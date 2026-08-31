create table public.processing_runs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  filename text not null check (length(filename) between 1 and 255),
  file_path text not null unique,
  mime_type text not null,
  course text not null check (length(course) between 1 and 120),
  section text not null check (length(section) between 1 and 80),
  exam text not null check (length(exam) between 1 and 120),
  max_score numeric not null check (max_score > 0 and max_score <= 500),
  source_kind text not null check (source_kind in ('csv', 'pdf')),
  extraction_method text not null check (extraction_method in ('csv', 'pdf-text', 'pdf-ocr')),
  status text not null default 'review' check (status in ('review', 'approved')),
  total_records integer not null default 0 check (total_records >= 0),
  verified_records integer not null default 0 check (verified_records >= 0),
  flagged_records integer not null default 0 check (flagged_records >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mark_records (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  run_id uuid not null references public.processing_runs(id) on delete cascade,
  position integer not null check (position >= 0),
  roll_number text not null,
  student_name text not null,
  score numeric,
  max_score numeric not null check (max_score > 0 and max_score <= 500),
  confidence numeric not null check (confidence between 0 and 1),
  status text not null check (status in ('verified', 'flagged', 'approved')),
  issue text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, position)
);

create index processing_runs_owner_created_idx on public.processing_runs(owner_id, created_at desc);
create index mark_records_run_position_idx on public.mark_records(run_id, position);

alter table public.processing_runs enable row level security;
alter table public.mark_records enable row level security;

create policy "Faculty can read their runs"
on public.processing_runs for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Faculty can create their runs"
on public.processing_runs for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Faculty can update their runs"
on public.processing_runs for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Faculty can delete their runs"
on public.processing_runs for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "Faculty can read their records"
on public.mark_records for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Faculty can create records in their runs"
on public.mark_records for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.processing_runs
    where processing_runs.id = run_id and processing_runs.owner_id = (select auth.uid())
  )
);

create policy "Faculty can update their records"
on public.mark_records for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.processing_runs
    where processing_runs.id = run_id and processing_runs.owner_id = (select auth.uid())
  )
);

create policy "Faculty can delete their records"
on public.mark_records for delete to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marksheets', 'marksheets', false, 10485760, array['text/csv', 'application/vnd.ms-excel', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Faculty can upload their source files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'marksheets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Faculty can read their source files"
on storage.objects for select to authenticated
using (
  bucket_id = 'marksheets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Faculty can delete their source files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'marksheets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
