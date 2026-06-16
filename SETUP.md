# VayuTransfer — Setup Guide 🛠️
> Version 2.0 | Simple, complete, copy-paste ready

---

## 📋 Before You Start

- [ ] Node.js 20.x installed
- [ ] AWS CLI installed and configured
- [ ] Razorpay account approved (apply first — takes 2–3 days)
- [ ] GoDaddy domain purchased
- [ ] Vercel account linked to GitHub
- [ ] GitHub repo created: `vayu-transfer`

---

## 1️⃣ Project Init

```bash
npx create-next-app@14.2.0 vayu-transfer \
  --typescript --tailwind --app --no-src-dir --import-alias "@/*"

cd vayu-transfer
npm install \
  @aws-sdk/client-s3 \
  @aws-sdk/client-dynamodb \
  @aws-sdk/lib-dynamodb \
  @aws-sdk/s3-request-presigner \
  @aws-sdk/client-ses \
  razorpay uuid
npm install -D @types/uuid
```

---

## 2️⃣ Environment Variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# AWS
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=vayu-transfer-files
CLOUDFRONT_DOMAIN=https://dXXXXXXXXXX.cloudfront.net

# DynamoDB Tables
DYNAMO_WALLETS_TABLE=vayu-wallets
DYNAMO_TRANSFERS_TABLE=vayu-transfers
DYNAMO_TRANSACTIONS_TABLE=vayu-transactions
DYNAMO_DOWNLOADS_TABLE=vayu-downloads
DYNAMO_AUDIT_TABLE=vayu-audit

# Razorpay
RAZORPAY_KEY_ID=rzp_live_XXXXXXXX
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_XXXXXXXX

# SES
SES_FROM_EMAIL=noreply@vayutransfer.in
SES_REGION=ap-south-1

# App
NEXT_PUBLIC_APP_URL=https://vayutransfer.in
APP_SECRET=generate_32_random_chars_here
MAX_FILE_SIZE_GB=10
DEFAULT_EXPIRY_HOURS=24
```

Generate APP_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3️⃣ AWS Setup (Run Once)

### 3.1 S3 Bucket

```bash
# Create bucket
aws s3api create-bucket \
  --bucket vayu-transfer-files \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Block public access
aws s3api put-public-access-block \
  --bucket vayu-transfer-files \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,\
BlockPublicPolicy=true,RestrictPublicBuckets=true

# CORS for browser uploads
aws s3api put-bucket-cors \
  --bucket vayu-transfer-files \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": [
        "https://vayutransfer.in",
        "http://localhost:3000"
      ],
      "AllowedMethods": ["GET","PUT","POST","DELETE","HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }]
  }'

# Lifecycle: delete files after 7 days + clean incomplete multipart after 1 day
aws s3api put-bucket-lifecycle-configuration \
  --bucket vayu-transfer-files \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "delete-files-7days",
        "Status": "Enabled",
        "Filter": { "Prefix": "uploads/" },
        "Expiration": { "Days": 7 }
      },
      {
        "ID": "abort-incomplete-multipart-1day",
        "Status": "Enabled",
        "Filter": { "Prefix": "uploads/" },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
      }
    ]
  }'
