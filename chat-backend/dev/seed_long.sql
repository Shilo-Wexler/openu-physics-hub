-- Dev only: long messages for checking how the chat displays them.
-- Adds a set to the busiest course and to the general chat (course 0),
-- written by existing users, so run seed_demo.sql first.
-- Each run adds a new set; nothing is changed or removed.
do $$
declare
  author    uuid;
  replier   uuid;
  busiest   integer;
  c         integer;
  long_id   bigint;
  word_id   bigint;
  lines_id  bigint;
  reply_id  bigint;
  sentence  text := 'זו הודעה ארוכה במיוחד שנועדה לבדוק איך הצ''אט מציג טקסט ארוך. ';
  mixed     text := 'הקורס 20215 (Physics I) is great, ממליץ מאוד on the labs, especially Newton''s laws. ';
begin
  select id into author from users order by created_at limit 1;
  select id into replier from users order by created_at desc limit 1;
  select course_id into busiest from messages
   where course_id <> 0
   group by course_id order by count(*) desc limit 1;
  if author is null or busiest is null then
    raise exception 'no users or course messages yet: run seed_demo.sql first';
  end if;

  foreach c in array array[busiest, 0] loop
    -- The longest text allowed (4000 characters).
    insert into messages (course_id, user_id, content)
    values (c, author, left(repeat(sentence, 100), 4000))
    returning id into long_id;

    -- One long word with no spaces, Hebrew and English.
    insert into messages (course_id, user_id, content)
    values (c, author, 'מילה ארוכה: ' || repeat('מילהארוכהבליםרווחים', 15) || ' ' || repeat('Supercalifragilistic', 15))
    returning id into word_id;

    -- A long link.
    insert into messages (course_id, user_id, content)
    values (c, author, 'הסיכום כאן: https://www.openu.ac.il/courses/' || repeat('a1b2c3d4e5', 30) || '?ref=summary&page=12');

    -- Many short lines.
    insert into messages (course_id, user_id, content)
    select c, author, string_agg('שורה ' || g, E'\n' order by g)
      from generate_series(1, 50) g
    returning id into lines_id;

    -- Hebrew and English mixed in one paragraph.
    insert into messages (course_id, user_id, content)
    values (c, author, repeat(mixed, 12));

    -- Replies: short reply quoting the 4000-character message.
    insert into messages (course_id, user_id, thread_id, reply_to_id, content)
    values (c, replier, long_id, long_id, 'מסכים לגמרי!');

    -- A 4000-character reply, then a reply that quotes it.
    insert into messages (course_id, user_id, thread_id, content)
    values (c, replier, long_id, left(repeat(sentence, 100), 4000))
    returning id into reply_id;
    insert into messages (course_id, user_id, thread_id, reply_to_id, content)
    values (c, author, long_id, reply_id, 'תגובה לציטוט של תגובה ארוכה');

    -- Replies quoting the long word and the many lines.
    insert into messages (course_id, user_id, thread_id, reply_to_id, content)
    values (c, replier, word_id, word_id, 'ציטוט של מילה ארוכה');
    insert into messages (course_id, user_id, thread_id, reply_to_id, content)
    values (c, replier, lines_id, lines_id, 'ציטוט של הרבה שורות');
  end loop;
end;
$$;