import { studioQueryByPK, TABLES } from './dynamodb'
import type { StudioTransfer, StudioTransferFile } from '@/types/studio'

// The one read path every caller (public download page, My Transfers detail
// panel, move/copy) uses instead of branching on transfer.fileCount itself —
// mirrors VayuTransfer's own lib/transferBatch.ts#getTransferFiles exactly.
// A transfer with no fileCount (every single-file SEND, and all of RECEIVE)
// synthesizes a single-element array straight from the parent's own scalar
// fields, so this works unchanged for every record that existed before
// batch transfers did — no backfill needed. A real batch queries its child
// rows from TABLES.transferFiles.
export async function getTransferFiles(transfer: StudioTransfer, consistentRead = false): Promise<StudioTransferFile[]> {
  if (!transfer.fileCount) {
    if (!transfer.filename) return []
    return [{
      transferId: transfer.transferId,
      fileId: transfer.transferId,
      filename: transfer.filename,
      relativePath: transfer.filename,
      mimeType: transfer.mimeType ?? '',
      sizeBytes: transfer.sizeBytes ?? 0,
      r2Key: transfer.r2Key ?? '',
      status: transfer.status === 'READY' ? 'UPLOADED' : transfer.status === 'FAILED' ? 'FAILED' : 'UPLOADING',
      downloadCount: transfer.downloadCount,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    }]
  }

  const files = await studioQueryByPK<StudioTransferFile>(TABLES.transferFiles, 'transferId', transfer.transferId, undefined, consistentRead)
  return files.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
}
