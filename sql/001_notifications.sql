-- Notifications table for in-app notification system.
-- Run this in Supabase SQL editor.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  type text not null,
  title text not null,
  body text,
  lead_id uuid references leads(id) on delete set null,
  action_id uuid references ai_actions(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Fast unread queries: WHERE client_id = ? AND read_at IS NULL ORDER BY created_at DESC
create index idx_notifications_client_unread
  on notifications (client_id, read_at, created_at desc);

-- RLS: scope to user's client_id from app_metadata.
-- Set client_id on the user via: supabase auth admin updateUserById(uid, { app_metadata: { client_id: '...' } })
alter table notifications enable row level security;

create policy "Users can read own client notifications"
  on notifications for select
  to authenticated
  using (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));

create policy "Users can insert own client notifications"
  on notifications for insert
  to authenticated
  with check (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));

create policy "Users can update own client notifications"
  on notifications for update
  to authenticated
  using (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));

create policy "Users can delete own client notifications"
  on notifications for delete
  to authenticated
  using (client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id'));
