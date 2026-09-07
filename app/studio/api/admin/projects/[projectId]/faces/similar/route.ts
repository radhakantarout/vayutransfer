import { NextRequest, NextResponse } from 'next/server'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, TABLES } from '@/lib/studio/dynamodb'
import { accuracyToMatchThreshold, DEFAULT_AI_ACCURACY } from '@/lib/studio/faceAccuracy'
import {
  collectionIdForProject, listCollectionFaces, faceCountByFileId,
  searchByFaceId, filterExclusive, intersectExclusive,
} from '@/lib/studio/faceSearch'
import type { StudioProject } from '@/types/studio'

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

    const collectionId = collectionIdForProject(projectId)

    // One paginated scan of the whole collection does double duty: finds
    // every face belonging to the reference photo (facesForPhoto, as
    // before) AND — for free, same data already being paginated through —
    // counts how many distinct faces exist per photo (counts), which 'solo'
    // mode needs afterward to know whether a candidate match is genuinely a
    // solo shot of that person or a group photo they merely appear in.
    let allFaces
    try {
      allFaces = await listCollectionFaces(collectionId)
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? ''
      if (name === 'ResourceNotFoundException') {
        return NextResponse.json({ success: false, error: 'NOT_INDEXED' }, { status: 404 })
      }
      throw err
    }
    const facesForPhoto = allFaces.filter(f => f.externalImageId === fileId)
    const counts = faceCountByFileId(allFaces)

    if (facesForPhoto.length === 0) {
      return NextResponse.json({ success: false, error: 'NOT_INDEXED', message: 'This photo has no indexed face yet.' }, { status: 404 })
    }

    let targetFaceId: string
    if (facesForPhoto.length === 1) {
      targetFaceId = facesForPhoto[0].faceId
    } else if (typeof chosenFaceId === 'string' && facesForPhoto.some(f => f.faceId === chosenFaceId)) {
      targetFaceId = chosenFaceId
    } else {
      return NextResponse.json({
        success: true,
        data: {
          needsSelection: true,
          faces: facesForPhoto.map(f => ({
            faceId: f.faceId,
            boundingBox: {
              left: f.boundingBox?.Left ?? 0,
              top: f.boundingBox?.Top ?? 0,
              width: f.boundingBox?.Width ?? 0,
              height: f.boundingBox?.Height ?? 0,
            },
          })),
        },
      })
    }

    // Couple mode: intersect two independent single-face searches within
    // this same project's own collection — no cross-project/multi-event
    // complexity (that was tried for a different feature and reverted for
    // being slow and confusing; this stays scoped to one collection).
    if (mode === 'couple' && typeof secondFaceId === 'string' && facesForPhoto.some(f => f.faceId === secondFaceId)) {
      const [setA, setB] = await Promise.all([
        searchByFaceId(collectionId, targetFaceId, matchThreshold),
        searchByFaceId(collectionId, secondFaceId, matchThreshold),
      ])
      // The reference photo itself trivially satisfies "both present" —
      // added before the exclusivity filter so a 3-person reference shot is
      // still excluded when "Only these two" is on.
      setA.add(fileId); setB.add(fileId)
      const fileIds = intersectExclusive(setA, setB, coupleExclusive === true, counts)
      return NextResponse.json({ success: true, data: { fileIds } })
    }

    const matchedIds = await searchByFaceId(collectionId, targetFaceId, matchThreshold)
    matchedIds.add(fileId)

    const fileIds = mode === 'solo'
      ? filterExclusive(matchedIds, counts, 1)
      : Array.from(matchedIds)

    return NextResponse.json({ success: true, data: { fileIds } })
  } catch (err) {
    console.error('[faces/similar POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
