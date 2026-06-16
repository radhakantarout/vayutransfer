# VayuTransfer — Requirements for Claude Code 🤖
> Version 2.0 | With Audit Table | Simple + Robust

Read this file completely before generating any code.
Generate files in STEP order. Each file must be complete and production-ready.

---

## 🎯 Product in One Line

Prepaid wallet file transfer platform — user loads credits, pays per GB + per download slot, shares files via secure expiring links. Zero loss guarantee — wallet deducted before upload.

---

## 🏗️ Tech Stack (Do Not Change)

| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 14 App Router (TypeScript) |
| Deployment | Vercel |
| Storage | AWS S3 (ap-south-1) |
| CDN | AWS CloudFront |
| Database | AWS DynamoDB |
| Payments | Razorpay |
| Email | AWS SES |
| Styling | Tailwind CSS |
| AWS SDK | @aws-sdk/client-s3, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, @aws-sdk/s3-request-presigner, @aws-sdk/client-ses |

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "next": "14.2.0",
    "react": "^18",
    "react-dom": "^18",
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "@aws-sdk/client-ses": "^3.600.0",
    "razorpay": "^2.9.2",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/uuid": "^10",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.1",
    "postcss": "^8"
  }
}
```

---

## 🗄️ DynamoDB Tables (5 Total)

### Table 1: `vayu-wallets`
Stores prepaid wallet per session.

```
PK: walletId (uuid)
GSI: sessionId-index (sessionId)

Fields:
- walletId: string (PK)
- sessionId: string (browser cookie, GSI)
- balance: number (paise, integer only)
- totalLoaded: number (paise, lifetime)
- totalSpent: number (paise, lifetime)
- createdAt: ISO string
- updatedAt: ISO string
```

### Table 2: `vayu-transfers`
One record per file transfer.

```
PK: fileId (uuid)
GSI: walletId-index (walletId)

Fields:
- fileId: string (PK)
- walletId: string (GSI)
- fileName: string
- fileSizeBytes: number
- billableGB: number (rounded up to 0.1)
- downloadSlots: number (purchased)
- downloadsUsed: number (starts 0)
- recipientEmail: string (nullable)
- amountDeducted: number (paise)
- storageCostPaise: number
- downloadCostPaise: number
- status: 'pending' | 'active' | 'expired' | 'exhausted' | 'failed'
- s3Key: string
- expiryTime: ISO string
- createdAt: ISO string
- completedAt: ISO string (nullable)
```

### Table 3: `vayu-transactions`
Every wallet credit/debit event.

```
PK: txnId (uuid)
GSI: walletId-index (walletId)

Fields:
- txnId: string (PK)
- walletId: string (GSI)
- type: 'topup' | 'deduction' | 'bonus' | 'refund'
- amount: number (paise)
- bonusAmount: number (paise, 0 for non-topup)
- razorpayOrderId: string (nullable)
- razorpayPaymentId: string (nullable)
- fileId: string (nullable, for deductions)
- status: 'pending' | 'success' | 'failed'
- createdAt: ISO string
```

### Table 4: `vayu-downloads`
One record per download attempt (successful or failed).

```
PK: downloadId (uuid)
GSI: fileId-index (fileId)

Fields:
- downloadId: string (PK)
- fileId: string (GSI)
- walletId: string
- attemptedAt: ISO string
- outcome: 'success' | 'expired' | 'exhausted' | 'invalid'
- downloadsUsedAtTime: number (snapshot)
- downloadsAllowedAtTime: number (snapshot)
- userAgent: string (nullable)
- ipHash: string (SHA256 of IP, not raw IP)
- countryCode: string (nullable)
```

### Table 5: `vayu-audit` ⭐ NEW
Every significant system event — single source of truth for analytics and debugging.

```
PK: auditId (uuid)
GSI-1: eventType-index (eventType + createdAt for range queries)
GSI-2: walletId-index (walletId + createdAt)
GSI-3: fileId-index (fileId + createdAt)

