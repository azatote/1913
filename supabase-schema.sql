-- Table 1913 : schéma Supabase.
-- Rejouable sans risque dans le SQL Editor (à relancer à chaque nouvelle colonne).

begin;

-- 1. Table des parties ------------------------------------------------------
-- Le modèle de jeu (piles, mains) est stocké en JSON dans "state".
-- "revision" sert au contrôle de concurrence optimiste.

create table if not exists public.nd1913_games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.nd1913_games add column if not exists revision integer not null default 0;
alter table public.nd1913_games add column if not exists state jsonb not null default '{"piles": [], "hands": {"top": [], "bottom": []}, "topZ": 1}'::jsonb;
alter table public.nd1913_games add column if not exists updated_at timestamptz not null default now();

-- 2. Contraintes CHECK ------------------------------------------------------

alter table public.nd1913_games drop constraint if exists nd1913_games_revision_check;
alter table public.nd1913_games add constraint nd1913_games_revision_check check (revision >= 0);

alter table public.nd1913_games drop constraint if exists nd1913_games_state_shape_check;
alter table public.nd1913_games add constraint nd1913_games_state_shape_check check (
  jsonb_typeof(state) = 'object'
  and jsonb_typeof(state -> 'piles') = 'array'
  and jsonb_typeof(state -> 'hands') = 'object'
  and jsonb_typeof(state -> 'hands' -> 'top') = 'array'
  and jsonb_typeof(state -> 'hands' -> 'bottom') = 'array'
  and jsonb_typeof(state -> 'topZ') = 'number'
);

alter table public.nd1913_games drop constraint if exists nd1913_games_state_size_check;
alter table public.nd1913_games add constraint nd1913_games_state_size_check check (pg_column_size(state) < 200000);

-- 3. Trigger : révision, intégrité du paquet, date de mise à jour -----------

create or replace function public.nd1913_validate_game()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  card_codes integer[];
begin
  if tg_op = 'UPDATE' then
    if new.revision <> old.revision + 1 then
      raise exception 'Conflit de revision : attendu %, recu %', old.revision + 1, new.revision
        using errcode = '40001';
    end if;
    new.created_at := old.created_at;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.state -> 'piles') as p(pile)
    where jsonb_typeof(p.pile -> 'cards') <> 'array' or jsonb_array_length(p.pile -> 'cards') = 0
  ) then
    raise exception 'Paquet invalide : une pile doit contenir au moins une carte'
      using errcode = '23514';
  end if;

  if jsonb_array_length(new.state -> 'hands' -> 'top') > 3
    or jsonb_array_length(new.state -> 'hands' -> 'bottom') > 3 then
    raise exception 'Main pleine : 3 cartes maximum par joueur'
      using errcode = '23514';
  end if;

  -- Player rows are at y = 28 (Joueur 2) and y = 1152 (Joueur 1) in model coordinates (see ROW_Y in logic.ts).
  if (select count(*) from jsonb_array_elements(new.state -> 'piles') as p(pile) where (p.pile ->> 'y')::numeric = 28) > 7
    or (select count(*) from jsonb_array_elements(new.state -> 'piles') as p(pile) where (p.pile ->> 'y')::numeric = 1152) > 7 then
    raise exception 'Ligne pleine : 7 cartes maximum par joueur'
      using errcode = '23514';
  end if;

  select coalesce(array_agg((c.card ->> 'code')::integer), '{}')
    into card_codes
  from (
    select pc.card
    from jsonb_array_elements(new.state -> 'piles') as p(pile)
    cross join lateral jsonb_array_elements(p.pile -> 'cards') as pc(card)
    union all
    select h.card from jsonb_array_elements(new.state -> 'hands' -> 'top') as h(card)
    union all
    select h.card from jsonb_array_elements(new.state -> 'hands' -> 'bottom') as h(card)
  ) as c;

  if cardinality(card_codes) <> 56
    or (select count(distinct code) from unnest(card_codes) as code) <> 56
    or exists (select 1 from unnest(card_codes) as code where code not between 1 and 56) then
    raise exception 'Paquet invalide : 56 cartes uniques numerotees de 1 a 56 attendues'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nd1913_validate_game on public.nd1913_games;
create trigger nd1913_validate_game
before insert or update on public.nd1913_games
for each row execute function public.nd1913_validate_game();

-- 4. Row Level Security (accès anonyme : outil entre amis, pas de compte) ---

alter table public.nd1913_games enable row level security;

drop policy if exists "Anyone can read games" on public.nd1913_games;
drop policy if exists "Anyone can create games" on public.nd1913_games;
drop policy if exists "Anyone can play games" on public.nd1913_games;
drop policy if exists "Anyone can delete games" on public.nd1913_games;

create policy "Anyone can read games"
  on public.nd1913_games for select
  to anon, authenticated
  using (true);

create policy "Anyone can create games"
  on public.nd1913_games for insert
  to anon, authenticated
  with check (revision = 0);

create policy "Anyone can play games"
  on public.nd1913_games for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Anyone can delete games"
  on public.nd1913_games for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.nd1913_games to anon, authenticated;

-- 5. Realtime (Postgres Changes) -------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime' and c.relname = 'nd1913_games'
  ) then
    alter publication supabase_realtime add table public.nd1913_games;
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
