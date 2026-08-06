import { v4 as uuidv4 } from 'uuid'
import { getItem, putItem, queryByPK, updateItem } from '@/lib/aws/dynamodb'
import { initiateUpload, getBatchObjectKey, transferKey, NEW_UPLOAD_BACKEND } from '@/lib/aws/storage'
import { calculatePrice } from '@/lib/pricing'
import { deductFromWallet, getWalletBalance, getFreeQuotaUsedBytes, consumeFreeQuota } from '@/lib/wallet'
import { MULTIPART_CHUNK_SIZE_BYTES } from '@/constants/pricing'
import type { PriceBreakdown, Transfer, TransferFile, Wallet } from '@/types'

const TRANSFER_FILES_TABLE = process.env.DYNAMO_TRANSFER_FILES_TABLE ?? 'vayu-transfer-files'
const TRANSFERS_TABLE = process.env.DYNAMO_TRANSFERS_TABLE ?? 'vayu-transfers'

export interface IncomingBatchFile {
  fileName: string
  fileSizeBytes: number
  relativePath?: string
  contentType?: string
}

export interface BatchFileInitResult {
  fileId: string
  uploadId: string
  key: string
  fileName: string
  fileSizeBytes: number
  totalChunks: number
}

// The money-and-storage core shared by both the normal "send" batch flow
// (/api/upload/batch/initiate, client-supplied walletId) and the "receive"
// flow (/api/receive/[requestId]/initiate, walletId resolved server-side
// from the request record) — same wallet deduction, same per-file multipart
// initiate, same Transfer/TransferFile creation, just a different caller
// resolving which wallet pays. Throws Error('WALLET_NOT_FOUND') or
// Error('INSUFFICIENT_BALANCE'); callers translate those to HTTP responses
// and handle audit logging themselves since the event types differ.
export async function createBatchTransfer(params: {
  walletId: string
  files: IncomingBatchFile[]
  recipientEmails?: string[]
  expiryDays: number
}): Promise<{
  batchId: string
  files: BatchFileInitResult[]
  pricing: PriceBreakdown
  balanceBeforePaise: number
  chunkSizeBytes: number
}> {
  const { walletId, files, recipientEmails, expiryDays } = params

  const walletsTable = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
  const wallet = await getItem<Wallet>(walletsTable, { walletId })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const totalSizeBytes = files.reduce((sum, f) => sum + f.fileSizeBytes, 0)
  const freeUsedBytes = await getFreeQuotaUsedBytes(walletId)
  const pricing = calculatePrice(totalSizeBytes, freeUsedBytes)
  const balanceBeforePaise = await getWalletBalance(walletId)
  if (!pricing.isFree && balanceBeforePaise < pricing.totalPaise) throw new Error('INSUFFICIENT_BALANCE')

  const batchId = uuidv4()
  if (pricing.isFree) {
    await consumeFreeQuota(walletId, totalSizeBytes)
  } else {
    await deductFromWallet(walletId, pricing.totalPaise, batchId)
  }

  const now = new Date().toISOString()

  const fileResults = await Promise.all(
    files.map(async (f) => {
      const fileId = uuidv4()
      const objectKey = getBatchObjectKey(batchId, fileId, f.fileName)
      const uploadId = await initiateUpload(NEW_UPLOAD_BACKEND, objectKey, f.contentType ?? 'application/octet-stream')

      const transferFile: TransferFile = {
        batchId,
        fileId,
        fileName: f.fileName,
        relativePath: f.relativePath,
        fileSizeBytes: f.fileSizeBytes,
        contentType: f.contentType ?? 'application/octet-stream',
        storageBackend: NEW_UPLOAD_BACKEND,
        ...(NEW_UPLOAD_BACKEND === 'R2' ? { r2Key: objectKey } : { s3Key: objectKey }),
        uploadId,
        status: 'pending',
        createdAt: now,
      }
      await putTransferFile(transferFile)

      return {
        fileId,
        uploadId,
        key: objectKey,
        fileName: f.fileName,
        fileSizeBytes: f.fileSizeBytes,
        totalChunks: Math.ceil(f.fileSizeBytes / MULTIPART_CHUNK_SIZE_BYTES),
      }
    })
  )

  const transfer: Transfer = {
    fileId: batchId,
    walletId,
    fileName: files.length === 1 ? files[0].fileName : `${files.length} files`,
    fileSizeBytes: totalSizeBytes,
    billableGB: pricing.billableGB,
    downloadsUsed: 0,
    recipientEmails,
    amountDeducted: pricing.totalPaise,
    isFreeTransfer: pricing.isFree,
    status: 'pending',
    storageBackend: NEW_UPLOAD_BACKEND,
    fileCount: files.length,
    expiryDays,
    expiryTime: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  }
  await putItem(TRANSFERS_TABLE, transfer)

  return { batchId, files: fileResults, pricing, balanceBeforePaise, chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES }
}

// Backward-compatible read path: a pre-batch-model Transfer IS the one file
// it describes (no TransferFile rows exist for it), a batch Transfer
// (fileCount set) always has exactly fileCount TransferFile rows keyed by
// its own fileId as their batchId. Every caller that needs "the files in
// this transfer" — download page, activity, dashboard — goes through here
// instead of branching on fileCount itself.
export async function getTransferFiles(transfer: Transfer): Promise<TransferFile[]> {
  if (!transfer.fileCount) {
    return [
      {
        batchId: transfer.fileId,
        fileId: transfer.fileId,
        fileName: transfer.fileName,
        fileSizeBytes: transfer.fileSizeBytes,
        contentType: 'application/octet-stream',
        storageBackend: transfer.storageBackend,
        s3Key: transfer.s3Key,
        r2Key: transfer.r2Key,
        status: transfer.status === 'failed' ? 'failed' : 'uploaded',
        createdAt: transfer.createdAt,
      },
    ]
  }

  const files = await queryByPK<TransferFile>(
    TRANSFER_FILES_TABLE,
    'batchId = :b',
    { ':b': transfer.fileId }
  )
  return files.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putTransferFile(file: TransferFile): Promise<void> {
  await putItem(TRANSFER_FILES_TABLE, file)
}

export async function updateTransferFileStatus(
  batchId: string,
  fileId: string,
  status: TransferFile['status']
): Promise<void> {
  await updateItem(
    TRANSFER_FILES_TABLE,
    { batchId, fileId },
    'SET #s = :status',
    { ':status': status },
    undefined,
    { '#s': 'status' }
  )
}

// The authoritative storage key for one file within a batch — same
// never-trust-the-client resolution rule as Transfer's own transferKey.
export function transferFileKey(file: Pick<TransferFile, 'storageBackend' | 's3Key' | 'r2Key'>): string {
  return transferKey(file)
}
