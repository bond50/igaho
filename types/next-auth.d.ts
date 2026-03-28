import type { DefaultSession } from 'next-auth';
import type { JWT as DefaultJWT } from 'next-auth/jwt';
import type { UserRole } from '@/prisma/src/generated/prisma/client';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: UserRole;
      isTwoFAEnabled: boolean;
      isOAuth: boolean;
    };
    mfaRequired: boolean;
    mfaVerified: boolean;
  }

  interface User {
    id?: string;
    role?: UserRole;
    isTwoFAEnabled?: boolean;
    isOAuth?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: UserRole;
    isOAuth?: boolean;
    isTwoFAEnabled?: boolean;
    mfaRequired?: boolean;
    mfaVerified?: boolean;
    image?: string;
  }
}
