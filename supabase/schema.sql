-- CineScout database. Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- movie_key is "tmdb:<id>" for TMDB movies or "ia:<identifier>" for Internet Archive films.

-- Profiles: public display names for members.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Favorites ("My List").
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_key text not null check (char_length(movie_key) <= 200),
  title text not null check (char_length(title) <= 300),
  poster text check (char_length(poster) <= 500),
  href text not null check (char_length(href) <= 300),
  created_at timestamptz not null default now(),
  primary key (user_id, movie_key)
);

-- Ratings, 1 to 5 stars, one per member per movie.
create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_key text not null check (char_length(movie_key) <= 200),
  score smallint not null check (score between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_key)
);

-- Comments from members and guests.
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  movie_key text not null check (char_length(movie_key) <= 200),
  user_id uuid default auth.uid() references auth.users on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  is_guest boolean not null default false,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_movie_idx on public.comments (movie_key, created_at desc);

create or replace view public.rating_stats with (security_invoker = true) as
  select movie_key, round(avg(score)::numeric, 1) as average, count(*)::int as total
  from public.ratings group by movie_key;

-- New members get a profile using the name they signed up with.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)), 40))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members always comment under their profile name. Guests are throttled to limit spam.
create or replace function public.prepare_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.user_id is not null then
    new.is_guest := false;
    select display_name into new.author_name from public.profiles where id = new.user_id;
    new.author_name := coalesce(new.author_name, 'Member');
  else
    new.is_guest := true;
    new.author_name := trim(new.author_name);
    if (select count(*) from public.comments
        where is_guest and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Too many guest comments right now. Please try again later or sign in.';
    end if;
  end if;
  new.body := trim(new.body);
  return new;
end $$;

drop trigger if exists comments_prepare on public.comments;
create trigger comments_prepare before insert on public.comments
  for each row execute function public.prepare_comment();

-- Row level security: everyone can read; people can only change their own data.
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings are public" on public.ratings;
create policy "ratings are public" on public.ratings for select using (true);
drop policy if exists "add own rating" on public.ratings;
create policy "add own rating" on public.ratings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "change own rating" on public.ratings;
create policy "change own rating" on public.ratings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "remove own rating" on public.ratings;
create policy "remove own rating" on public.ratings for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select using (true);
drop policy if exists "members comment" on public.comments;
create policy "members comment" on public.comments for insert to authenticated
  with check (user_id = auth.uid() and not is_guest);
drop policy if exists "guests comment" on public.comments;
create policy "guests comment" on public.comments for insert to anon
  with check (user_id is null and is_guest);
drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());

grant select on public.profiles, public.ratings, public.comments, public.rating_stats to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant insert, update, delete on public.ratings to authenticated;
grant insert on public.comments to anon, authenticated;
grant delete on public.comments to authenticated;
