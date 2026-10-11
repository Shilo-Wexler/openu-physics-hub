-- Demo data for LOCAL DEVELOPMENT ONLY: fake users, reviews, replies, likes and ratings,
-- so the chat page can be tried before sign-in and posting exist in the frontend.
--
-- Never run in production. This file is not a migration and nothing runs it automatically.
-- Every demo user's nickname starts with "demo_"; re-running first removes the old demo data.
--
-- Run from the repo root (database name as in chat-backend/.env):
--   docker exec -i chat-db-test psql -U postgres -d postgres < chat-backend/dev/seed_demo.sql
-- Remove the demo data only:
--   docker exec -i chat-db-test psql -U postgres -d postgres -v cleanup_only=1 < chat-backend/dev/seed_demo.sql

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
-- One statement, so replies and the reviews they belong to go together.
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
  avatars text[] := array['atom', 'rocket', 'magnet', 'telescope',
                            'orbit', 'lightbulb', 'waves', 'satellite'];
  user_ids uuid[];
  main_course integer;
  demo_courses integer[];
  review_id bigint;
  review_at timestamptz;
  big_thread bigint;
  big_thread_at timestamptz;
  first_reply bigint;
  deleted_reply bigint;
  deleted_review bigint;
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
  answers text[] := array[
    'מסכים לגמרי',
    'אצלי זה היה בדיוק אותו דבר',
    'תודה, לא ידעתי',
    'יש לי סיכום, אשלח בפרטי',
    'זה תלוי מאוד במנחה'
  ];
  i integer;
  k integer;
begin
  -- Ids come from the nickname, so the same demo user gets the same id on every run.
  select array_agg(md5(n)::uuid order by ord) into user_ids
    from unnest(nicknames) with ordinality as t(n, ord);
  -- Each demo user gets a different avatar (keys from AVATARS in app/services/users.py).
  insert into users (id, nickname, avatar)
    select md5(n)::uuid, n, avatars[ord]
      from unnest(nicknames) with ordinality as t(n, ord);

  select array_agg(id order by id) into demo_courses
    from (select id from courses order by id limit 3) c;
  main_course := demo_courses[1];

  -- Main course: 65 reviews, more than one page of 50, one every 37 minutes.
  -- Every 7th review gets a few short replies, posted a few minutes after it.
  for i in 1..65 loop
    review_at := now() - (66 - i) * interval '37 minutes';
    insert into messages (course_id, user_id, content, created_at)
    values (main_course, user_ids[1 + i % 8], lines[1 + i % 10] || ' (' || i || ')', review_at)
    returning id into review_id;
    if i % 7 = 0 then
      for k in 1..(1 + i % 4) loop
        insert into messages (course_id, user_id, thread_id, content, created_at)
        values (main_course, user_ids[1 + (i + k) % 8], review_id, answers[1 + (i + k) % 5],
                review_at + k * interval '4 minutes');
      end loop;
    end if;
    if i = 60 then
      big_thread := review_id;
      big_thread_at := review_at;
    end if;
  end loop;

  -- One long discussion on a review of the first page: replies that answer the review,
  -- replies that quote other replies (WhatsApp style), and a quote of a deleted reply.
  insert into messages (course_id, user_id, thread_id, content, created_at)
  values (main_course, user_ids[2], big_thread, 'גם אני חושב ככה, במיוחד על הממ"ן השני',
          big_thread_at + interval '5 minutes')
  returning id into first_reply;
  insert into messages (course_id, user_id, thread_id, reply_to_id, content, created_at)
  values (main_course, user_ids[3], big_thread, first_reply, 'הממ"ן השני היה הכי ארוך בעיניי',
          big_thread_at + interval '9 minutes');
  insert into messages (course_id, user_id, thread_id, content, created_at, deleted_at, deleted_by)
  values (main_course, user_ids[4], big_thread, 'תגובה שנמחקה', big_thread_at + interval '12 minutes',
          big_thread_at + interval '13 minutes', 'author')
  returning id into deleted_reply;
  insert into messages (course_id, user_id, thread_id, reply_to_id, content, created_at)
  values (main_course, user_ids[5], big_thread, deleted_reply, 'ציטוט של תגובה שכבר נמחקה',
          big_thread_at + interval '14 minutes');
  for k in 1..6 loop
    insert into messages (course_id, user_id, thread_id, reply_to_id, content, created_at)
    values (main_course, user_ids[1 + k], big_thread, case when k % 3 = 0 then first_reply end,
            answers[1 + k % 5] || ' (' || k || ')', big_thread_at + (15 + k * 3) * interval '1 minute');
  end loop;

  -- The newest reviews show the other special cases on the first page.
  insert into messages (course_id, user_id, content, created_at, edited_at)
  values (main_course, user_ids[3], 'הביקורת הזו נערכה אחרי שנשלחה', now() - interval '20 minutes',
          now() - interval '18 minutes');

  -- A deleted review with an active reply: the list shows it as "deleted" with its reply.
  insert into messages (course_id, user_id, content, created_at, deleted_at, deleted_by)
  values (main_course, user_ids[4], 'ביקורת שנמחקה', now() - interval '15 minutes',
          now() - interval '11 minutes', 'author')
  returning id into deleted_review;
  insert into messages (course_id, user_id, thread_id, content, created_at)
  values (main_course, user_ids[5], deleted_review, 'תגובה לביקורת שנמחקה אחר כך', now() - interval '12 minutes');

  insert into messages (course_id, user_id, content, created_at)
  values (main_course, user_ids[6], 'A review in English, to check left-to-right text.', now() - interval '8 minutes');

  insert into messages (course_id, user_id, content, created_at)
  values (main_course, user_ids[7],
          E'סיכום קצר שלי על הקורס:\n\n1. הממ"נים לוקחים זמן, כדאי להתחיל מוקדם.\n2. המפגשים לא חובה אבל עוזרים.\n3. בבחינה יש בחירה בין שאלות.\n\nבהצלחה לכולם!',
          now() - interval '3 minutes');

  -- The next two courses: a few reviews each, no replies.
  for i in 1..5 loop
    insert into messages (course_id, user_id, content, created_at)
    values (demo_courses[2], user_ids[1 + i], lines[i], now() - i * interval '3 hours'),
           (demo_courses[3], user_ids[2 + i], lines[10 - i], now() - i * interval '1 day');
  end loop;

  -- Likes: a fixed pattern that gives each message 0 to 8 likes, so sorting by top shows a clear order.
  insert into likes (user_id, message_id)
    select user_ids[u], m.id
      from messages m, generate_series(1, 8) as u
     where m.user_id = any (user_ids) and m.deleted_at is null and u <= (m.id * 7) % 9;

  -- The backend keeps like_count in step with each like; here it is set once for all.
  update messages m
     set like_count = (select count(*) from likes l where l.message_id = m.id)
   where m.user_id = any (user_ids);

  -- Ratings: every demo user rates the three courses once, with varied scores.
  insert into ratings (user_id, course_id, difficulty, recommendation)
    select user_ids[u], c, 1 + (u + c) % 5, 1 + (u * 2 + c) % 5
      from generate_series(1, 8) as u, unnest(demo_courses) as c;
end
$$;

commit;

select c.id as course_id, c.name,
       count(*) filter (where m.thread_id is null)     as demo_reviews,
       count(*) filter (where m.thread_id is not null) as demo_replies
  from courses c
  join messages m on m.course_id = c.id
  join users u on u.id = m.user_id and u.nickname like 'demo\_%'
 group by c.id, c.name
 order by c.id;
