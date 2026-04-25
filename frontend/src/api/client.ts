const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  code: string;
  detail: string;
  status: number;

  constructor(code: string, detail: string, status: number) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
    ...init,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? 'request_failed',
      body.detail ?? resp.statusText,
      resp.status,
    );
  }
  return resp.json() as Promise<T>;
}
