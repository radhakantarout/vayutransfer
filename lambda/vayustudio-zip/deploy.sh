#!/usr/bin/env bash
set -e

FUNCTION_NAME="vayustudio-zip"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies..."
cd "$DIR"
rm -rf node_modules
npm install --ignore-scripts

echo "==> Zipping..."
rm -f /tmp/vayustudio-zip.zip
zip -r /tmp/vayustudio-zip.zip . \
  --exclude "*.sh" \
  --exclude "*.zip" \
  --exclude ".DS_Store" \
  --exclude "deploy.sh"

echo "==> Checking if Lambda exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > /dev/null 2>&1; then
  echo "==> Updating existing Lambda code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb:///tmp/vayustudio-zip.zip \
    --region "$REGION" \
    --no-cli-pager

  echo "==> Waiting for update to complete..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "==> Updating configuration..."
  MERGED=$(python3 -c "
import json
env = {
  'DYNAMO_STUDIO_JOBS_TABLE': 'vayustudio-jobs',
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
echo ""
echo "IAM role must have:"
echo "  - AmazonDynamoDBFullAccess (or scoped to vayustudio-jobs table)"
echo "  - S3 GetObject on vayutransfer-studio-originals/* (S3-backed source files)"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
echo "  - No R2 IAM needed — R2 credentials arrive per-invoke in the payload"
