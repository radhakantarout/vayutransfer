import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

// Same client construction as app/studio/api/chat/route.ts's chatbot — extracted
// here so the AI website-builder routes (content drafts, template picker) don't
// duplicate it. The chat route itself is left untouched.
let client: BedrockRuntimeClient | null = null

export function getBedrockClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({
      region: process.env.AWS_BEDROCK_REGION ?? 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return client
}

export const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-haiku-20240307-v1:0'
