# VayuStudios AI Reel Generator — Design Document

Status: **design only, nothing built yet**. Companion to `VayuStudios AI Reel Generator.md` (the original feature brief this refines). Grounded in the actual VayuStudios codebase as of 2026-09-08, not a generic spec.

---

## 1. Executive Summary

Let a studio's client (from their Client Gallery) or a wedding guest (from Guest Selfie Search) pick a handful of photos and get back a short, premium-feeling AI-animated video reel — cinematic pans/zooms on most photos, real AI-generated motion (via Kling 3.0) on a few "hero" shots. This is a **metered, pay-per-use feature**, priced and costed like the existing AI-search-credits system (per-photo-indexing), not like storage (which is nearly free to VayuStudios thanks to R2's zero egress).

Three findings from researching the existing codebase shape this whole design:

1. **A near-identical metering pattern already exists and should be copied, not reinvented.** `Studio.aiSearchCreditsUsed/Total` + `checkAiCreditsAvailable()` + a Lambda that increments usage per-unit the instant real money is spent — that's the exact shape a Reel-credits system needs.
2. **The async-job plumbing already exists and should be extended, not duplicated.** `StudioJob` (one DynamoDB table, `jobType` discriminator, fire-and-forget Lambda invoke, 2–6s client polling) already backs face-indexing, watermarking, and zip downloads. Reels become a fourth `jobType`.
3. **FFmpeg does not exist anywhere in this codebase today.** Every other Lambda (watermark, zip, face-index) handles images or raw bytes only. The video-assembly stage is genuinely new infrastructure — the single biggest engineering unknown in this feature, not the AI provider integration.

Nothing here modifies an existing route, table, or Lambda. Every change is additive (new `jobType` enum member, new optional `Studio` fields, new tables/routes/components) — see §10 for the explicit non-invasiveness guarantee.

---

## 2. Goals and Non-Goals

**In scope for v1:**
- Client Gallery → Reel (full flow)
- Guest Selfie Search → Reel (full flow, with a real fix to a trust gap described in §5)
- Kling 3.0 as the only live provider, behind a real abstraction
- Hybrid generation: a few AI hero clips + FFmpeg Ken Burns/pan/zoom for the rest
- Credit-based metering and Razorpay top-ups, matching the existing billing system exactly

**Explicitly out of scope for v1** (deferred, not forgotten):
- Runway / Luma / Veo — interface stubs only, no live integration
- Studio-branded overlays/watermarks on reels — nice-to-have, adds render complexity, punt to v2
- Reel editing (trim/reorder after generation) — v1 lets the user reorder *before* generation only
- Bundling reel credits free into the existing Pro plan — the economics don't support it (§7)

---

## 3. User Flow

