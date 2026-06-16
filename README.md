# VayuTransfer 🚀
> Secure file transfer. Prepaid wallet. Pay only for what you use.

Built for the Indian market. No login. No subscription. No surprises.

---

## 🧠 How It Works (User View)

```
1. Load credits into wallet (₹199 minimum)
2. Drag & drop your file
3. See exact price before paying
4. Credits deducted → file uploads to S3
5. Share the link → recipient downloads
6. Link expires or gets exhausted → automatically locked
```

That's it. No account. No monthly fee. No hidden charges.

---

## 💰 Pricing

### Storage (per transfer)
| File Size | Charge |
|-----------|--------|
| Up to 500MB | ₹19 flat |
| 500MB – 2GB | ₹29 per GB |
| 2GB – 5GB | ₹25 per GB |
| 5GB – 10GB | ₹22 per GB |

### Downloads
- ₹5 per download slot (you choose 1–20 slots)

### Example
```
2GB file + 5 download slots
= ₹58 (storage) + ₹25 (downloads)
= ₹83 total
```

### Wallet Top-up Tiers
| Pack | Pay | Get | Bonus |
|------|-----|-----|-------|
| Starter | ₹199 | ₹199 | — |
| Popular ⭐ | ₹499 | ₹549 | ₹50 |
| Pro | ₹999 | ₹1,149 | ₹150 |
| Agency | ₹2,999 | ₹3,599 | ₹600 |

---

## 🏗️ Architecture

```
Browser (Next.js)
    │
    ├── Wallet API ──────────────── DynamoDB (vayu-wallets)
    ├── Upload API ──────────────── S3 (multipart, 50MB chunks)
    ├── Download API ────────────── S3 (presigned URL, 15 min)
    └── Audit Logger ────────────── DynamoDB (vayu-audit)
                                         │
                                    Business Analytics
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 14 App Router |
| Deployment | Vercel |
| Storage | AWS S3 ap-south-1 |
| CDN | AWS CloudFront |
| Database | AWS DynamoDB |
| Payments | Razorpay |
| Email | AWS SES |
| Styling | Tailwind CSS |

---

## 🗄️ Data Model (5 Tables)

### `vayu-wallets`
One wallet per browser session. Stores balance in paise.
```
walletId (PK) | sessionId (GSI) | balance | totalLoaded | totalSpent
```

### `vayu-transfers`
One record per file upload.
```
fileId (PK) | walletId (GSI) | fileName | fileSizeBytes | billableGB
downloadSlots | downloadsUsed | amountDeducted | status | expiryTime
```

### `vayu-transactions`
Every wallet credit or debit event.
```
txnId (PK) | walletId (GSI) | type | amount | bonusAmount
razorpayOrderId | razorpayPaymentId | status
```

### `vayu-downloads`
Every download attempt — success or failure.
```
downloadId (PK) | fileId (GSI) | outcome | downloadsUsedAtTime
ipHash | userAgent | countryCode | attemptedAt
```

### `vayu-audit` ⭐
Every significant system event. Single source of truth for analytics.
```
auditId (PK) | eventType (GSI) | walletId (GSI) | fileId (GSI)
actor | outcome | amountPaise | metadata (JSON) | durationMs | createdAt
```

---

## 📊 Audit Event Types

```
WALLET_CREATED              WALLET_TOPUP_INITIATED
WALLET_TOPUP_SUCCESS        WALLET_TOPUP_FAILED
WALLET_DEDUCTED             WALLET_REFUNDED

UPLOAD_INITIATED            UPLOAD_COMPLETED
UPLOAD_FAILED               UPLOAD_EXPIRED_PENDING

DOWNLOAD_ATTEMPTED          DOWNLOAD_SUCCESS
DOWNLOAD_BLOCKED_EXPIRED    DOWNLOAD_BLOCKED_EXHAUSTED
DOWNLOAD_BLOCKED_INVALID

LINK_EXPIRED                LINK_EXHAUSTED
RATE_LIMIT_HIT
WEBHOOK_RECEIVED            WEBHOOK_VERIFIED            WEBHOOK_REJECTED
```

---

## 📈 Business Insights from Audit Table

Every business question answered by querying `vayu-audit`:

| Question | How |
|----------|-----|
| Daily revenue | SUM amountPaise WHERE eventType=WALLET_DEDUCTED |
| Upload → complete conversion | COUNT UPLOAD_COMPLETED / UPLOAD_INITIATED |
| Most common file sizes | AVG metadata.fileSizeBytes WHERE UPLOAD_COMPLETED |
| Download engagement rate | AVG downloadsUsed/downloadSlots per fileId |
| Top-up tier split | COUNT by metadata.tierId WHERE WALLET_TOPUP_SUCCESS |
| Failed payment rate | WALLET_TOPUP_FAILED / WALLET_TOPUP_INITIATED |
| Refund rate | COUNT WALLET_REFUNDED / WALLET_DEDUCTED |
| Abuse detection | walletIds with RATE_LIMIT_HIT > 3/day |
| Link expiry vs exhausted | LINK_EXPIRED vs LINK_EXHAUSTED ratio |
| Revenue by hour | GROUP BY hour WHERE WALLET_DEDUCTED |
| Wallet float (idle money) | SUM balance across all wallets |
| Average time to first download | MIN(DOWNLOAD_SUCCESS.createdAt) - UPLOAD_COMPLETED.createdAt |

---

## 📁 Project Structure

```
vayu-transfer/
├── app/
│   ├── page.tsx                          # Upload flow
│   ├── wallet/page.tsx                   # Wallet management
│   ├── download/[fileId]/page.tsx        # Download page
│   └── api/
│       ├── wallet/
│       │   ├── balance/route.ts
│       │   ├── topup/route.ts
│       │   └── verify/route.ts
│       ├── upload/
│       │   └── multipart/
│       │       ├── initiate/route.ts
│       │       ├── part-url/route.ts
│       │       ├── complete/route.ts
│       │       └── abort/route.ts
│       ├── download/[fileId]/route.ts
│       └── webhooks/razorpay/route.ts
├── components/
│   ├── UploadZone.tsx
│   ├── PriceCalculator.tsx
│   ├── UploadProgress.tsx
│   ├── WalletCard.tsx
│   ├── TopupModal.tsx
│   └── DownloadCard.tsx
├── lib/
│   ├── audit.ts                          # ⭐ Fire-and-forget audit logger
│   ├── pricing.ts                        # Slab pricing engine
│   ├── wallet.ts                         # Wallet operations
│   └── aws/
│       ├── dynamodb.ts
│       ├── s3.ts
│       └── ses.ts
├── types/index.ts
├── constants/pricing.ts
├── .env.example
├── REQUIREMENTS.md
├── SETUP.md
└── README.md
```

---

## 🔄 Key Flows

### Upload Flow
```
File selected
→ Price calculated client-side (instant)
→ Upload button clicked
→ POST /api/upload/multipart/initiate
  → Wallet balance checked
  → Wallet deducted (atomic DynamoDB conditional write)
  → S3 multipart upload initiated
  → Audit: UPLOAD_INITIATED
