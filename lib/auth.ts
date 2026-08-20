import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Email/OTP sign-in — POST /api/auth/otp/request only sends the code;
    // authorize() below is where it's actually checked and consumed
    // (single-use, see lib/emailOtp.ts#verifyOtp). User lookup-or-creation
    // (and the blocked-account lockout) happens right here too, unlike
    // Google's OAuth flow which does it in the signIn callback below — a
    // Credentials provider has no separate account-linking step to hook
    // into, so authorize() is the one place both checks naturally live.
    CredentialsProvider({
      id: 'otp',
      name: 'Email OTP',
      credentials: {
        email: { label: 'Email', type: 'email' },
        otp: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const otp = credentials?.otp?.trim()
        if (!email || !otp) return null

        const { verifyOtp } = await import('@/lib/emailOtp')
        const result = await verifyOtp(email, otp)
        if (result !== 'ok') return null

        const { getOrCreateUserByEmail } = await import('@/lib/users')
        const record = await getOrCreateUserByEmail(email)
        if (record.status === 'blocked') return null

        return { id: record.userId, email: record.email, name: record.name, image: record.picture ?? null }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.id && user.email && user.name) {
        const { getOrCreateUser } = await import('@/lib/users')
        const record = await getOrCreateUser({
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        })
        // Full lockout, not just an upload restriction — a blocked account
        // can't establish a session at all. Set via the platform-admin
        // block/unblock routes (app/api/admin/users/[userId]/*).
        if (record.status === 'blocked') return false
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && user?.id) {
        token.userId = `google_${user.id}`
      }
      // The 'otp' provider's authorize() already returns the full internal
      // userId (email_<hash>, or an existing google_<sub> if that email
      // was already registered via Google) — no prefixing needed here.
      if (account?.provider === 'otp' && user?.id) {
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
