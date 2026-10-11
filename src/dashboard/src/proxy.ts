import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const proxy = auth((req) => {
    if (!req.auth) {
        const url = new URL('/login', req.nextUrl.origin);
        url.searchParams.set('callbackUrl', req.nextUrl.href);
        return NextResponse.redirect(url);
    }
});

export const config = {
    matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
