import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.id && user.email && user.name) {
        const { getOrCreateUser } = await import('@/lib/users')
        await getOrCreateUser({
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        })
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && user?.id) {
        token.userId = `google_${user.id}`
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
