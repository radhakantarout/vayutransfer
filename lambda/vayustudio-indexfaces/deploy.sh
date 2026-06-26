#!/usr/bin/env bash
set -e

FUNCTION_NAME="vayustudio-indexfaces"
REGION="ap-south-1"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing dependencies for Linux x64 (Lambda runtime)..."
cd "$DIR"

# Remove any existing node_modules (built for macOS)
rm -rf node_modules

# Install all deps for Linux x64
npm install --arch=x64 --platform=linux --libc=glibc

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

  echo "==> Updating configuration (merges env vars — preserves existing secrets)..."
  # Fetch existing env vars, merge our non-secret vars, push back
  EXISTING=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" --region "$REGION" \
    --query 'Environment.Variables' --output json 2>/dev/null || echo '{}')

  MERGED=$(echo "$EXISTING" | python3 -c "
import sys, json
existing = json.load(sys.stdin)
updates = {
  'DYNAMO_STUDIO_FACES_TABLE':         'vayustudio-faces',
  'DYNAMO_STUDIO_JOBS_TABLE':          'vayustudio-jobs',
  'DYNAMO_STUDIO_MEDIAFILES_TABLE':    'vayustudio-mediafiles',
  'DYNAMO_STUDIO_STUDIOS_TABLE':       'vayustudio-studios',
  'STUDIO_S3_BUCKET':                  'vayutransfer-studio-originals',
  'STUDIO_R2_BUCKET':                  'vayutransfer-studio-previews',
  'NEXT_PUBLIC_STUDIO_PREVIEW_URL':    'https://previews.studio.vayutransfer.com',
}
existing.update(updates)
print(json.dumps({'Variables': existing}))
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
echo "IMPORTANT: Make sure these secrets are set manually in AWS Console → Lambda → Configuration → Environment variables:"
echo "  STUDIO_R2_ENDPOINT"
echo "  R2_ACCESS_KEY_ID"
echo "  R2_SECRET_ACCESS_KEY"
echo ""
echo "IAM role must have:"
echo "  - AmazonRekognitionFullAccess"
echo "  - AmazonDynamoDBFullAccess (or scoped to vayustudio-* tables)"
echo "  - S3 GetObject on vayutransfer-studio-originals/*"
echo "  - S3 PutObject on vayutransfer-studio-previews/* (R2 uses HTTP, not IAM)"
echo "  - AWSLambdaBasicExecutionRole (CloudWatch logs)"
