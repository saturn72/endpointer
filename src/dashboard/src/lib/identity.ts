// Deny by default: both the OIDC `sub` (id) and the immutable username must be present.
export function userFromSession(
    session: { user?: { id?: string; username?: string } } | null | undefined,
): { id: string; username: string } {
    const id = session?.user?.id;
    const username = session?.user?.username;
    if (!id || !username) throw new Error('Unauthenticated');
    return { id, username };
}
