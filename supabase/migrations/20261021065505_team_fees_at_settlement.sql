-- Nâng cấp tại chỗ: giữ nguyên lịch, bình chọn, khoản phải đóng và giao dịch cũ.
begin;
alter table public.sessions alter column cost drop not null;
alter table public.session_charges add column team text check (team in ('A','B'));

create function public.save_session_v2(p_id uuid,p_title text,p_starts timestamptz,p_duration integer,p_venue text,p_address text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; roster uuid[];
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được tạo hoặc sửa lịch.'; end if;
  if p_id is null then
    select array_agg(id order by id) into roster from public.team_members where active;
    if coalesce(cardinality(roster),0)=0 then raise exception 'Hãy thêm thành viên vào danh sách đội trước.'; end if;
    insert into public.sessions(title,starts_at,duration,venue,address,cost,notes,roster_ids)
      values(trim(p_title),p_starts,p_duration,trim(p_venue),trim(p_address),null,trim(p_notes),roster) returning id into result;
  else
    update public.sessions set title=trim(p_title),starts_at=p_starts,duration=p_duration,venue=trim(p_venue),address=trim(p_address),notes=trim(p_notes)
      where id=p_id and finalized_at is null returning id into result;
    if result is null then raise exception 'Không thể sửa buổi đá đã chốt hoặc không tồn tại.'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.save_session_v2(uuid,text,timestamptz,integer,text,text,text) from public,anon;
grant execute on function public.save_session_v2(uuid,text,timestamptz,integer,text,text,text) to authenticated;

-- Trình duyệt cũ vẫn tạo được lịch; chi phí chỉ được xác định ở bước chốt mới.
create or replace function public.save_session(p_id uuid,p_title text,p_starts timestamptz,p_duration integer,p_venue text,p_address text,p_cost integer,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  return public.save_session_v2(p_id,p_title,p_starts,p_duration,p_venue,p_address,p_notes);
end;
$$;
create or replace function public.finalize_session(p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được chốt quỹ.'; end if;
  raise exception 'Hãy tải lại trang để nhập mức thu đội A, đội B và tiền sân trước khi chốt.';
end;
$$;

create function public.finalize_team_fees(p_session uuid,p_team_a_fee integer,p_team_b_fee integer,p_cost integer,p_lineup jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.sessions; ids uuid[]; expected uuid[];
  a_count integer; b_count integer; total bigint; balance bigint; missing bigint;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được chốt quỹ.'; end if;
  -- Chung khóa với mọi thao tác thu/chi, tránh hai lần chốt dùng trùng số dư.
  perform pg_catalog.pg_advisory_xact_lock(104729,1);
  select * into s from public.sessions where id=p_session for update;
  if not found or s.finalized_at is not null then raise exception 'Buổi đá đã chốt hoặc không tồn tại.'; end if;
  if s.starts_at>now() then raise exception 'Chỉ chốt quỹ sau giờ bắt đầu buổi đá.'; end if;
  if p_team_a_fee is null or p_team_b_fee is null or p_cost is null or
    p_team_a_fee not between 0 and 100000000 or p_team_b_fee not between 0 and 100000000 or p_cost not between 0 and 100000000 then
    raise exception 'Số tiền phải là số nguyên từ 0 đến 100 triệu đồng.';
  end if;
  if s.lineup is null or p_lineup is null or s.lineup is distinct from p_lineup then
    raise exception 'Đội hình đã thay đổi. Hãy chia và lưu lại đội rồi mở màn hình chốt.';
  end if;
  if jsonb_typeof(s.lineup->'a') is distinct from 'array' or jsonb_typeof(s.lineup->'b') is distinct from 'array' then
    raise exception 'Đội hình không hợp lệ. Hãy chia và lưu lại đội.';
  end if;
  a_count := jsonb_array_length(s.lineup->'a');
  b_count := jsonb_array_length(s.lineup->'b');
  select array_agg(id order by id) into ids from (
    select value::uuid id from jsonb_array_elements_text(s.lineup->'a')
    union all select value::uuid from jsonb_array_elements_text(s.lineup->'b')
  ) x;
  select array_agg(user_id order by user_id) into expected from public.votes where session_id=p_session and status='yes';
  if a_count=0 or b_count=0 or ids is distinct from expected or
    (select count(distinct id) from unnest(ids) id) <> cardinality(ids) then
    raise exception 'Danh sách tham gia đã thay đổi. Hãy chia và lưu lại đội.';
  end if;
  total := a_count::bigint*p_team_a_fee+b_count::bigint*p_team_b_fee;
  select coalesce(sum(case when kind='income' then amount::bigint else -amount::bigint end),0)
    into balance from public.transactions;
  missing := p_cost::bigint-total-balance;
  if missing>0 then
    raise exception 'Quỹ và khoản thu dự kiến còn thiếu % đ. Hãy điều chỉnh mức thu hoặc xác nhận các khoản đã thực thu.', missing;
  end if;
  insert into public.session_charges(session_id,user_id,full_name,position,level,amount,team,paid_at)
    select p_session,p.id,p.full_name,p.position,p.level,
      case when p.id=any(array(select value::uuid from jsonb_array_elements_text(s.lineup->'a'))) then p_team_a_fee else p_team_b_fee end,
      case when p.id=any(array(select value::uuid from jsonb_array_elements_text(s.lineup->'a'))) then 'A' else 'B' end,
      case when (case when p.id=any(array(select value::uuid from jsonb_array_elements_text(s.lineup->'a'))) then p_team_a_fee else p_team_b_fee end)=0 then now() else null end
    from public.votes v join public.team_members p on p.id=v.user_id where v.session_id=p_session and v.status='yes';
  -- Ghi đúng một khoản chi tiền sân. Phần bù từ quỹ không phải khoản chi thứ hai.
  insert into public.transactions(session_id,kind,amount,description,created_by)
    values(p_session,'expense',p_cost,'Tiền sân: '||s.title,auth.uid());
  update public.sessions set cost=p_cost,finalized_at=now() where id=p_session;
end;
$$;
revoke all on function public.finalize_team_fees(uuid,integer,integer,integer,jsonb) from public,anon;
grant execute on function public.finalize_team_fees(uuid,integer,integer,integer,jsonb) to authenticated;

create or replace function public.mark_charge_paid(p_charge uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.session_charges;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được xác nhận đã thu tiền.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(104729,1);
  select * into c from public.session_charges where id=p_charge for update;
  if not found or c.paid_at is not null then raise exception 'Khoản quỹ đã ghi nhận hoặc không tồn tại.'; end if;
  update public.session_charges set paid_at=now() where id=p_charge;
  if c.amount>0 then
    insert into public.transactions(session_id,charge_id,kind,amount,description,created_by)
      values(c.session_id,c.id,'income',c.amount,'Đóng quỹ · '||c.full_name,auth.uid());
  end if;
end;
$$;
create or replace function public.add_transaction(p_kind text,p_amount integer,p_description text,p_occurred timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được ghi thu chi.'; end if;
  if p_kind is null or p_kind not in ('income','expense') or p_amount is null or p_amount<=0 or p_occurred is null or p_occurred>now() then
    raise exception 'Loại, số tiền hoặc thời điểm không hợp lệ.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(104729,1);
  insert into public.transactions(kind,amount,description,occurred_at,created_by)
    values(p_kind,p_amount,trim(p_description),p_occurred,auth.uid());
end;
$$;
notify pgrst, 'reload schema';
commit;