→ File split into 50MB chunks
→ Each chunk: GET part presigned URL → PUT to S3 directly
→ Progress bar updates per chunk
→ POST /api/upload/multipart/complete
  → S3 assembles file
  → Transfer status → active
  → SES email sent (if recipient provided)
  → Audit: UPLOAD_COMPLETED
→ Shareable link shown
```

### Download Flow
```
Recipient clicks link
→ GET /api/download/[fileId]
  → Check: status active?
  → Check: not expired?
  → Check: slots remaining?
  → Atomic increment downloadsUsed
  → Save vayu-downloads record (ipHash, userAgent)
  → Audit: DOWNLOAD_SUCCESS
  → Return 15-min presigned URL
→ Browser streams file (no memory buffering)
```

### Wallet Top-up Flow
```
User picks tier
→ POST /api/wallet/topup → Razorpay order created
→ Razorpay checkout opens
→ Payment captured
→ POST /api/wallet/verify → HMAC signature verified
→ creditWallet (base + bonus, idempotent)
→ Audit: WALLET_TOPUP_SUCCESS
→ New balance shown
```

### Abort / Refund Flow
```
User closes browser mid-upload
→ beforeunload → POST /api/upload/multipart/abort
→ S3 multipart aborted
→ Wallet refunded (full amount)
→ Transfer status → failed
→ Audit: UPLOAD_FAILED + WALLET_REFUNDED
```

---

## ⚡ Performance

| File Size | Upload Time (50 Mbps) | Download Time (50 Mbps) |
|-----------|----------------------|------------------------|
| 200MB | ~35 seconds | ~35 seconds |
| 1GB | ~3 minutes | ~3 minutes |
| 2GB | ~6 minutes | ~6 minutes |
| 5GB | ~15 minutes | ~15 minutes |

Multipart upload (50MB chunks):
- No browser timeout issues
- Resume on chunk failure (retry that chunk only)
- Native browser download progress bar
- Mobile safe (streaming, no memory load)

---

## 🔐 Security

| Concern | How We Handle It |
|---------|----------------|
| Negative wallet balance | DynamoDB conditional write — impossible |
| Double payment credit | Idempotent webhook (txnId check) |
| Fake payment | HMAC SHA256 Razorpay signature verification |
| Download link abuse | Rate limited — count enforced atomically |
| User IP privacy | Stored as SHA256 hash only — never raw IP |
| AWS credentials | Server-side only — never in browser |
| Upload without paying | Wallet deducted before S3 URL generated |
| Race condition on downloads | DynamoDB atomic ADD with ConditionExpression |

---

## ✅ MVP Feature Checklist

**Launch (Week 1–3)**
- [x] Prepaid wallet with Razorpay
- [x] Slab pricing engine (₹19 minimum)
- [x] Multipart upload (50MB chunks)
- [x] Per-download slot tracking
- [x] Link expiry control (24h default)
- [x] Atomic download counter
- [x] SES email notification
- [x] Full audit trail
- [x] Wallet refund on upload failure

**V2 (Month 2)**
- [ ] Password-protected links
- [ ] SMS notification (MSG91)
- [ ] Login + transfer history
- [ ] Custom expiry (3/7 days)

**V3 (Month 3+)**
- [ ] Analytics dashboard (from audit table)
- [ ] Agency/team plans
- [ ] API access for developers
- [ ] Bulk transfer

---

## 💼 Business Model

```
Revenue per 200MB transfer (5 downloads):
  Charge:  ₹19 + ₹25 = ₹44
  Cost:    ₹1.50 (AWS) + ₹0.88 (Razorpay 2%) = ₹2.38
  Profit:  ₹41.62 = 94% margin

Revenue per 2GB transfer (5 downloads):
  Charge:  ₹58 + ₹25 = ₹83
  Cost:    ₹22 (AWS) + ₹1.66 (Razorpay) = ₹23.66
  Profit:  ₹59.34 = 71% margin

Path to ₹2L/month profit:
  Option A: 2,000 active paying users × avg ₹150 spend
  Option B: 100 agencies × avg ₹2,000/month spend
  Option C: Mix — 50 agencies + 500 individual users
```

---

## 👥 Built By

Radhakanta + Claude Code 🤖

---

*VayuTransfer — Fast. Secure. Prepaid. No surprises.*
