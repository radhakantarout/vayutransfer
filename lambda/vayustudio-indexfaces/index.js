'use strict'

const { RekognitionClient, CreateCollectionCommand, DeleteCollectionCommand, IndexFacesCommand } = require('@aws-sdk/client-rekognition')
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

async function indexFileFaces(projectId, file, qualityFilter) {
  // A single project's photos can span both backends mid-migration — each
  // file is read from wherever it actually lives, keyed off its own record.
  const useR2 = file.storageBackend === 'R2' && file.r2Key
  const obj = useR2
    ? await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.r2Key }))
    : await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }))
  const originalBuffer = await streamToBuffer(obj.Body)

  // Resize to 1920px max (was 1200px) — still comfortably under the 5MB
  // Image.Bytes limit at JPEG q85, but keeps far more detail for small/
  // distant faces in wide group shots. At 1200px, a face that's only ~5% of
  // the frame (typical in a big group photo) shrank to a handful of pixels
  // across — not enough detail for Rekognition to produce a reliably
  // distinctive embedding, which is what caused high-confidence WRONG
  // matches later (low-quality embeddings don't fail loudly, they just
  // match generically).
  const rekBuffer = await sharp(originalBuffer)
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  try {
    const result = await rek.send(new IndexFacesCommand({
      CollectionId: `vayustudio-${projectId}`,
      Image: { Bytes: rekBuffer },
      ExternalImageId: file.fileId,   // stored in collection — lets SearchFacesByImage return fileIds directly
      // Big Indian wedding/event group shots can have 20-50+ people in one
      // frame — 20 was already a real ceiling.
      MaxFaces: 50,
      // Resolved from the admin's Accuracy slider (lib/studio/faceAccuracy.ts
      // on the Next.js side maps 0-100 -> NONE/LOW/AUTO/MEDIUM/HIGH) and
      // passed in via the invocation payload — defaults to AUTO, Rekognition's
      // own recommended balance, if the caller didn't specify one.
      QualityFilter: qualityFilter || 'AUTO',
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
  const { projectId, studioId, jobId, fileIds, forceAll, qualityFilter } = event
  console.log(`[indexfaces] START projectId=${projectId} jobId=${jobId}${fileIds ? ` scoped=${fileIds.length}` : ''}${forceAll ? ' forceAll=true' : ''}`)

  await updateJob(jobId, { status: 'PROCESSING', updatedAt: new Date().toISOString() })

  try {
    // Check feature flag
    const studioRes = await ddb.send(new GetCommand({ TableName: STUDIOS_TABLE, Key: { studioId } }))
    if (!studioRes.Item?.featureFlags?.aiFaceRecognition) {
      await updateJob(jobId, { status: 'FAILED', errorMessage: 'Feature flag disabled', completedAt: new Date().toISOString() })
      return { statusCode: 403, body: 'Feature flag disabled' }
    }

    // forceAll = redo every photo from scratch, not just the unindexed ones.
    // Delete the collection first so re-indexing doesn't just pile new faces
    // on top of the old ones for photos that were already indexed — that
    // would double up (and never remove) the very low-quality faces a
    // forced reindex is usually run to get rid of. CreateCollection below
    // then rebuilds it fresh, empty.
    if (forceAll) {
      try {
        await rek.send(new DeleteCollectionCommand({ CollectionId: `vayustudio-${projectId}` }))
      } catch (err) {
        if (err.name !== 'ResourceNotFoundException') throw err
      }
    }

    // Create Rekognition collection (idempotent)
    try {
      await rek.send(new CreateCollectionCommand({ CollectionId: `vayustudio-${projectId}` }))
    } catch (err) {
      if (err.name !== 'ResourceAlreadyExistsException') throw err
    }

    // Query READY images — forceAll processes every one regardless of
    // current faceIndexed status; otherwise only the not-yet-indexed ones.
    // projectId is the table PK, no GSI needed.
    const filesRes = await ddb.send(new QueryCommand({
      TableName: MEDIAFILES_TABLE,
      KeyConditionExpression: 'projectId = :pid',
      FilterExpression: forceAll
        ? 'processingStatus = :ready AND fileType = :img'
        : 'processingStatus = :ready AND fileType = :img AND (attribute_not_exists(faceIndexed) OR faceIndexed = :false)',
      ExpressionAttributeValues: {
        ':pid':   projectId,
        ':ready': 'READY',
        ':img':   'IMAGE',
        ...(forceAll ? {} : { ':false': false }),
      },
    }))

    let files = filesRes.Items || []
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const wanted = new Set(fileIds)
      files = files.filter((f) => wanted.has(f.fileId))
    }
    console.log(`[indexfaces] ${files.length} images to index`)

    if (forceAll && files.length > 0) {
      // Reset every targeted photo back to "not yet indexed" up front so the
      // status endpoint (and the app's live blur/spinner per photo tile)
      // accurately shows a fresh pass in progress, instead of still
      // reporting the old "all done" the whole time this job runs.
      await Promise.all(files.map((file) =>
        ddb.send(new UpdateCommand({
          TableName: MEDIAFILES_TABLE,
          Key: { projectId, fileId: file.fileId },
          UpdateExpression: 'SET faceIndexed = :f, faceCount = :z REMOVE faceIndexedAt',
          ExpressionAttributeValues: { ':f': false, ':z': 0 },
        })).catch(() => {})
      ))
    }

    let indexed = 0
    const now = new Date().toISOString()

    for (const file of files) {
      try {
        const faceCount = await indexFileFaces(projectId, file, qualityFilter)
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

    // Persisted, increment-only — this is the only place indexing actually
    // happens, so it's the only place this needs incrementing. Deliberately
    // never decremented anywhere else (not on photo/project delete): the
    // Rekognition cost was already paid the moment this ran, so deleting
    // the photo afterward must not make the studio's AI-search usage look
    // smaller than what was actually billed.
    if (indexed > 0) {
      await ddb.send(new UpdateCommand({
        TableName: STUDIOS_TABLE,
        Key: { studioId },
        UpdateExpression: 'ADD aiSearchCreditsUsed :n SET updatedAt = :now',
        ExpressionAttributeValues: { ':n': indexed, ':now': new Date().toISOString() },
      })).catch((err) => console.error('[indexfaces] aiSearchCreditsUsed increment failed:', err.message))
    }

    console.log(`[indexfaces] DONE — indexed ${indexed}/${files.length}`)
    return { statusCode: 200, body: `Indexed ${indexed}/${files.length}` }
  } catch (err) {
    console.error('[indexfaces] Fatal error:', err)
    await updateJob(jobId, { status: 'FAILED', errorMessage: err.message, completedAt: new Date().toISOString() })
    throw err
  }
}
