import { getItem, putItem, deleteItem } from '@/lib/aws/dynamodb'
import type { DriveToken } from '@/types'

const DRIVE_TOKENS_TABLE = process.env.DYNAMO_DRIVE_TOKENS_TABLE ?? 'vayu-drive-tokens'

export async function getDriveToken(userId: string): Promise<DriveToken | null> {
  return getItem<DriveToken>(DRIVE_TOKENS_TABLE, { userId })
}

export async function saveDriveToken(userId: string, refreshToken: string, scope: string): Promise<void> {
  const token: DriveToken = { userId, refreshToken, scope, connectedAt: new Date().toISOString() }
  await putItem(DRIVE_TOKENS_TABLE, token)
}

export async function deleteDriveToken(userId: string): Promise<void> {
  await deleteItem(DRIVE_TOKENS_TABLE, { userId })
}
