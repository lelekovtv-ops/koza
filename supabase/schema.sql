-- Таблица проектов
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Таблица скриптов
create table scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text default 'UNTITLED',
  author text default '',
  draft text default 'First Draft',
  scenario text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Таблица файлов библиотеки
create table library_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  type text not null,
  mime_type text,
  size bigint,
  storage_path text,
  thumbnail_path text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS политики
alter table projects enable row level security;
alter table scripts enable row level security;
alter table library_files enable row level security;

create policy "Users can CRUD own projects"
  on projects for all using (auth.uid() = user_id);

create policy "Users can CRUD own scripts"
  on scripts for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

create policy "Users can CRUD own files"
  on library_files for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );
