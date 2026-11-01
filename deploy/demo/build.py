"""Builds the demo data SQL for staging from the text files next to this script.

Run from the repo root after editing any file here:
    .venv/bin/python deploy/demo/build.py
It rewrites deploy/helm/openuvoice/demo/chat.sql and admin.sql. The output is deterministic
(fixed random seed), so an unchanged input gives an unchanged file and a clean git diff.

The chart runs those files only when demo.enabled is true (values-staging.yaml), after the
migrations. Each file does nothing when its demo data is already there, so every deploy can
run it. Production never sets demo.enabled.

Input files:
  content/<course id>.txt   reviews and replies written for that course (0 = general chat):
                              R [likes] text          a review; " ¶ " starts a new paragraph
                              - [likes] text          a reply to the review above it
                              - [likes] >N text       a reply quoting the N-th reply of that review
                            a blank line separates reviews
  generic-reviews.txt       short reviews that fit any course, one per line
  generic-replies.txt       short replies that fit any review, one per line
  reported.txt              [reports] text: rude or spam replies, each reported by that many users
  users.txt                 demo nicknames, one per line
  inquiries.txt             course|type|status|days ago|internal note|content
  announcements.txt         pinned|published|draft|days ago|title|body
"""

import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "helm" / "openuvoice" / "demo"

SEED = 2026
GENERAL_COURSE_ID = 0
# Messages per chat, including the general chat.
TARGET_MESSAGES = 50
# Reviews per course chat; course-specific ones first, generic ones fill the rest.
TARGET_REVIEWS = 18
# Reviews spread over this many days back from the moment the seed runs.
SPREAD_DAYS = 90
# Demo users who write the reported replies; few of them, so the console shows repeat offenders.
TROLLS = 3
# The email shown as author of demo announcements and handler of demo inquiries. The admin
# seed uses it to tell whether demo data is already there.
DEMO_EMAIL = "demo@openuvoice.com"
# Avatar keys the chat backend accepts (chat-backend/app/services/users.py AVATARS).
AVATARS = [
    "atom", "bulb", "comet", "dna", "earth", "flask", "fox", "galaxy", "lightning", "magnet",
    "microscope", "moon", "octopus", "owl", "rainbow", "robot", "rocket", "satellite", "saturn",
    "snowflake", "sun", "telescope", "test-tube", "volcano",
]
# Typical difficulty (1-5) per course for the demo ratings; anything not listed is 4.
DIFFICULTY = {
    91463: 1, 20120: 2, 20123: 2, 20124: 3, 20113: 3, 20114: 3, 20418: 2, 20488: 3, 20489: 3,
    20201: 3, 20482: 3, 20483: 3, 20402: 3, 20403: 3, 20409: 3, 20289: 3, 20340: 3, 20382: 3,
    20125: 4, 20215: 5, 20250: 5, 20422: 5, 20589: 5, 20955: 5, 20320: 5, 20314: 5, 20522: 4,
}

LINE = re.compile(r"^(R|-) \[(\d+)\] (?:>(\d+) )?(.+)$")


def lines(name):
    """Non-empty, non-comment lines of a text file."""
    text = (HERE / name).read_text(encoding="utf-8")
    return [line for line in text.splitlines() if line.strip() and not line.startswith("#")]


def paragraphs(text):
    return text.replace(" ¶ ", "\n\n").strip()


def parse_course(path):
    """List of threads: (likes, text, [(likes, quote index or None, text), ...])."""
    threads = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        m = LINE.match(raw)
        if not m:
            raise SystemExit(f"{path.name}: cannot read line: {raw}")
        kind, likes, quote, text = m.groups()
        if kind == "R":
            threads.append((int(likes), paragraphs(text), []))
        else:
            if not threads:
                raise SystemExit(f"{path.name}: reply before any review")
            q = int(quote) if quote else None
            if q is not None and not 1 <= q <= len(threads[-1][2]):
                raise SystemExit(f"{path.name}: >{q} has no such reply: {raw}")
            threads[-1][2].append((int(likes), q, paragraphs(text), 0))
    return threads


