import { auth } from '@/auth';
import { userFromSession } from './identity';

// Returns the signed-in user's id or throws; the proxy already redirects anonymous page requests.
export async function requireUserId(): Promise<string> {
    return (await requireUser()).id;
}

// Username is the public URL segment (<domain>/<user_name>/<endpoint_name>) and is immutable.
export async function requireUser(): Promise<{ id: string; username: string }> {
    return userFromSession(await auth());
}