Fields:
- auditId: string (PK)
- eventType: string (see Event Types below)
- walletId: string (nullable)
- fileId: string (nullable)
- txnId: string (nullable)
- downloadId: string (nullable)
- actor: 'user' | 'system' | 'razorpay' | 'scheduler'
- outcome: 'success' | 'failure' | 'warning'
- amountPaise: number (nullable, for financial events)
- metadata: object (event-specific payload — see below)
- errorCode: string (nullable)
- errorMessage: string (nullable)
- durationMs: number (nullable, for performance tracking)
- createdAt: ISO string (sort key for GSIs)
```

#### Audit Event Types (Complete List)

```
WALLET_CREATED          — new wallet initialised
WALLET_TOPUP_INITIATED  — Razorpay order created
WALLET_TOPUP_SUCCESS    — payment confirmed, credits added
WALLET_TOPUP_FAILED     — payment failed
WALLET_DEDUCTED         — credits deducted for upload
WALLET_REFUNDED         — credits returned on upload failure

UPLOAD_INITIATED        — upload URL generated, wallet deducted
UPLOAD_COMPLETED        — file confirmed in S3, link generated
UPLOAD_FAILED           — S3 upload did not complete, refund triggered
UPLOAD_EXPIRED_PENDING  — pending uploads cleaned up by scheduler

DOWNLOAD_ATTEMPTED      — someone clicked a download link
DOWNLOAD_SUCCESS        — file served successfully
DOWNLOAD_BLOCKED_EXPIRED  — link past expiry time
DOWNLOAD_BLOCKED_EXHAUSTED — download limit reached
DOWNLOAD_BLOCKED_INVALID   — fileId not found

LINK_EXPIRED            — scheduler marked transfer expired
LINK_EXHAUSTED          — last download slot used

RATE_LIMIT_HIT          — user exceeded 10 uploads/hour
WEBHOOK_RECEIVED        — Razorpay webhook received
WEBHOOK_VERIFIED        — signature check passed
WEBHOOK_REJECTED        — signature check failed
```

#### Audit Metadata Payloads by Event Type

```typescript
// WALLET_TOPUP_SUCCESS
metadata: {
  tierId: 'popular',
  baseAmountPaise: 49900,
  bonusAmountPaise: 5000,
  totalCreditedPaise: 54900,
  razorpayOrderId: 'order_xxx',
  razorpayPaymentId: 'pay_xxx',
  newBalancePaise: 54900
}

// UPLOAD_INITIATED
metadata: {
  fileName: 'project.zip',
  fileSizeBytes: 209715200,
  billableGB: 0.2,
  downloadSlots: 5,
  storageCostPaise: 1900,
  downloadCostPaise: 2500,
  totalDeductedPaise: 4400,
  balanceBeforePaise: 49900,
  balanceAfterPaise: 45500
}

// DOWNLOAD_SUCCESS
metadata: {
  fileName: 'project.zip',
  fileSizeBytes: 209715200,
  downloadsUsed: 2,
  downloadsAllowed: 5,
  downloadsRemaining: 3,
  minutesToExpiry: 1080
}

// UPLOAD_FAILED
metadata: {
  reason: 'S3_TIMEOUT' | 'USER_ABANDONED' | 'NETWORK_ERROR',
  refundedPaise: 4400,
  fileId: 'uuid'
}

// RATE_LIMIT_HIT
metadata: {
  uploadsInLastHour: 11,
  limit: 10
}
```

---

## 💰 Pricing Constants

```typescript
// constants/pricing.ts

export const MINIMUM_CHARGE_PAISE = 1900        // ₹19 floor
export const SMALL_FILE_THRESHOLD_BYTES =
  500 * 1024 * 1024                             // 500MB

// Slab pricing
export const PRICE_SLABS = [
  { maxGB: 0.5,  pricePerGBPaise: 0,    flatPaise: 1900 },  // 0–500MB: ₹19 flat
  { maxGB: 2,    pricePerGBPaise: 2900,  flatPaise: 0 },     // 500MB–2GB: ₹29/GB
  { maxGB: 5,    pricePerGBPaise: 2500,  flatPaise: 0 },     // 2GB–5GB: ₹25/GB
  { maxGB: 10,   pricePerGBPaise: 2200,  flatPaise: 0 },     // 5GB–10GB: ₹22/GB
]

export const COST_PER_DOWNLOAD_PAISE = 500      // ₹5 per slot
export const DEFAULT_EXPIRY_HOURS = 24
export const MAX_FILE_SIZE_GB = 10
export const RATE_LIMIT_UPLOADS_PER_HOUR = 10
export const MULTIPART_CHUNK_SIZE_BYTES =
  50 * 1024 * 1024                              // 50MB chunks

