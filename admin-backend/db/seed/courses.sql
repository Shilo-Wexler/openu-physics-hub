-- Loads the course list from shared/courses.csv into this DB's courses table.
-- Safe to run on every deploy, after the migrations: new courses are added and renamed
-- ones get the new name. A course is never deleted here, since inquiries may point to it.
-- The CSV is read from psql's standard input, so this works from any folder:
--   psql -d <admin_db> -v ON_ERROR_STOP=1 -f admin-backend/db/seed/courses.sql < shared/courses.csv

begin;

create temp table course_seed (
  course_id integer not null,
  name      text not null
) on commit drop;

\copy course_seed (course_id, name) from pstdin with (format csv, header, encoding 'UTF8')

insert into courses (course_number, name)
select course_id, trim(name) from course_seed
on conflict (course_number) do update set name = excluded.name
  where courses.name is distinct from excluded.name;

commit;