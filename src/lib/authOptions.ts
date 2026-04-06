import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcryptjs from "bcryptjs"
import { dbQuery } from "./serverDb"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const result = await dbQuery<{
          id: string
          email: string
          name: string
          password: string
          avatar_url: string | null
        }>(
          `SELECT id, email, name, password, avatar_url FROM users WHERE email = $1`,
          [credentials.email.toLowerCase().trim()],
        )

        const user = result.rows[0]
        if (!user) return null

        const valid = await bcryptjs.compare(credentials.password, user.password)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.userId as string
      }
      return session
    },
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET || "dev_secret_change_in_production",
}