export const WALLET_TOPUP_TIERS = [
  { id: 'starter', label: 'Starter',  pricePaise: 19900, bonusPaise: 0,    popular: false },
  { id: 'popular', label: 'Popular',  pricePaise: 49900, bonusPaise: 5000, popular: true  },
  { id: 'pro',     label: 'Pro',      pricePaise: 99900, bonusPaise: 15000,popular: false },
  { id: 'agency',  label: 'Agency',   pricePaise: 299900,bonusPaise: 60000,popular: false },
]

// AWS actual cost estimates (for margin calculation)
export const ESTIMATED_AWS_COST_PER_GB_PAISE = 1100  // ₹11/GB
export const RAZORPAY_FEE_PERCENT = 2
```

---

## 📁 Files to Generate (in Order)

### STEP 1 — Types

**`types/index.ts`**
Generate TypeScript interfaces for:
- `Wallet` — all fields from DynamoDB schema above
- `Transfer` — all fields from DynamoDB schema above
- `Transaction` — all fields from DynamoDB schema above
- `Download` — all fields from DynamoDB schema above
- `AuditEvent` — all fields from DynamoDB schema above
- `PriceBreakdown` — billableGB, storageCostPaise, downloadSlots, downloadCostPaise, totalPaise, totalFormatted, slabApplied, marginPercent
- `WalletTopupTier` — id, label, pricePaise, bonusPaise, popular, effectiveValuePaise
- `ApiResponse<T>` — success, data, error
- `AuditEventType` — union type of all event type strings listed above

---

### STEP 2 — Audit Helper (Build This First — Everything Uses It)

**`lib/audit.ts`**

```
Export: logAudit(params: {
  eventType: AuditEventType,
  actor: 'user' | 'system' | 'razorpay' | 'scheduler',
  outcome: 'success' | 'failure' | 'warning',
  walletId?: string,
  fileId?: string,
  txnId?: string,
  downloadId?: string,
  amountPaise?: number,
  metadata?: Record<string, any>,
  errorCode?: string,
  errorMessage?: string,
  durationMs?: number,
}) => Promise<void>

Rules:
- Generate auditId with uuidv4()
- Always add createdAt: new Date().toISOString()
- Never throw — wrap in try/catch and console.error on failure
  (audit must never break the main flow)
- Write to vayu-audit DynamoDB table
- Keep it fire-and-forget — do not await in critical paths,
  use void logAudit(...) pattern
```

---

### STEP 3 — AWS Helpers

**`lib/aws/dynamodb.ts`**
```
- DynamoDBDocumentClient singleton (ap-south-1)
- getItem(table, key) → Promise<T | null>
- putItem(table, item) → Promise<void>
- updateItem(table, key, updateExpr, exprValues, conditionExpr?) → Promise<void>
- queryItems(table, indexName, keyCondition, exprValues) → Promise<T[]>
- All amounts in paise (integers)
```

**`lib/aws/s3.ts`**
```
- S3Client singleton (ap-south-1)
- initiateMultipartUpload(s3Key, contentType) → Promise<string> (uploadId)
- generatePartPresignedUrl(s3Key, uploadId, partNumber) → Promise<string>
  - Expires: 7200 seconds (2 hours)
- completeMultipartUpload(s3Key, uploadId, parts) → Promise<void>
- generateDownloadPresignedUrl(s3Key, fileName) → Promise<string>
  - Expires: 900 seconds (15 min)
  - ResponseContentDisposition: attachment
- deleteS3Object(key) → Promise<void>
- getS3Key(fileId, fileName) → string  (uploads/{fileId}/{fileName})
```

**`lib/aws/ses.ts`**
```
- SESClient singleton
- sendTransferLinkEmail(recipient, fileName, downloadUrl, expiryTime, downloadsAllowed)
  → Promise<void>
  Clean HTML email with download button. From: env SES_FROM_EMAIL
- sendWalletCreditedEmail(email, amountPaise, bonusPaise, newBalancePaise)
  → Promise<void>
```

---

### STEP 4 — Business Logic

**`lib/pricing.ts`**
```
- calculatePrice(fileSizeBytes, downloadSlots) → PriceBreakdown
  - Apply slab pricing from PRICE_SLABS constant
  - Round billableGB up to nearest 0.1
  - Apply MINIMUM_CHARGE_PAISE floor for files < 500MB
  - Calculate estimated margin percent
