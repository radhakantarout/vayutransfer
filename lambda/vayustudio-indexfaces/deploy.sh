#!/usr/bin/env bash
set -e

FUNCTION_NAME="vayustudio-indexfaces"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DIR/../../.env.local"

# ── Read env vars from .env.local ─────────────────────────────────────────────
read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

STUDIO_R2_BUCKET=$(read_env STUDIO_R2_BUCKET)
STUDIO_R2_ENDPOINT=$(read_env STUDIO_R2_ENDPOINT)
R2_ACCESS_KEY_ID=$(read_env R2_ACCESS_KEY_ID)
R2_SECRET_ACCESS_KEY=$(read_env R2_SECRET_ACCESS_KEY)
NEXT_PUBLIC_STUDIO_PREVIEW_URL=$(read_env NEXT_PUBLIC_STUDIO_PREVIEW_URL)

if [ -z "$STUDIO_R2_BUCKET" ] || [ -z "$R2_ACCESS_KEY_ID" ]; then
  echo "ERROR: Could not read R2 config from .env.local — check STUDIO_R2_BUCKET, R2_ACCESS_KEY_ID"
  exit 1
fi

echo "==> Using R2 bucket: $STUDIO_R2_BUCKET"
echo "==> Preview URL: $NEXT_PUBLIC_STUDIO_PREVIEW_URL"

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts
npm install --os=linux --cpu=x64 sharp

echo "==> Zipping..."
rm -f /tmp/vayustudio-indexfaces.zip
zip -r /tmp/vayustudio-indexfaces.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayustudio-indexfaces.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration (reads all env vars from .env.local)..."
  MERGED=$(python3 -c "
import json
env = {
  'DYNAMO_STUDIO_FACES_TABLE':      'vayustudio-faces',
  'DYNAMO_STUDIO_JOBS_TABLE':       'vayustudio-jobs',
  'DYNAMO_STUDIO_MEDIAFILES_TABLE': 'vayustudio-mediafiles',
  'DYNAMO_STUDIO_STUDIOS_TABLE':    'vayustudio-studios',
  'STUDIO_S3_BUCKET':               'vayutransfer-studio-originals',
  'STUDIO_R2_BUCKET':               '${STUDIO_R2_BUCKET}',
  'STUDIO_R2_ENDPOINT':             '${STUDIO_R2_ENDPOINT}',
  'R2_ACCESS_KEY_ID':               '${R2_ACCESS_KEY_ID}',
  'R2_SECRET_ACCESS_KEY':           '${R2_SECRET_ACCESS_KEY}',
  'NEXT_PUBLIC_STUDIO_PREVIEW_URL': '${NEXT_PUBLIC_STUDIO_PREVIEW_URL}',
}
print(json.dumps({'Variables': env}))
")

  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 900 \
    --memory-size 1024 \
    --region "$REGION" \
    --environment "$MERGED" \
    --no-cli-pager
else
  echo "ERROR: Lambda function '$FUNCTION_NAME' not found in $REGION."
  echo "Create it first in AWS Console (runtime: Node.js 20.x) then re-run this script."
  exit 1
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo "  R2 bucket: $STUDIO_R2_BUCKET"
echo "  Preview URL: $NEXT_PUBLIC_STUDIO_PREVIEW_URL"
echo ""
echo "IAM role must have:"
echo "  - AmazonRekognitionFullAccess"
echo "  - AmazonDynamoDBFullAccess (or scoped to vayustudio-* tables)"
echo "  - S3 GetObject on vayutransfer-studio-originals/*"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
