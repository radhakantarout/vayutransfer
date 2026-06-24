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

Last updated: 2026-06-21

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
```

Live at https://vayutransfer.com — GitHub: https://github.com/radhakantarout/vayutransfer

### AWS Infrastructure (ap-south-1)
- S3 bucket: vayu-transfer-files (CORS + lifecycle configured)
- DynamoDB: all 6 tables active (including vayu-users)
- SES: PRODUCTION (approved 2026-06-22), FROM = noreply@vayutransfer.com (domain verified + DKIM)
- SNS: PENDING production access (OTP SMS not working in production yet — dev logs OTP to console)

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

### Next Session Priorities
1. Razorpay live keys (when account approved)
2. SNS production access request (submit to AWS — needed for client OTP SMS)
3. Watermark Lambda — build real implementation (currently placeholder, marks files READY in dev)
4. Test full VayuTransfer upload → download flow on production with real Google account

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
