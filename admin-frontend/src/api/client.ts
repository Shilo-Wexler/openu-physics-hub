/** The single place that talks HTTP: JSON in and out, and one error type for every failure. */

/** A failed request. status 0 means the server was not reached at all (offline, proxy down). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";
type Params = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Google ID token (or a dev token), sent as "Authorization: Bearer ...". */
  token?: string;
  params?: Params;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, params, signal } = options;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  const url = queryString ? `${path}?${queryString}` : path;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // A cancelled request is not a failure the page should show, so it keeps its own type.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(0, "network error");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorDetail(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** FastAPI sends {"detail": "..."}; anything else falls back to the status text. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "detail" in data) {
      const { detail } = data;
      if (typeof detail === "string") {
        return detail;
      }
    }
  } catch {
    // Not JSON (for example a proxy error page).
  }
  return response.statusText;
}

/** True for errors that mean "sign in again". */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** True when the request was cancelled because the component went away. */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
