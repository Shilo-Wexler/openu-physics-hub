-- Loads the course list from shared/courses.csv into this DB's courses table.
-- Safe to run on every deploy, after the migrations: new courses are added and renamed
-- ones get the new name. A course is never deleted here, since messages and ratings may point to it.
-- The CSV is read from psql's standard input, so this works from any folder:
--   psql -d <chat_db> -v ON_ERROR_STOP=1 -f chat-backend/db/seed/courses.sql < shared/courses.csv

begin;

create temp table course_seed (
  course_id integer not null,
  name      text not null
) on commit drop;

\copy course_seed (course_id, name) from pstdin with (format csv, header, encoding 'UTF8')

insert into courses (id, name)
select course_id, trim(name) from course_seed
on conflict (id) do update set name = excluded.name
  where courses.name is distinct from excluded.name;

commit;