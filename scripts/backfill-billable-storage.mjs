// One-time backfill: sums each studio's real mediafiles.sizeBytes into the
// new Studio.billableStorageBytes field (the live, delete-aware metric added
// for usage billing). Must run once before quota enforcement goes live —
// otherwise every studio starts at 0 and appears falsely within quota
// regardless of how much they've actually stored.
//
// Safe to re-run: it overwrites billableStorageBytes with a freshly computed
// sum each time, it doesn't add to it.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-billable-storage.mjs           # dry run, prints only
//   node --env-file=.env.local scripts/backfill-billable-storage.mjs --apply   # writes to DynamoDB

import {
  DynamoDBClient, ScanCommand, UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const STUDIOS_TABLE    = process.env.DYNAMO_STUDIO_STUDIOS_TABLE    ?? 'vayustudio-studios'
const MEDIAFILES_TABLE = process.env.DYNAMO_STUDIO_MEDIAFILES_TABLE ?? 'vayustudio-mediafiles'

const APPLY = process.argv.includes('--apply')

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
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)
  console.log(`[backfill] scanning ${MEDIAFILES_TABLE}...`)
  const mediafiles = await scanAll(MEDIAFILES_TABLE)
  console.log(`[backfill] found ${mediafiles.length} media files`)

  const bytesByStudio = new Map()
  for (const f of mediafiles) {
    if (!f.studioId) continue
    bytesByStudio.set(f.studioId, (bytesByStudio.get(f.studioId) ?? 0) + (f.sizeBytes ?? 0))
  }

  console.log(`[backfill] scanning ${STUDIOS_TABLE}...`)
  const studios = await scanAll(STUDIOS_TABLE)
  console.log(`[backfill] found ${studios.length} studios`)

  let changed = 0
  for (const studio of studios) {
    const computed = bytesByStudio.get(studio.studioId) ?? 0
    const current = studio.billableStorageBytes ?? 0
    if (computed === current) continue

    changed++
    console.log(`  ${studio.studioId} (${studio.name ?? 'unnamed'}): ${current} -> ${computed} bytes`)

    if (APPLY) {
      await client.send(new UpdateItemCommand({
        TableName: STUDIOS_TABLE,
        Key: marshall({ studioId: studio.studioId }),
        UpdateExpression: 'SET billableStorageBytes = :b, updatedAt = :now',
        ExpressionAttributeValues: marshall({ ':b': computed, ':now': new Date().toISOString() }),
      }))
    }
  }

  console.log(`[backfill] done. ${changed}/${studios.length} studios ${APPLY ? 'updated' : 'would be updated'}.`)
  if (!APPLY && changed > 0) {
    console.log('[backfill] re-run with --apply to write these changes.')
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
