/** The single place that talks HTTP: JSON in and out, and one error type for every failure. */

/** A failed request. status 0 means the server was not reached at all (offline, DNS, CORS). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
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