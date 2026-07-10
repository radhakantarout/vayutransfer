'use strict'

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb')
const JSZip = require('jszip')

const REGION     = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE = process.env.DYNAMO_STUDIO_JOBS_TABLE || 'vayustudio-jobs'

const s3  = new S3Client({ region: REGION })
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
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

    const zip = new JSZip()
    const usedNames = new Set()
    let processed = 0

    for (const f of files) {
      const client = f.backend === 'R2' ? r2 : s3
      const bucket = f.backend === 'R2' ? r2Bucket : s3Bucket
      const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: f.key }))
      const buffer = await streamToBuffer(obj.Body)

      let name = f.filename
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.')
        name = dot === -1
          ? `${name}-${f.fileId.slice(0, 8)}`
          : `${name.slice(0, dot)}-${f.fileId.slice(0, 8)}${name.slice(dot)}`
      }
      usedNames.add(name)
      zip.file(name, buffer)

      processed++
      await updateJob(jobId, {
        outputPayload: { processed, total: files.length },
        updatedAt: new Date().toISOString(),
      })
    }

    // JPEGs are already compressed — skip DEFLATE, just bundle (matches the
    // sync version's behavior: faster, same output size).
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
    const zipKey = `studios/${studioId}/zips/${jobId}.zip`

    await r2.send(new PutObjectCommand({
      Bucket: r2Bucket, Key: zipKey, Body: zipBuffer, ContentType: 'application/zip',
    }))

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
