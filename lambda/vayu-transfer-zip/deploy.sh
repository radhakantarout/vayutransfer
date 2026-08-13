#!/usr/bin/env bash
set -e

# Overridable so the same script deploys either environment, e.g.:
#   FUNCTION_NAME=vayu-transfer-zip-test DYNAMO_ZIP_JOBS_TABLE=vayu-zip-jobs-test ./deploy.sh
export FUNCTION_NAME="${FUNCTION_NAME:-vayu-transfer-zip}"
export DYNAMO_ZIP_JOBS_TABLE="${DYNAMO_ZIP_JOBS_TABLE:-vayu-zip-jobs}"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts

echo "==> Zipping..."
rm -f /tmp/vayu-transfer-zip.zip
zip -r /tmp/vayu-transfer-zip.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayu-transfer-zip.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration..."
  MERGED=$(python3 -c "
import json, os
env = {
  'DYNAMO_ZIP_JOBS_TABLE': os.environ['DYNAMO_ZIP_JOBS_TABLE'],
}
print(json.dumps({'Variables': env}))
")

  # 3008MB — Lambda's network throughput scales with memory allocation, and
  # this is a streaming (not buffering) zip job, so the bottleneck is
  # bandwidth, not heap size. Mirrors vayustudio-zip's proven sizing.
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --timeout 900 \
    --memory-size 3008 \
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
echo ""
echo "IAM role must have:"
echo "  - DynamoDB access scoped to the $DYNAMO_ZIP_JOBS_TABLE table (Get/Update)"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
echo "  - No S3 access needed — VayuTransfer batch files are R2-only"
echo "  - No R2 IAM needed either — R2 credentials arrive per-invoke in the payload"
