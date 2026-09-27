create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  business_name text default 'My Business',
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opt_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(created_by,name)
);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key(contact_id,tag_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  template_name text,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.campaigns enable row level security;
alter table public.activity enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists contacts_owner on public.contacts;
create policy contacts_owner on public.contacts for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists tags_owner on public.tags;
create policy tags_owner on public.tags for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists contact_tags_owner on public.contact_tags;
create policy contact_tags_owner on public.contact_tags for all using (exists(select 1 from public.contacts c where c.id=contact_id and c.created_by=auth.uid())) with check (exists(select 1 from public.contacts c where c.id=contact_id and c.created_by=auth.uid()));

drop policy if exists campaigns_owner on public.campaigns;
create policy campaigns_owner on public.campaigns for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists activity_owner on public.activity;
create policy activity_owner on public.activity for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name) values(new.id,new.raw_user_meta_data->>'full_name'); return new; end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();


-- V1.1 CRM modules: message templates and campaign message content
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique(created_by,name)
);

alter table public.message_templates enable row level security;

drop policy if exists message_templates_owner on public.message_templates;
create policy message_templates_owner on public.message_templates
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

alter table public.campaigns add column if not exists message text;

