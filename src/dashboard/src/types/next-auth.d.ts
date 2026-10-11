import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            phone?: string;
            username?: string;
            displayName?: string;
            emailConfirmed?: boolean;
        } & DefaultSession['user'];
    }
}

declare module '@auth/core/jwt' {
    interface JWT {
        phone?: string;
        username?: string;
        displayName?: string;
        emailConfirmed?: boolean;
    }
}
