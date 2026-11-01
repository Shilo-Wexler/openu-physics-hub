-- Optional contact details for an inquiry that is not anonymous.
-- An inquiry with all three columns null is anonymous (the default; no flag column is needed).
-- The backend normalizes the values first (trims, keeps only digits and a leading + in the phone,
-- lowercases the email). A name is optional, but it never comes alone: a way to reply
-- (phone or email) is required, here and in the backend.
-- The DB enforces only the stored shapes, so an empty string can never be saved.

alter table inquiries
  add column contact_name  text check (length(contact_name) between 1 and 100
                                       and contact_name = trim(contact_name)),
  add column contact_phone text check (contact_phone ~ '^\+?[0-9]{7,15}$'),
  add column contact_email text check (length(contact_email) <= 254
                                       and contact_email = lower(trim(contact_email))
                                       and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add constraint inquiries_contact_reachable
    check (contact_name is null or contact_phone is not null or contact_email is not null);