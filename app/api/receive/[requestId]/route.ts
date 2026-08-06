import { NextRequest, NextResponse } from 'next/server'
import { getItem } from '@/lib/aws/dynamodb'
import type { ApiResponse, ReceiveRequest } from '@/types'

const RECEIVE_REQUESTS_TABLE = process.env.DYNAMO_RECEIVE_REQUESTS_TABLE ?? 'vayu-receive-requests'

// Public info for the uploader-facing page — deliberately never returns
// walletId or anything about the requester's balance.
export async function GET(
  _req: NextRequest,
  { params }: { params: { requestId: string } }
) {
  const { requestId } = params
  const receiveRequest = await getItem<ReceiveRequest>(RECEIVE_REQUESTS_TABLE, { requestId })

  if (!receiveRequest) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'NOT_FOUND', message: 'This receive link does not exist' },
      { status: 404 }
    )
  }

  const isExpired = receiveRequest.status === 'pending' && new Date() > new Date(receiveRequest.expiryTime)
  const status = isExpired ? 'expired' : receiveRequest.status

  return NextResponse.json<ApiResponse<{
    status: ReceiveRequest['status']
    message?: string
    expiryTime: string
  }>>({
    success: true,
    data: { status, message: receiveRequest.message, expiryTime: receiveRequest.expiryTime },
  })
}
