-- Branding logo storage bucket + owner-scoped policies.
-- Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding-logos',
  'branding-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop and recreate policies so re-runs are idempotent.
drop policy if exists "branding_logos_select_public" on storage.objects;
drop policy if exists "branding_logos_insert_own" on storage.objects;
drop policy if exists "branding_logos_update_own" on storage.objects;
drop policy if exists "branding_logos_delete_own" on storage.objects;

create policy "branding_logos_select_public"
  on storage.objects for select
  using (bucket_id = 'branding-logos');

create policy "branding_logos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'branding-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "branding_logos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'branding-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'branding-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "branding_logos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'branding-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
