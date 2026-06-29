import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioScanTable, studioPutItem, studioQueryByIndex, TABLES } from '@/lib/studio/dynamodb'
import { sendStudioCredentialsEmail, sendOwnerStudioCreatedEmail } from '@/lib/aws/ses'
import type { Studio, StudioUser, StudioPlan } from '@/types/studio'

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const studios = await studioScanTable<Studio>(TABLES.studios)
    studios.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return NextResponse.json({ success: true, data: studios })
  } catch (err) {
    console.error('[owner studios GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { studioName, plan = 'STARTER', adminName, adminEmail: rawAdminEmail, adminPhone, adminPassword } = await req.json()
    if (!studioName?.trim() || !adminName?.trim() || !rawAdminEmail?.trim() || !adminPhone?.trim() || !adminPassword) {
      return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 400 })
    }

    const adminEmail = rawAdminEmail.trim().toLowerCase()

    // Check email not already taken
    const existing = await studioQueryByIndex<StudioUser>(TABLES.users, 'email-index', 'email = :e', { ':e': adminEmail })
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'EMAIL_TAKEN', message: 'An admin account with this email already exists' }, { status: 409 })
    }

    const studioId = randomUUID()
    const userId   = randomUUID()
    const now      = new Date().toISOString()

    const studio: Studio = {
      studioId,
      name: studioName.trim(),
      ownerUserId: 'platform-owner',
      plan: plan as StudioPlan,
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
        aiFaceRecognition: false,
      },
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12)
    const adminUser: StudioUser = {
      userId,
      role: 'ADMIN',
      email: adminEmail,
      phone: adminPhone.trim(),
      name: adminName.trim(),
      passwordHash,
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

    // Welcome email to new studio admin (login link, no password)
    const loginUrl = `${req.nextUrl.origin}/studio/login?email=${encodeURIComponent(adminEmail)}`
    void sendStudioCredentialsEmail(adminEmail, adminName.trim(), studioName.trim(), adminEmail, loginUrl)

    // Confirmation email to platform owner
    const ownerNotify = process.env.PLATFORM_OWNER_SUPPORT_EMAIL ?? 'support@vayutransfer.com'
    void sendOwnerStudioCreatedEmail(ownerNotify, studioName.trim(), adminName.trim(), adminEmail)

    return NextResponse.json({
      success: true,
      data: { studioId, studioName: studioName.trim(), adminEmail },
    }, { status: 201 })
  } catch (err) {
    console.error('[owner studios POST]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
