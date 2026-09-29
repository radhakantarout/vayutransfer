#!/usr/bin/env bash
set -e

FUNCTION_NAME="${FUNCTION_NAME:-vayustudio-reelgen}"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults keyed off FUNCTION_NAME — same fix as the watermark Lambda's
# deploy.sh (a -test deploy run without an explicit override must never
# silently fall back to the PRODUCTION tables; update-function-configuration
# replaces the whole env set, so a wrong default here is a real prod-data risk).
if [[ "$FUNCTION_NAME" == *-test ]]; then
  DEFAULT_JOBS_TABLE="vayustudio-jobs-test"
  DEFAULT_REELS_TABLE="vayustudio-reels-test"
  DEFAULT_STUDIOS_TABLE="vayustudio-studios-test"
else
  DEFAULT_JOBS_TABLE="vayustudio-jobs"
  DEFAULT_REELS_TABLE="vayustudio-reels"
  DEFAULT_STUDIOS_TABLE="vayustudio-studios"
fi
JOBS_TABLE_VAL="${DYNAMO_STUDIO_JOBS_TABLE:-$DEFAULT_JOBS_TABLE}"
REELS_TABLE_VAL="${DYNAMO_STUDIO_REELS_TABLE:-$DEFAULT_REELS_TABLE}"
STUDIOS_TABLE_VAL="${DYNAMO_STUDIO_STUDIOS_TABLE:-$DEFAULT_STUDIOS_TABLE}"

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts
# @ffmpeg-installer/ffmpeg ships a platform-specific static binary via
# optional sub-packages — same cross-compile pattern as the watermark
# Lambda's sharp/@resvg/resvg-js (built on a Mac, deployed to Linux Lambda).
npm install --os=linux --cpu=x64 @ffmpeg-installer/ffmpeg

echo "==> Zipping..."
rm -f /tmp/vayustudio-reelgen.zip
zip -r /tmp/vayustudio-reelgen.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayustudio-reelgen.zip \
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
  'DYNAMO_STUDIO_JOBS_TABLE':    '${JOBS_TABLE_VAL}',
  'DYNAMO_STUDIO_REELS_TABLE':   '${REELS_TABLE_VAL}',
  'DYNAMO_STUDIO_STUDIOS_TABLE': '${STUDIOS_TABLE_VAL}',
}
print(json.dumps({'Variables': env}))
")

  # Timeout cut further, 420s -> 180s (Phase 6, 2026-09-29): Phase 5 already
  # retired the legacy 'photo' pipeline; this phase retires the equivalent
  # 'text' pipeline (its own in-Lambda poll loop topped out at ~320s, which
  # is why 420s was kept as of Phase 5). 'finalize' is now the ONLY live
  # mode — bounded purely by download+ffmpeg+upload time, observed well
  # under a minute per clip in real testing, comfortably fitting even a
  # 5-clip reel within 180s with real margin.
  # Memory left at 3008MB, unchanged — ffmpeg's concat/crop re-encode still
  # benefits from the higher proportional vCPU that comes with more memory,
  # and there isn't yet enough real observed data to safely shrink it
  # without risking the encode itself taking longer.
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 180 \
    --memory-size 3008 \
    --region "$REGION" \
    --environment "$ENV_JSON" \
    --no-cli-pager
else
  echo "ERROR: Lambda function '$FUNCTION_NAME' not found in $REGION."
  echo "Create it first (see AI Reel Generator design doc, Phase 0), then re-run this script."
  exit 1
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo "  DYNAMO_STUDIO_JOBS_TABLE:    $JOBS_TABLE_VAL"
echo "  DYNAMO_STUDIO_REELS_TABLE:   $REELS_TABLE_VAL"
echo "  DYNAMO_STUDIO_STUDIOS_TABLE: $STUDIOS_TABLE_VAL"
echo ""
echo "Reuses the shared vayustudio-lambda-role — its DynamoDB grant already"
echo "covers any vayustudio-* table, no new IAM policy needed."
echo "R2 + Kling credentials arrive per-invoke in the payload (same pattern"
echo "as every other studio Lambda) — never stored as env vars here."
