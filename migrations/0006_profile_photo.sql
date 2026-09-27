-- Profile photo (spec request: optional avatar on the user profile).
-- Stored as a data URL (client downscales to 256px JPEG, tens of KB) so the
-- column works identically on Neon/Supabase and local PGLite with no file
-- storage dependency.

alter table user_profiles add column if not exists photo_url text;
