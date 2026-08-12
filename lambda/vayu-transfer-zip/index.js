'use strict'

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const { PassThrough } = require('stream')
const archiver = require('archiver')

const REGION     = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE = process.env.DYNAMO_ZIP_JOBS_TABLE || 'vayu-zip-jobs'

// Safety net: without these, a rejection/throw outside our own try/catch
// (e.g. deep inside a stream library's internals) surfaces only as an
// opaque Lambda "NodeJsExit" with no clue what actually broke. Kept
// permanently for debuggability — same lesson learned building
// vayustudio-zip.
process.on('unhandledRejection', (reason) => {
  console.error('[transfer-zip] UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[transfer-zip] UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err)
})

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// A transient network blip on one file used to crash the whole job in the
// original design — GetObjectCommand's Body stream has no error handler
// once handed to archiver, so a reset became an uncaught exception.
// Downloading each file fully into a buffer (with retries) first bounds
// memory to one file at a time (not the whole batch) while keeping any
// network error inside our own try/catch.
async function downloadWithRetry(client, bucket, key, maxAttempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const chunks = []
      for await (const chunk of obj.Body) chunks.push(chunk)
      return Buffer.concat(chunks)
    } catch (err) {
      lastErr = err
      console.warn(`[transfer-zip] download attempt ${attempt}/${maxAttempts} failed for ${key}: ${err.message}`)
    }
  }
  throw lastErr
}

async function updateJob(jobId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map((_, i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({
    TableName: JOBS_TABLE,
    Key: { jobId },
    UpdateExpression: `SET ${sets}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: vals,
  }))
}

// ─── Lambda handler ──────────────────────────────────────────────────────
// Builds a zip for one batch Transfer's "Download All" (only ever invoked
// for batches >=1GB total — smaller ones zip client-side and never reach
// this Lambda). Streams the archive straight into a multipart R2 upload —
// never buffers the whole zip in memory, only one source file at a time —
// so total size is bounded by the 900s Lambda limit and the largest single
// file, not by total selection size.
//
// All batch Transfer files live on R2 only (batches were introduced after
// VayuTransfer's own S3→R2 migration), so unlike vayustudio-zip this never
// needs an S3 branch — one R2 client for source reads AND the zip upload.
//
// Payload built by app/api/download/[fileId]/zip/route.ts: a pre-resolved
// list of {fileId, name, r2Key} where `name` is already the
// relativePath-or-fileName the route wants inside the archive (folder
// hierarchy preserved via '/' separators, which archiver honors natively).
exports.handler = async (event) => {
  const {
    jobId, batchId, files, zipFileName,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
  } = event

  console.log(`[transfer-zip] START jobId=${jobId} batchId=${batchId} files=${files?.length}`)

  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })

  try {
    await updateJob(jobId, { status: 'processing' })

    const zipKey = `zips/${jobId}.zip`
    // STORE (no compression) — source files are typically already-compressed
    // formats; DEFLATE would just burn CPU for no meaningful size reduction.
    const archive = archiver('zip', { store: true })
    archive.on('warning', (err) => console.warn('[transfer-zip] archiver warning:', err.message))

    // archiver's internal stream fails @aws-sdk/lib-storage's `instanceof
    // Readable` check if passed directly as Body — piping through a native
    // PassThrough first gives Upload a stream it actually recognizes.
    const passthrough = new PassThrough()
    archive.pipe(passthrough)

    const upload = new Upload({
      client: r2,
      params: { Bucket: r2Bucket, Key: zipKey, Body: passthrough, ContentType: 'application/zip' },
      queueSize: 4,
      partSize: 16 * 1024 * 1024, // 16MB parts (R2 multipart minimum is 5MB)
    })
    // Start draining the archive stream NOW, concurrently with appending
    // entries below — calling done() only after finalize() resolves
    // deadlocks the two against each other (finalize can't complete until
    // something drains the backpressured stream).
    const uploadDonePromise = upload.done()

    let processed = 0
    let lastReportedAt = 0
    archive.on('entry', () => {
      processed++
      const now = Date.now()
      if (now - lastReportedAt > 1000 || processed === files.length) {
        lastReportedAt = now
        updateJob(jobId, { processed, total: files.length })
          .catch((err) => console.error('[transfer-zip] progress update failed:', err.message))
      }
    })

    // archiver emits 'error' asynchronously off the main control flow — a
    // plain throw inside the listener would become an uncaught exception
    // instead of reaching our try/catch, so route it through a promise.
    const archiveErrorPromise = new Promise((_, reject) => archive.once('error', reject))

    const usedNames = new Set()
    for (const f of files) {
      const buffer = await downloadWithRetry(r2, r2Bucket, f.r2Key)

      let name = f.name
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.')
        name = dot === -1
          ? `${name}-${f.fileId.slice(0, 8)}`
          : `${name.slice(0, dot)}-${f.fileId.slice(0, 8)}${name.slice(dot)}`
      }
      usedNames.add(name)
      archive.append(buffer, { name })
    }

    await Promise.race([
      archiveErrorPromise,
      (async () => {
        await archive.finalize()
        await uploadDonePromise
      })(),
    ])

    const downloadUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({
        Bucket: r2Bucket,
        Key: zipKey,
        ResponseContentDisposition: `attachment; filename="${zipFileName}"`,
      }),
      { expiresIn: 7200 } // 2 hours
    )

    await updateJob(jobId, {
      status: 'ready',
      processed: files.length,
      total: files.length,
      downloadUrl,
      zipFileName,
      completedAt: new Date().toISOString(),
    })

    console.log(`[transfer-zip] DONE jobId=${jobId}`)
    return { statusCode: 200, body: downloadUrl }
  } catch (err) {
    console.error('[transfer-zip] ERROR:', err)
    await updateJob(jobId, {
      status: 'failed',
      errorMessage: err.message,
      completedAt: new Date().toISOString(),
    }).catch(() => {})
    throw err
  }
}
