import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { verifyStudioJWT } from '@/lib/studio/auth'
import { studioGetItem, studioQueryByPK, TABLES } from '@/lib/studio/dynamodb'
import { activeStorageGrantBytes, currentStorageBytes, getMonthUsage, isOverStorageQuota, monthDownloadQuota } from '@/lib/studio/usage'
import { DEFAULT_RETENTION_GRACE_DAYS, FREE_AI_SEARCH_CREDITS } from '@/constants/studioPricing'
import type { Studio, StudioProject } from '@/types/studio'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }))

// Real cumulative "AI photos indexed" count across every project this studio
// owns — face-indexing costs real AWS Rekognition money per photo, so this is
// aggregated from the same faceIndexed flag the indexing Lambda already sets
// (lambda/vayustudio-indexfaces/index.js), not a fabricated number.
async function countAiIndexedPhotos(studioId: string): Promise<number> {
  const projects = await studioQueryByPK<StudioProject>(TABLES.projects, 'studioId', studioId)
  const counts = await Promise.all(
    projects.map((p) =>
      ddb.send(new QueryCommand({
        TableName: TABLES.mediafiles,
        KeyConditionExpression: 'projectId = :pid',
        FilterExpression: 'faceIndexed = :true',
        ExpressionAttributeValues: { ':pid': p.projectId, ':true': true },
        Select: 'COUNT',
      })).then((res) => res.Count ?? 0).catch(() => 0)
    )
  )
  return counts.reduce((sum, c) => sum + c, 0)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyStudioJWT(req)
    if (!auth || !['ADMIN', 'OWNER'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }
    const studioId = auth.studioId
    if (!studioId) {
      return NextResponse.json({ success: false, error: 'MISSING_STUDIO_ID' }, { status: 400 })
    }
    const studio = await studioGetItem<Studio>(TABLES.studios, { studioId })
    if (!studio) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    const [monthUsage, aiSearchCreditsUsed] = await Promise.all([
      getMonthUsage(studioId),
      countAiIndexedPhotos(studioId),
    ])

    return NextResponse.json({
      success: true,
      data: {
        studioName:       studio.name,
        storageUsedBytes: studio.storageUsedBytes,
        plan:             studio.plan,
        billing: {
          storageUsedBytes:  currentStorageBytes(studio),
          storageGrantBytes: activeStorageGrantBytes(studio),
          storageOverQuota:  isOverStorageQuota(studio),
          storageOverageStartedAt: studio.storageOverageStartedAt ?? null,
          dataRetentionGraceDays: studio.dataRetentionGraceDays ?? DEFAULT_RETENTION_GRACE_DAYS,
          downloadUsedBytes: monthUsage.downloadBytes,
          downloadQuotaBytes: monthDownloadQuota(monthUsage),
          aiSearchCreditsUsed,
          aiSearchCreditsTotal: studio.aiSearchCreditsTotal ?? FREE_AI_SEARCH_CREDITS,
        },
      },
    })
  } catch (err) {
    console.error('[admin/stats GET]', err)
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
