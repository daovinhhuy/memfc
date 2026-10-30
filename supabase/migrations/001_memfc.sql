-- Chạy một lần trong SQL Editor của một Supabase project mới.
begin;
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 1 and 80),
  position text not null default 'MF' check (position in ('GK','DF','MF','FW','DF_GK')),
  level integer not null default 3 check (level between 1 and 3),
  role text not null default 'member' check (role='member'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  duration integer not null default 90 check (duration between 30 and 360),
  venue text not null check (char_length(trim(venue)) between 1 and 160),
  address text not null default '' check (char_length(address) <= 300),
  cost integer not null check (cost between 0 and 100000000),
  notes text not null default '' check (char_length(notes) <= 1500),
  roster_ids uuid[] not null,
  lineup jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.votes (
  session_id uuid not null references public.sessions(id),
  user_id uuid not null references public.team_members(id),
  status text not null check (status in ('yes','no')),
  updated_at timestamptz not null default now(),
  primary key(session_id, user_id)
);
create table public.vote_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  user_id uuid not null references public.team_members(id),
  status text not null check (status in ('yes','no')),
  updated_at timestamptz not null default now()
);
create table public.session_charges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  user_id uuid not null references public.team_members(id),
  full_name text not null,
  position text not null check (position in ('GK','DF','MF','FW','DF_GK')),
  level integer not null check (level between 1 and 3),
  amount integer not null check (amount>=0),
  paid_at timestamptz,
  unique(session_id, user_id)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id),
  charge_id uuid unique references public.session_charges(id),
  kind text not null check (kind in ('income','expense')),
  amount integer not null check (amount between 0 and 100000000),
  description text not null check (char_length(trim(description)) between 1 and 300),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index on public.sessions(starts_at);
create index on public.vote_history(session_id, updated_at);
create index on public.session_charges(user_id);
create index on public.transactions(occurred_at);

create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admins where user_id=auth.uid());
$$;
alter table public.admins enable row level security;
alter table public.team_members enable row level security;
alter table public.sessions enable row level security;
alter table public.votes enable row level security;
alter table public.vote_history enable row level security;
alter table public.session_charges enable row level security;
alter table public.transactions enable row level security;
create policy admins_read on public.admins for select to authenticated using (user_id=auth.uid());
-- Link public cho phép xem tên, lịch và bình chọn. Quỹ chỉ dành cho quản trị viên.
create policy members_read on public.team_members for select to anon,authenticated using (true);
create policy sessions_read on public.sessions for select to anon,authenticated using (true);
create policy votes_read on public.votes for select to anon,authenticated using (true);
create policy history_read on public.vote_history for select to anon,authenticated using (true);
create policy charges_read on public.session_charges for select to authenticated using (public.is_admin());
create policy transactions_read on public.transactions for select to authenticated using (public.is_admin());
revoke all on public.admins, public.team_members, public.sessions, public.votes, public.vote_history, public.session_charges, public.transactions from anon,authenticated;
grant select on public.team_members, public.sessions, public.votes, public.vote_history, public.session_charges, public.transactions to anon,authenticated;
grant select on public.admins to authenticated;

-- Bình chọn theo tên, không xác thực danh tính. Không dùng cho bỏ phiếu bí mật.
create function public.cast_vote(p_session uuid, p_member uuid, p_status text) returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
  if p_status is null or p_status not in ('yes','no') then raise exception 'Bình chọn không hợp lệ.'; end if;
  select * into s from public.sessions where id=p_session for update;
  if not found then raise exception 'Không tìm thấy buổi đá.'; end if;
  if s.finalized_at is not null then raise exception 'Buổi đá đã chốt danh sách.'; end if;
  if p_member is null or not (p_member=any(s.roster_ids)) then raise exception 'Tên này không có trong danh sách trận.'; end if;
  -- Chọn lại cùng kết quả không tạo lịch sử rác.
  if exists(select 1 from public.votes where session_id=p_session and user_id=p_member and status=p_status) then return; end if;
  insert into public.votes(session_id,user_id,status) values(p_session,p_member,p_status)
    on conflict(session_id,user_id) do update set status=excluded.status,updated_at=now();
  insert into public.vote_history(session_id,user_id,status) values(p_session,p_member,p_status);
  update public.sessions set lineup=null where id=p_session;
end;
$$;
create function public.add_member(p_name text,p_position text,p_level integer) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được thêm thành viên.'; end if;
  insert into public.team_members(full_name,position,level) values(trim(p_name),p_position,p_level);
