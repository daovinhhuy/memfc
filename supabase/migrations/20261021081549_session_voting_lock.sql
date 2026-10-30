-- Khóa riêng phần bình chọn, không chốt quỹ và không đổi các lượt đăng ký đã có.
begin;
alter table public.sessions add column voting_locked_at timestamptz;

create function public.set_voting_locked(p_session uuid,p_locked boolean)
returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên được khóa hoặc mở bình chọn.'; end if;
  if p_locked is null then raise exception 'Trạng thái khóa không hợp lệ.'; end if;
  select * into s from public.sessions where id=p_session for update;
  if not found or s.finalized_at is not null then raise exception 'Buổi đá không tồn tại hoặc đã chốt.'; end if;
  update public.sessions
    set voting_locked_at=case when p_locked then coalesce(s.voting_locked_at,now()) else null end
    where id=p_session;
end;
$$;
revoke all on function public.set_voting_locked(uuid,boolean) from public,anon;
grant execute on function public.set_voting_locked(uuid,boolean) to authenticated;

create or replace function public.cast_vote(p_session uuid,p_member uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
  if p_status is null or p_status not in ('yes','no') then raise exception 'Bình chọn không hợp lệ.'; end if;
  -- Dùng cùng khóa hàng với thao tác khóa bình chọn, chia đội và chốt quỹ.
  select * into s from public.sessions where id=p_session for update;
  if not found then raise exception 'Không tìm thấy buổi đá.'; end if;
  if s.finalized_at is not null then raise exception 'Buổi đá đã chốt danh sách.'; end if;
  if s.voting_locked_at is not null then raise exception 'Bình chọn của trận này đã bị khóa.'; end if;
  if p_member is null or not (p_member=any(s.roster_ids)) then raise exception 'Tên này không có trong danh sách trận.'; end if;
  if exists(select 1 from public.votes where session_id=p_session and user_id=p_member and status=p_status) then return; end if;
  insert into public.votes(session_id,user_id,status) values(p_session,p_member,p_status)
    on conflict(session_id,user_id) do update set status=excluded.status,updated_at=now();
  insert into public.vote_history(session_id,user_id,status) values(p_session,p_member,p_status);
  update public.sessions set lineup=null where id=p_session;
end;
$$;
notify pgrst, 'reload schema';
commit;
