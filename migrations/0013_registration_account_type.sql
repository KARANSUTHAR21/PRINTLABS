-- Signup intent is stored separately from the access-control role. A vendor
-- registration remains a USER until the existing Admin-reviewed application
-- workflow grants the VENDOR role.
alter table user_profiles
  add column if not exists account_type text not null default 'CUSTOMER';
alter table user_profiles
  add column if not exists account_type_selected boolean not null default false;

-- Existing users keep their current intent; pending/approved applicants and
-- existing vendors remain on the vendor path after this migration.
update user_profiles
set account_type = 'VENDOR'
where role = 'VENDOR'
   or exists (select 1 from vendor_applications a where a.user_id = user_profiles.user_id);
update user_profiles set account_type_selected = true;

alter table user_profiles drop constraint if exists user_profiles_account_type_chk;
alter table user_profiles add constraint user_profiles_account_type_chk
  check (account_type in ('CUSTOMER', 'VENDOR'));

alter table registration_otps
  add column if not exists account_type text not null default 'CUSTOMER';

alter table registration_otps drop constraint if exists registration_otps_account_type_chk;
alter table registration_otps add constraint registration_otps_account_type_chk
  check (account_type in ('CUSTOMER', 'VENDOR'));
