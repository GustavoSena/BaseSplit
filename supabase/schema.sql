-- BaseSplit Database Schema
-- Run this SQL to set up all tables and RLS policies

-- Extensions (for gen_random_uuid)
create extension if not exists pgcrypto;

-- =========================
-- PROFILES (user DB)
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text unique not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  history_filter_default text not null default 'all' check (history_filter_default in ('all', 'contacts-only', 'external-only')),
  constraint profiles_wallet_lowercase check (wallet_address = lower(wallet_address))
);

alter table public.profiles enable row level security;

do $$ begin
  create policy "profiles_select_own"
    on public.profiles for select
    to authenticated
    using (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_insert_own"
    on public.profiles for insert
    to authenticated
    with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_update_own"
    on public.profiles for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- =========================
-- CONTACTS (address book)
-- =========================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_wallet_address text not null,
  label text not null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_wallet_lowercase check (contact_wallet_address = lower(contact_wallet_address)),
  constraint contacts_owner_contact_unique unique (owner_id, contact_wallet_address)
);

alter table public.contacts enable row level security;

do $$ begin
  create policy "contacts_select_own"
    on public.contacts for select
    to authenticated
    using (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "contacts_insert_own"
    on public.contacts for insert
    to authenticated
    with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "contacts_update_own"
    on public.contacts for update
    to authenticated
    using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "contacts_delete_own"
    on public.contacts for delete
    to authenticated
    using (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- =========================
-- PAYMENT REQUESTS
-- =========================
do $$ begin
  create type public.payment_request_status as enum ('pending', 'paid', 'cancelled', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,

  payer_wallet_address text not null,
  token_address text not null default '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', -- USDC Base mainnet (lowercase)
  chain_id int not null default 8453,

  amount bigint not null check (amount > 0), -- USDC micro-units (6 decimals)
  memo text null,

  status public.payment_request_status not null default 'pending',
  tx_hash text null,
  expires_at timestamptz null,
  paid_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_requests_payer_lowercase check (payer_wallet_address = lower(payer_wallet_address))
);

create index if not exists payment_requests_requester_id_idx on public.payment_requests (requester_id);
create index if not exists payment_requests_payer_wallet_idx on public.payment_requests (payer_wallet_address);
create index if not exists payment_requests_status_idx on public.payment_requests (status);

alter table public.payment_requests enable row level security;

-- Helper predicate: is the current authed user the payer?
create or replace function public.is_current_user_wallet(addr text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wallet_address = addr
  );
$$;

-- SELECT: requester OR payer can read
do $$ begin
  create policy "payment_requests_select_requester_or_payer"
    on public.payment_requests for select
    to authenticated
    using (
      auth.uid() = requester_id
      or public.is_current_user_wallet(payer_wallet_address)
    );
exception when duplicate_object then null; end $$;

-- INSERT: only requester can create
do $$ begin
  create policy "payment_requests_insert_requester"
    on public.payment_requests for insert
    to authenticated
    with check (auth.uid() = requester_id);
exception when duplicate_object then null; end $$;

-- UPDATE: requester OR payer can update (MVP)
do $$ begin
  create policy "payment_requests_update_requester_or_payer"
    on public.payment_requests for update
    to authenticated
    using (
      auth.uid() = requester_id
      or public.is_current_user_wallet(payer_wallet_address)
    )
    with check (
      auth.uid() = requester_id
      or public.is_current_user_wallet(payer_wallet_address)
    );
exception when duplicate_object then null; end $$;

-- DELETE: requester only
do $$ begin
  create policy "payment_requests_delete_requester"
    on public.payment_requests for delete
    to authenticated
    using (auth.uid() = requester_id);
exception when duplicate_object then null; end $$;

-- =========================
-- UPDATED_AT triggers
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_set_updated_at on public.contacts;
create trigger trg_contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists trg_payment_requests_set_updated_at on public.payment_requests;
create trigger trg_payment_requests_set_updated_at
before update on public.payment_requests
for each row execute function public.set_updated_at();
