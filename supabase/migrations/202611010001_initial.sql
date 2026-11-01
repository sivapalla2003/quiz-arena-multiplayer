create extension if not exists pgcrypto;

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  prompt text not null,
  options jsonb not null check (jsonb_array_length(options) = 4),
  answer_index smallint not null check (answer_index between 0 and 3),
  enabled boolean not null default true
);

create table if not exists public.quiz_rooms (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null unique,
  category text not null,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  phase text not null default 'lobby' check (phase in ('lobby','question','reveal','finished')),
  question_number smallint not null default 0,
  total_questions smallint not null default 10 check (total_questions = 10),
  question_order uuid[] not null default '{}',
  current_question_id uuid references public.quiz_questions(id),
  ends_at timestamptz,
  last_round jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_players (
  id uuid primary key,
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 18),
  avatar text not null,
  is_host boolean not null default false,
  score integer not null default 0,
  correct_count smallint not null default 0,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique(room_id, id)
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quiz_rooms(id) on delete cascade,
  player_id uuid not null references public.quiz_players(id) on delete cascade,
  question_number smallint not null,
  option_index smallint not null check (option_index between 0 and 3),
  is_correct boolean not null,
  points integer not null default 0,
  submitted_at timestamptz not null default now(),
  unique(room_id, player_id, question_number)
);

create index if not exists quiz_players_room_idx on public.quiz_players(room_id);
create index if not exists quiz_answers_room_round_idx on public.quiz_answers(room_id, question_number);

create or replace function public.shuffle_quiz_options()
returns trigger language plpgsql as $$
declare correct jsonb; shuffled jsonb; new_index smallint;
begin
  correct:=new.options->new.answer_index;
  with items as (
    select value, row_number() over(order by random())-1 as idx
    from jsonb_array_elements(new.options)
  )
  select jsonb_agg(value order by idx), max(idx) filter(where value=correct)
    into shuffled,new_index from items;
  new.options:=shuffled;
  new.answer_index:=new_index;
  return new;
end $$;
create trigger quiz_questions_shuffle before insert on public.quiz_questions
  for each row execute function public.shuffle_quiz_options();

alter table public.quiz_questions enable row level security;
alter table public.quiz_rooms enable row level security;
alter table public.quiz_players enable row level security;
alter table public.quiz_answers enable row level security;
revoke all on public.quiz_questions, public.quiz_rooms, public.quiz_players, public.quiz_answers from anon, authenticated;

create or replace function public.start_quiz(p_room uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r quiz_rooms%rowtype; n integer;
begin
  select * into r from quiz_rooms where id = p_room for update;
  if not found or r.phase <> 'lobby' then raise exception 'Room is not waiting to start'; end if;
  select count(*) into n from quiz_players where room_id = p_room;
  if n < 2 or n > 8 then raise exception 'A game needs 2 to 8 players'; end if;
  if array_length(p_order,1) <> 10 then raise exception 'A game needs 10 questions'; end if;
  update quiz_rooms set phase='question', question_number=1, question_order=p_order,
    current_question_id=p_order[1], ends_at=now()+interval '15 seconds', last_round=null, updated_at=now()
    where id=p_room;
end $$;

create or replace function public.finalize_quiz_round(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r quiz_rooms%rowtype; correct smallint; result jsonb;
begin
  select * into r from quiz_rooms where id=p_room for update;
  if not found or r.phase <> 'question' or r.ends_at > now() then return; end if;
  select answer_index into correct from quiz_questions where id=r.current_question_id;
  select coalesce(jsonb_object_agg(player_id::text, jsonb_build_object('correct',is_correct,'points',points)), '{}'::jsonb)
    into result from quiz_answers where room_id=p_room and question_number=r.question_number;
  update quiz_rooms set phase='reveal', last_round=jsonb_build_object('correct_index',correct,'answers',result), updated_at=now() where id=p_room;
end $$;

create or replace function public.submit_quiz_answer(p_room uuid, p_player uuid, p_option smallint)
returns void language plpgsql security definer set search_path = public as $$
declare r quiz_rooms%rowtype; correct smallint; is_right boolean; pts integer; submitted timestamptz; result jsonb;
begin
  select * into r from quiz_rooms where id=p_room for update;
  if not found or r.phase <> 'question' or r.ends_at <= now() then raise exception 'This question has closed'; end if;
  if not exists(select 1 from quiz_players where id=p_player and room_id=p_room) then raise exception 'Player is not in this room'; end if;
  submitted:=now();
  select answer_index into correct from quiz_questions where id=r.current_question_id;
  is_right:=p_option=correct;
  pts:=case when is_right then 100 + least(50,greatest(0,floor(extract(epoch from (r.ends_at-submitted))*50/15)::integer)) else 0 end;
  insert into quiz_answers(room_id,player_id,question_number,option_index,is_correct,points,submitted_at)
    values(p_room,p_player,r.question_number,p_option,is_right,pts,submitted)
    on conflict(room_id,player_id,question_number) do nothing;
  if not found then raise exception 'You already answered this question'; end if;
  update quiz_players set score=score+pts, correct_count=correct_count+(case when is_right then 1 else 0 end), last_seen=now() where id=p_player;
  if (select count(*) from quiz_answers where room_id=p_room and question_number=r.question_number) >=
     (select count(*) from quiz_players where room_id=p_room) then
    select answer_index into correct from quiz_questions where id=r.current_question_id;
    select coalesce(jsonb_object_agg(player_id::text,jsonb_build_object('correct',is_correct,'points',points)), '{}'::jsonb)
      into result from quiz_answers where room_id=p_room and question_number=r.question_number;
    update quiz_rooms set phase='reveal',last_round=jsonb_build_object('correct_index',correct,'answers',result),updated_at=now() where id=p_room;
  end if;
end $$;

create or replace function public.advance_quiz(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r quiz_rooms%rowtype; next_no integer;
begin
  select * into r from quiz_rooms where id=p_room for update;
  if not found or r.phase <> 'reveal' then raise exception 'Round is not ready to advance'; end if;
  if r.question_number >= r.total_questions then update quiz_rooms set phase='finished',updated_at=now() where id=p_room; return; end if;
  next_no:=r.question_number+1;
  update quiz_rooms set phase='question',question_number=next_no,current_question_id=question_order[next_no],
    ends_at=now()+interval '15 seconds',last_round=null,updated_at=now() where id=p_room;
end $$;

create or replace function public.rematch_quiz(p_room uuid,p_order uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r quiz_rooms%rowtype;
begin
  select * into r from quiz_rooms where id=p_room for update;
  if not found or r.phase <> 'finished' then raise exception 'Match is not finished'; end if;
  if array_length(p_order,1) <> 10 then raise exception 'A rematch needs 10 questions'; end if;
  delete from quiz_answers where room_id=p_room;
  update quiz_players set score=0,correct_count=0,last_seen=now() where room_id=p_room;
  update quiz_rooms set phase='question',question_number=1,question_order=p_order,current_question_id=p_order[1],
    ends_at=now()+interval '15 seconds',last_round=null,updated_at=now() where id=p_room;
end $$;

revoke all on function public.start_quiz(uuid,uuid[]), public.finalize_quiz_round(uuid), public.submit_quiz_answer(uuid,uuid,smallint), public.advance_quiz(uuid), public.rematch_quiz(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.start_quiz(uuid,uuid[]), public.finalize_quiz_round(uuid), public.submit_quiz_answer(uuid,uuid,smallint), public.advance_quiz(uuid), public.rematch_quiz(uuid,uuid[]) to service_role;

-- The server-side Edge Function uses the service role; browser clients cannot read answer keys or alter scores.