- formatPaise(paise) → string  (₹XX.XX)
- estimateAWSCost(fileSizeBytes, downloadSlots) → number (paise)
```

**`lib/wallet.ts`**
```
- getOrCreateWallet(sessionId) → Promise<Wallet>
  Check GSI, create if not found, log WALLET_CREATED audit event
- getWalletBalance(walletId) → Promise<number>
- deductFromWallet(walletId, amountPaise, fileId) → Promise<void>
  - DynamoDB conditional: balance >= amountPaise
  - Log WALLET_DEDUCTED audit on success
  - Throw 'INSUFFICIENT_BALANCE' on ConditionalCheckFailedException
- creditWallet(walletId, amountPaise, bonusPaise, txnId) → Promise<void>
  - Idempotent (check txnId not processed)
  - Log WALLET_TOPUP_SUCCESS audit
- refundWallet(walletId, amountPaise, fileId) → Promise<void>
  - Log WALLET_REFUNDED audit
```

---

### STEP 5 — API Routes

**`app/api/wallet/balance/route.ts`** — GET
```
- Read sessionId from cookie
- getOrCreateWallet(sessionId)
- Set httpOnly cookie if new
- Return: { walletId, balancePaise, balanceFormatted }
```

**`app/api/wallet/topup/route.ts`** — POST
```
Body: { tierId, walletId }
- Validate tierId in WALLET_TOPUP_TIERS
- Create Razorpay order
- Save pending transaction
- Log WALLET_TOPUP_INITIATED audit
- Return: { orderId, amountPaise, currency: 'INR', keyId }
```

**`app/api/wallet/verify/route.ts`** — POST
```
Body: { razorpayPaymentId, razorpayOrderId, razorpaySignature, walletId, tierId }
- Verify HMAC SHA256 signature
- Log WEBHOOK_VERIFIED or WEBHOOK_REJECTED audit
- If valid: creditWallet(base + bonus)
- Update transaction status
- Return: { success, newBalancePaise, newBalanceFormatted }
```

**`app/api/webhooks/razorpay/route.ts`** — POST
```
- Verify X-Razorpay-Signature
- Log WEBHOOK_RECEIVED audit always
- Handle payment.captured as backup (idempotent)
- Return 200 always
```

**`app/api/upload/multipart/initiate/route.ts`** — POST
```
Body: { walletId, fileName, fileSizeBytes, downloadSlots, recipientEmail }
- Validate: fileSizeBytes <= MAX_FILE_SIZE_GB × 1024³
- Rate limit: max 10 uploads/hour per walletId
  (query vayu-audit for UPLOAD_INITIATED in last hour)
  Log RATE_LIMIT_HIT if exceeded
- calculatePrice(fileSizeBytes, downloadSlots)
- Check wallet balance
- Atomic deduct from wallet
- Generate fileId, s3Key
- initiateMultipartUpload on S3
- Save transfer record (status: pending)
- Log UPLOAD_INITIATED audit with full metadata
- Return: { fileId, uploadId, s3Key, totalChunks, chunkSizeBytes, priceBreakdown }
```

**`app/api/upload/multipart/part-url/route.ts`** — POST
```
Body: { fileId, uploadId, partNumber, s3Key }
- Validate fileId belongs to wallet (check DynamoDB)
- generatePartPresignedUrl(s3Key, uploadId, partNumber)
- Return: { presignedUrl, partNumber, expiresIn: 7200 }
```

**`app/api/upload/multipart/complete/route.ts`** — POST
```
Body: { fileId, uploadId, s3Key, parts: [{PartNumber, ETag}] }
- completeMultipartUpload on S3
- Generate download presigned URL (15 min)
- Update transfer status → 'active'
- Set expiryTime = now + DEFAULT_EXPIRY_HOURS
- Send SES email if recipientEmail set
- Log UPLOAD_COMPLETED audit
- Return: { shareableLink: /download/{fileId}, fileId, expiryTime }
```

**`app/api/upload/multipart/abort/route.ts`** — POST
```
Body: { fileId, uploadId, s3Key, walletId }
- Abort multipart upload on S3
- Update transfer status → 'failed'
- refundWallet(walletId, amountDeducted, fileId)
- Log UPLOAD_FAILED audit with reason
- Return: { success, refundedPaise, refundedFormatted }
```

**`app/api/download/[fileId]/route.ts`** — GET
```
- Fetch transfer from DynamoDB
- Generate downloadId (uuid)
- Check status === 'active' → else log DOWNLOAD_BLOCKED_INVALID
- Check expiryTime > now → else log DOWNLOAD_BLOCKED_EXPIRED
- Check downloadsUsed < downloadSlots → else log DOWNLOAD_BLOCKED_EXHAUSTED
- Atomic increment downloadsUsed (conditional write)
- If downloadsUsed + 1 >= downloadSlots: update status → 'exhausted', log LINK_EXHAUSTED
- Save download record to vayu-downloads
  (ipHash = SHA256 of x-forwarded-for, userAgent from headers)
