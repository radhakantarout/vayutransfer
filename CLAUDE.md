# CLAUDE.md — VayuTransfer Project Context
> Claude Code reads this file automatically on every session start.

---

## What This Project Is

VayuTransfer — prepaid wallet file transfer platform for Indian market.
Users load credits, pay per GB + per download slot, share files via secure expiring links.
Zero loss guarantee — wallet deducted before S3 upload begins.

---

## Stack (Do Not Change)

- Next.js 14 App Router + TypeScript
- AWS: S3 (ap-south-1), DynamoDB, SES, CloudFront
- Razorpay (payments)
- Vercel (deployment)
- Tailwind CSS

---

## Critical Business Rules (Always Enforce)

1. All money stored as PAISE (integers) — never floats
2. Wallet DEDUCTED before S3 upload URL generated
3. DynamoDB conditional writes — wallet never goes negative
4. Audit logger is FIRE-AND-FORGET — void logAudit() never await
5. Download counter is ATOMIC — DynamoDB ADD with ConditionExpression
6. Razorpay webhook IDEMPOTENT — check txnId before crediting
7. Refund wallet if upload fails or is aborted

---

## Pricing Logic

```
< 500MB   → Free (storage + all downloads)
500MB–2GB → ₹5/GB storage + ₹14/download
2GB–5GB   → ₹4/GB storage + ₹47/download
5GB–10GB  → ₹3/GB storage + ₹101/download
```

---

## DynamoDB Tables

- vayu-wallets (PK: walletId, GSI: sessionId)
- vayu-transfers (PK: fileId, GSI: walletId)
- vayu-transactions (PK: txnId, GSI: walletId)
- vayu-downloads (PK: downloadId, GSI: fileId)
- vayu-audit (PK: auditId, GSI: eventType, walletId, fileId — all with createdAt sort key)

---

## Build Order (STEP 1 → 8)

See REQUIREMENTS.md for full spec. Build in this order:
1. types/index.ts + constants/pricing.ts
2. lib/audit.ts  ← build this before anything else
3. lib/aws/dynamodb.ts + s3.ts + ses.ts
4. lib/pricing.ts + lib/wallet.ts
5. API routes (wallet → upload → download → webhooks)
6. Frontend components
7. Pages
8. Config files

---

## Git Workflow

- **main** — production branch, deployed to https://vayutransfer.com via Vercel. Never commit directly.
- **develop** — active development branch. All commits and pushes go here.
- To ship: open a PR from `develop` → `main`, merge when ready.
- Commits must NOT include Co-Authored-By lines — causes Vercel Hobby plan block.

---

## Current Build Status

Last updated: 2026-08-10 (Phase 6 close-out)

