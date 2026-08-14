import { v4 as uuidv4 } from 'uuid'
import { getItem, putItem, queryByPK, updateItem } from '@/lib/aws/dynamodb'
import { initiateUpload, getBatchObjectKey, transferKey, NEW_UPLOAD_BACKEND } from '@/lib/aws/storage'
import { calculatePrice } from '@/lib/pricing'
import { deductFromWallet, getWalletBalance } from '@/lib/wallet'
import { sendTransferLinkEmail } from '@/lib/aws/ses'
import { logAudit } from '@/lib/audit'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
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

// Shared wallet-deduction preamble for both createBatchTransfer (client-
// driven multipart upload) and createDriveImportBatch (server-driven Drive
// import) — identical balance-check-then-deduct logic, same errors either
// caller already knows how to translate to HTTP responses.
async function deductForNewBatch(walletId: string, totalSizeBytes: number): Promise<{
  batchId: string
  pricing: PriceBreakdown
  balanceBeforePaise: number
}> {
  const walletsTable = process.env.DYNAMO_WALLETS_TABLE ?? 'vayu-wallets'
  const wallet = await getItem<Wallet>(walletsTable, { walletId })
  if (!wallet) throw new Error('WALLET_NOT_FOUND')

  const pricing = calculatePrice(totalSizeBytes)
  const balanceBeforePaise = await getWalletBalance(walletId)
  if (balanceBeforePaise < pricing.totalPaise) throw new Error('INSUFFICIENT_BALANCE')

  const batchId = uuidv4()
  await deductFromWallet(walletId, pricing.totalPaise, batchId)

  return { batchId, pricing, balanceBeforePaise }
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
  const pricing = calculatePrice(totalSizeBytes)
  const balanceBeforePaise = await getWalletBalance(walletId)
  if (balanceBeforePaise < pricing.totalPaise) throw new Error('INSUFFICIENT_BALANCE')

  const batchId = uuidv4()
  await deductFromWallet(walletId, pricing.totalPaise, batchId)

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

// ─── Google Drive import ────────────────────────────────────────────────
// A batch Transfer whose files are written directly by lambda/vayu-drive-
// import rather than a client-driven presigned-part upload — same wallet
// deduction and Transfer/TransferFile schema as createBatchTransfer above,
// but skips initiateUpload() entirely (no uploadId, no presigned parts:
// the Lambda performs one streaming multipart Upload of its own per file).

export interface IncomingDriveFile {
  driveFileId: string
  fileName: string          // final display/in-zip name, already carrying the
                             // export extension for Workspace files (e.g. "Budget.xlsx")
  fileSizeBytes: number     // real size for binary files; 0 for Workspace exports
                             // (unknown until Drive actually renders the export)
  relativePath?: string
  contentType: string       // real mimeType, or the export mimeType for Workspace files
  exportMimeType?: string   // set only for Workspace files — tells the Lambda to
                             // call drive.files.export instead of drive.files.get
}

export interface DriveBatchFileInitResult {
  fileId: string
  r2Key: string
  driveFileId: string
  fileName: string
  exportMimeType?: string
}

export async function createDriveImportBatch(params: {
  walletId: string
  files: IncomingDriveFile[]
  recipientEmails?: string[]
  expiryDays: number
}): Promise<{
  batchId: string
  files: DriveBatchFileInitResult[]
  pricing: PriceBreakdown
  balanceBeforePaise: number
}> {
  const { walletId, files, recipientEmails, expiryDays } = params
  const totalSizeBytes = files.reduce((sum, f) => sum + f.fileSizeBytes, 0)
  const { batchId, pricing, balanceBeforePaise } = await deductForNewBatch(walletId, totalSizeBytes)

  const now = new Date().toISOString()

  const fileResults = await Promise.all(
    files.map(async (f) => {
      const fileId = uuidv4()
      const objectKey = getBatchObjectKey(batchId, fileId, f.fileName)

      const transferFile: TransferFile = {
        batchId,
        fileId,
        fileName: f.fileName,
        relativePath: f.relativePath,
        fileSizeBytes: f.fileSizeBytes,
        contentType: f.contentType,
        storageBackend: NEW_UPLOAD_BACKEND,
        ...(NEW_UPLOAD_BACKEND === 'R2' ? { r2Key: objectKey } : { s3Key: objectKey }),
        status: 'pending',
        createdAt: now,
      }
      await putTransferFile(transferFile)

      return {
        fileId,
        r2Key: objectKey,
        driveFileId: f.driveFileId,
        fileName: f.fileName,
        exportMimeType: f.exportMimeType,
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
    status: 'pending',
    storageBackend: NEW_UPLOAD_BACKEND,
    fileCount: files.length,
    source: 'drive-import',
    expiryDays,
    expiryTime: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
  }
  await putItem(TRANSFERS_TABLE, transfer)

  return { batchId, files: fileResults, pricing, balanceBeforePaise }
}

// Marks one file of a batch 'uploaded' and, if that was the last one,
// atomically flips the Transfer to 'active' and sends the recipient
// emails — extracted from app/api/upload/batch/complete/route.ts so both
// that route (client-driven completion) and the Drive import Lambda's
// file-complete callback (server-driven completion) share the exact same
// race-safe "last file wins" logic instead of a hand-copied duplicate.
// The conditional write (status = 'pending' -> 'active') is what makes
// this safe under concurrent callers — whichever request observes every
// file uploaded AND wins the conditional write is the one that sends
// email/logs the audit event, no matter how many finish in the same instant.
export async function finalizeBatchIfComplete(params: {
  batchId: string
  fileId: string
  walletId: string
}): Promise<{ batchComplete: boolean }> {
  const { batchId, fileId, walletId } = params

  await updateTransferFileStatus(batchId, fileId, 'uploaded')

  const transfer = await getItem<Transfer>(TRANSFERS_TABLE, { fileId: batchId })
  if (!transfer) throw new Error('TRANSFER_NOT_FOUND')

  const allFiles = await getTransferFiles(transfer)
  const allUploaded = allFiles.every((f) => (f.fileId === fileId ? true : f.status === 'uploaded'))

  let justActivated = false
  if (allUploaded) {
    try {
      await updateItem(
        TRANSFERS_TABLE,
        { fileId: batchId },
        'SET #status = :active, completedAt = :now',
        { ':active': 'active', ':now': new Date().toISOString(), ':pending': 'pending' },
        '#status = :pending',
        { '#status': 'status' }
      )
      justActivated = true
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err
    }
  }

  if (justActivated) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const shareableLink = `${appUrl}/download/${batchId}`
    const recipients = transfer.recipientEmails ?? []
    for (const email of recipients) {
      sendTransferLinkEmail(email, transfer.fileName, shareableLink, transfer.expiryTime)
        .catch((err) => console.error('[ses] email send failed to', email, err))
    }

    void logAudit({
      eventType: 'UPLOAD_COMPLETED',
      actor: 'user',
      outcome: 'success',
      walletId,
      fileId: batchId,
      amountPaise: transfer.amountDeducted,
      metadata: {
        fileCount: transfer.fileCount,
        fileSizeBytes: transfer.fileSizeBytes,
        expiryTime: transfer.expiryTime,
        shareableLink,
        recipientEmailsSent: recipients.length,
      },
    })
  }

  return { batchComplete: allUploaded }
}