- Log DOWNLOAD_SUCCESS audit
- Return: { downloadUrl, fileName, downloadsRemaining, expiryTime }
```

---

### STEP 6 — Frontend Components

**`components/UploadZone.tsx`** — Client component
```
- HTML5 drag and drop (no external library)
- Click to browse fallback
- Show: file name, size formatted (KB/MB/GB)
- Emit onFileSelect(file: File)
- States: idle | dragover | selected
- Tailwind dark theme, dashed border
```

**`components/PriceCalculator.tsx`** — Client component
```
Props: { fileSizeBytes, walletBalancePaise, onPricingChange(pricing) }
- Import calculatePrice from lib/pricing
- Slider for downloadSlots (1–20)
- Show breakdown:
  File size: X GB (billed)
  Storage: ₹XX (slab shown e.g. "flat rate" or "₹29/GB")
  Downloads: X × ₹5 = ₹XX
  ─────────────────
  Total: ₹XX
- Green if balance sufficient, red warning if not
- Show estimated margin % in dev mode only (process.env.NODE_ENV)
```

**`components/UploadProgress.tsx`** — Client component
```
Props: { percent, currentChunk, totalChunks, fileName, onAbort() }
- Progress bar (animated)
- Show: "Uploading chunk X of Y"
- Abort button → calls /api/upload/multipart/abort → refund
- On complete: show shareable link with copy button
```

**`components/WalletCard.tsx`** — Client component
```
Props: { balancePaise, walletId, onTopup() }
- Show balance in ₹
- Low balance warning if < ₹50
- "Add Credits" button
- Auto-refresh every 30 seconds
```

**`components/TopupModal.tsx`** — Client component
```
Props: { walletId, onSuccess(newBalance), onClose() }
- 4 tier cards from WALLET_TOPUP_TIERS
- Show: price, bonus credits, effective value
- Highlight popular tier
- Load Razorpay JS: https://checkout.razorpay.com/v1/checkout.js
- On select → POST /api/wallet/topup → open Razorpay checkout
- On success → POST /api/wallet/verify → show new balance
```

**`components/DownloadCard.tsx`** — Client component
```
Props: { fileId }
- Fetch /api/download/[fileId] on mount
- Show: file name, size, downloads remaining, expiry countdown
- "Download File" button → window.open(downloadUrl)
- States: loading | ready | expired | exhausted | error
- Countdown timer to expiry (live)
```

---

### STEP 7 — Pages

**`app/page.tsx`**
```
Main page:
- WalletCard top right
- Hero: "Send large files. Pay only for what you use."
- UploadZone
- When file selected → PriceCalculator
- Upload button:
  1. POST /api/upload/multipart/initiate
  2. Split file into 50MB chunks
  3. For each chunk: get part URL → PUT to S3
  4. POST /api/upload/multipart/complete
  Show UploadProgress during steps 2–4
  On abort: POST /api/upload/multipart/abort
