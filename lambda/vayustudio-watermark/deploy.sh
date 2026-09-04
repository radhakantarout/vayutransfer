#!/usr/bin/env bash
set -e

FUNCTION_NAME="${FUNCTION_NAME:-vayustudio-watermark}"
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
# Default keyed off FUNCTION_NAME, not a hardcoded test URL — a real
# production incident happened here: deploying to the bare "vayustudio-
# watermark" (production) function with no NEXT_PUBLIC_STUDIO_PREVIEW_URL
# in .env.local silently fell back to the test domain and overwrote
# production's PREVIEW_BASE_URL, since update-function-configuration
# REPLACES the whole env set. Now the fallback matches whichever function
# is actually being deployed.
if [[ "$FUNCTION_NAME" == *-test ]]; then
  DEFAULT_PREVIEW_URL="https://previews-test.test.vayutransfer.com"
else
  DEFAULT_PREVIEW_URL="https://previews.vayustudios.com"
fi
PREVIEW_URL_VAL="${NEXT_PUBLIC_STUDIO_PREVIEW_URL:-$DEFAULT_PREVIEW_URL}"
S3_BUCKET_VAL="${STUDIO_S3_BUCKET:-vayutransfer-studio-originals}"
# Must match whichever environment FUNCTION_NAME targets — the bulk-job
# progress counter (StudioJob rows) lives in this table. Left unset (or
# wrong), a -test Lambda would silently write progress into the PRODUCTION
# jobs table instead of vayustudio-jobs-test (default also keyed off
# FUNCTION_NAME, same fix as PREVIEW_URL_VAL/DYNAMO_MEDIAFILES_TABLE_VAL).
if [[ "$FUNCTION_NAME" == *-test ]]; then
  DEFAULT_JOBS_TABLE="vayustudio-jobs-test"
else
  DEFAULT_JOBS_TABLE="vayustudio-jobs"
fi
JOBS_TABLE_VAL="${DYNAMO_STUDIO_JOBS_TABLE:-$DEFAULT_JOBS_TABLE}"

if [ -z "$R2_ENDPOINT_VAL" ] || [ -z "$R2_KEY_VAL" ] || [ -z "$R2_SECRET_VAL" ]; then
  echo "ERROR: R2 credentials not found in .env.local"
  echo "Need: STUDIO_R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
  exit 1
fi

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts
npm install --os=linux --cpu=x64 sharp @resvg/resvg-js

echo "==> Checking bundled font..."
mkdir -p "$DIR/fonts"
if [ ! -f "$DIR/fonts/DejaVuSans-Bold.ttf" ]; then
  echo "Downloading DejaVuSans-Bold.ttf..."
  curl -fsSL -o "$DIR/fonts/DejaVuSans-Bold.ttf" \
    "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf"
fi
echo "   font size: $(du -sh "$DIR/fonts/DejaVuSans-Bold.ttf" | cut -f1)"

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
# Defaults keyed off FUNCTION_NAME (same fix as PREVIEW_URL_VAL above) — a
# -test deploy run without an explicit DYNAMO_TABLE override must not
# silently fall back to the PRODUCTION mediafiles table.
if [[ "$FUNCTION_NAME" == *-test ]]; then
  DEFAULT_MEDIAFILES_TABLE="vayustudio-mediafiles-test"
else
  DEFAULT_MEDIAFILES_TABLE="vayustudio-mediafiles"
fi
DYNAMO_MEDIAFILES_TABLE_VAL="${DYNAMO_TABLE:-$DEFAULT_MEDIAFILES_TABLE}"
ENV_JSON=$(python3 -c "
import json
env = {
  'DYNAMO_TABLE':               '${DYNAMO_MEDIAFILES_TABLE_VAL}',
  'PREVIEW_BASE_URL':           '${PREVIEW_URL_VAL}',
  'DYNAMO_STUDIO_JOBS_TABLE':   '${JOBS_TABLE_VAL}',
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
echo "  DYNAMO_TABLE:    $DYNAMO_MEDIAFILES_TABLE_VAL"
echo "  DYNAMO_STUDIO_JOBS_TABLE: $JOBS_TABLE_VAL"
echo "  PREVIEW_BASE_URL: $PREVIEW_URL_VAL"
echo ""
echo "Note: R2 credentials are passed in the Lambda event payload"
echo "      (not stored as env vars) — same pattern as upload-complete API"
