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
| POST | `/internal/messages/{id}/reopen` | Undo a dismissal: dismissed reports are open again | `{"reopened_reports": n}` |
| POST | `/internal/messages/{id}/remove` | Remove the message and close its reports | `{"status": "ok"}` |
| POST | `/internal/messages/{id}/restore` | Undo a removal: the message is back, its closed reports open again | `{"reopened_reports": n}` |
| POST | `/internal/users/{user_id}/block` | User can read but not write, like, rate or report | `{"status": "ok"}` |
| POST | `/internal/users/{user_id}/unblock` | Undo block | `{"status": "ok"}` |
| GET | `/internal/blocked-users` | Blocked users, newest first | list (below) |
| GET | `/internal/users/{user_id}/removed-messages` | User's messages removed by moderators | list (below) |
| GET | `/internal/messages?ids=1&ids=2` | Any messages by id, deleted ones too (max 200 ids) | list (below) |
| GET | `/internal/users?ids=<uuid>&ids=<uuid>` | Users by id (max 200 ids) | list (below) |

dismiss, remove, block and unblock are safe to repeat. reopen and restore are not: once undone, there is
nothing left to undo (`409`). Message ids are integers, user ids are UUIDs, times are ISO 8601 UTC.

### Undo

Both undos put the message back in `reported-messages`, so a moderator decides again.

- `reopen`: only while the message is in the chat and has dismissed reports.
- `restore`: only for a message a moderator removed; never one its author deleted.

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

`messages?ids=` (`state` is `active`, `removed` by a moderator, or `deleted` by its author):
```json
{"message_id": 197, "course_id": 20113, "course_name": "...", "content": "...",
 "created_at": "...", "author_id": "uuid", "author_nickname": "...",
 "state": "removed", "open_reports": 0, "all_reports": 3}
```

`users?ids=`:
```json
{"user_id": "uuid", "nickname": "...", "blocked_at": null}
```

Ids that don't exist are left out, and the order is not the order asked.

## Errors

`401` bad or missing token, `404` message or user not found, `409` nothing to undo,
`422` malformed id, no ids, or more than 200.

## Notes

- Store which admin did each action on the admin side; the chat only records that a moderator did it.
- Full interactive docs: `/docs` on the chat backend.
