'use strict'

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { Upload } = require('@aws-sdk/lib-storage')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const { PassThrough } = require('stream')
const archiver = require('archiver')

const REGION     = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'

// Safety net: without these, a rejection/throw outside our own try/catch
// (e.g. deep inside a stream library's internals) surfaces only as an opaque
// Lambda "NodeJsExit" with no clue what actually broke — happened once
// during development. Keeping this permanently for future debuggability.
process.on('unhandledRejection', (reason) => {
  console.error('[zip] UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[zip] UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err)
})

const s3  = new S3Client({ region: REGION })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// A transient network blip (ECONNRESET/"aborted" mid-stream) on one file used
// to crash the entire job — the GetObjectCommand response's Body stream has
// no error handler once handed to archiver, so a reset became an uncaught
// exception that killed the whole Lambda, losing all progress. Downloading
// each file fully into a buffer (with retries) before appending it means any
// network error is caught by our own try/catch and simply retried, at the
// cost of only ever holding ONE file in memory at a time — bounded by the
// largest single file, not by total selection size, so 10GB+ batches are
// still safe.
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
      console.warn(`[zip] download attempt ${attempt}/${maxAttempts} failed for ${key}: ${err.message}`)
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

// ─── Lambda handler ──────────────────────────────────────────────────────────
// Downloads one source file at a time (with retry — see downloadWithRetry)
// into the zip archive, and streams the archive's output straight into a
// multipart R2 upload — the zip as a whole is never buffered in memory, only
// one file at a time is. Total transfer size is bounded by the 900s Lambda
// execution limit and the largest single file, not by total selection size.
// Needed because Indian wedding albums (RAW originals, multiple ceremonies)
// routinely run into multiple GB per print-portal selection — the original
// in-memory JSZip approach would OOM well before that.
//
// Payload built by app/studio/api/print/gallery/[token]/download-all/route.ts
// (POST/init): a pre-resolved list of {fileId, filename, backend, key} — the
// route already knows which backend each file is on (same resolveCurrent
// logic as lib/studio/storage.ts), so this Lambda doesn't need to query
// DynamoDB for MediaFile records itself, only to update its own job status.
exports.handler = async (event) => {
  const {
    jobId, studioId,
    files, zipFilename,
    s3Bucket,
    r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey,
  } = event

  console.log(`[zip] START jobId=${jobId} files=${files?.length}`)

  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })

  try {
    await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })

    const zipKey = `studios/${studioId}/zips/${jobId}.zip`
    // STORE (no compression) — source files are already-compressed JPEGs/RAW;
    // DEFLATE would just burn CPU time for no meaningful size reduction.
    const archive = archiver('zip', { store: true })
    archive.on('warning', (err) => console.warn('[zip] archiver warning:', err.message))

    // archiver is built on the userland "readable-stream" package internally,
    // which fails @aws-sdk/lib-storage's `instanceof Readable` check against
    // Node's native stream module if passed directly as Body. Piping through
    // a native PassThrough first gives Upload a stream it actually recognizes.
    const passthrough = new PassThrough()
    archive.pipe(passthrough)

    const upload = new Upload({
      client: r2,
      params: { Bucket: r2Bucket, Key: zipKey, Body: passthrough, ContentType: 'application/zip' },
      queueSize: 4,
      partSize: 16 * 1024 * 1024, // 16MB parts (R2/S3 multipart minimum is 5MB)
    })
    // Start draining the archive stream NOW, concurrently with appending
    // entries below. Upload.done() is what actually consumes the stream —
    // calling it only after archive.finalize() resolves deadlocks the two
    // against each other, since finalize() can't complete until something
    // drains the backpressured stream, and nothing does until done() runs.
    const uploadDonePromise = upload.done()

    let processed = 0
    let lastReportedAt = 0
    archive.on('entry', () => {
      processed++
      // Throttle progress writes to ~1/sec — a large album can be hundreds
      // of files, and a DynamoDB write per file adds up unnecessarily.
      const now = Date.now()
      if (now - lastReportedAt > 1000 || processed === files.length) {
        lastReportedAt = now
        updateJob(jobId, { outputPayload: { processed, total: files.length }, updatedAt: new Date().toISOString() })
          .catch((err) => console.error('[zip] progress update failed:', err.message))
      }
    })

    // archiver emits 'error' asynchronously off the main control flow — a
    // plain throw inside the listener would become an uncaught exception
    // instead of reaching our try/catch, so route it through a promise instead.
    const archiveErrorPromise = new Promise((_, reject) => archive.once('error', reject))

    const usedNames = new Set()
    for (const f of files) {
      const client = f.backend === 'R2' ? r2 : s3
      const bucket = f.backend === 'R2' ? r2Bucket : s3Bucket
      const buffer = await downloadWithRetry(client, bucket, f.key)

      let name = f.filename
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
        ResponseContentDisposition: `attachment; filename="${zipFilename}"`,
      }),
      { expiresIn: 7200 } // 2 hours — plenty to click a "ready" popup, short enough not to linger
    )

    await updateJob(jobId, {
      status: 'READY',
      outputPayload: { processed: files.length, total: files.length, downloadUrl, filename: zipFilename },
      completedAt: new Date().toISOString(),
    })

    console.log(`[zip] DONE jobId=${jobId}`)
    return { statusCode: 200, body: downloadUrl }
  } catch (err) {
    console.error('[zip] ERROR:', err)
    await updateJob(jobId, {
      status: 'FAILED',
      errorMessage: err.message,
      completedAt: new Date().toISOString(),
    }).catch(() => {})
    throw err
  }
}
