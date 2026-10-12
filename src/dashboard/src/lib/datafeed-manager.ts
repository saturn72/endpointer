import { requireUser } from '@/lib/session';

export interface ManagerDatafeed {
    _id: string;
    owner_id: string;
    name: string;
    description: string;
    adapter: 'static-file';
    adapter_config: { id_field: string | null };
    created_at: string;
    updated_at: string;
}

export interface ManagerEndpoint {
    _id: string;
    owner_id: string;
    owner_username?: string;
    name: string;
    datafeed_id: string;
    version_policy: { mode: 'latest' } | { mode: 'pinned'; major: number; minor: number };
    created_at: string;
    updated_at: string;
}

export interface ManagerUploadURL {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    key: string;
    format: string;
    expires_in: number;
}

async function managerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { id, username } = await requireUser();
    const base = (process.env.DATAFEED_MANAGER_URL ?? 'http://localhost:8083').replace(/\/$/, '');
    const response = await fetch(`${base}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            'X-Owner-ID': id,
            'X-Owner-Username': username,
            ...(init.headers ?? {}),
        },
    });
    const body = (await response.json()) as T | { error?: string };
    if (!response.ok) {
        throw new Error(typeof body === 'object' && body && 'error' in body ? body.error : 'Manager request failed');
    }
    return body as T;
}

export function managerListDatafeeds() {
    return managerRequest<ManagerDatafeed[]>('/datafeeds');
}

export function managerGetDatafeed(id: string) {
    return managerRequest<ManagerDatafeed>(`/datafeeds/${encodeURIComponent(id)}`);
}

export function managerCreateDatafeed(input: {
    name: string;
    description: string;
    adapter: 'static-file';
    adapter_config: { id_field: string | null };
}) {
    return managerRequest<ManagerDatafeed>('/datafeeds', { method: 'POST', body: JSON.stringify(input) });
}

export function managerListEndpoints() {
    return managerRequest<ManagerEndpoint[]>('/endpoints');
}

export function managerGetEndpoint(name: string) {
    return managerRequest<ManagerEndpoint>(`/endpoints/${encodeURIComponent(name)}`);
}

export function managerCreateEndpoint(input: { name: string; datafeed_id: string }) {
    return managerRequest<ManagerEndpoint>('/endpoints', { method: 'POST', body: JSON.stringify(input) });
}

export function managerGetUploadURL(datafeedId: string, input: { filename: string; size: number; content_type: string }) {
    return managerRequest<ManagerUploadURL>(`/datafeeds/${encodeURIComponent(datafeedId)}/upload-url`, {
        method: 'POST',
        body: JSON.stringify(input),
    });
}