/**
 * An in-memory stand-in for admin-backend, installed in the browser with page.route().
 * It follows the real API's rules (admin-backend/app/routes), so the console can be tested
 * without Docker or a database. Tests seed it, act in the page, then read its state back.
 */

import type { Page, Route } from "@playwright/test";

export const ADMIN = "admin@test.com";
export const STAFF = "staff@test.com";
export const FULL = ["admin"];
export const STANDARD = ["announcements", "inquiries", "moderator"];

export type InquiryStatus = "new" | "in_progress" | "closed";
export type InquiryType = "exams" | "staff" | "accessibility" | "admin" | "other";

export interface Inquiry {
  id: number;
  course_number: number;
  course_name: string;
  type: InquiryType;
  content: string;
  status: InquiryStatus;
  handled_by: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
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

// Same as the server (CONSOLE_PAGE_SIZE in admin-backend/app/routes/inquiries.py).
export const INQUIRY_PAGE_SIZE = 50;
const INQUIRY_STATUSES: InquiryStatus[] = ["new", "in_progress", "closed"];
const INQUIRY_TYPES: InquiryType[] = ["exams", "staff", "accessibility", "admin", "other"];
const MAX_NOTE_LENGTH = 2000;

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
  inquiries: Inquiry[] = [];
  failures: Failure[] = [];
  calls: { method: string; path: string; body: unknown }[] = [];
  chatStatus: number | null = null; // 503 = not configured, 502 = down

  users: Record<string, string> = { [USER_A]: "spammer_dev", [USER_B]: "polite_student" };
  reported: Reported[] = [];
  chatBlocked: { user_id: string; nickname: string; blocked_at: string; removed_count: number }[] = [];
  removed: Record<string, { message_id: number; course_id: number; course_name: string; content: string; created_at: string; removed_at: string }[]> = {};
  actions: { id: number; admin_email: string; action: string; message_id: number | null; user_id: string | null; created_at: string }[] = [];

  private nextInquiryId = 1;
  private nextActionId = 1;

  /** Adds one inquiry, as the public form would. Ids grow, so the last one added is the newest. */
  addInquiry(fields: Partial<Inquiry> = {}): Inquiry {
    const courseNumber = fields.course_number ?? 0;
    const created = minutesAgo(100 - this.nextInquiryId);
    const inquiry: Inquiry = {
      id: this.nextInquiryId++,
      course_number: courseNumber,
      course_name: this.courses.find((c) => c.course_number === courseNumber)?.name ?? "",
      type: "exams",
      content: "פנייה לבדיקה",
      status: "new",
      handled_by: null,
      internal_note: null,
      created_at: created,
      updated_at: created,
      ...fields,
    };
    this.inquiries.push(inquiry);
    return inquiry;
  }

  /** n inquiries, oldest first: content "פנייה 1" .. "פנייה n". */
  addManyInquiries(n: number, fields: Partial<Inquiry> = {}): Inquiry[] {
    return Array.from({ length: n }, (_, i) => this.addInquiry({ content: `פנייה ${i + 1}`, ...fields }));
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
    if (!token) return this.json(route, 401, { detail: "missing access token" });
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
    if (path.startsWith("/inquiries")) {
      if (!me.roles.includes("admin") && !me.roles.includes("inquiries")) throw new HttpError(403, "requires the inquiries role");
      return this.inquiry(method, path, q, body, admin);
    }

    if (method === "GET" && path === "/me") return ok({ email: admin, name: null, roles: me.roles });
    if (method === "GET" && path === "/courses") return ok([...this.courses].sort((a, b) => a.course_number - b.course_number));

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

    throw new HttpError(404, "Not Found");
  }

  // ---- inquiries ---------------------------------------------------------

  private inquiry(method: string, path: string, q: URLSearchParams, body: any, admin: string): { status?: number; data: unknown } {
    let m: RegExpMatchArray | null;

    if (method === "GET" && path === "/inquiries/counts") {
      const counts = { new: 0, in_progress: 0, closed: 0 };
      for (const i of this.inquiries) counts[i.status]++;
      return { data: counts };
    }

    if (method === "GET" && path === "/inquiries") {
      const status = q.get("status");
      const type = q.get("type");
      const course = q.get("course");
      const before = q.get("before");
      if (status !== null && !INQUIRY_STATUSES.includes(status as InquiryStatus)) throw new HttpError(422, "invalid status");
      if (type !== null && !INQUIRY_TYPES.includes(type as InquiryType)) throw new HttpError(422, "invalid type");
      if (course !== null && !(Number.isInteger(Number(course)) && Number(course) >= 0)) throw new HttpError(422, "invalid course");
      if (before !== null && !(Number.isInteger(Number(before)) && Number(before) >= 1)) throw new HttpError(422, "invalid before");

      const rows = this.inquiries
        .filter((i) => status === null || i.status === status)
        .filter((i) => type === null || i.type === type)
        .filter((i) => course === null || i.course_number === Number(course))
        .filter((i) => before === null || i.id < Number(before))
        .sort((a, b) => b.id - a.id); // newest first
      const items = rows.slice(0, INQUIRY_PAGE_SIZE);
      const more = rows.length > INQUIRY_PAGE_SIZE;
      return { data: { items, next_before: more ? items[items.length - 1]!.id : null } };
    }

    if ((m = path.match(/^\/inquiries\/(\d+)$/))) {
      const inquiry = this.inquiries.find((i) => i.id === Number(m![1]));
      if (!inquiry) throw new HttpError(404, "inquiry not found");
      if (method === "GET") return { data: inquiry };
      if (method === "POST") {
        const sent = Object.keys(body ?? {}).filter((k) => k === "status" || k === "internal_note");
        if (sent.length === 0) throw new HttpError(422, "nothing to update");
        if (sent.includes("status") && !INQUIRY_STATUSES.includes(body.status)) throw new HttpError(422, "invalid status");
        if (sent.includes("internal_note")) {
          const note = body.internal_note === null ? "" : String(body.internal_note).trim();
          if (note.length > MAX_NOTE_LENGTH) throw new HttpError(422, "invalid internal_note");
          inquiry.internal_note = note || null;
        }
        if (sent.includes("status")) {
          // Back to new: nobody handles it. Any other change records who made it; the same status keeps the handler.
          if (body.status === "new") inquiry.handled_by = null;
          else if (body.status !== inquiry.status) inquiry.handled_by = admin;
          inquiry.status = body.status;
        }
        inquiry.updated_at = new Date().toISOString();
        return { data: inquiry };
      }
    }

    throw new HttpError(404, "Not Found");
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
