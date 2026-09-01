create table if not exists public.library_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"prompts":[],"topics":[],"trash":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.library_state enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.library_state to authenticated;

create policy "Owner can read library"
on public.library_state for select
to authenticated
using (auth.uid() = user_id);

create policy "Owner can create library"
on public.library_state for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Owner can update library"
on public.library_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Owner can delete library"
on public.library_state for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prompt-previews',
  'prompt-previews',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Owner can read previews"
on storage.objects for select
to authenticated
using (
  bucket_id = 'prompt-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owner can upload previews"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'prompt-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owner can replace previews"
on storage.objects for update
to authenticated
using (
  bucket_id = 'prompt-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'prompt-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owner can delete previews"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'prompt-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);
