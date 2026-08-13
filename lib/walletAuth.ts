import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getUserById } from '@/lib/users'
import { getOrCreateWallet } from '@/lib/wallet'

// Resolves the CALLER's own walletId server-side — never trust a
// client-supplied walletId for anything ownership-sensitive (past-transfer
// duplicate lookups, invalidating a link). Mirrors wallet/balance's
// session-then-cookie resolution, but never creates a wallet for a
// brand-new anonymous visitor with no cookie yet — nothing to look up
// against for someone who's never used the app before.
export async function resolveOwnWalletId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) {
    const user = await getUserById(session.user.id)
    if (user) return user.walletId
  }
  const sessionId = cookies().get('vayu_session')?.value
  if (!sessionId) return null
  const wallet = await getOrCreateWallet(sessionId)
  return wallet.walletId
}
