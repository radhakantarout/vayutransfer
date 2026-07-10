// Background migration: copies existing S3-backed MediaFile originals (and
// any edited copies) to R2, verifies byte-for-byte via MD5, then flips
// storageBackend to "R2" only after the copy is confirmed correct. Never
// deletes the S3 copy — that's a separate, later, explicit decision.
//
// Idempotent/resumable: only touches records where storageBackend === "S3".
// If interrupted partway, re-running just picks up wherever it left off —
// already-migrated records are skipped since their storageBackend is
// already "R2" by then.
//
// Rate-limited to ~100 files/minute (small delay between each) to be a good
// citizen against R2/S3 API limits — matches the pace called for in the
// source migration docs for the eventual production run.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-s3-to-r2.mjs           # dry run, prints only
//   node --env-file=.env.local scripts/migrate-s3-to-r2.mjs --apply   # copies files, writes to DynamoDB
//
// Refuses to run against a non "-test" table unless --force is also passed —
// this migration is test-only until Phase 4 (production rollout) explicitly
// approves running it there.

import crypto from 'crypto'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb'
import { NodeHttpHandler } from '@smithy/node-http-handler'

// Without an explicit timeout, a stalled connection hangs the SDK call
// forever with zero CPU usage and zero error — indistinguishable from
// "still working" until you check process CPU time. Learned this the hard
// way on the first production run (had to kill -9 a hung process).
const requestHandler = new NodeHttpHandler({
  connectionTimeout: 10_000,
  requestTimeout: 60_000,
})

const REGION           = process.env.AWS_REGION ?? 'ap-south-1'
const MEDIAFILES_TABLE = process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE ?? 'vayustudio-mediafiles'
const S3_BUCKET        = process.env.STUDIO_S3_BUCKET ?? 'vayutransfer-studio-originals'
const R2_BUCKET             = process.env.STUDIO_R2_ORIGINAL_BUCKET
const R2_ENDPOINT           = process.env.STUDIO_R2_ENDPOINT
const R2_ACCESS_KEY_ID      = process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY  = process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')
const RATE_LIMIT_PER_MIN = 100
const DELAY_MS = Math.ceil(60000 / RATE_LIMIT_PER_MIN)

const s3 = new S3Client({ region: REGION, requestHandler })
const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  requestHandler,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})
const ddb = new DynamoDBClient({ region: REGION, requestHandler })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
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

// Copies one S3 object to R2 at the same key, verifying byte-for-byte via a
// fresh download + MD5 comparison (safer than trusting ETag, which can be a
// multipart-composite hash rather than a plain MD5 for large files).
async function migrateKey(s3Key) {
  const srcObj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }))
  const buffer = await streamToBuffer(srcObj.Body)
  const sourceMd5 = crypto.createHash('md5').update(buffer).digest('hex')

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: s3Key, Body: buffer, ContentType: srcObj.ContentType,
  }))

  const verifyObj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: s3Key }))
  const verifyBuffer = await streamToBuffer(verifyObj.Body)
  const destMd5 = crypto.createHash('md5').update(verifyBuffer).digest('hex')

  if (sourceMd5 !== destMd5) {
    throw new Error(`checksum mismatch: source=${sourceMd5} dest=${destMd5}`)
  }
  return { bytes: buffer.length, md5: sourceMd5 }
}

async function main() {
  if (!MEDIAFILES_TABLE.endsWith('-test') && !FORCE) {
    console.error(`[migrate] refusing to run against "${MEDIAFILES_TABLE}" — doesn't look like a -test table.`)
    console.error('[migrate] this migration is test-only until Phase 4 explicitly approves production. Pass --force to override.')
    process.exit(1)
  }
  if (!R2_BUCKET || !R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('[migrate] missing R2 originals credentials — check .env.local for STUDIO_R2_ORIGINAL_* vars')
    process.exit(1)
  }

  console.log(`[migrate] mode: ${APPLY ? 'APPLY (will copy + write)' : 'DRY RUN (no writes)'}`)
  console.log(`[migrate] source table: ${MEDIAFILES_TABLE}`)
  console.log(`[migrate] ${S3_BUCKET} -> ${R2_BUCKET}`)
  console.log(`[migrate] scanning...`)
  const files = await scanAll(MEDIAFILES_TABLE)
  const toMigrate = files.filter((f) => f.storageBackend === 'S3' && f.s3Key)
  console.log(`[migrate] ${toMigrate.length}/${files.length} files still on S3, eligible to migrate`)

  let migrated = 0, failed = 0

  for (const f of toMigrate) {
    const label = `${f.projectId} / ${f.fileId} (${f.originalFilename ?? 'unnamed'})`
    try {
      console.log(`  ${label}: migrating original...`)
      let originalResult = null
      if (APPLY) {
        originalResult = await migrateKey(f.s3Key)
        console.log(`    ✓ ${originalResult.bytes} bytes, md5=${originalResult.md5}`)
      }

      const hasEditedToMigrate = !!f.editedS3Key && !f.editedR2Key
      if (hasEditedToMigrate) {
        console.log(`    also migrating edited copy...`)
        if (APPLY) {
          const editedResult = await migrateKey(f.editedS3Key)
          console.log(`    ✓ edited ${editedResult.bytes} bytes, md5=${editedResult.md5}`)
        }
      }

      if (APPLY) {
        const updates = ['storageBackend = :backend', 'r2Key = :r2key']
        const values = { ':backend': 'R2', ':r2key': f.s3Key }
        if (hasEditedToMigrate) {
          updates.push('editedR2Key = :editedR2key')
          values[':editedR2key'] = f.editedS3Key
        }
        await ddb.send(new UpdateItemCommand({
          TableName: MEDIAFILES_TABLE,
          Key: marshall({ projectId: f.projectId, fileId: f.fileId }),
          UpdateExpression: `SET ${updates.join(', ')}`,
          ExpressionAttributeValues: marshall(values),
        }))
      }
      migrated++
    } catch (err) {
      console.error(`  ✗ FAILED ${label}: ${err.message}`)
      failed++
    }

    await sleep(DELAY_MS)
  }

  console.log(`[migrate] done. ${migrated} migrated, ${failed} failed, ${toMigrate.length} total.`)
  if (!APPLY) console.log('[migrate] re-run with --apply to actually copy files and update records.')
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
