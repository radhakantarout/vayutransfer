import { RekognitionClient, ListFacesCommand, SearchFacesCommand } from '@aws-sdk/client-rekognition'

// Shared Rekognition primitives behind faces/similar (AI Sort's only
// reference source is an already-indexed gallery photo — see
// StartSortingModal.tsx). Extracted from faces/similar's original inline
// implementation — no behavior change, just one shared place for collection
// scanning and exclusivity math.
const rek = new RekognitionClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

export function collectionIdForProject(projectId: string): string {
  return `vayustudio-${projectId}`
}

export interface CollectionFace {
  faceId: string
  externalImageId?: string
  boundingBox?: { Width?: number; Height?: number; Left?: number; Top?: number }
}

// One paginated scan of the whole collection — callers derive whatever they
// need from the result (a specific photo's own faces, a per-photo face
// count for exclusivity filtering, etc.) rather than each re-scanning.
export async function listCollectionFaces(collectionId: string): Promise<CollectionFace[]> {
  const faces: CollectionFace[] = []
  let nextToken: string | undefined
  do {
    const res = await rek.send(new ListFacesCommand({
      CollectionId: collectionId, MaxResults: 4096, NextToken: nextToken,
    }))
    for (const f of res.Faces ?? []) {
      faces.push({ faceId: f.FaceId!, externalImageId: f.ExternalImageId, boundingBox: f.BoundingBox })
    }
    nextToken = res.NextToken
  } while (nextToken)
  return faces
}

// How many distinct indexed faces exist per photo (ExternalImageId = fileId)
// — needed to tell a genuine solo/couple shot apart from a group photo the
// target person(s) merely appear in.
export function faceCountByFileId(faces: CollectionFace[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const f of faces) {
    if (f.externalImageId) map.set(f.externalImageId, (map.get(f.externalImageId) ?? 0) + 1)
  }
  return map
}

// "Select one photo, find everyone else with the same face" — reuses the
// FaceId Rekognition already computed for an indexed gallery photo.
export async function searchByFaceId(collectionId: string, faceId: string, threshold: number): Promise<Set<string>> {
  const res = await rek.send(new SearchFacesCommand({
    CollectionId: collectionId, FaceId: faceId, FaceMatchThreshold: threshold, MaxFaces: 4096,
  }))
  return new Set((res.FaceMatches ?? []).map(m => m.Face?.ExternalImageId).filter((id): id is string => !!id))
}

// Solo/"Just them" filtering — keep only photos where the matched person(s)
// don't share the frame with more indexed faces than allowed (maxCount=1
// for a single target, 2 for a pair).
export function filterExclusive(ids: Iterable<string>, counts: Map<string, number>, maxCount: number): string[] {
  return Array.from(ids).filter(id => (counts.get(id) ?? 0) <= maxCount)
}

// Couple mode: intersect two independent single-face searches. "exclusive"
// (Just them) additionally requires exactly 2 indexed faces in the photo —
// i.e. no third person also present.
export function intersectExclusive(setA: Set<string>, setB: Set<string>, exclusive: boolean, counts: Map<string, number>): string[] {
  const intersection = Array.from(setA).filter(id => setB.has(id))
  return exclusive ? intersection.filter(id => (counts.get(id) ?? 0) === 2) : intersection
}
