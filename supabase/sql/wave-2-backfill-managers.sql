-- Wave 2 backfill: managers
-- Purpose:
-- populate public.managers from auth.users
-- using the approved business role mapping from the project plan.
--
-- This is a manual data step, not a migration.
-- Run after wave-2-precheck.sql.

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
manager_source as (
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
insert into public.managers (
  auth_user_id,
  email,
  display_name,
  role
)
select
  ms.auth_user_id,
  ms.email,
  ms.display_name,
  ms.role
from manager_source ms
on conflict (auth_user_id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  role = excluded.role,
  updated_at = now();
