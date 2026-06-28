#!/usr/bin/env bash
set -e

FUNCTION_NAME="vayustudio-watermark"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Load R2 + preview vars from .env.local in project root
ENV_FILE="$DIR/../../.env.local"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -E '^(STUDIO_R2|R2_|NEXT_PUBLIC_STUDIO_PREVIEW|STUDIO_S3_BUCKET)' | xargs)
fi

R2_ENDPOINT_VAL="${STUDIO_R2_ENDPOINT:-}"
R2_KEY_VAL="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_VAL="${R2_SECRET_ACCESS_KEY:-}"
PREVIEW_URL_VAL="${NEXT_PUBLIC_STUDIO_PREVIEW_URL:-https://previews-test.test.vayutransfer.com}"
S3_BUCKET_VAL="${STUDIO_S3_BUCKET:-vayutransfer-studio-originals}"

if [ -z "$R2_ENDPOINT_VAL" ] || [ -z "$R2_KEY_VAL" ] || [ -z "$R2_SECRET_VAL" ]; then
  echo "ERROR: R2 credentials not found in .env.local"
  echo "Need: STUDIO_R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
  exit 1
fi

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts
npm install --os=linux --cpu=x64 sharp

echo "==> Zipping..."
rm -f /tmp/vayustudio-watermark.zip
zip -r /tmp/vayustudio-watermark.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Updating Lambda code..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file fileb:///tmp/vayustudio-watermark.zip \
  --region "$REGION" \
  --no-cli-pager

echo "==> Waiting for update to complete..."
aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

echo "==> Setting environment variables..."
ENV_JSON=$(python3 -c "
import json
env = {
  'DYNAMO_TABLE':      'vayustudio-mediafiles',
  'PREVIEW_BASE_URL':  '${PREVIEW_URL_VAL}',
}
print(json.dumps({'Variables': env}))
")

aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --runtime nodejs20.x \
  --timeout 120 \
  --memory-size 1024 \
  --region "$REGION" \
  --environment "$ENV_JSON" \
  --no-cli-pager

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo "  DYNAMO_TABLE:    vayustudio-mediafiles"
echo "  PREVIEW_BASE_URL: $PREVIEW_URL_VAL"
echo ""
echo "Note: R2 credentials are passed in the Lambda event payload"
echo "      (not stored as env vars) — same pattern as upload-complete API"
