export const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

let accessToken: string | null = null;

function browserToken() {
  if (typeof window === 'undefined') return accessToken;
  return accessToken ?? window.sessionStorage.getItem('rainwood_access_token');
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) window.sessionStorage.setItem('rainwood_access_token', token);
    else window.sessionStorage.removeItem('rainwood_access_token');
    window.dispatchEvent(new Event('rainwood-auth-change'));
  }
}

export function clearAccessToken() { setAccessToken(null); }

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = browserToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
    if (refreshed.ok) {
      const body = await readBody(refreshed) as { accessToken?: string } | null;
      if (body?.accessToken) { setAccessToken(body.accessToken); return apiRequest<T>(path, init, false); }
    }
  }
  const body = await readBody(response);
  if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function publicApi<T>(path: string) { return apiRequest<T>(path); }
