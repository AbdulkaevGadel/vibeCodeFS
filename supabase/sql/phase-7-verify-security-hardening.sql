-- Phase 7 verification: RLS and RPC security hardening
-- Run manually in Supabase SQL Editor after applying migration:
-- supabase/migrations/20260422090000_phase_7_security_hardening.sql
--
-- This file is read-only. Expected problem counts should be 0.

-- 1. RLS must be enabled on all core support tables.
with core_tables(table_name) as (
  values
    ('clients'),
    ('managers'),
    ('chats'),
    ('chat_messages'),
    ('chat_assignments'),
    ('assignment_history'),
    ('chat_status_history')
)
select
  ct.table_name,
  c.relrowsecurity as rls_enabled
from core_tables ct
join pg_class c
  on c.relname = ct.table_name
join pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
order by ct.table_name;

-- 2. Core SELECT policies must require a current manager.
with core_tables(table_name) as (
  values
    ('clients'),
    ('managers'),
    ('chats'),
    ('chat_messages'),
    ('chat_assignments'),
    ('assignment_history'),
    ('chat_status_history')
)
select
  p.tablename,
  p.policyname,
  p.cmd,
  p.qual
from pg_policies p
join core_tables ct
  on ct.table_name = p.tablename
where p.schemaname = 'public'
  and p.cmd = 'SELECT'
order by p.tablename, p.policyname;

-- Expected: 0 rows. Broad SELECT policies must not remain.
with core_tables(table_name) as (
  values
    ('clients'),
    ('managers'),
    ('chats'),
    ('chat_messages'),
    ('chat_assignments'),
    ('assignment_history'),
    ('chat_status_history')
)
select
  p.tablename,
  p.policyname,
  p.qual
from pg_policies p
join core_tables ct
  on ct.table_name = p.tablename
where p.schemaname = 'public'
  and p.cmd = 'SELECT'
  and (
    p.qual = 'true'
    or p.qual not ilike '%get_current_manager_id_safe_v1%'
  )
order by p.tablename, p.policyname;

-- 3. Core tables should not expose permissive direct write policies to authenticated users.
-- Explicit false/deny policies are acceptable if they were created earlier.
-- Expected: 0 rows.
with core_tables(table_name) as (
  values
    ('clients'),
    ('managers'),
    ('chats'),
    ('chat_messages'),
    ('chat_assignments'),
    ('assignment_history'),
    ('chat_status_history')
)
select
  p.tablename,
  p.policyname,
  p.cmd,
  p.permissive,
  p.roles,
  p.qual,
  p.with_check
from pg_policies p
join core_tables ct
  on ct.table_name = p.tablename
where p.schemaname = 'public'
  and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  and p.permissive = 'PERMISSIVE'
  and 'authenticated' = any(p.roles)
  and not (
    (p.cmd = 'INSERT' and lower(coalesce(p.with_check, '')) in ('false', '(false)'))
    or (p.cmd = 'UPDATE' and lower(coalesce(p.qual, '')) in ('false', '(false)') and lower(coalesce(p.with_check, '')) in ('false', '(false)'))
    or (p.cmd = 'DELETE' and lower(coalesce(p.qual, '')) in ('false', '(false)'))
  )
order by p.tablename, p.cmd, p.policyname;

-- 4. Admin delete RPCs must be SECURITY DEFINER and must pin search_path to public.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_message', 'delete_chat_admin')
order by p.proname, arguments;

-- Expected: 0 rows.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_message', 'delete_chat_admin')
  and (
    p.prosecdef is not true
    or p.proconfig is null
    or not ('search_path=public' = any(p.proconfig))
  )
order by p.proname, arguments;

-- 5. Helper used by RLS should be stable, SECURITY DEFINER, and search_path protected.
select
  p.proname,
  p.provolatile as volatility,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_current_manager_id_safe_v1';
