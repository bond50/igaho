import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUserByEmail } from '@/features/auth/queries/user';
import { getVerificationTokenByToken } from '@/features/auth/queries/verification-token';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import Google from 'next-auth/providers/google';
import { loginSchema } from '@/features/auth/schemas/auth';

export default {
  providers: [
    Google({
      authorization: { params: { prompt: 'select_account' } },
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      async authorize(credentials) {
        const validatedFields = loginSchema.safeParse(credentials);
        if (validatedFields.success) {
          const { email, password } = validatedFields.data;
          const user = await getUserByEmail(email);
          if (!user || !user.password || !user.emailVerified) return null;
          const isPasswordValid = await bcrypt.compare(password, user.password);
          if (isPasswordValid) return user;
        }
        return null;
      },
    }),
    Credentials({
      id: 'verification-link',
      name: 'Verification link',
      credentials: {
        token: {},
      },
      async authorize(credentials) {
        const token = String(credentials?.token ?? '').trim();
        if (!token) return null;

        const verificationToken = await getVerificationTokenByToken(token);
        if (!verificationToken) return null;

        if (verificationToken.expires < new Date()) {
          await db.verificationToken.delete({ where: { id: verificationToken.id } });
          return null;
        }

        const user = await getUserByEmail(verificationToken.email);
        if (!user) return null;

        if (!user.emailVerified) {
          await db.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          });
        }

        await db.verificationToken.delete({ where: { id: verificationToken.id } });
        return user;
      },
    }),
  ],
} satisfies NextAuthConfig;
