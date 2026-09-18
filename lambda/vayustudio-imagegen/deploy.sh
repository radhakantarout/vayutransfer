#!/usr/bin/env bash
set -e

FUNCTION_NAME="${FUNCTION_NAME:-vayustudio-imagegen}"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults keyed off FUNCTION_NAME — same fix as the watermark/reelgen
# Lambdas' deploy.sh (a -test deploy run without an explicit override must
# never silently fall back to the PRODUCTION tables; update-function-configuration
# replaces the whole env set, so a wrong default here is a real prod-data risk).
if [[ "$FUNCTION_NAME" == *-test ]]; then
  DEFAULT_JOBS_TABLE="vayustudio-jobs-test"
  DEFAULT_AI_IMAGES_TABLE="vayustudio-ai-images-test"
else
  DEFAULT_JOBS_TABLE="vayustudio-jobs"
  DEFAULT_AI_IMAGES_TABLE="vayustudio-ai-images"
fi
JOBS_TABLE_VAL="${DYNAMO_STUDIO_JOBS_TABLE:-$DEFAULT_JOBS_TABLE}"
AI_IMAGES_TABLE_VAL="${DYNAMO_STUDIO_AI_IMAGES_TABLE:-$DEFAULT_AI_IMAGES_TABLE}"

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts

echo "==> Zipping..."
rm -f /tmp/vayustudio-imagegen.zip
zip -r /tmp/vayustudio-imagegen.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayustudio-imagegen.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration..."
  ENV_JSON=$(python3 -c "
import json
env = {
  'DYNAMO_STUDIO_JOBS_TABLE':      '${JOBS_TABLE_VAL}',
  'DYNAMO_STUDIO_AI_IMAGES_TABLE': '${AI_IMAGES_TABLE_VAL}',
}
print(json.dumps({'Variables': env}))
")

  # No ffmpeg/video-assembly step here — image generation + a handful of
  # HTTP downloads/uploads needs far less than reelgen's 3008MB/900s.
  # 1024MB/300s gives real headroom over Kling's expected image-generation
  # latency without over-provisioning.
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 300 \
    --memory-size 1024 \
    --region "$REGION" \
    --environment "$ENV_JSON" \
    --no-cli-pager
else
  echo "ERROR: Lambda function '$FUNCTION_NAME' not found in $REGION."
  echo "Create it first (AWS console or 'aws lambda create-function'), then re-run this script."
  exit 1
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo "  DYNAMO_STUDIO_JOBS_TABLE:      $JOBS_TABLE_VAL"
echo "  DYNAMO_STUDIO_AI_IMAGES_TABLE: $AI_IMAGES_TABLE_VAL"
echo ""
echo "Reuses the shared vayustudio-lambda-role — its DynamoDB grant already"
echo "covers any vayustudio-* table, no new IAM policy needed."
echo "R2 + Kling credentials arrive per-invoke in the payload (same pattern"
echo "as every other studio Lambda) — never stored as env vars here."
