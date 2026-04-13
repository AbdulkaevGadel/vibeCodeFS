-- Wave 2 verification: managers
-- Run manually after wave-2-backfill-managers.sql

-- =========================================================
-- 1. Expected manager count vs actual table count
-- =========================================================

with approved_manager_roles as (
  select *
  from (
    values
      ('57d97ebe-1a63-4860-bd31-7533c8cb0dc7'::uuid, 'admin'::text),
      ('efe7f751-a837-4030-a93f-3d58cdd1ef98'::uuid, 'supervisor'::text),
      ('06b80191-6286-4965-9fb8-f784fc09ee2c'::uuid, 'supervisor'::text),
      ('3418952f-ef57-4331-9096-73f159e70091'::uuid, 'support'::text)
  ) as t(auth_user_id, role)
)
select
  (
    select count(*)
    from approved_manager_roles
  ) as expected_manager_count,
  (
    select count(*)
    from public.managers
  ) as managers_table_count;

-- =========================================================
-- 2. Exact manager mapping verification
-- =========================================================

with approved_manager_roles as (
  select *
  from (
    values
      ('57d97ebe-1a63-4860-bd31-7533c8cb0dc7'::uuid, 'admin'::text),
      ('efe7f751-a837-4030-a93f-3d58cdd1ef98'::uuid, 'supervisor'::text),
      ('06b80191-6286-4965-9fb8-f784fc09ee2c'::uuid, 'supervisor'::text),
      ('3418952f-ef57-4331-9096-73f159e70091'::uuid, 'support'::text)
  ) as t(auth_user_id, role)
),
expected_managers as (
  select
    au.id as auth_user_id,
    au.email,
    coalesce(
      nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
      au.email
    ) as display_name,
    amr.role
  from approved_manager_roles amr
  inner join auth.users au
    on au.id = amr.auth_user_id
)
select
  em.auth_user_id,
  em.email as expected_email,
  m.email as actual_email,
  em.display_name as expected_display_name,
  m.display_name as actual_display_name,
  em.role as expected_role,
  m.role as actual_role
from expected_managers em
left join public.managers m
  on m.auth_user_id = em.auth_user_id
where m.id is null
   or m.email is distinct from em.email
   or m.display_name is distinct from em.display_name
   or m.role is distinct from em.role
order by em.role, em.auth_user_id;

-- =========================================================
-- 3. Unexpected managers outside the approved mapping
-- =========================================================

with approved_manager_roles as (
  select *
  from (
    values
      ('57d97ebe-1a63-4860-bd31-7533c8cb0dc7'::uuid, 'admin'::text),
      ('efe7f751-a837-4030-a93f-3d58cdd1ef98'::uuid, 'supervisor'::text),
      ('06b80191-6286-4965-9fb8-f784fc09ee2c'::uuid, 'supervisor'::text),
      ('3418952f-ef57-4331-9096-73f159e70091'::uuid, 'support'::text)
  ) as t(auth_user_id, role)
)
select
  m.id,
  m.auth_user_id,
  m.email,
  m.display_name,
  m.role,
  m.created_at,
  m.updated_at
from public.managers m
left join approved_manager_roles amr
  on amr.auth_user_id = m.auth_user_id
where amr.auth_user_id is null
order by m.created_at, m.auth_user_id;