```
[x] STEP 1 — Types + Constants
[x] STEP 2 — Audit helper (lib/audit.ts)
[x] STEP 3 — AWS helpers (dynamodb, s3, ses)
[x] STEP 4 — Business logic (pricing, wallet)
[x] STEP 5 — API routes (wallet, upload, download, webhook, transfers, auth)
[x] STEP 6 — Components (UploadZone, PriceCalculator, UploadProgress, WalletCard, TopupModal, DownloadCard, Navbar, Footer, Providers)
[x] STEP 7 — Pages (/, /wallet, /download/[fileId], /login, /profile, /transfers, /pricing, /privacy, /terms)
[x] STEP 8 — Config files (.env.example, next.config.js, tailwind.config.js)
[x] STEP 9 — Google OAuth + ₹50 signup bonus (lib/auth.ts, lib/users.ts, vayu-users table)
[x] STEP 10 — VayuStudios AI chatbot (AWS Bedrock Claude 3 Haiku, streaming, WhatsApp escalation)
[x] STEP 11 — VayuStudios usage-based billing (Razorpay top-ups, PDF receipts, storage retention) — MERGED TO MAIN, live in production. Razorpay still in TEST MODE (live key swap still pending, see priorities below)
[x] STEP 12 — VayuStudios S3→R2 storage migration + async ZIP download (streaming Lambda, hybrid client/server zip strategy, retry-on-network-error) — MERGED TO MAIN, live in production. VayuTransfer's own new uploads now go to R2 too (see STEP 14)
[x] STEP 13 — VayuStudios Raw File Transfer tab (native send/receive of large RAW files, no VayuTransfer integration) — MERGED TO MAIN, live in production
[x] STEP 14 — VayuTransfer: S3→R2 for new uploads, batch/multi-file + receive-link transfers, flat-rate pricing, UI overhaul (preview panel, icon set, transfers page redesign) — MERGED TO MAIN 2026-08-10 (merge commit c71f419), live in production at vayutransfer.com. Production R2 bucket + vayu-transfer-files/vayu-receive-requests DynamoDB tables + Vercel Production env vars all set up same day; confirmed working via a real production upload.
[x] STEP 15 — VayuTransfer Phase 6 (R2 migration background/rollout close-out) — MERGED TO MAIN 2026-08-10, run directly against production. Metadata-only: `storageBackend='S3'` backfilled on the 147/149 production `vayu-transfers` records missing it. No file bytes copied — confirmed the production S3 bucket (`vayu-transfer-files`) has zero objects (its 7-day lifecycle rule already deleted everything, independent of app status/expiry), so there was nothing left to migrate. Wallets/transactions/downloads tables untouched. R2 migration is now fully closed out.
```

Live at https://vayutransfer.com — GitHub: https://github.com/radhakantarout/vayutransfer

### AWS Infrastructure (ap-south-1)
- S3 bucket: vayu-transfer-files (CORS + lifecycle configured) — pre-R2-migration files only, served forever from here, never migrated
- Cloudflare R2: `vayu-transfer-files-test` (test) and a production bucket (both with 20-day lifecycle rule) — all new VayuTransfer uploads (test and prod) go here now
- DynamoDB: 8 tables active in both `-test` and production (wallets/transfers/transfer-files/transactions/downloads/audit/users/receive-requests) — production `vayu-transfer-files`/`vayu-receive-requests` created 2026-08-10 alongside the STEP 14 prod merge
- SES: PRODUCTION (approved 2026-06-22), FROM = noreply@vayutransfer.com (domain verified + DKIM)
- SNS: PENDING production access (OTP SMS not working in production yet — dev logs OTP to console)
- Bedrock: PRODUCTION (ap-south-1), Claude 3 Haiku — env var AWS_BEDROCK_REGION=ap-south-1

