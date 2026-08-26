// Diagnostic (+ optional cleanup) for incomplete multipart uploads sitting
// in the R2 transfer bucket. These are invisible to ListObjectsV2 (and so
// invisible to lib/aws/r2.ts#listR2BucketObjects, the platform dashboard's
// "Actually in R2" stat, and the whole orphan-detection system in
// lib/r2Orphans.ts) but ARE real, billed bytes Cloudflare's own bucket-size
// UI counts — this is the most likely explanation for a gap between the
// two numbers.
//
// Root cause: every abort/cancel path in the app (upload/multipart/abort,
// upload/batch/abort, receive/[requestId]/abort, cron/reconcile-uploads)
// does call AbortMultipartUploadCommand, but only when it has an uploadId
// to abort with. Records created before `Transfer.uploadId` was persisted
// (or where the client abandoned the tab before any DB row was ever
// written) leave the multipart upload itself with no code path that will
// ever reach it.
//
// Usage:
//   node --env-file=.env.local scripts/list-incomplete-multipart-uploads.mjs                          # list + summarize only
//   node --env-file=.env.local scripts/list-incomplete-multipart-uploads.mjs --apply --older-than-hours=6   # abort ones initiated more than N hours ago
//
// --older-than-hours defaults to 6, matching the reconcile-uploads cron's
// own STALE_THRESHOLD_MS (already generous for a legitimate slow upload).
// Never aborts anything younger than that, --apply or not.

import {
  S3Client, ListMultipartUploadsCommand, ListPartsCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

const BUCKET = process.env.R2_TRANSFER_BUCKET ?? ''
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_TRANSFER_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_TRANSFER_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_TRANSFER_SECRET_ACCESS_KEY ?? '',
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
})

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'

const APPLY = process.argv.includes('--apply')
const olderThanArg = process.argv.find((a) => a.startsWith('--older-than-hours='))
const OLDER_THAN_HOURS = olderThanArg ? Number(olderThanArg.split('=')[1]) : 6

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

async function scanAll(table) {
  const items = []
  let lastKey
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }))
    for (const item of res.Items ?? []) items.push(unmarshall(item))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)
  return items
}

async function listAllIncompleteUploads() {
  const uploads = []
  let keyMarker
  let uploadIdMarker
  do {
    const res = await r2.send(new ListMultipartUploadsCommand({
      Bucket: BUCKET,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker,
      MaxUploads: 1000,
    }))
    for (const u of res.Uploads ?? []) {
      uploads.push({ key: u.Key, uploadId: u.UploadId, initiated: u.Initiated })
    }
    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined
    uploadIdMarker = res.IsTruncated ? res.NextUploadIdMarker : undefined
  } while (keyMarker)
  return uploads
}

async function sumPartBytes(key, uploadId) {
  let total = 0
  let partNumberMarker
  do {
    const res = await r2.send(new ListPartsCommand({
      Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumberMarker: partNumberMarker,
    }))
    for (const p of res.Parts ?? []) total += p.Size ?? 0
    partNumberMarker = res.IsTruncated ? res.NextPartNumberMarker : undefined
  } while (partNumberMarker)
  return total
}

async function main() {
  console.log(`[incomplete-multipart] bucket: ${BUCKET}`)
  console.log(`[incomplete-multipart] mode: ${APPLY ? `APPLY (will abort uploads older than ${OLDER_THAN_HOURS}h)` : 'DRY RUN (list only)'}`)

  const [uploads, transfers, transferFiles] = await Promise.all([
    listAllIncompleteUploads(),
    scanAll(TRANSFERS_TABLE),
    scanAll(TRANSFER_FILES_TABLE),
  ])
  console.log(`[incomplete-multipart] found ${uploads.length} incomplete multipart uploads`)
  if (uploads.length === 0) return

  const transfersByKey = new Map(transfers.filter((t) => t.r2Key).map((t) => [t.r2Key, t]))
  const transferFilesByKey = new Map(transferFiles.filter((f) => f.r2Key).map((f) => [f.r2Key, f]))
  const transfersById = new Map(transfers.map((t) => [t.fileId, t]))

  const cutoffMs = Date.now() - OLDER_THAN_HOURS * 60 * 60 * 1000
  let totalBytes = 0
  let toAbortCount = 0
  let toAbortBytes = 0
  const rows = []

  for (const u of uploads) {
    const bytes = await sumPartBytes(u.key, u.uploadId)
    totalBytes += bytes

    const single = transfersByKey.get(u.key)
    const batchFile = transferFilesByKey.get(u.key)
    const parent = batchFile ? transfersById.get(batchFile.batchId) : undefined
    const status = single?.status ?? batchFile?.status ?? parent?.status ?? 'untraceable'
    const ageMs = Date.now() - new Date(u.initiated).getTime()
    const isOld = new Date(u.initiated).getTime() < cutoffMs

    rows.push({ key: u.key, uploadId: u.uploadId, bytes, status, ageHours: (ageMs / 3600000).toFixed(1), isOld })

    if (isOld) {
      toAbortCount++
      toAbortBytes += bytes
      if (APPLY) {
        await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: u.key, UploadId: u.uploadId }))
          .catch((err) => console.error(`  failed to abort ${u.key}:`, err.message))
      }
    }
  }

  rows.sort((a, b) => b.bytes - a.bytes)
  console.log('')
  console.log('key | status | age(h) | bytes')
  for (const r of rows.slice(0, 50)) {
    console.log(`${r.key} | ${r.status} | ${r.ageHours} | ${formatBytes(r.bytes)}`)
  }
  if (rows.length > 50) console.log(`... and ${rows.length - 50} more`)

  console.log('')
  console.log(`[incomplete-multipart] total incomplete-upload bytes: ${formatBytes(totalBytes)} across ${uploads.length} uploads`)
  console.log(`[incomplete-multipart] older than ${OLDER_THAN_HOURS}h (${APPLY ? 'aborted' : 'would be aborted'}): ${toAbortCount} uploads, ${formatBytes(toAbortBytes)}`)
  if (!APPLY && toAbortCount > 0) {
    console.log('[incomplete-multipart] re-run with --apply to actually abort these and free the storage.')
  }
}

main().catch((err) => {
  console.error('[incomplete-multipart] failed:', err)
  process.exit(1)
})
