// Shared "admin force-delete" storage-cleanup logic — used by the
// individual per-transfer/per-receive-request admin delete routes AND the
// "Clear All" bulk action, so all three call one real implementation
// instead of hand-copying the same abort/cleanup steps three times.
// No wallet refund anywhere here, matching the existing user-facing
// DELETE /api/transfers/[fileId] policy: deleting early forfeits any
// remaining retention, same as letting it expire naturally.

import { getItem, updateItem } from '@/lib/aws/dynamodb'
import { deleteStorageObject, deleteStorageObjectByKey } from '@/lib/aws/storage'
import { getTransferFiles, transferFileKey } from '@/lib/transferBatch'
import type { Transfer, ReceiveRequest } from '@/types'

const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'
const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

export async function deleteTransferAndStorage(transfer: Transfer): Promise<void> {
  if (transfer.status === 'deleted') return

  if (transfer.fileCount) {
    const files = await getTransferFiles(transfer)
    await Promise.all(
      files
        .filter((f) => f.status === 'uploaded')
        .map((f) =>
          deleteStorageObjectByKey(f.storageBackend, transferFileKey(f))
            .catch((err) => console.error('[adminDelete] failed to delete object for', f.fileId, err))
        )
    )
  } else if (transfer.status === 'active') {
    await deleteStorageObject(transfer).catch((err) => console.error('[adminDelete] failed to delete object for', transfer.fileId, err))
  }

  await updateItem(
    TRANSFERS_TABLE,
    { fileId: transfer.fileId },
    'SET #s = :deleted',
    { ':deleted': 'deleted' },
    undefined,
    { '#s': 'status' }
  )
}

export async function deleteReceiveRequestAndCascade(request: ReceiveRequest): Promise<{ deletedTransfer: boolean }> {
  let deletedTransfer = false

  if (request.status !== 'cancelled' && request.resultFileId) {
    const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId: request.resultFileId })
    if (transfer && transfer.status !== 'deleted') {
      await deleteTransferAndStorage(transfer)
      deletedTransfer = true
    }
  }

  if (request.status !== 'cancelled') {
    await updateItem(
      RECEIVE_REQUESTS_TABLE,
      { requestId: request.requestId },
      'SET #s = :cancelled',
      { ':cancelled': 'cancelled' },
      undefined,
      { '#s': 'status' }
    )
  }

  return { deletedTransfer }
}
