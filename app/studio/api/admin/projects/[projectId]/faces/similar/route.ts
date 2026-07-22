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
//
// Three match modes (matchMode): 'solo' finds photos where the target person
// is the ONLY indexed face — an exclusive match. 'group' is the original,
// unrestricted behavior (target appears, regardless of who else is also in
// frame). 'couple' takes a second face (secondFaceId) and intersects two
// searches — only photos containing BOTH people.
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

    const {
      fileId, faceId: chosenFaceId, secondFaceId, accuracyLevel,
      matchMode, coupleExclusive,
    } = await req.json().catch(() => ({}))
    if (typeof fileId !== 'string' || !fileId) {
      return NextResponse.json({ success: false, error: 'NO_FILE_ID' }, { status: 400 })
    }
    const mode: 'solo' | 'group' | 'couple' = ['solo', 'group', 'couple'].includes(matchMode) ? matchMode : 'group'
    const matchThreshold = accuracyToMatchThreshold(
      typeof accuracyLevel === 'number' ? accuracyLevel : DEFAULT_AI_ACCURACY
    )

    const collectionId = `vayustudio-${projectId}`

    // One paginated scan of the whole collection does double duty: finds
    // every face belonging to the reference photo (facesForPhoto, as
    // before) AND — for free, same data already being paginated through —
    // counts how many distinct faces exist per photo (faceCountByFileId),
    // which 'solo' mode needs afterward to know whether a candidate match
    // is genuinely a solo shot of that person or a group photo they merely
    // appear in.
    const facesForPhoto: { FaceId?: string; BoundingBox?: { Width?: number; Height?: number; Left?: number; Top?: number } }[] = []
    const faceCountByFileId = new Map<string, number>()
    let nextToken: string | undefined
    try {
      do {
        const listRes = await rek.send(new ListFacesCommand({
          CollectionId: collectionId, MaxResults: 4096, NextToken: nextToken,
        }))
        for (const f of listRes.Faces ?? []) {
          if (f.ExternalImageId === fileId) facesForPhoto.push(f)
          if (f.ExternalImageId) faceCountByFileId.set(f.ExternalImageId, (faceCountByFileId.get(f.ExternalImageId) ?? 0) + 1)
        }
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

    const searchOne = async (faceId: string) => {
      const res = await rek.send(new SearchFacesCommand({
        CollectionId: collectionId,
        FaceId: faceId,
        // Admin-controlled via the Accuracy slider (lib/studio/faceAccuracy.ts)
        // — defaults to 85, tuned from the original 70 to cut down wrong-
        // person false positives without losing real matches on test data.
        FaceMatchThreshold: matchThreshold,
        MaxFaces: 4096,
      }))
      return new Set((res.FaceMatches ?? []).map(m => m.Face?.ExternalImageId).filter((id): id is string => !!id))
    }

    // Couple mode: intersect two independent single-face searches within
    // this same project's own collection — no cross-project/multi-event
    // complexity (that was tried for a different feature and reverted for
    // being slow and confusing; this stays scoped to one collection).
    if (mode === 'couple' && typeof secondFaceId === 'string' && facesForPhoto.some(f => f.FaceId === secondFaceId)) {
      const [setA, setB] = await Promise.all([searchOne(targetFaceId), searchOne(secondFaceId)])
      const intersection = new Set(Array.from(setA).filter(id => setB.has(id)))
      intersection.add(fileId)
      // "Only these two" — same free faceCountByFileId map solo mode uses,
      // just checking for exactly 2 (these two people, no one else) instead
      // of exactly 1. Applies uniformly, including the reference photo
      // itself, so a 3-person reference shot is excluded too when exclusive.
      const fileIds = coupleExclusive === true
        ? Array.from(intersection).filter(id => (faceCountByFileId.get(id) ?? 0) === 2)
        : Array.from(intersection)
      return NextResponse.json({ success: true, data: { fileIds } })
    }

    const matchedIds = await searchOne(targetFaceId)
    matchedIds.add(fileId)

    const fileIds = mode === 'solo'
      ? Array.from(matchedIds).filter(id => (faceCountByFileId.get(id) ?? 0) <= 1)
      : Array.from(matchedIds)

    return NextResponse.json({ success: true, data: { fileIds } })
  } catch (err) {
    console.error('[faces/similar POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
