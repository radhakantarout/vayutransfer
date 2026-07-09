'use strict'

const { RekognitionClient, CreateCollectionCommand, IndexFacesCommand } = require('@aws-sdk/client-rekognition')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')
const sharp = require('sharp')

const REGION             = process.env.AWS_REGION || 'ap-south-1'
const JOBS_TABLE         = process.env.DYNAMO_STUDIO_JOBS_TABLE     || 'vayustudio-jobs'
const MEDIAFILES_TABLE   = process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE || 'vayustudio-mediafiles'
const STUDIOS_TABLE      = process.env.DYNAMO_STUDIO_STUDIOS_TABLE   || 'vayustudio-studios'
const S3_BUCKET          = process.env.STUDIO_S3_BUCKET || 'vayutransfer-studio-originals'
// R2 originals — this Lambda processes a batch of files per invocation
// (queried from DynamoDB itself), each of which may independently be on S3
// or R2, so credentials live in the Lambda's own env config rather than
// being passed per-invoke like the single-file watermark Lambda does.
const R2_BUCKET          = process.env.STUDIO_R2_ORIGINAL_BUCKET
const R2_ENDPOINT        = process.env.STUDIO_R2_ENDPOINT
const R2_ACCESS_KEY_ID   = process.env.STUDIO_R2_ORIGINAL_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY

const rek = new RekognitionClient({ region: REGION })
const s3  = new S3Client({ region: REGION })
const r2  = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

// ─── helpers ────────────────────────────────────────────────────────────────

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function updateJob(jobId, patch) {
  const entries = Object.entries(patch)
  const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]))
  const sets  = entries.map(([,], i) => `#k${i} = :v${i}`).join(', ')
  const vals  = Object.fromEntries(entries.map(([,v], i) => [`:v${i}`, v]))
  await ddb.send(new UpdateCommand({
    TableName: JOBS_TABLE,
    Key: { jobId },
    UpdateExpression: `SET ${sets}`,
    ExpressionAttributeNames:  names,
    ExpressionAttributeValues: vals,
  }))
}

// ─── index one file — returns face count detected ───────────────────────────

async function indexFileFaces(projectId, file) {
  // A single project's photos can span both backends mid-migration — each
  // file is read from wherever it actually lives, keyed off its own record.
  const useR2 = file.storageBackend === 'R2' && file.r2Key
  const obj = useR2
    ? await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.r2Key }))
    : await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }))
  const originalBuffer = await streamToBuffer(obj.Body)

  // Resize to 1200px max — well under 5 MB limit, good enough for detection
  const rekBuffer = await sharp(originalBuffer)
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  try {
    const result = await rek.send(new IndexFacesCommand({
      CollectionId: `vayustudio-${projectId}`,
      Image: { Bytes: rekBuffer },
      ExternalImageId: file.fileId,   // stored in collection — lets SearchFacesByImage return fileIds directly
      MaxFaces: 20,
      QualityFilter: 'LOW',
      DetectionAttributes: ['DEFAULT'],
    }))
    return result.FaceRecords?.length ?? 0
  } catch (err) {
    console.error(`[indexfaces] IndexFaces failed for ${file.fileId}:`, err.message)
    return 0
  }
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const { projectId, studioId, jobId } = event
  console.log(`[indexfaces] START projectId=${projectId} jobId=${jobId}`)

  await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })

  try {
    // Check feature flag
    const studioRes = await ddb.send(new GetCommand({ TableName: STUDIOS_TABLE, Key: { studioId } }))
    if (!studioRes.Item?.featureFlags?.aiFaceRecognition) {
      await updateJob(jobId, { status: 'FAILED', errorMessage: 'Feature flag disabled', completedAt: new Date().toISOString() })
      return { statusCode: 403, body: 'Feature flag disabled' }
    }

    // Create Rekognition collection (idempotent)
    try {
      await rek.send(new CreateCollectionCommand({ CollectionId: `vayustudio-${projectId}` }))
    } catch (err) {
      if (err.name !== 'ResourceAlreadyExistsException') throw err
    }

    // Query READY images not yet indexed — projectId is the table PK, no GSI needed
    const filesRes = await ddb.send(new QueryCommand({
      TableName: MEDIAFILES_TABLE,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: 'processingStatus = :ready AND fileType = :img AND (attribute_not_exists(faceIndexed) OR faceIndexed = :false)',
      ExpressionAttributeValues: {
        ':pid':   projectId,
        ':ready': 'READY',
        ':img':   'IMAGE',
        ':false': false,
      },
    }))

    const files = filesRes.Items || []
    console.log(`[indexfaces] ${files.length} images to index`)

    let indexed = 0
    const now = new Date().toISOString()

    for (const file of files) {
      try {
        const faceCount = await indexFileFaces(projectId, file)
        await ddb.send(new UpdateCommand({
          TableName: MEDIAFILES_TABLE,
          Key: { projectId, fileId: file.fileId },
          UpdateExpression: 'SET faceCount = :cnt, faceIndexed = :t, faceIndexedAt = :now',
          ExpressionAttributeValues: { ':cnt': faceCount, ':t': true, ':now': now },
        }))
        indexed++
      } catch (err) {
        console.error(`[indexfaces] Failed on file ${file.fileId}:`, err.message)
      }
    }

    await ddb.send(new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: 'SET #s = :s, completedAt = :ca, outputPayload = :op',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s':  'READY',
        ':ca': new Date().toISOString(),
        ':op': { indexedCount: indexed, totalFiles: files.length },
      },
    }))

    console.log(`[indexfaces] DONE — indexed ${indexed}/${files.length}`)
    return { statusCode: 200, body: `Indexed ${indexed}/${files.length}` }
  } catch (err) {
    console.error('[indexfaces] Fatal error:', err)
    await updateJob(jobId, { status: 'FAILED', errorMessage: err.message, completedAt: new Date().toISOString() })
    throw err
  }
}
