-- =====================================================================
--  계정 시스템 스키마 (Supabase Auth 연동) — profiles / favorites
--  실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
--  코치 지정: sunwooryong@gmail.com 은 가입 시 자동으로 coach + 승인됨.
-- =====================================================================

-- 프로필: auth.users 1:1
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  role          text not null default 'athlete' check (role in ('coach','athlete')),
  display_name  text,
  requested_key text,        -- 선수가 신청한 본인 식별키(이름|출생연도|성별)
  athlete_key   text,        -- 코치 승인 후 연결된 식별키 (null=미연결)
  approved      boolean not null default false,
  created_at    timestamptz default now()
);

-- 즐겨찾기: 사용자당 1행(그룹/항목을 jsonb 로 통째 저장)
create table if not exists public.favorites (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 코치 여부 확인 함수 (RLS 재귀 방지 위해 security definer)
create or replace function public.is_coach(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'coach');
$$;

alter table public.profiles  enable row level security;
alter table public.favorites enable row level security;

-- profiles 정책
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_coach_update on public.profiles;
create policy profiles_read   on public.profiles for select
  using (auth.uid() = id or public.is_coach(auth.uid()));
create policy profiles_insert on public.profiles for insert
  with check (auth.uid() = id);
create policy profiles_update on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_coach_update on public.profiles for update
  using (public.is_coach(auth.uid()));

-- favorites 정책 (본인 것만)
drop policy if exists favorites_all on public.favorites;
create policy favorites_all on public.favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 가입 시 프로필 자동 생성 (코치 이메일은 자동 coach)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role, approved)
  values (
    new.id, new.email,
    case when new.email = 'sunwooryong@gmail.com' then 'coach' else 'athlete' end,
    case when new.email = 'sunwooryong@gmail.com' then true  else false end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
