-- DEV ONLY: fake chat data in a LOCAL chat_db, so the moderation screens have something to show.
-- Run with psql from the repo root (the \copy reads shared/courses.csv), after chat-backend's migrations:
--   psql -d chat_db -f admin-backend/scripts/dev_chat_seed.sql
-- Never run it against a real chat database.

\copy courses (id, name) from 'shared/courses.csv' with (format csv, header, encoding 'UTF8')

insert into users (id, nickname) values
  ('11111111-1111-4111-8111-111111111111', 'spammer_dev'),
  ('22222222-2222-4222-8222-222222222222', 'reporter_one'),
  ('33333333-3333-4333-8333-333333333333', 'reporter_two'),
  ('44444444-4444-4444-8444-444444444444', 'polite_student');

insert into messages (course_id, user_id, content) values
  (20215, '11111111-1111-4111-8111-111111111111', 'הודעת ספאם לבדיקה: קנו פתרונות למטלות!'),
  (20215, '44444444-4444-4444-8444-444444444444', 'מישהו יודע מתי מתפרסם הממן הבא?'),
  (20250, '11111111-1111-4111-8111-111111111111', 'עוד הודעה מעצבנת לבדיקה');

-- Two reports on the first spam message, one on the second spam message and one on the polite one.
insert into reports (message_id, reporter_id)
select m.id, r.reporter_id
from messages m
join (values
  ('הודעת ספאם לבדיקה: קנו פתרונות למטלות!', '22222222-2222-4222-8222-222222222222'::uuid),
  ('הודעת ספאם לבדיקה: קנו פתרונות למטלות!', '33333333-3333-4333-8333-333333333333'::uuid),
  ('עוד הודעה מעצבנת לבדיקה',                 '22222222-2222-4222-8222-222222222222'::uuid),
  ('מישהו יודע מתי מתפרסם הממן הבא?',         '33333333-3333-4333-8333-333333333333'::uuid)
) as r(content, reporter_id) on r.content = m.content;
