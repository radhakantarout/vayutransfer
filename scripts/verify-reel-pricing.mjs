// Sanity-checks the AI Reel credit-pricing formula and pack margins. No AWS
// dependency and no test framework exists in this repo (see package.json),
// so this follows the same plain-script convention as the other scripts/
// here rather than introducing a new dev dependency.
//
// IMPORTANT: this intentionally duplicates constants/videoProviders.ts's
// numbers and formula (a .mjs script here can't import a .ts module without
// a build step) — if that file's constants or computeReelCost/
// packEffectiveMarginPct logic change, update this script's copies too.
//
// Usage: node scripts/verify-reel-pricing.mjs

const KLING_COST_PAISE_PER_AI_SECOND = 970
const FIXED_OVERHEAD_PAISE_PER_REEL = 400
const TARGET_MARGIN = 0.55
const MIN_MARGIN_FLOOR = 0.35
const CREDIT_VALUE_PAISE = 8000

const REEL_CREDIT_PACKS = [
  { id: 'starter', credits: 5,  monthlyPricePaise: 36000,  annualPricePaise: 32400 },
  { id: 'studio',  credits: 20, monthlyPricePaise: 136000, annualPricePaise: 122400 },
  { id: 'pro',     credits: 60, monthlyPricePaise: 384000, annualPricePaise: 337920 },
]

function computeReelCost(heroClipCount, avgClipDurationSec) {
  const rawCostPaise = Math.round(heroClipCount * avgClipDurationSec * KLING_COST_PAISE_PER_AI_SECOND + FIXED_OVERHEAD_PAISE_PER_REEL)
  const sellPricePaise = Math.round(rawCostPaise / (1 - TARGET_MARGIN))
  const creditsRequired = Math.max(1, Math.ceil(sellPricePaise / CREDIT_VALUE_PAISE))
  return { rawCostPaise, sellPricePaise, creditsRequired }
}

function packMarginPct(pack, billingCycle) {
  const costPerCreditPaise = CREDIT_VALUE_PAISE * (1 - TARGET_MARGIN)
  const price = billingCycle === 'annual' ? pack.annualPricePaise : pack.monthlyPricePaise
  const pricePerCreditPaise = price / pack.credits
  return ((pricePerCreditPaise - costPerCreditPaise) / pricePerCreditPaise) * 100
}

let failures = 0
function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ok  ${label}`)
  } else {
    failures++
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('== Dynamic per-reel credit cost ==')
for (const [label, heroClips, avgSec] of [
  ['15s light (3 clips x 3s)', 3, 3],
  ['30s default (5 clips x 3s)', 5, 3],
  ['60s heavy (6 clips x 5s)', 6, 5],
]) {
  const r = computeReelCost(heroClips, avgSec)
  console.log(`  ${label}: raw ₹${(r.rawCostPaise / 100).toFixed(2)}, sell ₹${(r.sellPricePaise / 100).toFixed(2)}, ${r.creditsRequired} credits`)
  assert(`${label} — credits required is a positive integer`, Number.isInteger(r.creditsRequired) && r.creditsRequired > 0)
  assert(`${label} — sell price implies >= ${Math.round(TARGET_MARGIN * 100)}% margin over raw cost`, r.sellPricePaise * (1 - TARGET_MARGIN) >= r.rawCostPaise - 1)
}

console.log('\n== Credit pack margins vs MIN_MARGIN_FLOOR ==')
for (const pack of REEL_CREDIT_PACKS) {
  for (const cycle of ['monthly', 'annual']) {
    const marginPct = packMarginPct(pack, cycle)
    console.log(`  ${pack.id} (${cycle}): ${marginPct.toFixed(1)}% margin`)
    assert(`${pack.id} (${cycle}) margin >= ${MIN_MARGIN_FLOOR * 100}% floor`, marginPct >= MIN_MARGIN_FLOOR * 100 - 0.5, `got ${marginPct.toFixed(1)}%`)
  }
  assert(`${pack.id} annual price is cheaper than monthly`, pack.annualPricePaise < pack.monthlyPricePaise)
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`)
process.exit(failures === 0 ? 0 : 1)
