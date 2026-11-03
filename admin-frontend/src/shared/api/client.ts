/** The single place that talks HTTP: JSON in and out, and one error type for every failure. */

/** A failed request. status 0 means the server was not reached at all (offline, proxy down, no answer in time). */
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
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as the raw request body with its own Content-Type (an image upload). Use instead of body. */
  file?: Blob;
  /** Google ID token (or a dev token), sent as "Authorization: Bearer ...". */
  token?: string;
  params?: Params;
  signal?: AbortSignal;
}

// How long a request may take, answer included, before it counts as a network error. Without a limit,
// a connection lost on the way (the phone moving from WiFi to cellular) can leave a request waiting
// forever, and its button on "saving". An upload gets longer: up to 10MB from a slow phone.
const TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return withTimeout(path, options, async (response) => {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  });
}

/** For a file that needs the sign-in token (an image an img tag cannot fetch by itself). */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return withTimeout(path, options, (response) => response.blob());
}

/** Sends the request and reads its answer within the time limit. Running out of time becomes
    ApiError(0), like being offline; the page's own cancel (options.signal) stays a cancel. */
async function withTimeout<R>(
  path: string,
  options: RequestOptions,
  read: (response: Response) => Promise<R>,
): Promise<R> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.file ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  // The page's cancel stops this request too. Done by hand: AbortSignal.any is missing in older iPhone Safari.
  const pageSignal = options.signal;
  const forward = () => controller.abort();
  if (pageSignal?.aborted) forward();
  else pageSignal?.addEventListener("abort", forward, { once: true });

  try {
    const response = await send(path, { ...options, signal: controller.signal });
    return await read(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (pageSignal?.aborted) throw new DOMException("The request was cancelled", "AbortError");
    // Out of time, or the connection broke while the answer was being read.
    throw new ApiError(0, "network error");
  } finally {
    clearTimeout(timer);
    pageSignal?.removeEventListener("abort", forward);
  }
}

/** Sends the request and returns the response; any failure becomes an ApiError. */
async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, file, token, params, signal } = options;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  const url = queryString ? `${path}${path.includes("?") ? "&" : "?"}${queryString}` : path;

  const headers: Record<string, string> = {};
  if (file) headers["Content-Type"] = file.type || "application/octet-stream";
  else if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (error) {
    // A cancelled request is not a failure the page should show, so it keeps its own type.
    if (isAbort(error)) {
      throw error;
    }
    throw new ApiError(0, "network error");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await errorDetail(response));
  }
  return response;
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
