import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
})

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
})

export async function getItem<T>(
  table: string,
  key: Record<string, NativeAttributeValue>
): Promise<T | null> {
  const result = await docClient.send(new GetCommand({ TableName: table, Key: key }))
  return (result.Item as T) ?? null
}

export async function putItem(
  table: string,
  item: object
): Promise<void> {
  await docClient.send(new PutCommand({ TableName: table, Item: item as Record<string, unknown> }))
}

export async function updateItem(
  table: string,
  key: Record<string, NativeAttributeValue>,
  updateExpression: string,
  expressionAttributeValues: Record<string, NativeAttributeValue>,
  conditionExpression?: string,
  expressionAttributeNames?: Record<string, string>
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(conditionExpression && { ConditionExpression: conditionExpression }),
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
    })
  )
}

export async function queryItems<T>(
  table: string,
  indexName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, NativeAttributeValue>,
  filterExpression?: string,
  expressionAttributeNames?: Record<string, string>
): Promise<T[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: table,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
    })
  )
  return (result.Items as T[]) ?? []
}

// Query on the table's own primary key (partition [+ sort] key) — no GSI.
// e.g. every TransferFile row for one batchId, where batchId is the HASH key.
export async function queryByPK<T>(
  table: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, NativeAttributeValue>
): Promise<T[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  )
  return (result.Items as T[]) ?? []
}

export async function deleteItem(
  table: string,
  key: Record<string, NativeAttributeValue>
): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: table, Key: key }))
}

// ─── Admin-only helpers ──────────────────────────────────────────────────
// Full-table scans — only used by the platform-admin dashboard
// (app/api/admin/**), never on a hot user-facing path. Same trade-off
// VayuStudios' own admin stats route already makes (no running counters);
// fine at current scale, worth revisiting with incremental counters if a
// table gets large enough for this to matter.

// Cheap count-only scan (DynamoDB Select: 'COUNT' skips returning item
// data, just paginates and sums Count/ScannedCount).
export async function scanCount(
  table: string,
  filterExpression?: string,
  expressionAttributeValues?: Record<string, NativeAttributeValue>,
  expressionAttributeNames?: Record<string, string>
): Promise<number> {
  let total = 0
  let lastKey: Record<string, NativeAttributeValue> | undefined
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: table,
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
        ...(filterExpression && { FilterExpression: filterExpression }),
        ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
        ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
      })
    )
    total += result.Count ?? 0
    lastKey = result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined
  } while (lastKey)
  return total
}

// Full scan returning every item — only for admin tables expected to stay
// small-to-moderate (users, wallets). Paginates via LastEvaluatedKey.
export async function scanAll<T>(
  table: string,
  filterExpression?: string,
  expressionAttributeValues?: Record<string, NativeAttributeValue>,
  expressionAttributeNames?: Record<string, string>
): Promise<T[]> {
  const items: T[] = []
  let lastKey: Record<string, NativeAttributeValue> | undefined
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: lastKey,
        ...(filterExpression && { FilterExpression: filterExpression }),
        ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
        ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
      })
    )
    items.push(...((result.Items as T[]) ?? []))
    lastKey = result.LastEvaluatedKey as Record<string, NativeAttributeValue> | undefined
  } while (lastKey)
  return items
}
