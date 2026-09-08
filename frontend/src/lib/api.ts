export const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function apiAssetUrl(value?: string | null) {
  if (!value) return '';
  const marker = '/files/public/';
  const markerIndex = value.indexOf(marker);
  return markerIndex >= 0 ? `${API}${value.slice(markerIndex)}` : value;
}

let accessToken: string | null = null;

function browserToken() {
  if (typeof window === 'undefined') return accessToken;
  return accessToken ?? window.localStorage.getItem('rainwood_access_token');
}

export function setAccessToken(token: string | null, role?: string) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) window.localStorage.setItem('rainwood_access_token', token);
    else {
      window.localStorage.removeItem('rainwood_access_token');
      window.localStorage.removeItem('rainwood_user_role');
    }
    if (token && role) window.localStorage.setItem('rainwood_user_role', role);
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
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  } catch {
    throw new Error(`RainWood API is unavailable. Start the backend and confirm it is listening at ${API}.`);
  }
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