def generic_likes(rng):
    r = rng.random()
    if r < 0.6:
        return 0
    if r < 0.85:
        return rng.randint(1, 3)
    if r < 0.97:
        return rng.randint(4, 9)
    return rng.randint(10, 20)


def copy_value(v):
    """One value in COPY text format."""
    if v is None:
        return r"\N"
    s = str(v)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def copy_block(table, columns, rows):
    out = [f"copy {table} ({', '.join(columns)}) from stdin;"]
    out += ["\t".join(copy_value(v) for v in row) for row in rows]
    out.append("\\.")
    return "\n".join(out)


def literal(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def build_chat(rng):
    nicknames = lines("users.txt")
    users = [(n, nick, AVATARS[(n - 1) % len(AVATARS)]) for n, nick in enumerate(nicknames, 1)]
    user_ns = [u[0] for u in users]
    generic_reviews = lines("generic-reviews.txt")
    generic_replies = lines("generic-replies.txt")
    max_minutes = SPREAD_DAYS * 24 * 60
    trolls = rng.sample(user_ns, TROLLS)

    messages = []  # (n, course_id, thread_n, quote_n, user_n, minutes_ago, content)
    likes = {}  # message n -> like count
    ratings = []
    course_files = sorted((HERE / "content").glob("*.txt"), key=lambda p: int(p.stem))
    # Each reported reply lands in a random course chat.
    reported_by_course = {}
    for raw in lines("reported.txt"):
        m = re.match(r"^\[(\d+)\] (.+)$", raw)
        if not m:
            raise SystemExit(f"reported.txt: cannot read line: {raw}")
        course_id = int(rng.choice(course_files).stem)
        reported_by_course.setdefault(course_id, []).append((int(m.group(1)), m.group(2)))
    reported = []  # (message n, number of reports, author, minutes_ago)

    for path in course_files:
        course_id = int(path.stem)
        threads = parse_course(path)
        if course_id != GENERAL_COURSE_ID:
            pool = rng.sample(generic_reviews, max(0, TARGET_REVIEWS - len(threads)))
            threads += [(generic_likes(rng), text, []) for text in pool]
        for count, text in reported_by_course.get(course_id, []):
            rng.choice(threads)[2].append((0, None, text, count))
        replies_now = sum(len(t[2]) for t in threads)
        extra = max(0, TARGET_MESSAGES - len(threads) - replies_now)
        # Busier reviews (more likes) draw more of the extra replies.
        weights = [1 + t[0] for t in threads]
        for _ in range(extra):
            t = rng.choices(range(len(threads)), weights=weights)[0]
            threads[t][2].append((generic_likes(rng), None, rng.choice(generic_replies), 0))

        for likes_r, text, replies in threads:
            review_n = len(messages) + 1
            author = rng.choice(user_ns)
            review_ago = rng.randint(60 * 24, max_minutes)
            messages.append([review_n, course_id, None, None, author, review_ago, text])
            likes[review_n] = likes_r
            # Replies follow the review in order, each a few minutes to two days after the last.
            gaps = [rng.randint(5, 2 * 24 * 60) for _ in replies]
            total = sum(gaps)
            room = review_ago - 1
            if total > room:
                gaps = [max(1, g * room // (total + 1)) for g in gaps]
            at = review_ago
            reply_ns = []
            for (likes_p, quote, rtext, report_count), gap in zip(replies, gaps):
                at = max(1, at - gap)
                n = len(messages) + 1
                quote_n = reply_ns[quote - 1] if quote else None
                quoted_author = messages[quote_n - 1][4] if quote_n else None
                if report_count:
                    who = rng.choice([u for u in trolls if u != author])
                    reported.append((n, report_count, who, at))
                elif quote_n and quoted_author != author:
                    # A quote reply is usually the reviewer answering whoever spoke to them.
                    who = author
                else:
                    who = rng.choice([u for u in user_ns if u != author])
                messages.append([n, course_id, review_n, quote_n, who, at, rtext])
                likes[n] = likes_p
                reply_ns.append(n)

        if course_id != GENERAL_COURSE_ID:
            base = DIFFICULTY.get(course_id, 4)
            for u in rng.sample(user_ns, rng.randint(8, 22)):
                difficulty = min(5, max(1, base + rng.choice([-1, 0, 0, 1])))
                recommendation = min(5, max(1, rng.choice([2, 3, 4, 4, 5, 5])))
                ratings.append((u, course_id, difficulty, recommendation, rng.randint(60, max_minutes)))

    for m in messages:
        if len(m[6]) > 4000:
            raise SystemExit(f"message too long in course {m[1]}: {m[6][:40]}")
    like_rows = []
    for n, count in likes.items():
        for u in rng.sample(user_ns, min(count, len(user_ns))):
            like_rows.append((n, u))
    report_rows = []
    for n, count, author, at in reported:
        for reporter in rng.sample([u for u in user_ns if u != author], count):
            report_rows.append((n, reporter, rng.randint(1, max(1, at - 1))))

    parts = [HEADER_CHAT]
    parts.append(copy_block("demo_users", ["n", "nickname", "avatar"], users))
    parts.append(copy_block(
        "demo_messages",
        ["n", "course_id", "thread_n", "quote_n", "user_n", "minutes_ago", "content"],
        messages,
    ))
    parts.append(copy_block("demo_likes", ["message_n", "user_n"], like_rows))
    parts.append(copy_block(
        "demo_ratings", ["user_n", "course_id", "difficulty", "recommendation", "minutes_ago"], ratings,
    ))
    parts.append(copy_block("demo_reports", ["message_n", "user_n", "minutes_ago"], report_rows))
    parts.append(FOOTER_CHAT)
    stats = (
        f"{len(users)} users, {len(messages)} messages, {len(like_rows)} likes, "
        f"{len(ratings)} ratings, {len(reported)} reported replies ({len(report_rows)} reports)"
    )
    return "\n\n".join(parts) + "\n", stats


HEADER_CHAT = r"""-- Demo data for the chat database (staging only). Generated by deploy/demo/build.py: edit the
-- text files there and rebuild instead of editing this file.
-- Demo users are the logins google/demo-NN; when any exists, the data is already here and
-- nothing runs. Real users are never touched.
\set ON_ERROR_STOP on
select exists (
  select 1 from user_identities where provider = 'google' and provider_user_id like 'demo-%'
) as seeded \gset
\if :seeded
\echo Chat demo data already present, nothing to do.
\quit
\endif

begin;

create temp table demo_users (
  n int primary key, nickname text, avatar text, id uuid not null default gen_random_uuid()
) on commit drop;
create temp table demo_messages (
  n int primary key, course_id int, thread_n int, quote_n int, user_n int, minutes_ago int, content text
) on commit drop;
create temp table demo_likes (message_n int, user_n int) on commit drop;
create temp table demo_ratings (
  user_n int, course_id int, difficulty int, recommendation int, minutes_ago int
) on commit drop;
create temp table demo_reports (message_n int, user_n int, minutes_ago int) on commit drop;"""

FOOTER_CHAT = r"""insert into users (id, nickname, avatar, created_at)
select id, nickname, avatar, now() - interval '100 days' from demo_users;

insert into user_identities (user_id, provider, provider_user_id)
select id, 'google', 'demo-' || lpad(n::text, 2, '0') from demo_users;

-- Message ids continue after the highest existing id, so threads and quotes can point at
-- each other inside one insert; the id sequence is moved past them afterwards.
select coalesce(max(id), 0) as base from messages \gset

insert into messages (id, course_id, user_id, thread_id, reply_to_id, content, like_count, created_at)
overriding system value
select :base + m.n, m.course_id, u.id, :base + m.thread_n, :base + m.quote_n, m.content,
       (select count(*) from demo_likes l where l.message_n = m.n),
       now() - m.minutes_ago * interval '1 minute'
  from demo_messages m
  join demo_users u on u.n = m.user_n
 order by m.n;

select setval(pg_get_serial_sequence('messages', 'id'), (select max(id) from messages));

insert into likes (user_id, message_id)
select u.id, :base + l.message_n from demo_likes l join demo_users u on u.n = l.user_n;

insert into ratings (user_id, course_id, difficulty, recommendation, created_at)
select u.id, r.course_id, r.difficulty, r.recommendation, now() - r.minutes_ago * interval '1 minute'
  from demo_ratings r join demo_users u on u.n = r.user_n;

insert into reports (message_id, reporter_id, created_at)
select :base + r.message_n, u.id, now() - r.minutes_ago * interval '1 minute'
  from demo_reports r join demo_users u on u.n = r.user_n;

commit;
\echo Chat demo data loaded."""


def build_admin():
    inquiries = []
    for raw in lines("inquiries.txt"):
        course, kind, status, days, note, content = raw.split("|", 5)
        handled = DEMO_EMAIL if status != "new" else None
        inquiries.append(
            f"({int(course)}, {literal(kind)}, {literal(status)}, {int(days)}, "
            f"{literal(handled)}, {literal(note or None)}, {literal(content)})"
        )
    announcements = []
    for raw in lines("announcements.txt"):
        state, days, title, body = raw.split("|", 3)
        announcements.append(
            f"({literal(state)}, {int(days)}, {literal(title)}, {literal(paragraphs(body))})"
        )
    sql = HEADER_ADMIN + f"""
insert into inquiries (course_number, type, status, content, handled_by, internal_note, created_at, updated_at)
select v.course, v.type, v.status, v.content, v.handled_by, v.note,
       now() - v.days * interval '1 day',
       now() - v.days * interval '1 day' + case when v.status = 'new' then interval '0' else interval '2 days' end
  from (values
    {(',' + chr(10) + '    ').join(inquiries)}
  ) as v (course, type, status, days, handled_by, note, content)
  -- Only courses this database knows.
  join courses c on c.course_number = v.course;

-- At most one announcement is pinned, so the demo one is pinned only when none is.
insert into announcements (title, body, published_at, pinned, author_email, created_at)
select v.title, v.body,
       case when v.state = 'draft' then null else now() - v.days * interval '1 day' end,
       v.state = 'pinned' and not exists (select 1 from announcements where pinned),
       '{DEMO_EMAIL}',
       now() - v.days * interval '1 day'
  from (values
    {(',' + chr(10) + '    ').join(announcements)}
  ) as v (state, days, title, body);

commit;
\\echo Admin demo data loaded.
"""
    return sql, f"{len(inquiries)} inquiries, {len(announcements)} announcements"


HEADER_ADMIN = rf"""-- Demo data for the admin database (staging only). Generated by deploy/demo/build.py: edit the
-- text files there and rebuild instead of editing this file.
-- Demo rows are marked by the author email {DEMO_EMAIL}; when a demo announcement exists, the
-- data is already here and nothing runs.
\set ON_ERROR_STOP on
select exists (select 1 from announcements where author_email = '{DEMO_EMAIL}') as seeded \gset
\if :seeded
\echo Admin demo data already present, nothing to do.
\quit
\endif

begin;
"""


def main():
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    chat, chat_stats = build_chat(rng)
    admin, admin_stats = build_admin()
    (OUT / "chat.sql").write_text(chat, encoding="utf-8")
    (OUT / "admin.sql").write_text(admin, encoding="utf-8")
    print(f"chat.sql: {chat_stats}")
    print(f"admin.sql: {admin_stats}")


if __name__ == "__main__":
    main()
