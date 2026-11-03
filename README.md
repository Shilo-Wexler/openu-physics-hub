# OpenUVoice

A student-run hub for Open University physics students: course chats with reviews and ratings,
committee announcements, and an inquiry form to the students' committee, with a console for the committee.
Not an official Open University site.

## Parts

| Folder | What |
|---|---|
| `public-frontend/` | The student site (React) |
| `chat-backend/` | Course chats and student sign-in (FastAPI) |
| `admin-frontend/` | The committee console (React) |
| `admin-backend/` | Inquiries, announcements, staff, moderation (FastAPI) |
| `shared/courses.csv` | The course list, single source for both databases |
| `deploy/` | Images, Helm charts, Argo CD, server setup |
| `docs/` | Documentation |

## Start here

- Run it locally: `docs/local-setup.md`
- All documentation: `docs/README.md`