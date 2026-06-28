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

  echo "==> Updating configuration..."
  MERGED=$(python3 -c "
import json
env = {
  'DYNAMO_STUDIO_JOBS_TABLE':       'vayustudio-jobs',
  'DYNAMO_STUDIO_MEDIAFILES_TABLE': 'vayustudio-mediafiles',
  'DYNAMO_STUDIO_STUDIOS_TABLE':    'vayustudio-studios',
  'STUDIO_S3_BUCKET':               'vayutransfer-studio-originals',
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
echo "  - AmazonRekognitionFullAccess"
echo "  - AmazonDynamoDBFullAccess (or scoped to vayustudio-* tables)"
echo "  - S3 GetObject on vayutransfer-studio-originals/*"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
