# Chat moderation API

Server-to-server API for the admin console. The browser never calls it, and neither side reads the other's database.

## Auth

Every request sends:

```
Authorization: Bearer <MOD_API_TOKEN>
```

The token (32+ chars) is shared privately and read from env (`MOD_API_TOKEN` or `MOD_API_TOKEN_FILE`). Never commit it.
Call the chat backend through its in-cluster Service; `/internal` is not exposed publicly.

## Endpoints

| Method | Path | Does | Returns |
|---|---|---|---|
| GET | `/internal/reported-messages` | Messages with open reports, most reported first (max 100) | list (below) |
| POST | `/internal/messages/{id}/dismiss` | Close open reports, keep the message | `{"dismissed_reports": n}` |
| POST | `/internal/messages/{id}/remove` | Remove the message and close its reports | `{"status": "ok"}` |
| POST | `/internal/users/{user_id}/block` | User can read but not write, like, rate or report | `{"status": "ok"}` |
| POST | `/internal/users/{user_id}/unblock` | Undo block | `{"status": "ok"}` |
| GET | `/internal/blocked-users` | Blocked users, newest first | list (below) |
| GET | `/internal/users/{user_id}/removed-messages` | User's messages removed by moderators | list (below) |

All POSTs are safe to repeat. Message ids are integers, user ids are UUIDs, times are ISO 8601 UTC.

## Response items

`reported-messages`:
```json
{"message_id": 197, "course_id": 20113, "course_name": "...", "content": "...",
 "created_at": "...", "author_id": "uuid", "author_nickname": "...", "author_blocked": false,
 "report_count": 3, "last_reported_at": "...",
 "author_removed_count": 1, "author_reported_count": 2}
```

`blocked-users`:
```json
{"user_id": "uuid", "nickname": "...", "blocked_at": "...", "removed_count": 1}
```

`removed-messages`:
```json
{"message_id": 197, "course_id": 20113, "course_name": "...", "content": "...",
 "created_at": "...", "removed_at": "..."}
```

## Errors

`401` bad or missing token, `404` message or user not found, `422` malformed id.

## Notes

- Store which admin did each action on the admin side; the chat only records that a moderator did it.
- Full interactive docs: `/docs` on the chat backend.