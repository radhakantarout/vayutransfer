#!/usr/bin/env bash
set -e

# Overridable so the same script deploys either environment, e.g.:
#   FUNCTION_NAME=vayu-drive-import-test ./deploy.sh
export FUNCTION_NAME="${FUNCTION_NAME:-vayu-drive-import}"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts

echo "==> Zipping..."
rm -f /tmp/vayu-drive-import.zip
zip -r /tmp/vayu-drive-import.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayu-drive-import.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration..."
  # No DYNAMO_* env var here on purpose — unlike vayu-transfer-zip, this
  # Lambda holds no DynamoDB credentials at all. Every job/Transfer/
  # TransferFile write happens in the Next.js backend, reached via the
  # file-complete HTTP callback baked into each invoke's payload.
  # 900s/3008MB — large Drive files (multi-GB video, etc.) need the full
  # timeout budget; memory sized for network throughput like vayu-transfer-zip.
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 900 \
    --memory-size 3008 \
    --region "$REGION" \
    --no-cli-pager
else
  echo "ERROR: Lambda function '$FUNCTION_NAME' not found in $REGION."
  echo "Create it first in AWS Console (runtime: Node.js 20.x) then re-run this script."
  exit 1
fi

echo ""
echo "✓ Deploy complete: $FUNCTION_NAME"
echo ""
echo "IAM role must have:"
echo "  - AWSLambdaBasicExecutionRole only (CloudWatch logs) — no DynamoDB"
echo "    access needed, this Lambda never touches DynamoDB directly"
echo "  - No R2 IAM needed — R2 credentials arrive per-invoke in the payload"
echo "  - No Google/Drive IAM needed — the Drive access token arrives"
echo "    per-invoke in the payload, minted server-side beforehand"
