/**
 * Small fetch wrapper for the Django API: cookie sessions, CSRF header,
 * JSON or multipart bodies, and translatable errors.
 */

export type FieldErrors = Record<string, { code: string; message: string }[]>;

export class ApiError extends Error {
  status: number;
  code: string;
  fields: FieldErrors;
  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function readCookie(name: string) {
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

let csrfReady: Promise<void> | null = null;
export function ensureCsrf() {
  if (readCookie("csrftoken")) return Promise.resolve();
  if (!csrfReady) {
    csrfReady = fetch("/api/auth/csrf/", { credentials: "same-origin" }).then(() => undefined);
  }
  return csrfReady;
}

type Body = Record<string, unknown> | FormData | unknown[] | undefined;

export async function api<T = unknown>(path: string, options: { method?: string; body?: Body; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  const lang = document.documentElement.lang;
  if (lang) headers["Accept-Language"] = lang;
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-CSRFToken"] = readCookie("csrftoken");
  }
  let response: Response;
  try {
    response = await fetch(path.startsWith("/") ? path : `/api/${path}`, {
      method,
      headers,
      body,
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Network error");
  }
  if (response.status === 204 || response.status === 202) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.code ?? `http_${response.status}`, data.detail ?? response.statusText, data.fields ?? {});
  }
  return data as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: Body) => api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T>(path: string, body: Body) => api<T>(path, { method: "PATCH", body });
export const del = <T = void>(path: string) => api<T>(path, { method: "DELETE" });

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[]; total_amount?: number };

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

export function toFormData(values: Record<string, unknown>) {
  const fd = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v as Blob));
    else if (value instanceof Blob) fd.append(key, value);
    else fd.append(key, String(value));
  });
  return fd;
}
