-- Demo data for LOCAL DEVELOPMENT ONLY: fake users, messages, likes and ratings,
-- so the chat page can be tried before sign-in and posting exist in the frontend.
--
-- Never run in production. This file is not a migration and nothing runs it automatically.
-- Every demo user's nickname starts with "demo_"; re-running first removes the old demo data.
--
-- Run from the repo root (database name as in chat-backend/.env):
--   docker exec -i chat-db-test psql -U postgres -d chat < chat-backend/dev/seed_demo.sql
-- Remove the demo data only:
--   docker exec -i chat-db-test psql -U postgres -d chat -v cleanup_only=1 < chat-backend/dev/seed_demo.sql

\set ON_ERROR_STOP on

begin;

-- ---- Cleanup: everything made by or attached to demo users ----------------

create temp table demo_users on commit drop as
  select id from users where nickname like 'demo\_%';

delete from likes
 where user_id in (select id from demo_users)
    or message_id in (select id from messages where user_id in (select id from demo_users));
delete from reports
 where reporter_id in (select id from demo_users)
    or message_id in (select id from messages where user_id in (select id from demo_users));
delete from ratings where user_id in (select id from demo_users);
delete from messages where user_id in (select id from demo_users);
delete from users where id in (select id from demo_users);

\if :{?cleanup_only}
commit;
\echo 'demo data removed'
\quit
\endif

-- ---- Seed ------------------------------------------------------------------

do $$
declare
  nicknames text[] := array['demo_dana', 'demo_yossi', 'demo_noa', 'demo_amit',
                            'demo_maya', 'demo_omer', 'demo_shira', 'demo_eitan'];
  user_ids uuid[];
  main_course integer;
  demo_courses integer[];
  msg_id bigint;
  quoted_id bigint;
  deleted_id bigint;
  lines text[] := array[
    'מישהו יודע מתי מתפרסמים ציוני הממ"ן?',
    'המנחה בקבוצה של יום שלישי מסביר מעולה, ממליץ',
    'יחידה 3 הייתה הכי קשה בעיניי, שווה להשקיע בה זמן',
    'יש למישהו סיכום של הפרק על תנע זוויתי?',
    'הבחינה הייתה הוגנת, בעיקר שאלות בסגנון הממ"נים',
    'כדאי לפתור את השאלות מהבחינות הקודמות, חוזרות הרבה',
    'למי שמתלבט: הקורס דורש בערך 12 שעות בשבוע',
    'תודה רבה! זה עזר לי מאוד',
    'הספר קצת יבש, אבל ההרצאות המוקלטות מצוינות',
    'מישהו רוצה ללמוד יחד לקראת מועד א?'
  ];
  i integer;
begin
  -- Ids come from the nickname, so the same demo user gets the same id on every run.
  select array_agg(md5(n)::uuid order by ord) into user_ids
    from unnest(nicknames) with ordinality as t(n, ord);
  insert into users (id, nickname)
    select md5(n)::uuid, n from unnest(nicknames) as n;

  select array_agg(id order by id) into demo_courses
    from (select id from courses order by id limit 3) c;
  main_course := demo_courses[1];

  -- Main course: 65 messages, more than one page of 50, one every 37 minutes.
  for i in 1..65 loop
    insert into messages (course_id, user_id, content, created_at)
    values (main_course,
            user_ids[1 + i % 8],
            lines[1 + i % 10] || ' (' || i || ')',
            now() - (66 - i) * interval '37 minutes')
    returning id into msg_id;
    if i = 60 then
      quoted_id := msg_id;
    end if;
  end loop;

  -- The newest messages show the special cases on the first page.
  insert into messages (course_id, user_id, reply_to_id, content, created_at)
  values (main_course, user_ids[2], quoted_id, 'מסכים לגמרי, גם אני מצאתי את זה', now() - interval '25 minutes');

  insert into messages (course_id, user_id, content, created_at, edited_at)
  values (main_course, user_ids[3], 'ההודעה הזו נערכה אחרי שנשלחה', now() - interval '20 minutes',
          now() - interval '18 minutes');

  insert into messages (course_id, user_id, content, created_at, deleted_at, deleted_by)
  values (main_course, user_ids[4], 'הודעה שנמחקה', now() - interval '15 minutes',
          now() - interval '14 minutes', 'author')
  returning id into deleted_id;
  insert into messages (course_id, user_id, reply_to_id, content, created_at)
  values (main_course, user_ids[5], deleted_id, 'תגובה להודעה שכבר נמחקה', now() - interval '12 minutes');

  insert into messages (course_id, user_id, content, created_at)
  values (main_course, user_ids[6], 'A message in English, to check left-to-right text.', now() - interval '8 minutes');

  insert into messages (course_id, user_id, content, created_at)
  values (main_course, user_ids[7],
          E'סיכום קצר שלי על הקורס:\n\n1. הממ"נים לוקחים זמן, כדאי להתחיל מוקדם.\n2. המפגשים לא חובה אבל עוזרים.\n3. בבחינה יש בחירה בין שאלות.\n\nבהצלחה לכולם!',
          now() - interval '3 minutes');

  -- The next two courses: a few messages each.
  for i in 1..5 loop
    insert into messages (course_id, user_id, content, created_at)
    values (demo_courses[2], user_ids[1 + i], lines[i], now() - i * interval '3 hours'),
           (demo_courses[3], user_ids[2 + i], lines[10 - i], now() - i * interval '1 day');
  end loop;

  -- Likes: a fixed pattern, so counts differ between messages.
  insert into likes (user_id, message_id)
    select user_ids[u], m.id
      from messages m, generate_series(1, 8) as u
     where m.user_id = any (user_ids) and m.deleted_at is null and (m.id + u) % 3 = 0;

  -- Ratings: every demo user rates the three courses once, with varied scores.
  insert into ratings (user_id, course_id, difficulty, recommendation)
    select user_ids[u], c, 1 + (u + c) % 5, 1 + (u * 2 + c) % 5
      from generate_series(1, 8) as u, unnest(demo_courses) as c;
end
$$;

commit;

select c.id as course_id, c.name, count(m.id) as demo_messages
  from courses c
  join messages m on m.course_id = c.id
  join users u on u.id = m.user_id and u.nickname like 'demo\_%'
 group by c.id, c.name
 order by c.id;