// One-time backfill: grants the new 120 Moments Credit (raw AI-search
// credit equivalent) welcome bonus to every already-onboarded Moments
// personal Studio (isIndividual: true), now that the platform has a
// friendly "Moments Credits" display unit (see constants/studioPricing.ts
// #toMomentsCredits, lib/pricingConfig.ts's momentsCreditDivisor).
//
// ADDITIVE, never resets: adds onto aiSearchCreditsTotal (seeded from the
// free baseline via if_not_exists), so a studio that already topped up or
// used credits keeps that history intact — this only adds headroom.
// Studio Admin's own studios (isIndividual !== true) are completely
// untouched. Gated by Studio.momentsWelcomeBonusGrantedAt so re-running
// this script (even with --apply) can never double-grant.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-moments-credits-bonus.mjs           # dry run, prints only
//   node --env-file=.env.local scripts/backfill-moments-credits-bonus.mjs --apply   # writes to DynamoDB

import { DynamoDBClient, ScanCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' })

const STUDIOS_TABLE = process.env.DYNAMO_STUDIO_STUDIOS_TABLE ?? 'vayustudio-studios'
const PRICING_CONFIG_TABLE = process.env.DYNAMO_STUDIO_PRICING_CONFIG_TABLE ?? 'vayustudio-pricing-config'

const MOMENTS_CREDITS_BONUS = 120
const DEFAULT_DIVISOR = 50
const DEFAULT_FREE_AI_CREDITS = 200

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

  const configRow = await client.send(new GetItemCommand({
    TableName: PRICING_CONFIG_TABLE,
    Key: marshall({ configKey: 'live' }),
  })).then((r) => (r.Item ? unmarshall(r.Item) : null)).catch(() => null)
  const divisor = configRow?.momentsCreditDivisor ?? DEFAULT_DIVISOR
  const freeAiCredits = configRow?.freeAiSearchCredits ?? DEFAULT_FREE_AI_CREDITS
  const rawCreditsBonus = MOMENTS_CREDITS_BONUS * divisor
  console.log(`[backfill] granting ${MOMENTS_CREDITS_BONUS} Moments Credits = ${rawCreditsBonus} raw AI credits (divisor=${divisor})`)

  console.log(`[backfill] scanning ${STUDIOS_TABLE}...`)
  const studios = await scanAll(STUDIOS_TABLE)
  const moments = studios.filter((s) => s.isIndividual === true && !s.momentsWelcomeBonusGrantedAt)
  console.log(`[backfill] ${studios.length} studios total, ${moments.length} Moments studios eligible (isIndividual, not yet granted)`)

  let applied = 0, skippedRace = 0
  for (const studio of moments) {
    const currentTotal = studio.aiSearchCreditsTotal ?? freeAiCredits
    const newTotal = currentTotal + rawCreditsBonus
    console.log(`  ${studio.studioId} (${studio.name ?? 'unnamed'}): aiSearchCreditsTotal ${currentTotal} -> ${newTotal}`)

    if (!APPLY) continue

    try {
      await client.send(new UpdateItemCommand({
        TableName: STUDIOS_TABLE,
        Key: marshall({ studioId: studio.studioId }),
        UpdateExpression: 'SET aiSearchCreditsTotal = :total, momentsWelcomeBonusGrantedAt = :now, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(momentsWelcomeBonusGrantedAt)',
        ExpressionAttributeValues: marshall({ ':total': newTotal, ':now': new Date().toISOString() }),
      }))
      applied++
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        skippedRace++
        console.log(`    already granted (race with another run?) — skipped`)
      } else {
        throw err
      }
    }
  }

  console.log(`[backfill] done. ${APPLY ? `${applied} granted, ${skippedRace} already-granted skipped` : `${moments.length} would be granted`}.`)
  if (!APPLY && moments.length > 0) {
    console.log('[backfill] re-run with --apply to write these changes.')
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