```

### 3.2 DynamoDB Tables

```bash
# Wallets
aws dynamodb create-table \
  --table-name vayu-wallets \
  --attribute-definitions \
    AttributeName=walletId,AttributeType=S \
    AttributeName=sessionId,AttributeType=S \
  --key-schema AttributeName=walletId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "sessionId-index",
    "Keys": [{"AttributeName":"sessionId","KeyType":"HASH"}],
    "Projection": {"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Transfers
aws dynamodb create-table \
  --table-name vayu-transfers \
  --attribute-definitions \
    AttributeName=fileId,AttributeType=S \
    AttributeName=walletId,AttributeType=S \
  --key-schema AttributeName=fileId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "walletId-index",
    "Keys": [{"AttributeName":"walletId","KeyType":"HASH"}],
    "Projection": {"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Transactions
aws dynamodb create-table \
  --table-name vayu-transactions \
  --attribute-definitions \
    AttributeName=txnId,AttributeType=S \
    AttributeName=walletId,AttributeType=S \
  --key-schema AttributeName=txnId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "walletId-index",
    "Keys": [{"AttributeName":"walletId","KeyType":"HASH"}],
    "Projection": {"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Downloads
aws dynamodb create-table \
  --table-name vayu-downloads \
  --attribute-definitions \
    AttributeName=downloadId,AttributeType=S \
    AttributeName=fileId,AttributeType=S \
  --key-schema AttributeName=downloadId,KeyType=HASH \
  --global-secondary-indexes '[{
    "IndexName": "fileId-index",
    "Keys": [{"AttributeName":"fileId","KeyType":"HASH"}],
    "Projection": {"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Audit Table (3 GSIs for flexible querying)
aws dynamodb create-table \
  --table-name vayu-audit \
  --attribute-definitions \
    AttributeName=auditId,AttributeType=S \
    AttributeName=eventType,AttributeType=S \
    AttributeName=walletId,AttributeType=S \
    AttributeName=fileId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=auditId,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "eventType-index",
      "Keys": [
        {"AttributeName":"eventType","KeyType":"HASH"},
        {"AttributeName":"createdAt","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    },
    {
      "IndexName": "walletId-index",
      "Keys": [
        {"AttributeName":"walletId","KeyType":"HASH"},
        {"AttributeName":"createdAt","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    },
    {
      "IndexName": "fileId-index",
      "Keys": [
        {"AttributeName":"fileId","KeyType":"HASH"},
        {"AttributeName":"createdAt","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

### 3.3 IAM Policy

Create policy `vayu-transfer-policy`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject", "s3:GetObject",
        "s3:DeleteObject", "s3:HeadObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::vayu-transfer-files/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:UpdateItem", "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-wallets",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-wallets/index/*",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-transfers",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-transfers/index/*",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-transactions",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-transactions/index/*",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-downloads",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-downloads/index/*",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-audit",
        "arn:aws:dynamodb:ap-south-1:*:table/vayu-audit/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

```bash
aws iam create-policy \
  --policy-name vayu-transfer-policy \
  --policy-document file://iam-policy.json

# Create user and attach
aws iam create-user --user-name vayu-transfer-app
aws iam attach-user-policy \
  --user-name vayu-transfer-app \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/vayu-transfer-policy

# Create access keys
aws iam create-access-key --user-name vayu-transfer-app
# Save KeyId and SecretAccessKey to .env.local
```

### 3.4 CloudFront

```bash
aws cloudfront create-distribution \
  --origin-domain-name vayu-transfer-files.s3.ap-south-1.amazonaws.com \
  --default-root-object index.html \
  --query 'Distribution.DomainName'
# Copy output domain → CLOUDFRONT_DOMAIN in .env.local
```

### 3.5 SES

```bash
# Verify domain
aws ses verify-domain-identity \
  --domain vayutransfer.in \
  --region ap-south-1

# Verify sender email
aws ses verify-email-identity \
  --email-address noreply@vayutransfer.in \
  --region ap-south-1

# Request production access via AWS Console
# Support → Create Case → Service Limit Increase → SES Sending Limits
# Takes 24–48 hours
```

---

## 4️⃣ Razorpay Setup

1. Register at [razorpay.com](https://razorpay.com) — do this today (2–3 day approval)
2. Complete KYC: PAN + Aadhaar + bank account
3. Your website must be live with Privacy Policy + T&C pages before approval
4. Settings → API Keys → Generate live keys → copy to `.env.local`
5. Settings → Webhooks:
   - URL: `https://vayutransfer.in/api/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`
   - Copy webhook secret → `RAZORPAY_WEBHOOK_SECRET`

---

## 5️⃣ GitHub

```bash
git init
git add .
git commit -m "feat: VayuTransfer v2 initial setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vayu-transfer.git
git push -u origin main
```

---

## 6️⃣ Vercel

```bash
npm install -g vercel
vercel login
vercel link    # link to GitHub repo
```

Add all `.env.local` values in:
Vercel Dashboard → Project → Settings → Environment Variables → Production

```bash
vercel --prod   # first deploy
# After this, every git push to main auto-deploys
```

---

## 7️⃣ GoDaddy → Vercel Domain

In GoDaddy DNS Management:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | 600 |
| CNAME | www | cname.vercel-dns.com | 600 |

In Vercel → Project → Settings → Domains:
- Add `vayutransfer.in`
- Add `www.vayutransfer.in`
- SSL auto-provisioned ✅

DNS propagation: 15 min – 48 hours.

---

## 8️⃣ Verify Everything Works

```bash
# Test DynamoDB connection
aws dynamodb list-tables --region ap-south-1

# Test S3 bucket
aws s3 ls s3://vayu-transfer-files/

# Test local dev
npm run dev
# Open http://localhost:3000
```

### End-to-End Test Checklist
```
[ ] Load wallet page — wallet created, cookie set
[ ] Top-up ₹199 — Razorpay test mode payment
[ ] Check balance shows ₹199
[ ] Upload 1MB test file — price calculator shows ₹19
[ ] Complete upload — shareable link generated
[ ] Open download link — file downloads
[ ] Check audit table has all events logged
[ ] Check vayu-downloads has download record
```

---

## 🚨 Common Issues

| Issue | Fix |
|-------|-----|
| S3 CORS error on upload | Verify AllowedOrigins includes your domain |
| ETag missing on part upload | Add ExposeHeaders: ["ETag"] to CORS config |
| Razorpay 400 on webhook | Webhook secret mismatch — check env var |
| DynamoDB GSI not found | Wait 2–3 minutes after table creation |
| SES sandbox — emails not arriving | Add recipient to verified emails in SES console |
| Vercel env vars not loading | Redeploy after adding in dashboard |
| CloudFront 403 | Add S3 bucket policy for CloudFront OAC |
| Wallet balance negative | DynamoDB conditional write missing — check lib/wallet.ts |

---

## 🔧 Useful Commands

```bash
# Dev
npm run dev
npm run build
npm run type-check

# Deploy
vercel --prod

# DynamoDB — scan audit events
aws dynamodb scan \
  --table-name vayu-audit \
  --filter-expression "eventType = :t" \
  --expression-attribute-values '{":t":{"S":"UPLOAD_COMPLETED"}}' \
  --region ap-south-1

# Query audit by wallet
aws dynamodb query \
  --table-name vayu-audit \
  --index-name walletId-index \
  --key-condition-expression "walletId = :w" \
  --expression-attribute-values '{":w":{"S":"YOUR_WALLET_ID"}}' \
  --region ap-south-1

# S3 — list uploads
aws s3 ls s3://vayu-transfer-files/uploads/ --recursive --human-readable
```

---

*Setup complete → Start with `npm run dev` and open http://localhost:3000*
