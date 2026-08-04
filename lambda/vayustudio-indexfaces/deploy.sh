#!/usr/bin/env bash
set -e

FUNCTION_NAME="vayustudio-indexfaces"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

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

  # Deliberately does NOT touch --environment. aws lambda
  # update-function-configuration REPLACES the entire env var set rather
  # than merging — an earlier version of this script hardcoded only 4 of
  # the ~8 vars this function actually needs (DYNAMO_STUDIO_JOBS_TABLE,
  # DYNAMO_STUDIO_MEDIAFILES_TABLE, DYNAMO_STUDIO_STUDIOS_TABLE,
  # STUDIO_S3_BUCKET) and silently wiped the R2 credentials
  # (STUDIO_R2_ORIGINAL_BUCKET, STUDIO_R2_ENDPOINT,
  # STUDIO_R2_ORIGINAL_ACCESS_KEY_ID, STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY)
  # on every routine code-only redeploy — breaking every R2-backed photo's
  # indexing in production for hours before anyone noticed. Env vars are
  # managed by hand in the AWS Console (Lambda → Configuration →
  # Environment variables) and are set once, not on every deploy — this
  # script only ever ships code + timeout/memory/runtime.
  echo "==> Updating runtime/timeout/memory only (env vars untouched)..."
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 900 \
    --memory-size 1024 \
    --region "$REGION" \
    --no-cli-pager
else
  echo "ERROR: Lambda function '$FUNCTION_NAME' not found in $REGION."
  echo "Create it first in AWS Console (runtime: Node.js 20.x) then re-run this script."
  exit 1
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME (code only — environment variables untouched)"
echo ""
echo "IAM role must have:"
echo "  - AmazonRekognitionFullAccess"
echo "  - AmazonDynamoDBFullAccess (or scoped to vayustudio-* tables)"
echo "  - S3 GetObject on vayutransfer-studio-originals/*"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
echo ""
echo "Required environment variables (set once by hand in the Console, never by this script):"
echo "  - DYNAMO_STUDIO_JOBS_TABLE, DYNAMO_STUDIO_MEDIAFILES_TABLE, DYNAMO_STUDIO_STUDIOS_TABLE"
echo "  - STUDIO_S3_BUCKET (legacy S3-backed files)"
echo "  - STUDIO_R2_ORIGINAL_BUCKET, STUDIO_R2_ENDPOINT, STUDIO_R2_ORIGINAL_ACCESS_KEY_ID, STUDIO_R2_ORIGINAL_SECRET_ACCESS_KEY (R2-backed files — most photos now)"
echo "If indexing jobs are completing with indexedCount=0, check these are all still present first."