### Key Decisions Made
- Google OAuth users get ₹50 bonus only (dev seed skipped via skipDevSeed=true)
- Wallet balance API checks NextAuth session first, falls back to cookie for anonymous
- Commits must NOT include Co-Authored-By lines — causes Vercel Hobby plan block
- GitHub repo: radhakantarout/vayutransfer (public, new repo fixed Vercel deploy)
- Google Console needs BOTH: https://vayutransfer.com AND https://www.vayutransfer.com callback URIs
- Files under 500 MB are completely free (storage + all downloads). Default download count = 10 for free transfers.
- "Download slots" renamed to plain English ("how many people can download") across all UI
- VayuStudio enquiry approve flow: one-click link in email creates studio + emails credentials to photographer
- test.vayutransfer.com deploys develop branch (Vercel preview, public access, same AWS infra)
- AI chatbot: Phase 1 system prompt approach (no RAG/vector DB). Phase 2 (lightweight RAG with embeddings in S3) if needed later.
- Chatbot model: Claude 3 Haiku (anthropic.claude-3-haiku-20240307-v1:0). Mumbai has Claude Haiku 4.5 — confirm exact model ID from Bedrock console to upgrade.
- VayuStudios billing kept in fully separate files/tables from VayuTransfer's wallet (studio-prefixed paths, `vayustudio-transactions`/`vayustudio-usage` tables) — same Razorpay merchant account/keys reused since it's one business, but no shared runtime code
- VayuStudios free baseline: 20GB storage (standing balance) + 2GB downloads/month (resets monthly), same for every studio regardless of `plan` field (plan stays cosmetic for now)
- Storage top-ups are time-bound grants ("N GB for M months"), not open-ended — keeps one-time payments profitable against AWS's recurring storage cost. Download top-ups are one-time (downloads don't persist)
- Storage overage policy: configurable grace period (default 25 days) with 3 reminder emails, then oldest-projects-first auto-delete via daily Vercel cron (`app/studio/api/cron/storage-check`) — never merges/auto-renews, always requires the studio to top up
- `Studio.billableStorageBytes` is the new live, delete-aware storage metric (used for billing); `storageUsedBytes` stays untouched as the historical "Total Upload Size" dashboard stat
- `npm run backfill:billable-storage --apply` run successfully against production 2026-07-08 (4/9 studios had real storage backfilled: rkrstudio 304MB, Mystudio_T 2.7MB, Saheb 15MB, Kiran Studio 4MB)
- Razorpay Authorized Domains: had to add `test.vayustudios.com` (and `studio.vayutransfer.com`) in the Razorpay Dashboard under Settings → Configuration/Website & App Settings before Checkout would accept payments on those domains — same merchant account as VayuTransfer, which only had `vayutransfer.com` registered
- Print portal single-file download switched from CloudFront signed URLs to direct S3 presigned URLs (`getStudioSignedDownloadUrl`, same mechanism as every other download path) — CloudFront was throwing in both environments (env var config) and the one distribution's origin only points at the production bucket anyway, breaking test-env files structurally. `getStudioCloudFrontSignedUrl` is left in `lib/studio/s3.ts`, unused but ready if CDN acceleration is worth revisiting later
- Watermark Lambda (`lambda/vayustudio-watermark/index.js`) uploads previews to R2 with `Cache-Control: public, max-age=31536000, immutable` — any time a preview needs to change for the same fileId (e.g. edited-photo re-watermarking), it MUST get a new r2Key/URL (see `previewKeySuffix` in `lib/studio/watermark.ts`), never reuse the old one — immutable caching means browsers/CDN will never re-fetch it
- Editing a photo (studio admin "Upload Edited") re-invokes the same watermark Lambda against the edited file so the preview shown everywhere (admin grid, client gallery, print portal) is properly watermarked — never the raw unwatermarked edited original, which would defeat the whole watermark/paywall model
- VayuStudios originals migrated from S3 to Cloudflare R2 (zero egress fees) via a `storageBackend: 'S3'|'R2'` field on `MediaFile` — old files keep serving from S3 forever, new uploads write R2, every read path branches on the field. Fully live in production as of 2026-07-10 (530/530 files on R2, one dead orphaned record deleted). `lib/studio/storage.ts` is the single dispatch point every route calls — never branch on `storageBackend` directly in a route. VayuTransfer has NOT been migrated yet (still S3-only) — that's Phases 5-6, not started. Full history in memory (`r2_migration_plan` in auto-memory).
- **Lambda deploys are separate from Vercel app deploys** — merging app code to `main` does NOT update any Lambda's actual deployed code. Each Lambda (`vayustudio-watermark`, `vayustudio-indexfaces`, `vayustudio-zip`) needs its own explicit `aws lambda update-function-code` per environment (test AND production, both, every time its code changes) — learned this the hard way when production watermarks silently got stuck after an R2 app-code merge because only the `-test` Lambda had been redeployed.
- Print portal "Download all" is now an async job (`vayustudio-zip` Lambda + `StudioJob{jobType:'ZIP_DOWNLOAD'}`), same pattern as face indexing — client POSTs to `download-all` to get a `jobId`, polls `download-all/status/[jobId]` every 2s, shows a "ready to download" banner. Replaces the old synchronous in-request zip (60s `maxDuration`, timeout risk on large batches).
- Zip Lambda streams instead of buffering the whole zip in memory (`archiver` + `@aws-sdk/lib-storage`'s multipart `Upload`, piped through a native `PassThrough` since archiver's stream fails an `instanceof Readable` check otherwise) — memory bumped to 3008MB. Each file downloads into a buffer with up to 3 retries before being appended (a single network reset used to crash the whole job with no retry — found on a real 355-file test batch). Total size is bounded by the 900s Lambda limit and largest single file, not by total selection size — built to reliably handle 10GB+ Indian wedding albums.
- Print portal picks the zip strategy by total selection size: under 1GB zips client-side in the browser (`fetch` + `JSZip`, no server round trip), at/above 1GB uses the Lambda job. Total size (GB/MB) now shown next to photo count.
- Raw File Transfer (new "Raw Transfers" event tab): studio owner sends a large RAW file to anyone, or requests one back, via presigned R2 links — no login required for the recipient, no watermarking on the transfer itself. This is a **native VayuStudios feature**, not an integration with VayuTransfer's live API — reuses VayuTransfer's chunked-multipart/presigned-link/share-token *patterns* as new parallel code, keeping the two products fully code-separate. No separate wallet — storage/download bytes fold into the studio's existing quota (`Studio.billableStorageBytes`, `StudioUsageMonth`). Importing a received file into the gallery points the new `MediaFile.r2Key` at the transfer's existing object (no copy, no double-billing) and is the only point where watermarking happens. New table `vayustudio-transfers`; `cron/storage-check` now also reclaims/sweeps transfers, not just gallery projects. Deleting a transfer checks whether its imported `MediaFile` still actually exists (not just a stale `importedToGallery` flag) — fixed a bug where deleting the imported file from the gallery left the transfer record permanently stuck. Full details in memory (`raw_file_transfer_feature`).
- VayuTransfer new pricing model (replaces the old tiered-slab + download-slot pricing entirely): 10GB free per calendar month, any single transfer under 3GB is free as long as it fits inside that remaining monthly quota — crossing either line charges the **whole** transfer (not just the overage) at a flat ₹4.99/GB. Downloads are no longer priced or capped by a user-visible "slot count" — unlimited downloads until the link expires, backed only by a silent `MAX_DOWNLOADS_PER_LINK=200` anti-abuse ceiling never shown in the UI. `Wallet.freeQuotaUsedBytes`/`freeQuotaMonthKey` track the monthly free allowance with lazy calendar-month reset (no cron). `Transfer.downloadSlots`/`exhausted` status/the `add-slots` route are gone.
- VayuTransfer batch/multi-file transfers ("Epic B"): a `Transfer` can now hold 1..N raw files (`fileCount` set, rows in new `vayu-transfer-files` table keyed by `batchId`=the Transfer's own fileId) — no client-side zipping, folder structure preserved via `relativePath`. One wallet deduction/expiry/download-slot-pool covers the whole batch. Pre-batch single-file Transfers still read correctly via `lib/transferBatch.ts#getTransferFiles`'s backward-compatible synthesis. `lib/transferBatch.ts#createBatchTransfer` is the shared money-and-storage core used by both the normal send flow and receive-links (see below).
- VayuTransfer receive-links ("Epic D"): a signed-in user can generate a `/receive/[requestId]` link and send it to anyone — the recipient uploads directly into the requester's wallet-funded storage, no account needed on their end. New `vayu-receive-requests` table. If the requester's balance is short when the uploader tries to start, the upload is blocked and the requester gets a throttled (max 1/hour) "add funds" email instead of a silent failure; the uploader sees a "waiting on the sender" state with retry. Completion emails the requester "you received a file" and the batch Transfer shows up in their normal `/transfers` list like anything else.
- VayuTransfer's own new uploads now go to Cloudflare R2 (own bucket/keys, `R2_TRANSFER_*` env vars — fully separate from VayuStudios' R2 usage), same `storageBackend: 'S3'|'R2'` dispatch pattern as VayuStudios' earlier migration, via `lib/aws/storage.ts`. This is the "Phase 5" R2 migration — live in both test and production as of 2026-08-10.
- **Phase 6 (background migration close-out) is DONE as of 2026-08-10.** Investigation found the production S3 bucket (`vayu-transfer-files`) has a hard 7-day lifecycle rule on `uploads/` that deletes objects unconditionally, regardless of the app's own `status`/`expiryTime` — so by the time Phase 6 ran, every pre-R2-migration file was already gone (bucket had 0 objects). No byte-level copy was possible or needed. Ran `npm run backfill:transfer-storage-backend -- --force --apply` directly against production `vayu-transfers` (147/149 records were missing `storageBackend`, now 0) — metadata-only, touches nothing else, wallets/transactions/downloads untouched. Old S3-backed Transfer records with `active` status but no real file (104 of them) is expected/harmless — those links already 404'd before this backfill and still will; that's a pre-existing consequence of the lifecycle rule, not a regression.
- VayuTransfer home page preview: right-side panel is now a real, fully client-side file preview (before upload) — images/video/audio render natively, PDF via iframe, plain-text/code files read directly, and `.docx` is converted to HTML in-browser via `mammoth` (dynamically imported, only loaded when a docx is actually selected). `.xlsx`/`.pptx` intentionally have no preview (no good lightweight client-side renderer) — falls back to an icon + filename. New shared `components/icons.tsx` (stroke-SVG set matching VayuStudios' visual language) replaced all emoji across the upload/download/receive/transfers UI.
- **`develop`→`main` merges in this repo use a real merge commit, not fast-forward** — `main`'s history includes GitHub-style "Merge branch 'develop'" commits that `develop` itself never incorporated, so `git merge --ff-only` will always fail; use a normal `git merge origin/develop` instead (same pattern already in the repo's history).
- **Lesson from the STEP 14 prod merge**: `NEW_UPLOAD_BACKEND` in `lib/aws/storage.ts` is a hardcoded constant (not env-gated), so the moment R2-migration code merges to `main`, *all* uploads — not just the new batch/receive features — immediately depend on `R2_TRANSFER_*` existing in Vercel Production. Merging code that changes this constant without first provisioning prod R2 + the prod DynamoDB tables caused a brief production outage window (caught and fixed same day: prod tables created, prod R2 bucket + env vars added by the user, redeployed, confirmed working). Future infra-dependent merges to `main` should provision production resources *before* the merge, not after.

