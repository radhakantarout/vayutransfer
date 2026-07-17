import { NextRequest, NextResponse } from 'next/server'
import { RekognitionClient, ListFacesCommand, SearchFacesCommand } from '@aws-sdk/client-rekognition'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { accuracyToMatchThreshold, DEFAULT_AI_ACCURACY } from '@/lib/studio/faceAccuracy'
import type { StudioProject } from '@/types/studio'

const rek = new RekognitionClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

// "Select one photo, find everyone else with the same face" — reuses the
// FaceId(s) Rekognition already computed for this photo at index time (no
// re-fetching/resizing the image, no 5MB Image.Bytes limit to worry about,
// unlike a fresh SearchFacesByImage call).
//
// A photo can have more than one face indexed under the same ExternalImageId
// (fileId) — IndexFaces doesn't distinguish "which person" within one image.
// Picking just one arbitrarily (the original version of this route did,
// via .find()) silently searches for whichever face happened to come back
// first, which is why a 2-person reference photo pulled in an unrelated mix
// of matches. Now: if the reference photo has multiple faces and the caller
// hasn't said which one, respond with `needsSelection` + each face's
// bounding box so the admin can pick the right one before we search.
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { projectId } = params
    const studioId = auth.studioId!
    const project = await studioGetItem<StudioProject>(TABLES.projects, { studioId, projectId })
    if (!project) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })

    const { fileId, faceId: chosenFaceId, accuracyLevel } = await req.json().catch(() => ({}))
    if (typeof fileId !== 'string' || !fileId) {
      return NextResponse.json({ success: false, error: 'NO_FILE_ID' }, { status: 400 })
    }
    const matchThreshold = accuracyToMatchThreshold(
      typeof accuracyLevel === 'number' ? accuracyLevel : DEFAULT_AI_ACCURACY
    )

    const collectionId = `vayustudio-${projectId}`

    const facesForPhoto: { FaceId?: string; BoundingBox?: { Width?: number; Height?: number; Left?: number; Top?: number } }[] = []
    let nextToken: string | undefined
    try {
      do {
        const listRes = await rek.send(new ListFacesCommand({
          CollectionId: collectionId, MaxResults: 4096, NextToken: nextToken,
        }))
        facesForPhoto.push(...(listRes.Faces ?? []).filter(f => f.ExternalImageId === fileId))
        nextToken = listRes.NextToken
      } while (nextToken)
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'ResourceNotFoundException') {
        return NextResponse.json({ success: false, error: 'NOT_INDEXED' }, { status: 404 })
      }
      throw err
    }

    if (facesForPhoto.length === 0) {
      return NextResponse.json({ success: false, error: 'NOT_INDEXED', message: 'This photo has no indexed face yet.' }, { status: 404 })
    }

    let targetFaceId: string
    if (facesForPhoto.length === 1) {
      targetFaceId = facesForPhoto[0].FaceId!
    } else if (typeof chosenFaceId === 'string' && facesForPhoto.some(f => f.FaceId === chosenFaceId)) {
      targetFaceId = chosenFaceId
    } else {
      return NextResponse.json({
        success: true,
        data: {
          needsSelection: true,
          faces: facesForPhoto.map(f => ({
            faceId: f.FaceId,
            boundingBox: {
              left: f.BoundingBox?.Left ?? 0,
              top: f.BoundingBox?.Top ?? 0,
              width: f.BoundingBox?.Width ?? 0,
              height: f.BoundingBox?.Height ?? 0,
            },
          })),
        },
      })
    }

    const searchRes = await rek.send(new SearchFacesCommand({
      CollectionId: collectionId,
      FaceId: targetFaceId,
      // Admin-controlled via the Accuracy slider (lib/studio/faceAccuracy.ts)
      // — defaults to 85, tuned from the original 70 to cut down wrong-
      // person false positives without losing real matches on test data.
      FaceMatchThreshold: matchThreshold,
      MaxFaces: 4096,
    }))

    const fileIds = Array.from(new Set([
      fileId,
      ...(searchRes.FaceMatches ?? [])
        .map(m => m.Face?.ExternalImageId)
        .filter((id): id is string => !!id),
    ]))

    return NextResponse.json({ success: true, data: { fileIds } })
  } catch (err) {
    console.error('[faces/similar POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
