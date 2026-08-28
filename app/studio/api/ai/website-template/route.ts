import { NextRequest, NextResponse } from 'next/server'
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { getBedrockClient, DEFAULT_MODEL_ID } from '@/lib/studio/bedrock'
import { WEBSITE_TEMPLATES } from '@/lib/studio/websiteTemplates'

const MAX_DESCRIPTION_LENGTH = 300

const SYSTEM_PROMPT = `You recommend one website template for a photography/videography studio, from a fixed list. Respond in EXACTLY this two-line format, nothing else:
TEMPLATE_ID: <id>
REASON: <one short sentence, under 20 words, explaining the fit>
<id> must be exactly one of the ids given in the list — never invent a new one.`

export async function POST(req: NextRequest) {
  const auth = await verifyStudioJWT(req)
  if (!auth || !['ADMIN', 'OWNER'].includes(auth.role) || !auth.studioId) {
    return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { description?: string } | null
  const description = body?.description?.trim().slice(0, MAX_DESCRIPTION_LENGTH)
  if (!description) {
    return NextResponse.json({ success: false, error: 'A short description is required' }, { status: 400 })
  }

  const templateList = WEBSITE_TEMPLATES.map(t => `- ${t.id}: ${t.name} — ${t.desc}`).join('\n')
  const userMessage = `Templates:\n${templateList}\n\nStudio's style/niche description: "${description}"`

  try {
    const command = new InvokeModelCommand({
      modelId: DEFAULT_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 80,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const response = await getBedrockClient().send(command)
    const parsed = JSON.parse(new TextDecoder().decode(response.body))
    const raw = (parsed.content?.[0]?.text ?? '').trim()

    const idMatch = raw.match(/TEMPLATE_ID:\s*([a-z]+)/i)
    const reasonMatch = raw.match(/REASON:\s*(.+)/i)
    const candidateId = idMatch?.[1]?.toLowerCase()

    // The whole point of this route: never trust the model's id blindly — only
    // ever hand back one of the real, known template ids.
    const match = WEBSITE_TEMPLATES.find(t => t.id === candidateId)
    if (!match) {
      console.error('[ai/website-template] model returned an unrecognized id:', raw)
      return NextResponse.json({ success: false, error: 'Could not get a recommendation — try describing it differently' }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      templateId: match.id,
      reason: reasonMatch?.[1]?.trim() || `A good fit for "${description}".`,
    })
  } catch (err) {
    console.error('[ai/website-template]', err)
    return NextResponse.json({ success: false, error: 'Could not get a recommendation — try again' }, { status: 500 })
  }
}
