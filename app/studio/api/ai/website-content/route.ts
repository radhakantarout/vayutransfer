import { NextRequest, NextResponse } from 'next/server'
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getBedrockClient, DEFAULT_MODEL_ID } from '@/lib/studio/bedrock'

type Field = 'about' | 'tagline' | 'heroSubtitle' | 'serviceDescription'

// Word-count guidance keeps drafts the right length for where they'll actually
// render, and doubles as a natural cost cap via maxTokens — nobody needs 500
// tokens for a tagline.
const FIELD_SPEC: Record<Field, { instruction: string; maxTokens: number }> = {
  about: {
    instruction: 'Write a warm, professional "About" paragraph for a photography studio website, 60-90 words. Third person is fine, first person ("we") is also fine — pick whichever reads more natural. No headings, no quotes around the text.',
    maxTokens: 220,
  },
  tagline: {
    instruction: 'Write one short, punchy tagline for a photography studio website, 6-10 words. No quotes, no trailing period.',
    maxTokens: 40,
  },
  heroSubtitle: {
    instruction: 'Write one short hero subtitle line for a photography studio website home page, 10-16 words. No quotes.',
    maxTokens: 50,
  },
  serviceDescription: {
    instruction: 'Write a short description of a specific photography service for a studio website, 20-35 words. No quotes, no heading.',
    maxTokens: 90,
  },
}

const SYSTEM_PROMPT = `You write short marketing copy for photography and videography studio websites in India.
Tone: warm, professional, confident — never cheesy or over-the-top.
Rules:
- Return ONLY the requested text. No preamble, no explanation, no markdown, no surrounding quotes.
- Respect the requested word count closely.
- Use the studio's actual name/city naturally if given; never invent facts (awards, years in business, specific numbers) that weren't provided.`

export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    field?: Field
    studioName?: string
    city?: string
    serviceName?: string
  } | null

  if (!body?.field || !(body.field in FIELD_SPEC)) {
    return NextResponse.json({ success: false, error: 'A valid field is required' }, { status: 400 })
  }
  const spec = FIELD_SPEC[body.field]

  const context = [
    body.studioName && `Studio name: ${body.studioName}`,
    body.city && `Location: ${body.city}`,
    body.field === 'serviceDescription' && body.serviceName && `Service name: ${body.serviceName}`,
  ].filter(Boolean).join('\n')

  const userMessage = `${spec.instruction}\n\n${context || 'No further details provided — keep it generic but still warm and specific-sounding.'}`

  try {
    const command = new InvokeModelCommand({
      modelId: DEFAULT_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: spec.maxTokens,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const response = await getBedrockClient().send(command)
    const parsed = JSON.parse(new TextDecoder().decode(response.body))
    const text = (parsed.content?.[0]?.text ?? '').trim().replace(/^["']|["']$/g, '')

    if (!text) {
      return NextResponse.json({ success: false, error: 'AI did not return any text — try again' }, { status: 502 })
    }

    return NextResponse.json({ success: true, text })
  } catch (err) {
    console.error('[ai/website-content]', err)
    return NextResponse.json({ success: false, error: 'Could not generate a draft — try again' }, { status: 500 })
  }
}
