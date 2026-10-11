import { signIn } from '@/auth';

// Casdoor is the only provider, so skip NextAuth's provider-picker page.
export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;

    // Returning to /login after a failed sign-in would loop back into Casdoor.
    const error = params.get('error');
    if (error) return new Response(`Sign-in failed: ${error}`, { status: 401 });

    return signIn('casdoor', { redirectTo: params.get('callbackUrl') ?? '/' });
}