- Show shareable link + copy button on success
```

**`app/wallet/page.tsx`**
```
- Current balance
- Last 10 transactions (query vayu-transactions GSI)
- TopupModal trigger
- Transaction table: date, type, amount, bonus, status
```

**`app/download/[fileId]/page.tsx`**
```
- Server component wrapper
- DownloadCard
- VayuTransfer branding footer
```

---

### STEP 8 — Config Files

**`.env.example`**
```
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=vayu-transfer-files
CLOUDFRONT_DOMAIN=
DYNAMO_WALLETS_TABLE=vayu-wallets
DYNAMO_TRANSFERS_TABLE=vayu-transfers
DYNAMO_TRANSACTIONS_TABLE=vayu-transactions
DYNAMO_DOWNLOADS_TABLE=vayu-downloads
DYNAMO_AUDIT_TABLE=vayu-audit
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
SES_FROM_EMAIL=
SES_REGION=ap-south-1
NEXT_PUBLIC_APP_URL=
APP_SECRET=
MAX_FILE_SIZE_GB=10
DEFAULT_EXPIRY_HOURS=24
```

**`next.config.js`**
```
- App Router enabled
- CloudFront domain in images.domains
- Body size limit 10mb
- Content Security Policy headers
```

**`tailwind.config.js`**
```
Dark theme:
- bg: #0B0F1A
- card: #131929
- border: #1E2D45
- accent: #00C6FF
- success: #00E5A0
- danger: #FF5370
- text: #E0EAF8
- muted: #5A7090
```

**`.gitignore`** — Standard Next.js + `.env.local`

---

## 🔐 Security Rules (Non-Negotiable)

1. All amounts stored as paise (integers) — never floats
2. Wallet deduction BEFORE S3 upload — always
3. DynamoDB conditional writes for deduction and download counter
4. Razorpay webhook: verify HMAC SHA256 before any processing
5. IP stored as SHA256 hash only — never raw IP
6. Presigned upload URLs: 2 hour expiry
7. Presigned download URLs: 15 minute expiry
8. Session wallet IDs in httpOnly cookies only
9. Rate limit: 10 uploads per walletId per hour (enforced via audit table query)
10. Never expose AWS credentials client-side

---

## ⚡ Critical Business Rules

1. Wallet deducted → upload fails → refund immediately via abort endpoint
2. Download counter atomic — DynamoDB ADD with ConditionExpression
3. Razorpay webhook idempotent — check txnId before crediting twice
4. Audit log is fire-and-forget — never let audit failure break main flow
5. S3 lifecycle: auto-delete files after 7 days
6. Abort incomplete multipart uploads after 24 hours (S3 lifecycle rule)

---

## 📊 Business Outcomes from Audit Table

The vayu-audit table enables these insights without any additional instrumentation:

| Business Question | Audit Query |
|-------------------|-------------|
| Daily revenue | SUM(amountPaise) WHERE eventType=WALLET_DEDUCTED, date=today |
| Conversion rate | COUNT(UPLOAD_COMPLETED) / COUNT(WALLET_CREATED) |
| Drop-off point | COUNT(UPLOAD_INITIATED) vs COUNT(UPLOAD_COMPLETED) |
| Most popular file sizes | AVG(metadata.fileSizeBytes) WHERE eventType=UPLOAD_COMPLETED |
| Download engagement | AVG(downloadsUsed/downloadsAllowed) per fileId |
| Top-up tier popularity | COUNT by tierId WHERE eventType=WALLET_TOPUP_SUCCESS |
| Failed payment rate | COUNT(WALLET_TOPUP_FAILED) / COUNT(WALLET_TOPUP_INITIATED) |
| Refund rate | COUNT(WALLET_REFUNDED) / COUNT(WALLET_DEDUCTED) |
| Abuse detection | COUNT(RATE_LIMIT_HIT) by walletId |
| Link expiry vs exhausted | COUNT(LINK_EXPIRED) vs COUNT(LINK_EXHAUSTED) |
| Revenue by hour | GROUP BY hour WHERE eventType=WALLET_DEDUCTED |
| Wallet float | SUM(balance) across all wallets (idle money) |

---

## 🧪 Test Scenarios

1. Upload 200MB + 5 downloads → charged ₹19 + ₹25 = ₹44 ✅
2. Upload 2GB + 3 downloads → charged ₹58 + ₹15 = ₹73 ✅
3. Wallet insufficient → upload blocked, error shown, nothing deducted ✅
4. Upload fails mid-way → wallet refunded, audit logged ✅
5. Download link clicked 5/5 times → 6th blocked, status = exhausted ✅
6. Download after expiry → blocked, audit DOWNLOAD_BLOCKED_EXPIRED ✅
7. Top-up ₹499 → ₹549 credited (₹50 bonus) ✅
8. Two simultaneous downloads → counter correct (no race condition) ✅
9. 11th upload in 1 hour → rate limit hit, audit logged ✅
10. Razorpay webhook duplicate → second credit ignored (idempotent) ✅

---

## 📝 Code Style

- TypeScript strict mode
- All API routes return ApiResponse<T>
- Errors: { success: false, error: 'SNAKE_CASE_CODE', message: 'human readable' }
- No `any` types
- All money in paise in backend, ₹ formatted in UI only
- void logAudit(...) — never await audit in critical path
- Console.log only in development