end;
$$;
create function public.update_member(p_user uuid,p_position text,p_level integer,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được quản lý thành viên.'; end if;
  perform id from public.sessions where finalized_at is null order by id for update;
  update public.team_members set position=p_position,level=p_level,active=p_active where id=p_user;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;
  update public.sessions set lineup=null where finalized_at is null;
end;
$$;
create function public.save_session(p_id uuid,p_title text,p_starts timestamptz,p_duration integer,p_venue text,p_address text,p_cost integer,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; roster uuid[];
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được tạo hoặc sửa lịch.'; end if;
  if p_id is null then
    select array_agg(id order by id) into roster from public.team_members where active;
    if coalesce(cardinality(roster),0)=0 then raise exception 'Hãy thêm thành viên vào danh sách đội trước.'; end if;
    insert into public.sessions(title,starts_at,duration,venue,address,cost,notes,roster_ids)
      values(trim(p_title),p_starts,p_duration,trim(p_venue),trim(p_address),p_cost,trim(p_notes),roster) returning id into result;
  else
    update public.sessions set title=trim(p_title),starts_at=p_starts,duration=p_duration,venue=trim(p_venue),address=trim(p_address),cost=p_cost,notes=trim(p_notes)
      where id=p_id and finalized_at is null returning id into result;
    if result is null then raise exception 'Không thể sửa buổi đá đã chốt hoặc không tồn tại.'; end if;
  end if;
  return result;
end;
$$;
create function public.save_lineup(p_session uuid,p_lineup jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions; ids uuid[]; expected uuid[];
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được chia đội.'; end if;
  select * into s from public.sessions where id=p_session for update;
  if not found or s.finalized_at is not null then raise exception 'Buổi đá không tồn tại hoặc đã chốt.'; end if;
  if p_lineup is null or jsonb_typeof(p_lineup->'a') is distinct from 'array' or jsonb_typeof(p_lineup->'b') is distinct from 'array' then raise exception 'Danh sách đội không hợp lệ.'; end if;
  select array_agg(id order by id) into ids from (
    select value::uuid id from jsonb_array_elements_text(p_lineup->'a')
    union all select value::uuid from jsonb_array_elements_text(p_lineup->'b')
  ) x;
  select array_agg(user_id order by user_id) into expected from public.votes where session_id=p_session and status='yes';
  if coalesce(cardinality(ids),0)<2 or ids is distinct from expected or abs(jsonb_array_length(p_lineup->'a')-jsonb_array_length(p_lineup->'b'))>1 then raise exception 'Danh sách bình chọn đã thay đổi. Vui lòng chia lại đội.'; end if;
  update public.sessions set lineup=p_lineup where id=p_session;
end;
$$;
create function public.finalize_session(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions; n integer;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được chốt quỹ.'; end if;
  -- Chung khóa với cast_vote: chốt và bình chọn đồng thời không làm lệch danh sách.
  select * into s from public.sessions where id=p_session for update;
  if not found or s.finalized_at is not null then raise exception 'Buổi đá đã chốt hoặc không tồn tại.'; end if;
  if s.starts_at>now() then raise exception 'Chỉ chốt quỹ sau giờ bắt đầu buổi đá.'; end if;
  select count(*) into n from public.votes where session_id=p_session and status='yes';
  if n=0 then raise exception 'Cần ít nhất một người tham gia để chốt quỹ.'; end if;
  insert into public.session_charges(session_id,user_id,full_name,position,level,amount)
    select p_session,p.id,p.full_name,p.position,p.level,
      (s.cost/n) + case when row_number() over(order by p.id)<=(s.cost%n) then 1 else 0 end
    from public.votes v join public.team_members p on p.id=v.user_id where v.session_id=p_session and v.status='yes';
  insert into public.transactions(session_id,kind,amount,description,created_by) values(p_session,'expense',s.cost,'Chi phí: '||s.title,auth.uid());
  update public.sessions set finalized_at=now() where id=p_session;
end;
$$;
create function public.mark_charge_paid(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.session_charges;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được xác nhận đã thu tiền.'; end if;
  select * into c from public.session_charges where id=p_charge for update;
  if not found or c.paid_at is not null then raise exception 'Khoản quỹ đã ghi nhận hoặc không tồn tại.'; end if;
  update public.session_charges set paid_at=now() where id=p_charge;
  insert into public.transactions(session_id,charge_id,kind,amount,description,created_by) values(c.session_id,c.id,'income',c.amount,'Đóng quỹ · '||c.full_name,auth.uid());
end;
$$;
create function public.add_transaction(p_kind text,p_amount integer,p_description text,p_occurred timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được ghi thu chi.'; end if;
  if p_kind is null or p_kind not in ('income','expense') or p_amount is null or p_amount<=0 or p_occurred is null or p_occurred>now() then raise exception 'Loại, số tiền hoặc thời điểm không hợp lệ.'; end if;
  insert into public.transactions(kind,amount,description,occurred_at,created_by) values(p_kind,p_amount,trim(p_description),p_occurred,auth.uid());
end;
$$;
revoke all on function public.is_admin(),public.cast_vote(uuid,uuid,text) from public;
grant execute on function public.is_admin(),public.cast_vote(uuid,uuid,text) to anon,authenticated;
revoke all on function public.add_member(text,text,integer),public.update_member(uuid,text,integer,boolean),public.save_session(uuid,text,timestamptz,integer,text,text,integer,text),public.save_lineup(uuid,jsonb),public.finalize_session(uuid),public.mark_charge_paid(uuid),public.add_transaction(text,integer,text,timestamptz) from public,anon;
grant execute on function public.add_member(text,text,integer),public.update_member(uuid,text,integer,boolean),public.save_session(uuid,text,timestamptz,integer,text,text,integer,text),public.save_lineup(uuid,jsonb),public.finalize_session(uuid),public.mark_charge_paid(uuid),public.add_transaction(text,integer,text,timestamptz) to authenticated;
commit;
