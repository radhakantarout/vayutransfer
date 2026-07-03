import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime'
import { VAYUSTUDIOS_SYSTEM_PROMPT } from '@/lib/studio/chatbotKnowledge'

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_BEDROCK_REGION ?? 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-haiku-4-5-20251001-v1:0'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json() as { messages: { role: string; content: string }[] }

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        temperature: 0.3,
        system: VAYUSTUDIOS_SYSTEM_PROMPT,
        messages: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      }),
    })

    const response = await bedrock.send(command)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of response.body!) {
            if (event.chunk?.bytes) {
              const parsed = JSON.parse(new TextDecoder().decode(event.chunk.bytes))
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                controller.enqueue(encoder.encode(parsed.delta.text))
              }
            }
          }
        } catch (err) {
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[chat] Bedrock error:', err)
    return Response.json({ error: 'AI service unavailable. Please try again.' }, { status: 500 })
  }
}
