-- Fari Money Assistant — Supabase setup
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists public.money_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.money_profiles enable row level security;

drop policy if exists "Users can view their own money profile" on public.money_profiles;
create policy "Users can view their own money profile"
on public.money_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own money profile" on public.money_profiles;
create policy "Users can insert their own money profile"
on public.money_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own money profile" on public.money_profiles;
create policy "Users can update their own money profile"
on public.money_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own money profile" on public.money_profiles;
create policy "Users can delete their own money profile"
on public.money_profiles for delete
using (auth.uid() = user_id);

create or replace function public.set_money_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_money_profiles_updated_at on public.money_profiles;
create trigger trg_money_profiles_updated_at
before update on public.money_profiles
for each row execute function public.set_money_profiles_updated_at();
