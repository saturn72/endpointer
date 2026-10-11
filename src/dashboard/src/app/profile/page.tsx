import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, LogOut, Mail, Phone, User, Fingerprint } from 'lucide-react';
import { userInitials } from '@/lib/user';

async function signOutAction() {
    'use server';
    // Ending the Casdoor SSO session too; otherwise /login would sign straight back in.
    const issuer = process.env.AUTH_CASDOOR_ISSUER;
    const base = (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    await signOut({ redirect: false });
    const logout = new URL('/api/logout', issuer);
    logout.searchParams.set('client_id', process.env.AUTH_CASDOOR_ID ?? '');
    logout.searchParams.set('post_logout_redirect_uri', `${base}/login`);
    redirect(logout.toString());
}

export default async function ProfilePage() {
    const session = await auth();
    const user = session?.user;
    if (!user) redirect('/login');

    const issuer = (process.env.AUTH_CASDOOR_ISSUER ?? '').replace(/\/$/, '');
    const display = user.displayName || user.name || user.username || user.email || 'User';

    const rows = [
        { icon: User, label: 'Username', value: user.username },
        {
            icon: Mail,
            label: 'Email',
            value: user.email,
            badge:
                user.email && user.emailConfirmed !== undefined
                    ? user.emailConfirmed
                        ? 'Verified'
                        : 'Unverified'
                    : null,
        },
        { icon: Phone, label: 'Phone', value: user.phone },
        { icon: Fingerprint, label: 'User ID', value: user.id },
    ];

    return (
        <div className="space-y-6 max-w-2xl">
            <h1 className="text-2xl font-bold text-foreground">Profile</h1>

            <Card className="border border-border shadow-sm">
                <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-semibold shrink-0">
                        {userInitials(display)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-foreground truncate">{display}</p>
                        {user.email && (
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold">Account details</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    <dl className="divide-y divide-border text-sm">
                        {rows.map((r) => (
                            <div key={r.label} className="flex items-center gap-3 py-3">
                                <r.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <dt className="w-28 text-muted-foreground shrink-0">{r.label}</dt>
                                <dd className="flex-1 min-w-0 flex items-center gap-2 text-foreground">
                                    {r.value ? (
                                        <span className="truncate">{r.value}</span>
                                    ) : (
                                        <span className="italic text-muted-foreground">Not set</span>
                                    )}
                                    {r.badge && (
                                        <Badge
                                            variant="secondary"
                                            className={
                                                r.badge === 'Verified'
                                                    ? 'text-xs bg-primary/10 text-primary border-0'
                                                    : 'text-xs bg-amber-50 text-amber-700 border-0'
                                            }
                                        >
                                            {r.badge}
                                        </Badge>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>

            <div className="flex items-center gap-3 flex-wrap">
                <a
                    href={`${issuer}/account`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Manage account (password, phone, MFA)
                </a>
                <form action={signOutAction}>
                    <Button type="submit" variant="outline" size="sm">
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        Sign out
                    </Button>
                </form>
            </div>
        </div>
    );
}
