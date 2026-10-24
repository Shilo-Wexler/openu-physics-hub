# Admin DB contract

The rules the admin-backend DB keeps. The schema is in `migrations/`; this file says what it means.

## Inquiries (`inquiries`)

Anonymous: no name, email or IP is stored, and the content is never written to the log.

### What the site sends (`POST /api/inquiries`)

| Field | Rule |
|---|---|
| `course_id` | A course number from `shared/courses.csv`, or `0` for "כללי" |
| `type` | `exams`, `staff`, `accessibility`, `admin` or `other` |
| `content` | 1 to 2000 characters after trimming |
| `website` | Honeypot. Filled in: `201 {"id": 0}`, nothing is saved |
| `turnstile_token` | Required. Missing or rejected: `422`. Cloudflare unreachable: `503` |

The server sets `status = new`, `created_at` and `updated_at`.

### Handling in the console

- Every admin level may handle them.
- Status: `new`, `in_progress` or `closed`, in any direction.
- `handled_by` (an admin's email):
  - set to the current admin when the status changes;
  - kept when the status stays the same;
  - cleared when the inquiry goes back to `new`.
- `internal_note`: up to 2000 characters. `""` or `null` clears it.
- Every change sets `updated_at`.
- Inquiries are never deleted from the console.

## Courses (`courses`)

Loaded from `shared/courses.csv`, plus `0,כללי`. A course that an inquiry points to cannot be removed.

## Admins (`admins`)

- Only emails in this table can use the console. Cloudflare Access signs them in first.
- Every admin has one level (`role`). Every level sees every screen and the admins list:

| Level | In the console | Managing admins |
|---|---|---|
| `super_admin` | Everything | Any admin, any level |
| `admin` | Everything | Admins and members only: never gives or touches `super_admin` |
| `member` | Everything, announcements as drafts only | None |

- Nobody changes or removes their own row. With the rule above, a super admin always remains.
- A new admin added without a level is a `member`. One added by hand in the DB is a `super_admin`.
- Refused with `403`: `"requires an admin"` (a member) or `"requires a super admin"` (an admin).
- Changes apply on the next request.

## Chat moderation (`moderation_actions`)

- Every chat action (dismiss, remove, block, unblock) is logged with the admin and the target, and only after the chat backend confirmed it.
- The log shows the chat backend's details (nickname, course, text, what became of the message), asked for all rows at once. If the chat backend is down, the log still loads, with ids only.
- An action can be undone (`POST /api/admin/chat/actions/{id}/undo`) only while it is the latest action on its message or user, and only once. The undo is the opposite action, logged with `undoes` pointing at the action it undid:

| Action | Undone by | In the chat |
|---|---|---|
| `dismiss` | `reopen` | The dismissed reports are open again |
| `remove` | `restore` | The message is back, and its reports are open again |
| `block` | `unblock` | |
| `unblock` | `block` | |

- `reopen` and `restore` are not undone in turn: they put the message back in the reported list, where it is decided again.
- The log (`GET /api/admin/chat/actions`) leaves the undos out. An undone action carries `undone_by`, `undone_by_email` and `undone_at` instead.
- `409` when it can't be undone: not the latest, undone already, or the chat backend has nothing to undo (the message changed since, or its author deleted it).

## Announcements (`announcements`)

- Three parts, each optional: a title (up to 200 characters, `""` for none), a text (up to 5000) and one image (WebP, with a required description for screen readers).
- A published announcement has at least one part. The server refuses with `422 "announcement is empty"`:
  - publishing an empty one;
  - emptying the title and the text of a published one with no image;
  - removing the only part of a published one, its image.
- A draft may be empty: the console saves the text before it uploads the image.
- Many can be published. At most one, a published one, is pinned to the home page.
- A `member` creates, edits and deletes drafts (text and image). Publishing, unpublishing, pinning, and changing or deleting a published one: `403 "requires an admin"`.