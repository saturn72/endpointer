import NextAuth from 'next-auth';

// Casdoor is a standard OIDC provider; endpoints are discovered from the issuer.
export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        {
            id: 'casdoor',
            name: 'Casdoor',
            type: 'oidc',
            issuer: process.env.AUTH_CASDOOR_ISSUER,
            clientId: process.env.AUTH_CASDOOR_ID,
            clientSecret: process.env.AUTH_CASDOOR_SECRET,
            authorization: { params: { scope: 'openid profile email phone' } },
        },
    ],
    session: { strategy: 'jwt' },
    pages: { signIn: '/login' },
    callbacks: {
        // Casdoor puts these user fields in the ID token claims.
        jwt({ token, profile }) {
            if (profile) {
                token.phone = (profile.phone as string | undefined) || undefined;
                // Casdoor's `name` claim is the sign-up username (it emits no preferred_username).
                token.username = profile.name as string | undefined;
                token.displayName = profile.displayName as string | undefined;
                token.emailConfirmed = profile.email_verified as boolean | undefined;
            }
            return token;
        },
        // token.sub is the OIDC `sub` claim — the stable per-user id.
        session({ session, token }) {
            if (token.sub) session.user.id = token.sub;
            session.user.phone = token.phone;
            session.user.username = token.username;
            session.user.displayName = token.displayName;
            session.user.emailConfirmed = token.emailConfirmed;
            return session;
        },
    },
});
