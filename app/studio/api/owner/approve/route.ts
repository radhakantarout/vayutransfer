import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { sendStudioCredentialsEmail } from '@/lib/aws/ses'
import type { Studio, StudioUser } from '@/types/studio'

function getSecret() {
  const s = process.env.STUDIO_JWT_SECRET
  if (!s) throw new Error('STUDIO_JWT_SECRET not set')
  return new TextEncoder().encode(s)
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.redirect(new URL('/studio/home', req.url))

    const { payload } = await jwtVerify(token, getSecret())
    const { studioName, adminName, email, phone } = payload as {
      studioName: string; adminName: string; email: string; phone: string
    }

    // Idempotency: check if email already has a studio admin account
    const existing = await studioQueryByIndex<StudioUser>(
      TABLES.users, 'email-index', 'email = :e', { ':e': email }
    )
    if (existing.length > 0) {
      return NextResponse.redirect(new URL('/studio/admin/studios?notice=already_approved', req.url))
    }

    const studioId = randomUUID()
    const userId   = randomUUID()
    const now      = new Date().toISOString()
    const password = generatePassword()

    const studio: Studio = {
      studioId,
      name: studioName,
      ownerUserId: 'platform-owner',
      plan: 'STARTER',
      brandingConfig: {},
      storageUsedBytes: 0,
      projectCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      featureFlags: {
        videoSupport: true,
        watermarkToggle: true,
        extendedStorage: false,
        clientComments: true,
        editingRequired: true,
      },
    }

    const adminUser: StudioUser = {
      userId,
      role: 'ADMIN',
      email,
      phone,
      name: adminName,
      passwordHash: await bcrypt.hash(password, 12),
      linkedStudioId: studioId,
      status: 'ACTIVE',
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await Promise.all([
      studioPutItem(TABLES.studios, studio as unknown as Record<string, unknown>),
      studioPutItem(TABLES.users,   adminUser as unknown as Record<string, unknown>),
    ])

    void sendStudioCredentialsEmail(
      email, adminName, studioName, email, password, `${origin}/studio/login`
    )

    console.log(`[approve] Studio created: ${studioName} (${studioId}) for ${email}`)
    return NextResponse.redirect(new URL(`/studio/admin/studios?approved=${studioId}`, req.url))
  } catch (err) {
    console.error('[approve GET]', err)
    return NextResponse.redirect(new URL('/studio/home?error=invalid_token', req.url))
  }
}
