import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  DeleteItemCommand,
  ScanCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const TABLES = {
  studios:    process.env.DYNAMO_STUDIO_STUDIOS_TABLE    ?? 'vayustudio-studios',
  projects:   process.env.DYNAMO_STUDIO_PROJECTS_TABLE   ?? 'vayustudio-projects',
  mediafiles: process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE ?? 'vayustudio-mediafiles',
  selections: process.env.DYNAMO_STUDIO_SELECTIONS_TABLE ?? 'vayustudio-selections',
  users:      process.env.DYNAMO_STUDIO_USERS_TABLE      ?? 'vayustudio-users',
  auditlog:   process.env.DYNAMO_STUDIO_AUDITLOG_TABLE   ?? 'vayustudio-auditlog',
  faces:      process.env.DYNAMO_STUDIO_FACES_TABLE      ?? 'vayustudio-faces',
  jobs:       process.env.DYNAMO_STUDIO_JOBS_TABLE       ?? 'vayustudio-jobs',
  transfers:  process.env.DYNAMO_STUDIO_TRANSFERS_TABLE  ?? 'vayustudio-transfers',
  websites:   process.env.DYNAMO_STUDIO_WEBSITES_TABLE   ?? 'vayustudio-websites',
  bookings:   process.env.DYNAMO_STUDIO_BOOKINGS_TABLE   ?? 'vayustudio-bookings',
  // Billing — deliberately separate tables from VayuTransfer's vayu-transactions,
  // never shared/imported across the two products.
  transactions: process.env.DYNAMO_STUDIO_TRANSACTIONS_TABLE ?? 'vayustudio-transactions',
  usage:        process.env.DYNAMO_STUDIO_USAGE_TABLE        ?? 'vayustudio-usage',
} as const

export { TABLES }

export async function studioGetItem<T>(
  table: string,
  key: Record<string, unknown>
): Promise<T | null> {
  const res = await client.send(new GetItemCommand({
    TableName: table,
    Key: marshall(key),
    ConsistentRead: true,
  }))
  return res.Item ? (unmarshall(res.Item) as T) : null
}

export async function studioPutItem(
  table: string,
  item: Record<string, unknown>
): Promise<void> {
  await client.send(new PutItemCommand({
    TableName: table,
    Item: marshall(item, { removeUndefinedValues: true }),
  }))
}

export async function studioUpdateItem(
  table: string,
  key: Record<string, unknown>,
  updateExpression: string,
  expressionValues: Record<string, unknown>,
  expressionNames?: Record<string, string>,
  conditionExpression?: string
): Promise<void> {
  await client.send(new UpdateItemCommand({
    TableName: table,
    Key: marshall(key),
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: marshall(expressionValues, { removeUndefinedValues: true }),
    ...(expressionNames ? { ExpressionAttributeNames: expressionNames } : {}),
    ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
  }))
}

export async function studioDeleteItem(
  table: string,
  key: Record<string, unknown>
): Promise<void> {
  await client.send(new DeleteItemCommand({
    TableName: table,
    Key: marshall(key),
  }))
}

export async function studioQueryByIndex<T>(
  table: string,
  indexName: string,
  keyCondition: string,
  expressionValues: Record<string, unknown>,
  expressionNames?: Record<string, string>,
  limit?: number
): Promise<T[]> {
  const res = await client.send(new QueryCommand({
    TableName: table,
    IndexName: indexName,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: marshall(expressionValues, { removeUndefinedValues: true }),
    ...(expressionNames ? { ExpressionAttributeNames: expressionNames } : {}),
    ...(limit ? { Limit: limit } : {}),
  }))
  return (res.Items ?? []).map((i) => unmarshall(i) as T)
}

export async function studioScanTable<T>(table: string): Promise<T[]> {
  const items: T[] = []
  let lastKey: Record<string, AttributeValue> | undefined
  do {
    const res = await client.send(new ScanCommand({
      TableName: table,
      ExclusiveStartKey: lastKey,
    }))
    for (const item of res.Items ?? []) items.push(unmarshall(item) as T)
    lastKey = res.LastEvaluatedKey as Record<string, AttributeValue> | undefined
  } while (lastKey)
  return items
}

export async function studioQueryByPK<T>(
  table: string,
  pkName: string,
  pkValue: string,
  skCondition?: { expression: string; values: Record<string, unknown> }
): Promise<T[]> {
  const keyCondition = skCondition
    ? `${pkName} = :pk AND ${skCondition.expression}`
    : `${pkName} = :pk`

  const expressionValues = skCondition
    ? { ':pk': pkValue, ...skCondition.values }
    : { ':pk': pkValue }

  const res = await client.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: marshall(expressionValues),
  }))
  return (res.Items ?? []).map((i) => unmarshall(i) as T)
}
