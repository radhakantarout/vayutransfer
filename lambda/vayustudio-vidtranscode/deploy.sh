#!/usr/bin/env bash
set -e

FUNCTION_NAME="${FUNCTION_NAME:-vayustudio-vidtranscode}"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Load R2 + preview vars from .env.local in project root — same source as
# the watermark Lambda's deploy.sh.
ENV_FILE="$DIR/../../.env.local"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -E '^(STUDIO_R2|R2_|NEXT_PUBLIC_STUDIO_PREVIEW)' | xargs)
fi

# Same "keyed off FUNCTION_NAME, never blindly inherited from .env.local"
# fix as the watermark Lambda's deploy.sh — .env.local's own preview URL is
# always the TEST domain (that's what local dev needs), so a naive fallback
# would silently overwrite production's PREVIEW_BASE_URL on every prod deploy.
if [[ "$FUNCTION_NAME" == *-test ]]; then
  PREVIEW_URL_VAL="${NEXT_PUBLIC_STUDIO_PREVIEW_URL:-https://previews-test.test.vayutransfer.com}"
  DEFAULT_MEDIAFILES_TABLE="vayustudio-mediafiles-test"
  DEFAULT_JOBS_TABLE="vayustudio-jobs-test"
else
  PREVIEW_URL_VAL="https://previews.vayustudios.com"
  DEFAULT_MEDIAFILES_TABLE="vayustudio-mediafiles"
  DEFAULT_JOBS_TABLE="vayustudio-jobs"
fi
DYNAMO_MEDIAFILES_TABLE_VAL="${DYNAMO_TABLE:-$DEFAULT_MEDIAFILES_TABLE}"
JOBS_TABLE_VAL="${DYNAMO_STUDIO_JOBS_TABLE:-$DEFAULT_JOBS_TABLE}"

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts
# @ffmpeg-installer/ffmpeg ships a platform-specific static binary via
# optional sub-packages — same cross-compile pattern as vayustudio-reelgen
# and vayustudio-watermark's sharp/@resvg/resvg-js (built on a Mac, deployed
# to Linux Lambda).
npm install --os=linux --cpu=x64 @ffmpeg-installer/ffmpeg

echo "==> Zipping..."
rm -f /tmp/vayustudio-vidtranscode.zip
zip -r /tmp/vayustudio-vidtranscode.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

# Reuses the shared vayustudio-lambda-role — its DynamoDB grant already
# covers any vayustudio-* table, no new IAM policy needed (same as
# vayustudio-reelgen). Confirmed via `aws lambda get-function-configuration`
# against the live reelgen function.
ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::533267297491:role/vayustudio-lambda-role}"

ENV_JSON=$(python3 -c "
import json
env = {
  'DYNAMO_TABLE':             '${DYNAMO_MEDIAFILES_TABLE_VAL}',
  'PREVIEW_BASE_URL':         '${PREVIEW_URL_VAL}',
  'DYNAMO_STUDIO_JOBS_TABLE': '${JOBS_TABLE_VAL}',
}
print(json.dumps({'Variables': env}))
")

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayustudio-vidtranscode.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration..."
  # 3008MB/900s to match vayustudio-reelgen's ffmpeg-workload sizing, not
  # watermark's lighter image sizing — video download + transcode + upload
  # needs the higher proportional vCPU allocation that comes with more
  # memory. EphemeralStorage (/tmp) defaults to only 512MB, which is nowhere
  # near enough to hold a video up to the 2GB source cap plus its transcoded
  # output — raised to the 10240MB max.
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 900 \
    --memory-size 3008 \
    --ephemeral-storage Size=10240 \
    --region "$REGION" \
    --environment "$ENV_JSON" \
    --no-cli-pager
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
else
  echo "==> Function doesn't exist — creating it..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout 900 \
    --memory-size 3008 \
    --ephemeral-storage Size=10240 \
    --zip-file fileb:///tmp/vayustudio-vidtranscode.zip \
    --environment "$ENV_JSON" \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for function to become active..."
  aws lambda wait function-active \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo "  DYNAMO_TABLE:               $DYNAMO_MEDIAFILES_TABLE_VAL"
echo "  DYNAMO_STUDIO_JOBS_TABLE:   $JOBS_TABLE_VAL"
echo "  PREVIEW_BASE_URL:           $PREVIEW_URL_VAL"
echo ""
echo "Note: R2 credentials are passed in the Lambda event payload"
echo "      (not stored as env vars) — same pattern as every other studio Lambda."
