import { signIn } from '@/auth';

const failedPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign-in failed - FeedHub Admin</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem">
<h1>Sign-in failed</h1><p>We could not sign you in. Please try again.</p><p><a href="/login">Try again</a></p></body></html>`;

// Casdoor is the only provider, so skip NextAuth's provider-picker page.
export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;

    // Returning to /login after a failed sign-in would loop back into Casdoor.
    // The error value is not echoed back, so it cannot be used for content injection.
    if (params.get('error')) {
        return new Response(failedPage, {
            status: 401,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        });
    }

    return signIn('casdoor', { redirectTo: params.get('callbackUrl') ?? '/' });
}
