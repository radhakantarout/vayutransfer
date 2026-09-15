import { studioDeleteItem, studioQueryByPK, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { deleteProjectCascade } from '@/lib/studio/projectDelete'
import type { MediaFile, GalleryMember, GalleryLike, GalleryComment, GalleryMessage, StudioReel } from '@/types/studio'

// Full cascade delete for a VayuStudios Moments gallery — everything
// deleteProjectCascade already handles (R2 objects, mediafiles, selections,
// the project row, storage counters) PLUS the Moments-only tables it knows
// nothing about: memberships, per-file likes/comments, group chat history,
// and reel history rows. Reel *output* videos in R2 are deliberately left
// alone (same "rely on the bucket's own lifecycle rule" acceptance already
// used elsewhere in this codebase, e.g. the watermark Lambda's orphaned
// preview objects) rather than adding per-reel R2 delete calls here.
export async function deleteMomentsGalleryCascade(studioId: string, projectId: string): Promise<void> {
  const mediafiles = await studioQueryByPK<MediaFile>(TABLES.mediafiles, 'projectId', projectId)

  const [likesByFile, commentsByFile] = await Promise.all([
    Promise.all(mediafiles.map((f) => studioQueryByPK<GalleryLike>(TABLES.galleryLikes, 'fileId', f.fileId))),
    Promise.all(mediafiles.map((f) => studioQueryByPK<GalleryComment>(TABLES.galleryComments, 'fileId', f.fileId))),
  ])

  const [members, messages, reels] = await Promise.all([
    studioQueryByPK<GalleryMember>(TABLES.galleryMembers, 'projectId', projectId),
    studioQueryByPK<GalleryMessage>(TABLES.galleryMessages, 'projectId', projectId),
    studioQueryByIndex<StudioReel>(TABLES.reels, 'projectId-createdAt-index', 'projectId = :p', { ':p': projectId }),
  ])

  await Promise.all([
    ...likesByFile.flatMap((likes, i) => likes.map((l) => studioDeleteItem(TABLES.galleryLikes, { fileId: mediafiles[i].fileId, userId: l.userId }))),
    ...commentsByFile.flatMap((comments, i) => comments.map((c) => studioDeleteItem(TABLES.galleryComments, { fileId: mediafiles[i].fileId, commentId: c.commentId }))),
    ...members.map((m) => studioDeleteItem(TABLES.galleryMembers, { projectId, userId: m.userId })),
    ...messages.map((m) => studioDeleteItem(TABLES.galleryMessages, { projectId, messageId: m.messageId })),
    ...reels.map((r) => studioDeleteItem(TABLES.reels, { reelId: r.reelId })),
  ])

  // Handles the mediafiles (R2 delete + row delete), the project row itself,
  // and the studio's projectCount/billableStorageBytes counters.
  await deleteProjectCascade(studioId, projectId)
}
