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

- Needs the `inquiries` or `admin` role.
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
- Roles: `admin`, `moderator`, `inquiries`, `announcements`.
- Only `admin` can add, change or remove admins, and never their own row.
- Changes apply on the next request.

## Chat moderation (`moderation_actions`)

Every chat action (dismiss, remove, block, unblock) is logged with the admin and the target, and only after the chat backend confirmed it.

## Announcements (`announcements`)

- Three parts, each optional: a title (up to 200 characters, `""` for none), a text (up to 5000) and one image (WebP, with a required description for screen readers).
- A published announcement has at least one part. The server refuses with `422 "announcement is empty"`:
  - publishing an empty one;
  - emptying the title and the text of a published one with no image;
  - removing the only part of a published one, its image.
- A draft may be empty: the console saves the text before it uploads the image.
- Many can be published. At most one, a published one, is pinned to the home page.