### 3a. Client Gallery
1. Client opens their gallery at `app/studio/api/client/gallery/[token]` (existing `studio_token` JWT, role `CLIENT`, scoped to their project — `lib/studio/auth.ts:37-52`).
2. Sees a new `AIReelButton` next to existing gallery actions.
3. `ReelPhotoSelector` — reuses the existing photo-grid selection idiom (`Set<string>` toggle, checkmark overlay, "select all"/clear — same shape as `StartSortingModal.tsx`'s grid), 5–30 photos.
4. `ReelStyleSelector` + `ReelSettings` (style, aspect ratio, resolution, duration).
5. Client-side quick check: server will re-validate everything, but the button should already grey out if the client is below the reel-credit balance the studio has available, to avoid a dead-end submit.
6. `POST /studio/api/client/gallery/[token]/reels` → job created, `reelId` returned immediately.
7. `ReelGenerationScreen` polls status, cinematic stage messaging (§ "Generation Experience" in the original brief — carried over unchanged, it's good).
8. `ReelPreview` → download/share/WhatsApp/Create Another.
9. Job appears in "My Reels" (`ReelHistory`), same page pattern as the gallery itself.

### 3b. Guest Selfie Search
Same UI components, different auth wiring:
1. Guest is inside `app/studio/guest/[token]` with a `GUEST_QR` JWT (not `studio_token` — a completely separate trust tier, see §5).
2. Guest runs a selfie search (existing `search/route.ts`), gets back matched photos.
3. Guest picks 5–30 of *their own matched* photos (see §5 for why "their own matched" needs new server-side work, not just UI-level restriction).
4. Same generation/preview/share flow.
5. No "My Reels" history for guests beyond a short-lived link — configurable retention, matching how guest search results themselves are already treated as ephemeral (no persisted "guest session" record exists today — see §5).

---

## 4. System Architecture

### 4.1 Data model

**Extend, don't replace.** `types/studio.ts`:

```ts
// Add to the existing JobType union (types/studio.ts:262)
export type JobType = 'INDEX_FACES' | 'ZIP_DOWNLOAD' | 'SELFIE_SEARCH' | 'WATERMARK' | 'AI_REEL'
```

A Reel job is a `StudioJob` row (`TABLES.jobs`, no new table needed for the job envelope itself):

```ts
inputPayload: {
  source: 'CLIENT_GALLERY' | 'GUEST_SELFIE_SEARCH'
  photoIds: string[]          // re-validated server-side before use, never trusted as final
  style: ReelStyle
  aspectRatio: '9:16' | '4:5' | '16:9'
  resolution: '720p' | '1080p'
  durationSec: 15 | 30 | 45 | 60
  guestJwtProjectId?: string  // decoded server-side at creation, stamped for audit
}
outputPayload: {
  stage: 'analyzing' | 'planning' | 'generating' | 'assembling' | 'finalizing'
  processed: number            // hero clips completed
  total: number                 // hero clips required
  outputUrl?: string
  thumbnailUrl?: string
  providerUsed?: string         // 'kling' — internal only, never sent to frontend
  estimatedCostPaise?: number
  actualCostPaise?: number
  retryCount?: number
}
```

This reuses the exact `{stage, processed, total}` progress shape the zip Lambda already writes, so `useJobTracker.ts` needs only a new interval-map entry (`AI_REEL: 3000`), not new polling logic.

**One new table**, because a Reel needs richer structured data than fits `StudioJob.outputPayload` (the story plan, per-photo analysis, cost ledger) and because this data should outlive the job's own TTL for "My Reels" history:

```
vayustudio-reels (+ -test)
PK: reelId
studioId, projectId, source, guestJwtProjectId?
photoIds: string[]
analysis: PhotoAnalysis[]        // category, faces, qualityScore, compositionScore, orientation, recommendedMotion, aiVideoRecommended
storyPlan: { sequence: [{photoId, role, motion, aiGenerationRequired}] }
style, aspectRatio, resolution, durationSec
status: ReelStatus                // mirrors JobStatus but with the finer stages from the brief
provider: 'kling'
providerJobIds: string[]          // one per hero clip, for cancel/retry
outputUrl, thumbnailUrl
estimatedCostPaise, actualCostPaise
creditsCharged: number
createdAt, startedAt, completedAt, expiresAt
errorCode, errorMessage
jobId                              // FK back to the StudioJob driving it
```

Same PAY_PER_REQUEST, no-GSI shape as `vayustudio-jobs`/`vayu-transfer-files`, `DYNAMO_STUDIO_REELS_TABLE` env var following the established `DYNAMO_STUDIO_<NAME>_TABLE` convention (`lib/studio/dynamodb.ts:15-37`). **Needs your explicit go-ahead, test table first, exactly like every prior table addition this session.**

**`Studio` gets new optional fields** (additive, doesn't touch existing billing fields):

```ts
reelCreditsBalance?: number       // never expires, purchased in packs (see §7) — not a monthly-reset pool like AI-search credits, because reels are a discretionary purchase, not a baseline included quota
reelCreditsFreeTrialUsed?: boolean // one lifetime free reel to drive trial, see §7
```

### 4.2 Provider abstraction

```ts
interface VideoProvider {
  generateImageToVideo(request: ImageToVideoRequest): Promise<{ providerJobId: string; estimatedCostPaise: number }>
  getGenerationStatus(providerJobId: string): Promise<{ status: 'processing'|'completed'|'failed'; outputUrl?: string; actualCostPaise?: number }>
  cancelGeneration(providerJobId: string): Promise<void>
  getCapabilities(): { maxDurationSec: number; resolutions: string[]; supportsAudio: boolean }
}

class KlingProvider implements VideoProvider { /* all Kling-specific request/response mapping lives ONLY here */ }

class VideoProviderRouter {
  select(criteria: { quality, style, duration, aspectRatio, resolution }): VideoProvider
  // reads a config object shaped exactly like the brief's example (kling enabled/priority:1, others disabled)
}
```

Config lives in a new `constants/videoProviders.ts`, mirroring `constants/studioPricing.ts`'s pattern of "all pricing/config constants in one file with the cost-basis reasoning documented in comments" (that file's header comment — `constants/studioPricing.ts:8-14` — is the right template to copy verbatim in spirit).

Provider names are never sent to the frontend — `outputPayload.providerUsed` is stripped before any client-facing API response, same discipline as `errorMessage` sanitization patterns elsewhere in the codebase.

### 4.3 Job pipeline & the new Lambda

New Lambda: `vayustudio-reelgen` (+ `-test`), created manually in the console like every other Lambda here (`deploy.sh` only supports code/config updates, never initial creation — confirmed pattern across all 4 existing Lambdas).

**Config**: Node.js 20.x, **3008MB memory** (matches `vayustudio-zip`'s choice — video encoding needs the higher proportional vCPU allocation that comes with more memory, not more heap), **900s timeout** (the Lambda ceiling).

**Why one Lambda invocation can plausibly fit the whole pipeline in 900s**: Kling image-to-video generations typically complete in 1–5 minutes. Submitting 4–6 hero clips *in parallel* (bounded by the existing `runWithConcurrencyLimit` utility — already used identically for `WATERMARK_INVOKE_CONCURRENCY`) and polling Kling's own status endpoint means total wait is ~5 minutes regardless of clip count, not 5 minutes × clip count. FFmpeg assembly of a 30–60s 1080x1920 video is typically well under 2 minutes on decent CPU. Total: comfortably under 900s in the normal case.

**The failure mode this doesn't cover**: if Kling is degraded and a clip takes >10 minutes, the Lambda times out mid-job with the `StudioJob` stuck at `PROCESSING` forever — this is exactly the "never leave ReelJob permanently stuck" requirement from the brief. Fix: **reuse the existing daily cron pattern** (`app/studio/api/cron/storage-check` already runs a daily sweep) — add a sweep that marks any `AI_REEL` job stuck in `PROCESSING`/`generating` past a timeout (e.g. 20 minutes) as `FAILED`, refunds the credit charge, and surfaces the "Create Simple Cinematic Reel" fallback. No new infrastructure, just a new check in an existing cron.

**FFmpeg itself — the real new-infrastructure item.** No Lambda in this repo bundles FFmpeg today. Needs either:
- an npm package that ships a static FFmpeg binary (e.g. `@ffmpeg-installer/ffmpeg`) bundled into the Lambda deployment zip, or
- a Lambda Layer with a precompiled static FFmpeg binary.

Either approach increases deployment package size and cold-start time versus the other Lambdas here — budget real testing time for this specifically, it's the one piece with no local precedent to copy.

**Pipeline stages inside the Lambda** (matches the brief's flow, now grounded in real primitives):
1. Fetch selected `MediaFile`s via `lib/studio/storage.ts`'s existing backend-agnostic `getMediaObjectBuffer` — never touch S3/R2 directly.
2. Analyze (face count via existing Rekognition usage pattern from `vayustudio-indexfaces`; quality/composition scoring — new, likely a lightweight local heuristic or a single cheap vision-model call, not Kling itself).
3. Story-plan (deterministic rules first — role assignment by category/face-count, no AI call needed for v1; an LLM-based planner is a plausible v2 upgrade, not required for launch).
4. Submit hero clips to `KlingProvider`, poll to completion.
5. FFmpeg-animate the remaining photos (Ken Burns/pan/zoom).
6. Assemble via `ReelAssembler` (new, FFmpeg concat + transitions + licensed music track + fades).
7. Upload final MP4 to R2, write `outputUrl`/`thumbnailUrl`, flip `StudioJob`→`READY` and `vayustudio-reels` row→`completed`.

### 4.4 Storage layout

```
studios/{studioId}/ai-reels/{reelId}/source/       (photo copies pulled for this job — see below)
studios/{studioId}/ai-reels/{reelId}/ai-clips/
studios/{studioId}/ai-reels/{reelId}/preview/
studios/{studioId}/ai-reels/{reelId}/thumbnail/
studios/{studioId}/ai-reels/{reelId}/final.mp4
```

**No existing per-object temp/permanent distinction exists in this codebase** (confirmed — cleanup today is entirely bucket-level 20-day lifecycle rules, set by hand in the R2 console, plus DynamoDB-item TTL on job rows, never on the R2 object itself). Two options, pick one explicitly rather than silently inheriting the bucket-wide rule:
- **(Recommended)** A dedicated lifecycle rule on the `ai-reels/*/{source,ai-clips,preview}/` prefixes with a short TTL (e.g. 2 days — plenty past normal generation+retry windows), console-configured like every other R2 lifecycle rule here. `final.mp4`/`thumbnail` get no expiry (or a long one tied to the studio's own retention policy) since that's the actual deliverable.
- Fallback: no dedicated rule, rely on the existing 20-day bucket rule — simpler, but wastes 18+ days of storage on intermediate garbage. Given R2 storage is VayuStudios' cheapest resource (₹1.45/GB/month per the pricing-constants file), this isn't a big cost risk either way, but it's needless data hoarding of client photos on a third-party-adjacent pipeline (see §5 privacy note), so the dedicated short rule is worth the extra 10-minute console step.

Never expose signed URLs to originals beyond what generation needs — the Lambda pulls bytes server-side via `getMediaObjectBuffer`, it never mints a public URL to a private original.

### 4.5 API surface

```
POST   /studio/api/client/gallery/[token]/reels          (CLIENT JWT)
POST   /studio/api/guest/[token]/reels                    (GUEST_QR JWT)
GET    /studio/api/admin/projects/[projectId]/reels/[reelId]/status   (reuse generic jobs/[jobId] status shape)
POST   /studio/api/.../reels/[reelId]/cancel
POST   /studio/api/.../reels/[reelId]/retry
DELETE /studio/api/.../reels/[reelId]
GET    /studio/api/.../reels/[reelId]/download
GET    /studio/api/admin/projects/[projectId]/reels        (My Reels list — admin/client view)
```

Exact route nesting under client-gallery-token vs. guest-token vs. admin mirrors the three existing trust tiers 1:1 (see §5's matrix) — deliberately not a single unified `/reels` endpoint, because auth *shape* genuinely differs per caller today and unifying it would be the first departure from an otherwise completely consistent codebase convention.

---

## 5. Security & Trust Boundaries

This section is the most important one in this document — it's where the original brief's "never trust photo IDs from a guest" requirement meets a real gap discovered during research.

**Client Gallery is fully solved by existing infrastructure.** `verifyStudioJWT` + `auth.projectId` match + a photo-by-photo `MediaFile` re-fetch scoped to that `projectId` (the exact pattern every existing client route already uses) is sufficient. No new auth work needed here — just call the same functions.

**Guest Selfie Search has a real gap, not just a hypothetical one.** Today:
- There is **no persisted "guest search session" record anywhere in the codebase.** A guest's selfie search returns a `photos[]` array directly in the HTTP response and nothing is cached server-side.
- The *only* thing preventing a guest from requesting an arbitrary `fileId` today is that it must belong to the `projectId` baked into their `GUEST_QR` JWT — which is correct for "photos this guest is allowed to browse" but **not for "photos this guest's own face actually matched."**
- If a Reel is built the same way (decode `projectId` from the JWT, accept any `fileId` from that project), a guest could technically build a reel out of **any photo in the entire gallery**, not just photos of themselves — a real privacy problem for a wedding gallery containing hundreds of guests' photos.

**This needs new work, not just reused auth** — two options:
- **(Recommended for v1)** Re-run the Rekognition match server-side at reel-creation time, using the guest's session identity, and silently drop any client-submitted `photoId` not in that fresh match result. Slightly more Rekognition cost per reel request, but zero new data model and closes the gap completely.
- Persist a short-lived "guest search result" record (new table or a `StudioJob{jobType:'SELFIE_SEARCH'}` row's `outputPayload`, which already exists and already stores the matched `fileId`s) keyed by the guest's own JWT, and validate reel `photoIds` as a subset of that record. Cheaper per-request (no re-matching), but a new dependency between two features.

Either is acceptable; **do not ship guest reels without one of these** — this is the one place the original brief's security requirements aren't met by "just reuse what exists."

**Privacy/compliance note, separate from the above**: photos leave VayuStudios' infrastructure and go to Kling (a third-party AI vendor) for processing. This is a new category of data flow for VayuStudios — worth an explicit consent line in the reel-creation UI ("your photos will be processed by an AI video service to create this reel") for both client and guest flows, and worth confirming Kling's own data-retention/deletion terms before launch. Never send a guest's own selfie image to Kling — only the already-owned gallery photos it matched (the brief's "don't store unnecessary sensitive selfie information" principle extended to "don't transmit it to a third party either").

**Auth matrix for reference** (from research, confirmed against actual code):

| Actor | Credential | Verified where | Scope |
|---|---|---|---|
| Client | `studio_token` JWT, role CLIENT | `verifyStudioJWT`, per route | `projectId`/`clientEmail` match |
| Guest | `GUEST_QR` JWT in URL | ad hoc `jwtVerify`, per guest route | `projectId` from JWT only — **insufficient alone for reels, see above** |

---

## 6. Cost Model

All figures are working estimates for design purposes — confirm against live Kling API quotes before finalizing pricing. Sourced from a September 2026 pricing check (see note at end of section).

**Per-reel cost breakdown** (default settings: 30s reel, ~10-15 photos selected, hybrid split of 5 AI hero clips + remainder via FFmpeg):

| Component | Basis | Estimated cost/reel (₹) |
|---|---|---|
| Kling 3.0 API (5 hero clips × ~3s each, 1080p, no audio) | $0.075–$0.15/sec × 15 sec, at ~₹88/$ | ₹99 – ₹198 |
| Rekognition photo analysis (10-15 photos, reusing the existing ₹0.10/photo basis from `constants/studioPricing.ts`) | ~12 photos × ₹0.10 | ₹1.2 |
| Lambda compute (3008MB, ~5 min wall time incl. Kling wait) | ~2.94GB × 300s × Lambda GB-sec rate | ₹1.3 |
| R2 storage (intermediate + final, short-lived) | negligible at ₹1.45/GB/month, sub-100MB total | <₹0.20 |
| **Total internal cost** | | **≈ ₹115 – ₹200, central estimate ≈ ₹170** |

This is materially different from every other VayuStudios cost center — storage and AI-search credits cost paise-per-unit; a Reel costs **~₹170**, over 1000x a single AI-search credit. **This single fact should drive the pricing model in §7**: Reels cannot be bundled into existing plans the way storage/AI-search headroom is, without wrecking plan economics.

*Pricing-data caveat*: Kling's official per-second API rate varies by source ($0.075/s via reseller quotes, up to $0.20/s for native-audio variants) and by resolution/credit-tier. Before setting final retail prices, get an actual quote from Kling's own developer console for the exact tier you'll integrate (1080p, no audio, 3-5s clips) — the ₹170 central estimate has real range (±30%) until that's confirmed.

---

## 7. Pricing & Profit Model — dynamic, per-video, margin-protected

**Model: prepaid Reel Credits (fixed ₹ value each), consumed dynamically per video based on its actual configuration — not sold or charged in flat per-reel/per-duration buckets.** This directly extends the existing `StudioTransaction` type pattern (`type: 'storage_topup'|'ai_search_topup'|'plan_change'` → add `'reel_credit_topup'`) and reuses the exact Razorpay order→verify→idempotent-credit flow already built for storage/AI-search top-ups (`app/studio/api/billing/*-topup/route.ts`, `lib/studio/billing.ts#applyTopup`).

An earlier draft of this section priced reels in flat duration buckets (1 credit up to 30s, 2 credits beyond). That protects margin only for the "average" reel — a request with more hero clips or higher resolution than the bucket assumed would silently erode margin, while a light request would overpay. Pricing every reel from its *actual* configuration fixes both, and — the part that matters most — means a single provider-price or forex update repricing one constant fixes margin for every future reel instantly, instead of you having to remember to reprice fixed pack tiers.

**Why not bundle into Pro plan (₹999/month)?** The Pro base price already has margin sized around ~₹1.45/GB storage and ~₹0.10/photo Rekognition costs — a completely different, much cheaper cost structure. Keep Reels as a separate, explicitly-purchased line item regardless of plan (see resolved decision #3 below).

**Credit unit**: 1 credit = ₹80 fixed retail value (granular enough that a typical reel costs 3-4 credits, similar in feel to how mobile data/SMS packs are sold). What's dynamic is not the ₹/credit rate — it's *how many credits a given reel consumes*.

**Dynamic cost formula**, computed server-side at request time, before dispatch — gating the job exactly like `checkAiCreditsAvailable` already gates AI-search work:

```
rawCostPaise    = heroClipCount × avgClipDurationSec × KLING_COST_PAISE_PER_AI_SECOND
                  + FIXED_OVERHEAD_PAISE_PER_REEL     // Rekognition + Lambda + storage, ~₹3-5, roughly constant
sellPricePaise  = rawCostPaise / (1 - TARGET_MARGIN)   // TARGET_MARGIN e.g. 0.55
creditsRequired = ceil(sellPricePaise / CREDIT_VALUE_PAISE)
```

`heroClipCount` and `avgClipDurationSec` fall out of the story plan the pipeline is already computing (§4.3) — no new data needed, just pricing from real numbers instead of a duration bucket. All three cost constants live in `constants/videoProviders.ts` (already planned in §4.2), one source of truth:

- **`KLING_COST_PAISE_PER_AI_SECOND`** — the single number that changes when Kling's real pricing is confirmed or USD/INR moves. **This is the actual resolution to open decision #1** (below): you don't need the exact Kling number to finalize this design, only to set one constant — correctable at any time with zero pricing-model rework and no stale fixed prices left stranded in old packs.
- `FIXED_OVERHEAD_PAISE_PER_REEL`
- `TARGET_MARGIN`

**Reconciliation, not just estimation**: charge `creditsRequired` (the estimate) at job creation, but when the Lambda reports `actualCostPaise` back from Kling's real billing (schema already has this field, §4.1), true up the studio's credit ledger if the difference is material (e.g. a retry inflated real cost). This closes the estimate-vs-actual gap a flat-bucket model has no way to see.

**Illustrative credit costs** (using §6's ₹170-central-estimate inputs until the real Kling number lands):

| Reel config | AI-seconds (clips × avg len) | Raw cost | Sell price (55% margin) | Credits (@₹80) |
|---|---|---|---|---|
| 15s, light (3 clips × 3s) | 9 | ~₹80 | ~₹178 | 3 |
| 30s, default (5 clips × 3s) | 15 | ~₹135 | ~₹300 | 4 |
| 60s, heavy (6 clips × 5s) | 30 | ~₹265 | ~₹589 | 8 |

**Credit packs** (payment-UX convenience only — a bulk discount on the ₹80/credit retail rate, not a separate pricing model):

| Pack | Credits | Price | Effective ₹/credit |
|---|---|---|---|
| Starter | 5 | ₹360 | ₹72 |
| Studio | 20 | ₹1,360 | ₹68 |
| Pro | 60 | ₹3,840 | ₹64 |

Because the *consumption* side already bakes `TARGET_MARGIN` into every reel's credit cost, the *purchase* side can offer a genuine bulk discount without threatening overall margin — the discount is absorbed by the margin buffer, which stays bounded because `TARGET_MARGIN` is a config constant you control directly, the same cost-basis-in-a-constants-file philosophy as `constants/studioPricing.ts`.

**Annual Pro/Custom loyalty discount.** The base VayuStudios plan already gives annual subscribers 2 months free (`ANNUAL_MONTHS_CHARGED = 10`, `constants/studioPricing.ts`). Extend that same retention logic to Reel credits: studios on **annual** Pro/Custom billing (`Studio.billingCycle === 'annual'`) get an extra discount on top of the bulk-pack price, as a loyalty perk rather than a standard margin-target price:

| Pack | Monthly-billing price | Annual-billing price | Extra discount | Effective ₹/credit |
|---|---|---|---|---|
| Starter (5) | ₹360 | ₹324 | 10% | ₹64.8 |
| Studio (20) | ₹1,360 | ₹1,224 | 10% | ₹61.2 |
| Pro (60) | ₹3,840 | ₹3,379 | 12% | ₹56.3 |

This intentionally runs thinner than the ~55% consumption-side margin — roughly 44-50% at Starter/Studio, ~36% at the Pro tier — the same way the platform's own "2 months free" is already a below-full-price retention tool, not a margin-target price. **Guardrail**: define a hard `MIN_MARGIN_FLOOR` (e.g. 35%) in `constants/videoProviders.ts` and clamp the combined bulk+annual discount so it can never stack below that floor, regardless of how deep either individual discount gets configured later — protects against an innocuous future promo accidentally making Reels loss-making at the highest tier.

**One free trial credit per studio, lifetime** (`Studio.reelCreditsFreeTrialUsed`), *not* monthly — small, bounded acquisition cost, applies equally regardless of plan.

**Illustrative profit projection** (same adoption scenarios as before, now margin-consistent by construction rather than assumed):

| Adoption scenario | Studios/month | Avg reels/studio | Revenue/month | Cost/month | Gross profit |
|---|---|---|---|---|---|
| Early | 10 | 3 | ₹9,000 | ₹4,050 | ₹4,950 (55%) |
| Growing | 50 | 5 | ₹75,000 | ₹33,750 | ₹41,250 (55%) |
| Established | 200 | 8 | ₹480,000 | ₹216,000 | ₹264,000 (55%) |

**Forex/provider-drift risk, now bounded instead of open-ended**: because margin is recomputed from `KLING_COST_PAISE_PER_AI_SECOND` on every single reel rather than baked into fixed pack prices, a forex move or Kling price change only erodes margin for the window between the change happening and someone updating that one constant. Recommend a monthly check (or an ad hoc update whenever USD/INR moves >5%) rather than the old model's "reprice packs annually and eat the drift in between."

---

## 8. Risks

Ranked by severity:

1. **[Security — must-fix before launch]** Guest Selfie Search reel creation has no server-side check that a guest's selected photos are actually *their own* matches, only that they belong to the right project. See §5 — needs one of the two fixes described there before shipping guest reels. Client Gallery reels have no equivalent gap.
2. **[Reputational/product]** Image-to-video AI on wedding photos of couples/families carries real risk of distorted faces or unnatural motion — this is a wedding-photo product where facial fidelity is the whole point. Mitigate by keeping the brief's own `aiVideoRecommended` gate strict (low face-count, high quality/composition score only) in v1, defaulting ambiguous photos to FFmpeg-only motion, and always showing a full preview before the reel is finalized/shareable (already in the flow).
3. **[New infrastructure, no local precedent]** FFmpeg has never been used in this codebase. Bundling a static binary into a Lambda, tuning memory/timeout for encode performance, and getting mobile-compatible H.264/AAC output right is real, untested engineering — budget more time here than for the Kling integration itself, which is comparatively well-trodden (an HTTP client + polling).
4. **[Availability]** Kling generation time is provider-controlled and can spike. A single-Lambda-does-everything design (§4.3) works in the common case but can time out under provider degradation, leaving a job stuck — mitigated by extending the existing daily cron sweep, but this is a new failure mode to monitor in production, not a solved problem.
5. **[Financial/forex]** Kling costs are USD; VayuStudios revenue is INR. See §7's margin-erosion note — a real, ongoing risk, not a one-time design concern.
6. **[Privacy/compliance]** Client and guest photos (containing faces) leave VayuStudios' infrastructure to a third-party AI vendor for the first time in this product's history. Needs an explicit consent surface and a look at Kling's data-retention terms before launch — this precedent-setting aspect matters beyond just this feature.
7. **[Operational]** This requires a brand-new external vendor relationship (Kling developer account, prepaid USD balance, API keys) — the first paid third-party AI vendor for VayuStudios (Bedrock/Rekognition are AWS-native, already-trusted infra). Treat provisioning this account with the same explicit-go-ahead discipline as any new AWS resource, but recognize it's a bigger step (external company, contract terms, USD billing) than adding a DynamoDB table.
8. **[Cost overrun]** Without the credit-gate-before-dispatch pattern (§4.3, mirroring `checkAiCreditsAvailable`), a bug could let jobs run up unmetered Kling spend. Must gate at job-creation time, exactly like the existing AI-search route does, not after the fact.

---

## 9. Phased Rollout — Step-by-Step Implementation Plan

Client Gallery first, Guest Selfie Search second — deliberately sequenced, not parallel, because Phase 2 depends on a real security fix (§5) that Phase 1 doesn't need, and because Client Gallery is the safer place to learn whether the §6/§7 cost model matches reality before opening the feature to unauthenticated guests.

### 9.0 UI/UX Design Language (applies to every phase below)

The brief asks for a "premium, cinematic, dynamic" feel with animation throughout — not a generic spinner anywhere. As with the earlier Raw Transfer Send redesign, there's no way to source or license real GIF/stock-video assets from this seat, so "GIF-like" motion is built with **CSS/SVG animation, not actual `.gif`/video files** — same tradeoff made (and explicitly flagged) for that earlier feature, and it reads as more premium than compressed GIFs would anyway.

**Visual motif**: film-production language throughout — clapperboard, film-strip frame, camera aperture/focus brackets, spotlight/bokeh — directly matching the brief's own "REC indicator, camera focus bracket, film/camera animation" ask.

**Motion inventory** (all CSS/SVG, all respecting `prefers-reduced-motion`, per the brief's own requirement):
- **Selection grid**: photo scales up + a numbered badge springs in on select (numbered, not just a checkmark — shows story position at a glance); a floating bottom (mobile) / side (desktop) action bar slides in once ≥5 photos are selected, showing live photo count **and the dynamically computed credit cost from §7's formula, updating in real time** as photos/duration/style change — this ties the pricing engine directly into the UI as continuous feedback, not a cost surprise at the end.
- **Style selector cards**: each `ReelStyle` gets a distinct looping ambient background (film-grain + light-leak sweep for CINEMATIC, soft bokeh drift for ROMANTIC, warm gold shimmer for BOLLYWOOD, slow particle glimmer for LUXURY, polaroid-flutter for MEMORIES, neutral animated frame for PHOTOGRAPHERS_CHOICE) — a lightweight always-on preview of what the studio/client is picking, not just a text label.
- **Generation screen**: rotating film-reel/countdown-leader loop, pulsing camera focus brackets over a preview thumbnail, a progress bar styled as a film strip filling with frames, stage text cross-fading between the brief's own stage copy ("Selecting your best moments" → … → "Finalizing your video").
- **Result screen**: full-screen player with a subtle vignette/grain overlay, share actions sliding up as a bottom sheet.

**Responsive strategy** (Tailwind breakpoints, matching the existing stack):
- **Mobile (<640px)** — the priority tier, since guests (Phase 2) are almost entirely on phones at a live event: full-screen single-column step flow (select → review → generate → preview), bottom-sheet modals, 44px+ touch targets, swipe/long-press-drag for story reordering, native Web Share API / WhatsApp deep link as the primary share action.
- **Tablet (640–1024px)**: 2-column layouts where it earns its keep (photo grid alongside a live cost/settings panel), grid density steps up to 4-5 columns.
- **Desktop (>1024px)** — mainly studio-admin previewing/QA'ing on a client's behalf, and clients on a laptop: up to 6-column grid, hover-preview enlargement, mouse drag-and-drop story reordering, settings in a side panel instead of a full-screen step.
- Build mobile-first, then progressively enhance — not the reverse — since Phase 2's primary audience is mobile-only by nature of the context (a guest at a wedding).

### Phase 0 — Provisioning
*(needs your explicit go-ahead, test environment first, exactly like every prior table/Lambda this session)*
1. ✅ **Done (2026-09-09)** — `vayustudio-reels-test` DynamoDB table created (PK `reelId`, GSI `projectId-createdAt-index` for the future "My Reels" list query), `ACTIVE`.
2. ✅ **Done (2026-09-09)** — Kling developer account created directly on kling.ai/dev (confirmed official, not a reseller). Auth was corrected twice in one session: web-search-sourced third-party docs suggested an Access Key/Secret Key JWT scheme, which was implemented first — then the user pasted the actual console page, which shows Kling offers **two** auth methods and the JWT one is explicitly scoped to **"legacy version design standards" only**. The correct method for current models (including Kling 3.0, this integration's actual target) is the simple **API Key bearer token** — `Authorization: Bearer <KEY>` — which is what the user's originally-pasted single key already was. Reverted `lib/studio/videoProviders/klingProvider.ts` to the simple bearer-token method accordingly; the JWT/`jose`-minting code was removed from this file (`jose` itself stays as an explicit `package.json` dependency regardless — it was already used elsewhere in this codebase for guest-JWT verification without being formally declared, a pre-existing latent fragility worth fixing independent of this feature). Also corrected the API domain to `api-singapore.klingai.com` (the console's own notice: this is the correct endpoint for servers outside China; `api.klingai.com` is a different/legacy regional endpoint) — the earlier web-search-sourced guess of `api.klingai.com` would have been wrong for this deployment's actual traffic origin.

Then a third correction, this time from a real curl sample pulled directly from the console for the actual target model: the request contract is nothing like generic Kling docs suggested. Confirmed for real: **endpoint is `POST {base}/image-to-video/kling-3.0-turbo`** (model name is a URL path segment, not a body field — resolves the earlier "exact model id" open question too: it's `kling-3.0-turbo`), and the **body is `{contents: [{type:'prompt',text}, {type:'first_frame',url}], settings:{resolution,duration}, options:{external_task_id, watermark_info:{enabled}}}`** — critically, the source image must be a **URL**, not embedded base64 bytes as every generic-docs version assumed, and there is **no `aspect_ratio` request field at all** (output aspect ratio must come from cropping/padding the source image before calling Kling, not a provider-level parameter — a real architectural finding, not just a field-name fix). `ImageToVideoRequest.imageBuffer: Buffer` replaced with `imageUrl: string` in `lib/studio/videoProviders/types.ts` — the pipeline will need to mint a presigned/public R2 URL for each source photo before calling Kling, it can't pass raw bytes through. Also explicitly set `watermark_info: {enabled: false}` on every request — an un-caught Kling watermark on hero clips would be a real product defect in a paid wedding-video feature, worth verifying on the first real render rather than assuming it works. **A real live test call was then made** (2026-09-09, using Kling's own documented sample image, real API key, real ₹/$ spend) against `POST /image-to-video/kling-3.0-turbo` — succeeded, HTTP 200, task id `926484082518392851`. This confirms the full request AND response shape for task creation with certainty:
```json
{"code":0,"message":"SUCCEED","request_id":"...",
 "data":{"id":"926484082518392851","status":"submitted","external_id":"vayustudio-test-001",
          "message":"","create_time":1788919537338,"update_time":1788919537338}}
```
— the task id lives at `data.data.id`, NOT `data.task_id` as originally guessed. `klingProvider.ts` updated to parse this exactly, with an app-level `code !== 0` error check alongside the HTTP-status check.

**Status-check endpoint was then found and confirmed with a full real create→poll→succeed cycle** — the earlier eight guessed REST patterns had all 404'd; the actual endpoint is `GET /tasks?external_task_ids=<id>` (queries by OUR OWN external id, not Kling's internal task id — a real design implication: `ImageToVideoRequest.externalTaskId` is now a *required* field, and `ImageToVideoResult.providerJobId` returns that same value rather than Kling's own `data.id`, since that's what the rest of the pipeline needs to poll with). Polling the real task from the earlier test call showed it had already gone `submitted` → `succeeded`, with a genuine output video URL and duration (`5.041s` for our 5s request) — and, importantly, **no `watermark_url` field was present, only a clean `url`**, confirming `watermark_info: {enabled: false}` actually suppresses Kling's watermark rather than just being ignored (§8 risk 6 concern resolved for real, not just assumed). Kling's returned video URL is signed/hotlink-protected and self-described as cleared after 30 days — confirms the pipeline must download and persist it to our own R2 promptly rather than treating it as stable, exactly as §4.4 already assumed. A `billing[]` array on the succeeded response (`{charge_type:'unit', amount:'5', package_type:'video'}` for this account) is available but treated as informational only — our own `computeReelCost` stays the real billing source of truth. `lib/studio/videoProviders/klingProvider.ts` and `types.ts` updated to match all of this exactly; the OWNER-only test route (`/studio/api/owner/reel-provider-test`) got a real opt-in `POST` (kicks off one real billed generation, defaults to Kling's own sample image so it's safe to re-run) + `GET ?checkTaskId=` (polls it) for future verification without hand-crafting curl commands again. **Kling integration is now fully confirmed end-to-end** — nothing further blocks Phase 1 step 3 on the provider side.
3. ✅ **Done (2026-09-09)** — `vayustudio-reelgen-test` Lambda created (`lambda/vayustudio-reelgen/`, Node 20.x, 3008MB/900s, reusing the existing shared `vayustudio-lambda-role` — its DynamoDB grant already wildcards `vayustudio-*`, no new IAM policy needed). Hello-world shell only, no pipeline logic. Smoke-tested end to end: seeded a `PENDING` job row, invoked the Lambda, confirmed it wrote `PROCESSING` then `READY` with `outputPayload` — proves the invoke/status round trip before any real analysis/Kling/FFmpeg logic is built on top of it. `deploy.sh` added following the same `FUNCTION_NAME`-suffix-driven test/prod table branching as the watermark Lambda's (not the zip Lambda's, which hardcodes production — a latent bug in that one, not touched here). Production `vayustudio-reels` table and `vayustudio-reelgen` function are separate, later approvals.

### Phase 1 — Client Gallery Reel Generator (MVP)

1. ✅ **Backend skeleton — done (2026-09-09), not yet pushed.** `JobType`/`StudioReel` type additions (§4.1) in `types/studio.ts`; `TABLES.reels` in `lib/studio/dynamodb.ts`; `VideoProvider` interface + `KlingProvider` + `VideoProviderRouter` in `lib/studio/videoProviders/` (§4.2), callable only from the new OWNER-only `GET /studio/api/owner/reel-provider-test` (router selection + capabilities only, no real Kling call — safe with no API key set); pricing engine in `constants/videoProviders.ts` (§7's dynamic formula, credit packs, annual discount, `MIN_MARGIN_FLOOR` guard) verified by `scripts/verify-reel-pricing.mjs` (`npm run verify:reel-pricing` — all checks pass, no test framework exists in this repo so this follows the existing plain-script convention instead of introducing one); `reel_credit_topup` transaction type + `POST /studio/api/billing/reel-credit-topup` + `verify/route.ts` dispatch wiring, reusing the existing Razorpay order→verify→idempotent-credit pipeline exactly. `checkReelCreditsAvailable` (quota.ts) + `deductReelCredits`/`refundReelCredits` (billing.ts, conditional-write guarded against going negative) round out the credit ledger. Caught and fixed one real bug while wiring `verify/route.ts`: `lib/studio/receiptLabel.ts#formatTxnLabel` had no branch for the new transaction type and would have silently mislabeled a reel-credit purchase as "Pro plan" on the receipt PDF/email — fixed. `npx tsc --noEmit` and `npm run build` both clean; new routes confirmed present in the build manifest. Nothing wired to a real reel yet — no reel-creation route, no pipeline logic, `vayustudio-reelgen` Lambda is still the Phase 0 hello-world shell. Steps 2-8 below are next.
2. **"Simple Cinematic Reel" first, before touching Kling at all** — build and ship the FFmpeg-only pan/zoom/Ken-Burns pipeline (the brief's own "Failure Fallback" feature, brought forward to milestone 1 instead of last). This isolates the one genuinely new piece of infrastructure (FFmpeg-in-Lambda, §8 risk 3) from the comparatively well-understood Kling HTTP integration, and gives you a testable, shippable-even-if-Kling-never-launches artifact early. Verify iPhone Safari + Android Chrome playback here, since mobile-compatibility bugs are far cheaper to catch before AI clips are layered on top.
3. **Add Kling hero-clip generation** on top of the now-working FFmpeg pipeline: photo analysis/quality-gating, story planning, parallel Kling submission + polling, hybrid assembly.
4. **Frontend, Client Gallery only**: `AIReelButton`, `ReelPhotoSelector`, `ReelStyleSelector`, `ReelSettings`, all built to the §9.0 design language and responsive strategy from day one (not retrofitted later) — live dynamic-cost preview wired directly to step 1's pricing engine.
5. `ReelGenerationScreen`, `ReelPreview`, `ReelShareActions`, `ReelHistory` ("My Reels") for the client-gallery surface.
6. Billing UI: credit balance indicator, pack-purchase modal (reusing the existing Razorpay checkout component), free-trial-credit banner, annual-discount pricing display for eligible studios (§7).
7. **Pilot**: a small, named set of studios, feature-flagged. Watch real Kling cost against §6/§7's estimates and correct `KLING_COST_PAISE_PER_AI_SECOND` before wider release — this is the checkpoint where the whole cost model gets its first real-world validation.
8. GA on Client Gallery once the pilot validates cost assumptions and mobile/tablet/desktop QA passes.

### Phase 2 — Guest Selfie Search

1. **Close the §5 trust-boundary gap first** — server-side re-match (recommended) or a persisted guest-search-session record. This ships and is verified *before* any guest-facing reel route goes live, not in parallel with UI work.
2. Reuse Phase 1's components unchanged — only the auth wiring differs (`GUEST_QR` JWT path instead of `studio_token`/CLIENT). No "My Reels" history for guests; short-lived share link at the 7-day default retention from resolved decision #5.
3. **Mobile-first hardening pass specifically for guests** — this audience is essentially 100% phone-based, live, at an event with imperfect wifi/data. Prioritize the mobile motion/interaction treatment from §9.0, resilient retry on flaky connections (reuse the chunk-retry discipline already established elsewhere in this codebase for uploads), and WhatsApp/native-share as the default action, not an alternative.
4. Guest pilot at a small number of live events; add per-guest-JWT rate limiting before wider rollout (abuse surface is different from Client Gallery — an anonymous guest has no account to disable).

### Phase 3 — Full style/format matrix + admin analytics
Expand beyond CINEMATIC/9:16/1080p/30s defaults to the full brief-specified matrix; add the ADMIN ANALYTICS dashboard (totalReels/successfulReels/averageAICost/revenue/profit, provider usage breakdown) reusing the existing owner-admin dashboard patterns.

### Phase 4 — Future providers
Runway/Luma/Veo — a router config flip only (§4.2), no frontend or business-logic changes. Not scheduled; its existence on paper is the entire point of building the abstraction in Phase 1 rather than coupling directly to Kling.

---

## 10. What This Does Not Touch

Explicit non-invasiveness guarantee, so this can be built without risking the live product:

- No existing route, Lambda, or table is modified — only new ones added and one new enum member (`'AI_REEL'`) appended to `JobType`.
- No existing billing field changes meaning — `reelCreditsBalance` is new and optional; `Studio.billableStorageBytes`, `aiSearchCreditsUsed`, `billingPlanId` etc. are untouched.
- No changes to Client Gallery or Guest Selfie Search's existing read/download paths — Reels only *adds* a new action button, it doesn't alter how photos are browsed or downloaded today.
- No shared runtime code with VayuTransfer's own recently-built zip/batch-transfer infrastructure — same "code-separate, pattern-reused" discipline already established between the two products.

---

## 11. Open Decisions — Resolved Recommendations

1. **Real Kling 3.0 pricing.** No longer a blocker on the design itself — §7's dynamic formula isolates the entire unknown to one constant, `KLING_COST_PAISE_PER_AI_SECOND`. Remaining action: pull the actual per-second rate from Kling's own developer console (1080p, no audio, the exact tier you'll integrate) and set that one number before launch. Getting it slightly wrong at launch costs nothing beyond a config update later — it no longer contaminates fixed pack prices the way the earlier bucket model would have.
2. **Kling vendor account setup.** Recommend starting with the smallest prepaid funding tier Kling's API offers, replenished as a rolling top-up based on observed burn rate, rather than a large upfront commitment — minimizes working-capital exposure and forex risk while real adoption is still unproven (Phase 1 is a small studio cohort, per §9).
3. **Free-plan gating.** Recommend allowing **all** plans (Free/Pro/Custom) to buy Reel credits, not just Pro/Custom. Under the dynamic model every credit purchase already covers its own cost plus `TARGET_MARGIN` regardless of the buyer's plan — there's no cross-subsidy risk from Free-plan studios the way there would be with a bundled-free-quota model, so gating by plan would only add complexity without a financial reason behind it.
4. **Consent copy.** Recommend: *"Your selected photos will be processed by a third-party AI video service to create this reel. No original photos are made public."* — short, matches the product's existing plain-English UI style (e.g. "how many people can download" instead of "download slots").
5. **Guest reel retention window.** Recommend **7 days** by default, matching the existing `PRINT` role's 7-day JWT expiry (`ROLE_EXPIRY.PRINT`, `lib/studio/auth.ts`) as the closest existing precedent for short-lived, guest-facing, no-persistent-account access — make it studio-configurable like other expiry settings rather than hardcoding it.

---

*This document does not include code, file lists, or environment variables for implementation — those get finalized in a proper implementation plan once the above open decisions are resolved and Phase 0 provisioning is approved, per this session's standing practice of design-then-approval-then-build.*
