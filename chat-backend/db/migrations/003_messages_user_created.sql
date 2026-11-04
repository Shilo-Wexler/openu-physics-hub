-- Posting limits count a user's messages in the last minute and hour
-- (app/services/messages.py). This index serves that count and every lookup by user
-- (account purge), so it replaces messages_user_idx.
create index messages_user_created_idx on messages (user_id, created_at);
drop index messages_user_idx;