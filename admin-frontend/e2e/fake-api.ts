/**
 * An in-memory stand-in for admin-backend, installed in the browser with page.route().
 * It follows the real API's rules (admin-backend/app/routes), so the console can be tested
 * without Docker, a database or Google. Tests seed it, act in the page, then read its state back.
 */

import type { Page, Route } from "@playwright/test";

export const ADMIN = "admin@test.com";
export const STAFF = "staff@test.com";
export const FULL = ["admin"];
export const STANDARD = ["announcements", "inquiries", "moderator"];

export interface Req {
  id: number;
  full_name: string;
  email: string;
  course_name: string;
  body: string;
  status: "new" | "closed";
  is_opened: boolean;
  created_at: string;
}

export interface Course {
  name: string;
  course_number: number;
}

export interface Reported {
  message_id: number;
  course_id: number;
  course_name: string;
  content: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_blocked: boolean;
  report_count: number;
  last_reported_at: string;
  author_removed_count: number;
  author_reported_count: number;
}

export interface Failure {
  method?: string;
  path: RegExp; // matched against the path after /api/admin
  status: number;
  detail?: string;
  times?: number; // how many requests to fail; default: all
}

export const COURSES: Course[] = [
  { name: "כללי", course_number: 0 },
  { name: "מכניקה", course_number: 20215 },
  { name: "חשמל ומגנטיות", course_number: 20250 },
  { name: "גלים ואופטיקה", course_number: 20248 },
  { name: "תרמודינמיקה", course_number: 20483 },
];

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "44444444-4444-4444-8444-444444444444";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export class FakeApi {
  admins: { email: string; roles: string[]; added_by: string | null; created_at: string }[] = [
    { email: ADMIN, roles: FULL, added_by: null, created_at: minutesAgo(10_000) },
  ];

  /** Adds a standard admin ("מנהל"): everything except managing admins. */
  addStaff(email = STAFF) {
    this.admins.push({ email, roles: [...STANDARD], added_by: ADMIN, created_at: minutesAgo(5_000) });
  }
  courses = COURSES.map((c) => ({ ...c }));
  requests: Req[] = [];
  blocked: { email: string; reason: string | null; blocked_at: string }[] = [];
  failures: Failure[] = [];
  calls: { method: string; path: string; body: unknown }[] = [];
  chatStatus: number | null = null; // 503 = not configured, 502 = down

  users: Record<string, string> = { [USER_A]: "spammer_dev", [USER_B]: "polite_student" };
  reported: Reported[] = [];
  chatBlocked: { user_id: string; nickname: string; blocked_at: string; removed_count: number }[] = [];
  removed: Record<string, { message_id: number; course_id: number; course_name: string; content: string; created_at: string; removed_at: string }[]> = {};
  actions: { id: number; admin_email: string; action: string; message_id: number | null; user_id: string | null; created_at: string }[] = [];

  private nextId = 1;
  private nextActionId = 1;

  /** Adds one request; created_at defaults to `minutesOld` minutes ago (newest = smallest). */
  addRequest(fields: Partial<Req> & { minutesOld?: number } = {}): Req {
    const { minutesOld, ...rest } = fields;
    const r: Req = {
      id: this.nextId++,
      full_name: "ישראל ישראלי",
      email: "student@test.com",
      course_name: "מכניקה",
      body: "פנייה לבדיקה",
      status: "new",
      is_opened: false,
      created_at: minutesAgo(minutesOld ?? 100 - this.nextId),
      ...rest,
    };
    this.requests.push(r);
    return r;
  }

  /** n requests, oldest first: body "פנייה 1" .. "פנייה n". */
  addMany(n: number, fields: Partial<Req> = {}): Req[] {
    return Array.from({ length: n }, (_, i) => this.addRequest({ body: `פנייה ${i + 1}`, minutesOld: 1000 - i, ...fields }));
  }

  addReported(fields: Partial<Reported> = {}): Reported {
    const m: Reported = {
      message_id: 100 + this.reported.length,
      course_id: 20215,
      course_name: "מכניקה",
      content: "הודעת ספאם לבדיקה",
      created_at: minutesAgo(30),
      author_id: USER_A,
      author_nickname: "spammer_dev",
      author_blocked: false,
      report_count: 2,
      last_reported_at: minutesAgo(5),
      author_removed_count: 0,
      author_reported_count: 1,
      ...fields,
    };
    this.reported.push(m);
    return m;
  }

  fail(f: Failure) {
    this.failures.push(f);
  }

  called(method: string, path: RegExp) {
    return this.calls.filter((c) => c.method === method && path.test(c.path));
  }

  async install(page: Page) {
    await page.route("**/accounts.google.com/**", (route) => route.abort());
    await page.route("**/api/admin/**", (route) => this.handle(route));
  }

  // ---------------------------------------------------------------------

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname.replace(/^\/api\/admin/, "");
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    this.calls.push({ method, path, body });

    const failure = this.failures.find((f) => (!f.method || f.method === method) && f.path.test(path));
    if (failure) {
      if (failure.times !== undefined && --failure.times <= 0) this.failures.splice(this.failures.indexOf(failure), 1);
      return this.json(route, failure.status, { detail: failure.detail ?? "error" });
    }

    const auth = req.headers()["authorization"] ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return this.json(route, 401, { detail: "missing bearer token" });
    const email = token.startsWith("dev:") ? token.slice(4).toLowerCase() : token.toLowerCase();
    if (!email.includes("@")) return this.json(route, 401, { detail: "invalid or expired token" });
    if (!this.admins.some((a) => a.email === email)) return this.json(route, 403, { detail: "not an admin" });

    try {
      const result = this.dispatch(method, path, url.searchParams, body, email);
      if (result === undefined) return route.fulfill({ status: 204, body: "" });
      return this.json(route, result.status ?? 200, result.data);
    } catch (e) {
      if (e instanceof HttpError) return this.json(route, e.status, { detail: e.message });
      throw e;
    }
  }

  private json(route: Route, status: number, data: unknown) {
    return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(data) });
  }

  private dispatch(method: string, path: string, q: URLSearchParams, body: any, admin: string): { status?: number; data: unknown } | undefined {
    let m: RegExpMatchArray | null;
    const ok = (data: unknown, status = 200) => ({ data, status });

    if (path.startsWith("/chat/")) return this.chat(method, path, admin);

    const me = this.admins.find((a) => a.email === admin)!;
    const requireFull = () => {
      if (!me.roles.includes("admin")) throw new HttpError(403, "requires the admin role");
    };
    if (method === "GET" && path === "/me") return ok({ email: admin, name: null, roles: me.roles });
    if (method === "GET" && path === "/summary") {
      const r = this.requests;
      return ok({
        unread: r.filter((x) => !x.is_opened).length,
        in_progress: r.filter((x) => x.is_opened && x.status === "new").length,
        closed: r.filter((x) => x.status === "closed").length,
        total: r.length,
      });
    }
    if (method === "GET" && path === "/requests") return ok(this.list(q));
    if (method === "GET" && path === "/courses") return ok([...this.courses].sort((a, b) => a.course_number - b.course_number));

    if ((m = path.match(/^\/requests\/(\d+)$/))) {
      const r = this.find(Number(m[1]));
      if (method === "GET") {
        const { ...full } = r;
        return ok(full);
      }
      if (method === "DELETE") {
        this.requests = this.requests.filter((x) => x !== r);
        return undefined;
      }
    }
    if ((m = path.match(/^\/requests\/(\d+)\/(read|unread|close|reopen)$/)) && method === "POST") {
      const r = this.find(Number(m[1]));
      const action = m[2];
      if (action === "read") r.is_opened = true;
      if (action === "unread") {
        if (r.status === "closed") throw new HttpError(409, "a closed request cannot be marked unread");
        r.is_opened = false;
      }
      if (action === "close") {
        if (!r.is_opened) throw new HttpError(409, "request must be read before closing");
        r.status = "closed";
      }
      if (action === "reopen") r.status = "new";
      return ok({ id: r.id, status: r.status, is_opened: r.is_opened });
    }

    if (method === "GET" && path === "/stats/by-course") {
      return ok(
        this.courses
          .map((c) => {
            const mine = this.requests.filter((r) => r.course_name === c.name);
            return { course_name: c.name, course_number: c.course_number, total: mine.length, unread: mine.filter((r) => !r.is_opened).length };
          })
          .sort((a, b) => b.total - a.total || a.course_name.localeCompare(b.course_name)),
      );
    }
    if (method === "GET" && path === "/stats/weekly") {
      const weeks = Number(q.get("weeks") ?? 12);
      const start = weekStart(new Date());
      return ok(
        Array.from({ length: weeks }, (_, i) => {
          const from = new Date(start.getTime() - (weeks - 1 - i) * 7 * 86_400_000);
          const to = new Date(from.getTime() + 7 * 86_400_000);
          const total = this.requests.filter((r) => new Date(r.created_at) >= from && new Date(r.created_at) < to).length;
          return { week: from.toISOString(), total };
        }),
      );
    }
    if (method === "GET" && path === "/stats/top-senders") {
      const by = new Map<string, Req[]>();
      for (const r of this.requests) by.set(r.email, [...(by.get(r.email) ?? []), r]);
      return ok(
        [...by.entries()]
          .map(([email, rs]) => ({
            email,
            total: rs.length,
            last_at: rs.map((r) => r.created_at).sort().at(-1),
            is_blocked: this.blocked.some((b) => b.email === email),
          }))
          .sort((a, b) => b.total - a.total),
      );
    }

    if (path === "/admins" && method === "GET") return ok(this.admins);
    if (path === "/admins" && method === "POST") {
      requireFull();
      const email = String(body?.email ?? "").trim().toLowerCase();
      const roles = rolesFrom(body?.roles ?? STANDARD);
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 254) throw new HttpError(422, "invalid email");
      if (this.admins.some((a) => a.email === email)) throw new HttpError(409, "already an admin");
      const row = { email, roles, added_by: admin, created_at: new Date().toISOString() };
      this.admins.push(row);
      return ok(row, 201);
    }
    if ((m = path.match(/^\/admins\/(.+)\/roles$/)) && method === "PUT") {
      requireFull();
      const email = decodeURIComponent(m[1]!).trim().toLowerCase();
      const roles = rolesFrom(body?.roles);
      if (email === admin) throw new HttpError(409, "you cannot change your own roles");
      const row = this.admins.find((a) => a.email === email);
      if (!row) throw new HttpError(404, "not an admin");
      row.roles = roles;
      return ok(row);
    }
    if ((m = path.match(/^\/admins\/(.+)$/)) && method === "DELETE") {
      requireFull();
      const email = decodeURIComponent(m[1]!).trim().toLowerCase();
      if (email === admin) throw new HttpError(409, "you cannot remove yourself");
      if (!this.admins.some((a) => a.email === email)) throw new HttpError(404, "not an admin");
      this.admins = this.admins.filter((a) => a.email !== email);
      return undefined;
    }

    if (path === "/blocked" && method === "GET") return ok([...this.blocked].reverse());
    if (path === "/blocked" && method === "POST") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!email.includes("@")) throw new HttpError(422, "invalid email");
      const existing = this.blocked.find((b) => b.email === email);
      if (existing) existing.reason = body?.reason ?? null;
      else this.blocked.push({ email, reason: body?.reason ?? null, blocked_at: new Date().toISOString() });
      return ok(this.blocked.find((b) => b.email === email), 201);
    }
    if ((m = path.match(/^\/blocked\/(.+)$/)) && method === "DELETE") {
      const email = decodeURIComponent(m[1]!).toLowerCase();
      if (!this.blocked.some((b) => b.email === email)) throw new HttpError(404, "email is not blocked");
      this.blocked = this.blocked.filter((b) => b.email !== email);
      return undefined;
    }

    throw new HttpError(404, "Not Found");
  }

  private list(q: URLSearchParams) {
    let rows = [...this.requests];
    const course = q.get("course_name");
    const status = q.get("status");
    const opened = q.get("is_opened");
    const email = q.get("email");
    if (course) rows = rows.filter((r) => r.course_name === course);
    if (status) rows = rows.filter((r) => r.status === status);
    if (opened !== null) rows = rows.filter((r) => r.is_opened === (opened === "true"));
    if (email) rows = rows.filter((r) => r.email === email.trim().toLowerCase());
    const oldest = q.get("sort") === "oldest";
    rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id) * (oldest ? 1 : -1));
    const page = Number(q.get("page") ?? 1);
    const size = Number(q.get("page_size") ?? 25);
    const items = rows.slice((page - 1) * size, page * size).map(({ body, ...r }) => ({ ...r, preview: body.slice(0, 200) }));
    return { items, total: rows.length, page, page_size: size };
  }

  private find(id: number): Req {
    const r = this.requests.find((x) => x.id === id);
    if (!r) throw new HttpError(404, "request not found");
    return r;
  }

  // ---- chat --------------------------------------------------------------

  private chat(method: string, path: string, admin: string): { status?: number; data: unknown } | undefined {
    if (this.chatStatus) throw new HttpError(this.chatStatus, this.chatStatus === 503 ? "chat moderation is not configured" : "chat backend unavailable");
    let m: RegExpMatchArray | null;
    const log = (action: string, message_id: number | null, user_id: string | null) =>
      this.actions.unshift({ id: this.nextActionId++, admin_email: admin, action, message_id, user_id, created_at: new Date().toISOString() });

    if (method === "GET" && path === "/chat/reported-messages") return { data: this.reported };
    if (method === "GET" && path === "/chat/blocked-users") return { data: this.chatBlocked };
    if (method === "GET" && path === "/chat/actions") return { data: this.actions };

    if ((m = path.match(/^\/chat\/messages\/(\d+)\/(dismiss|remove)$/)) && method === "POST") {
      const id = Number(m[1]);
      const msg = this.reported.find((x) => x.message_id === id);
      if (m[2] === "dismiss") {
        this.reported = this.reported.filter((x) => x.message_id !== id);
        log("dismiss", id, null);
        return { data: { dismissed_reports: msg?.report_count ?? 0 } };
      }
      if (!msg) throw new HttpError(404, "message not found");
      this.reported = this.reported.filter((x) => x.message_id !== id);
      (this.removed[msg.author_id] ??= []).unshift({
        message_id: id,
        course_id: msg.course_id,
        course_name: msg.course_name,
        content: msg.content,
        created_at: msg.created_at,
        removed_at: new Date().toISOString(),
      });
      for (const x of this.reported) if (x.author_id === msg.author_id) x.author_removed_count++;
      const b = this.chatBlocked.find((u) => u.user_id === msg.author_id);
      if (b) b.removed_count++;
      log("remove", id, null);
      return { data: { status: "ok" } };
    }

    if ((m = path.match(/^\/chat\/users\/([^/]+)\/(block|unblock|removed-messages)$/))) {
      const user = m[1]!;
      if (!/^[0-9a-f-]{36}$/.test(user)) throw new HttpError(422, "invalid user id");
      if (!this.users[user]) throw new HttpError(404, "user not found");
      if (m[2] === "removed-messages" && method === "GET") return { data: this.removed[user] ?? [] };
      const block = m[2] === "block";
      for (const x of this.reported) if (x.author_id === user) x.author_blocked = block;
      if (block && !this.chatBlocked.some((u) => u.user_id === user)) {
        this.chatBlocked.unshift({ user_id: user, nickname: this.users[user]!, blocked_at: new Date().toISOString(), removed_count: (this.removed[user] ?? []).length });
      }
      if (!block) this.chatBlocked = this.chatBlocked.filter((u) => u.user_id !== user);
      log(m[2]!, null, user);
      return { data: { status: "ok" } };
    }
    throw new HttpError(404, "Not Found");
  }
}

/** Same rules as the backend: known roles only, at least one, sorted without duplicates. */
function rolesFrom(value: unknown): string[] {
  const known = ["admin", "moderator", "inquiries", "announcements"];
  if (!Array.isArray(value) || value.length === 0 || !value.every((r) => known.includes(r))) {
    throw new HttpError(422, "invalid roles");
  }
  return [...new Set(value as string[])].sort();
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Monday 00:00 (UTC) of the week of `d`. */
function weekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