### Next Session Priorities
1. VayuStudios feature enhancement planning — next focus per user, now that VayuTransfer's R2 migration (Phases 1-6) is fully closed out. No specific feature picked yet.
2. Epic F (subscription/margin-based pricing) and Epic G (regenerate/reshare links) — planned VayuTransfer epics, not started, lower priority than VayuStudios work for now.
3. Razorpay live keys (when account approved) — swap manually in Vercel, do NOT do this via Claude
4. SNS production access request (submit to AWS — needed for client OTP SMS)
5. Watermark Lambda enhancements — currently works for original + edited uploads; consider whether the orphaned old preview objects in R2 (left behind after each edit re-watermark) need periodic cleanup
6. Confirm Claude Haiku 4.5 exact model ID from Bedrock console → upgrade chatbot model
7. Decide whether to build a dedicated CloudFront distribution + key pair for the test bucket (skipped for now — test.vayustudios.com's print single-download was moved to direct S3 instead)
8. Consider giving `vayustudio-zip` reserved Lambda concurrency so a burst of large downloads can't starve watermark/face-indexing Lambdas (account-wide concurrency is shared) — not urgent at current usage scale, but cheap insurance
9. Real-world validation of a ~10GB print-portal batch to confirm actual elapsed time before printing a "10GB max download" claim in product docs

---

## How to Continue in a New Session

1. Read this file (CLAUDE.md)
2. Check "Next Session Priorities" above
3. `git checkout develop` — always work on develop, never main
4. Run `npm run dev` to start local server
5. Wallet needs dev credits — use the yellow banner button on the page

---

## Key Files

- REQUIREMENTS.md — complete spec for every file
- SETUP.md — AWS CLI commands, Vercel setup, Razorpay
- README.md — product overview, data model, flows

---

*Always commit after each step to `develop`. Update build status above. Merge to `main` only when ready to release.*
