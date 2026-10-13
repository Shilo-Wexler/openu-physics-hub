# Student requests API (for public-frontend)

How a student request reaches the committee, if `public-frontend` sends it to the admin backend.
Status: proposed. Who owns submission (this endpoint, or the chat side) is not decided yet.

## `POST /api/requests`

Same origin as the site: the Ingress forwards `/api/requests` to the admin backend.
No cookie and no Authorization header: the Google ID token goes in the body.

```json
{
  "id_token": "<Google ID token from Sign In With Google>",
  "email": "student@gmail.com",
  "full_name": "ישראל ישראלי",
  "course_name": "מכניקה",
  "body": "the request text"
}
```

| Field | Rule |
|---|---|
| `id_token` | Google ID token for the same OAuth client ID as the admin backend's `GOOGLE_CLIENT_ID` |
| `email` | Must equal the token's email (case-insensitive). The token's email must be verified |
| `full_name` | 1–100 characters after trimming |
| `course_name` | A name from `shared/courses.csv`, exactly, or `כללי` |
| `body` | 1–5000 characters after trimming |

Success: `201 {"ok": true}`.

| Status | `detail` | Meaning |
|---|---|---|
| 401 | `invalid or expired token` / `email not verified` / `email does not match token` | Sign in again |
| 403 | `request not accepted` | Sender is blocked (deliberately vague) |
| 409 | `duplicate request` | Same text from the same email in the last 5 minutes |
| 422 | `unknown course` / validation details | A field is wrong |
| 429 | `too many requests, try again later` | More than 5 requests in an hour from this email |

The student cannot read, edit or delete requests afterwards. Admins handle them in the admin console.
