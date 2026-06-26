'use strict'

const { RekognitionClient, CreateCollectionCommand, IndexFacesCommand, SearchFacesByImageCommand, DeleteCollectionCommand } = require('@aws-sdk/client-rekognition')
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb')
const sharp = require('sharp')

const REGION = process.env.AWS_REGION || 'ap-south-1'
const FACES_TABLE      = process.env.DYNAMO_STUDIO_FACES_TABLE    || 'vayustudio-faces'
const JOBS_TABLE       = process.env.DYNAMO_STUDIO_JOBS_TABLE     || 'vayustudio-jobs'
const MEDIAFILES_TABLE = process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE || 'vayustudio-mediafiles'
const STUDIOS_TABLE    = process.env.DYNAMO_STUDIO_STUDIOS_TABLE   || 'vayustudio-studios'
const R2_PUBLIC_URL    = process.env.NEXT_PUBLIC_STUDIO_PREVIEW_URL || ''
const R2_BUCKET        = process.env.STUDIO_R2_BUCKET || 'vayutransfer-studio-previews'
const S3_BUCKET        = process.env.STUDIO_S3_BUCKET || 'vayutransfer-studio-originals'

const rek = new RekognitionClient({ region: REGION })

const s3 = new S3Client({ region: REGION })

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.STUDIO_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
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

async function cropFaceThumbnail(imageBuffer, bbox, imgWidth, imgHeight) {
  const pad   = 0.20
  const left  = Math.max(0, Math.floor((bbox.Left   - pad * bbox.Width)  * imgWidth))
  const top   = Math.max(0, Math.floor((bbox.Top    - pad * bbox.Height) * imgHeight))
  const right = Math.min(imgWidth,  Math.ceil((bbox.Left + bbox.Width  * (1 + pad)) * imgWidth))
  const bot   = Math.min(imgHeight, Math.ceil((bbox.Top  + bbox.Height * (1 + pad)) * imgHeight))
  return sharp(imageBuffer)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bot - top) })
    .resize(120, 120, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

async function uploadToR2(buffer, key, contentType = 'image/jpeg') {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
}

// ─── main face indexer for one file ─────────────────────────────────────────

async function indexFileFaces(projectId, studioId, file) {
  // Download the original once
  const s3Obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: file.s3Key }))
  const originalBuffer = await streamToBuffer(s3Obj.Body)

  // Resize to 1200px for Rekognition — well under 5MB, still good enough for face detection.
  // Bounding boxes from Rekognition are fractional (0–1), so they map back to any resolution.
  const rekBuffer = await sharp(originalBuffer)
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  let indexResult
  try {
    indexResult = await rek.send(new IndexFacesCommand({
      CollectionId: `vayustudio-${projectId}`,
      Image: { Bytes: rekBuffer },
      ExternalImageId: file.fileId,
      MaxFaces: 20,
      QualityFilter: 'MEDIUM',
      DetectionAttributes: ['DEFAULT'],
    }))
  } catch (err) {
    console.error(`[indexfaces] IndexFaces failed for ${file.fileId}:`, err.message)
    return []
  }

  if (!indexResult.FaceRecords?.length) return []

  // Use original full-resolution buffer for thumbnail cropping (quality matters)
  const origMeta = await sharp(originalBuffer).metadata()
  const imgW = origMeta.width
  const imgH = origMeta.height

  const canonicalFaceIds = []
  const now = new Date().toISOString()

  for (const faceRecord of indexResult.FaceRecords) {
    const { FaceId, BoundingBox, Confidence } = faceRecord.Face

    // BoundingBox fractions are resolution-independent — apply to original dimensions
    let thumbnailBuffer
    try {
      thumbnailBuffer = await cropFaceThumbnail(originalBuffer, BoundingBox, imgW, imgH)
    } catch (err) {
      console.warn(`[indexfaces] Crop failed for face ${FaceId}:`, err.message)
      continue
    }

    // Find canonical face — search collection with the cropped thumbnail
    // to cluster same-person appearances across photos
    let canonicalFaceId = FaceId
    try {
      const searchRes = await rek.send(new SearchFacesByImageCommand({
        CollectionId: `vayustudio-${projectId}`,
        Image: { Bytes: thumbnailBuffer },
        FaceMatchThreshold: 85,
        MaxFaces: 5,
      }))
      const bestMatch = (searchRes.FaceMatches || [])
        .filter(m => m.Face.FaceId !== FaceId)
        .sort((a, b) => b.Similarity - a.Similarity)[0]
      if (bestMatch && bestMatch.Similarity >= 85) {
        canonicalFaceId = bestMatch.Face.FaceId
      }
    } catch {
      // SearchFacesByImage failure → fall back to new face
    }

    const r2Key  = `studios/${studioId}/projects/${projectId}/faces/${canonicalFaceId}.jpg`
    const r2Url  = `${R2_PUBLIC_URL}/${r2Key}`

    await uploadToR2(thumbnailBuffer, r2Key)

    // Upsert face record — ADD photoIds (StringSet) and photoCount
    await ddb.send(new UpdateCommand({
      TableName: FACES_TABLE,
      Key: { projectId, faceId: canonicalFaceId },
      UpdateExpression: `
        ADD photoIds :fid, photoCount :one
        SET studioId      = if_not_exists(studioId, :studioId),
            thumbnailUrl  = :thumbnailUrl,
            thumbnailR2Key= :r2Key,
            confidence    = :conf,
            boundingBox   = :bbox,
            createdAt     = if_not_exists(createdAt, :now),
            updatedAt     = :now
      `,
      ExpressionAttributeValues: {
        ':fid':         new Set([file.fileId]),
        ':one':         1,
        ':studioId':    studioId,
        ':thumbnailUrl':r2Url,
        ':r2Key':       r2Key,
        ':conf':        Math.round(Confidence),
        ':bbox':        JSON.stringify(BoundingBox),
        ':now':         now,
      },
    }))

    canonicalFaceIds.push(canonicalFaceId)
  }

  return [...new Set(canonicalFaceIds)]
}

// ─── Lambda handler ──────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const { projectId, studioId, jobId } = event
  console.log(`[indexfaces] START projectId=${projectId} jobId=${jobId}`)

  // Mark job PROCESSING
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

    // Query all READY image files not yet face-indexed
    // projectId is the table's own PK — no GSI needed
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
        const faceIds = await indexFileFaces(projectId, studioId, file)
        await ddb.send(new UpdateCommand({
          TableName: MEDIAFILES_TABLE,
          Key: { projectId, fileId: file.fileId },
          UpdateExpression: 'SET faceIds = :ids, faceCount = :cnt, faceIndexed = :t, faceIndexedAt = :now',
          ExpressionAttributeValues: {
            ':ids': faceIds,
            ':cnt': faceIds.length,
            ':t':   true,
            ':now': now,
          },
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
