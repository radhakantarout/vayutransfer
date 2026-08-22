'use strict'

const { S3Client } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { Readable } = require('stream')

// Safety net: without these, a rejection/throw outside our own try/catch
// surfaces only as an opaque Lambda "NodeJsExit" with no clue what broke —
// same lesson learned building lambda/vayu-transfer-zip. Kept permanently.
process.on('unhandledRejection', (reason) => {
  console.error('[drive-import] UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[drive-import] UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err)
})

function driveDownloadUrl(driveFileId, exportMimeType) {
  return exportMimeType
    ? `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`
    : `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`
}

// Streams a single Drive file straight into R2 — never buffers the whole
// file in memory or on disk. Node 20's native fetch() gives a Web
// ReadableStream response body; Readable.fromWeb() bridges it to a real
// Node stream, which @aws-sdk/lib-storage's Upload can consume directly
// for a streaming multipart upload. On failure, retries with a completely
// fresh fetch()+Upload from the top (a partially-consumed stream can't be
// resumed mid-way, so "retry" here means "start this one file over"),
// mirroring the retry-per-file approach in lambda/vayu-transfer-zip.
async function streamDriveFileToR2WithRetry(r2, bucket, f, accessToken, maxAttempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = driveDownloadUrl(f.driveFileId, f.exportMimeType)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '')
        // Surface enough to log/debug without leaking the token — the
        // Authorization header itself is never included in bodyText.
        throw new Error(`Drive fetch failed (${res.status}): ${bodyText.slice(0, 200)}`)
      }
      if (!res.body) throw new Error('Drive returned an empty response body')

      const nodeStream = Readable.fromWeb(res.body)
      const upload = new Upload({
        client: r2,
        params: {
          Bucket: bucket,
          Key: f.r2Key,
          Body: nodeStream,
          ContentType: f.exportMimeType || 'application/octet-stream',
        },
        queueSize: 4,
        partSize: 16 * 1024 * 1024, // 16MB parts (R2 multipart minimum is 5MB)
      })
      await upload.done()
      return
    } catch (err) {
      lastErr = err
      console.warn(`[drive-import] attempt ${attempt}/${maxAttempts} failed for "${f.fileName}": ${err.message}`)
    }
  }
  throw lastErr
}

// Reports one file's outcome (and running progress) back to the Next.js
// backend, which owns all vayu-drive-jobs / Transfer / TransferFile writes
// — this Lambda holds no DynamoDB credentials at all, keeping its IAM role
// to just basic CloudWatch logging (R2 credentials arrive per-invoke in
// the payload, same pattern as lambda/vayu-transfer-zip).
// Never throws — a callback failure (network error or non-2xx) only means
// the Next.js backend won't hear about this one file's outcome; it must
// not take down the rest of the batch, which is still this Lambda's job to
// finish regardless. Before this guard, a network-level fetch() failure
// here (as opposed to a plain non-ok response, already handled below)
// would propagate straight out of the per-file try/catch in the handler's
// loop and abort every remaining file.
async function notifyFileComplete(callbackUrl, secret, payload) {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error(`[drive-import] file-complete callback failed: ${res.status}`)
    }
  } catch (err) {
    console.error('[drive-import] file-complete callback threw:', err.message)
  }
}

// ─── Lambda handler ──────────────────────────────────────────────────────
// Payload built by app/api/google-drive/import/route.ts: jobId, batchId,
// walletId, files ({fileId, r2Key, driveFileId, fileName, exportMimeType}[]),
// a short-lived driveAccessToken (never a refresh token), the callback URL
// + shared secret, and R2 credentials. One file's failure doesn't abort the
// rest of the batch — each file's outcome is reported independently, same
// as a partially-failed local batch upload leaves the other files intact.
exports.handler = async (event) => {
  const { jobId, batchId, walletId, files, driveAccessToken, callbackUrl, internalSecret, r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey } = event

  console.log(`[drive-import] START jobId=${jobId} batchId=${batchId} files=${files?.length}`)

  const r2 = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  })

  let processed = 0
  const total = files.length

  for (const f of files) {
    try {
      await streamDriveFileToR2WithRetry(r2, r2Bucket, f, driveAccessToken)
      processed++
      await notifyFileComplete(callbackUrl, internalSecret, {
        jobId, batchId, fileId: f.fileId, walletId, status: 'uploaded',
        processed, total, currentFileName: f.fileName,
      })
    } catch (err) {
      console.error(`[drive-import] FAILED "${f.fileName}":`, err.message)
      await notifyFileComplete(callbackUrl, internalSecret, {
        jobId, batchId, fileId: f.fileId, walletId, status: 'failed',
        errorMessage: err.message, processed, total, currentFileName: f.fileName,
      })
    }
  }

  console.log(`[drive-import] DONE jobId=${jobId} processed=${processed}/${total}`)
  return { statusCode: 200, body: `processed ${processed}/${total}` }
}
