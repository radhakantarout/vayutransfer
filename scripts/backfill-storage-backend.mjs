// One-time backfill: sets storageBackend="S3" on every existing MediaFile
// record that predates the S3->R2 migration (no storageBackend field at all).
// New uploads set storageBackend="R2" themselves at upload time — this script
// only needs to run once per environment, for the files that already existed
// before the migration shipped there.
//
// Safe to re-run: only touches records where storageBackend is genuinely
// absent, never overwrites an existing value either way.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-storage-backend.mjs           # dry run, prints only
//   node --env-file=.env.local scripts/backfill-storage-backend.mjs --apply   # writes to DynamoDB
//
// Refuses to run against a non "-test" table unless --force is also passed —
// this migration is test-only until Phase 4 (production rollout) explicitly
// approves running it there.

import {
  DynamoDBClient, ScanCommand, UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const MEDIAFILES_TABLE = process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE ?? 'vayustudio-mediafiles'

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

async function scanAll(table) {
  const items = []
  let lastKey
  do {
    const res = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }))
    for (const item of res.Items ?? []) items.push(unmarshall(item))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)
  return items
}

async function main() {
  if (!MEDIAFILES_TABLE.endsWith('-test') && !FORCE) {
    console.error(`[backfill] refusing to run against "${MEDIAFILES_TABLE}" — doesn't look like a -test table.`)
    console.error('[backfill] this migration is test-only until Phase 4 explicitly approves production. Pass --force to override.')
    process.exit(1)
  }

  console.log(`[backfill] mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)
  console.log(`[backfill] scanning ${MEDIAFILES_TABLE}...`)
  const files = await scanAll(MEDIAFILES_TABLE)
  console.log(`[backfill] found ${files.length} media files`)

  const needsBackfill = files.filter((f) => !f.storageBackend)
  console.log(`[backfill] ${needsBackfill.length} files missing storageBackend`)

  for (const f of needsBackfill) {
    console.log(`  ${f.projectId} / ${f.fileId} (${f.originalFilename ?? 'unnamed'}): -> S3`)
    if (APPLY) {
      await client.send(new UpdateItemCommand({
        TableName: MEDIAFILES_TABLE,
        Key: marshall({ projectId: f.projectId, fileId: f.fileId }),
        UpdateExpression: 'SET storageBackend = :s',
        ConditionExpression: 'attribute_not_exists(storageBackend)',
        ExpressionAttributeValues: marshall({ ':s': 'S3' }),
      })).catch((err) => {
        if (err.name !== 'ConditionalCheckFailedException') throw err
      })
    }
  }

  console.log(`[backfill] done. ${needsBackfill.length}/${files.length} files ${APPLY ? 'updated' : 'would be updated'}.`)
  if (!APPLY && needsBackfill.length > 0) {
    console.log('[backfill] re-run with --apply to write these changes.')
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
