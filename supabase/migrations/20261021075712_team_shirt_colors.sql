-- Lưu màu áo cùng đội hình; giữ nguyên lịch sử và các khoản thu chi.
begin;
alter table public.sessions
  add column team_a_color text
    check (team_a_color is null or char_length(btrim(team_a_color)) between 1 and 40),
  add column team_b_color text
    check (team_b_color is null or char_length(btrim(team_b_color)) between 1 and 40);

create function public.save_lineup_with_colors(
  p_session uuid,
  p_lineup jsonb,
  p_team_a_color text,
  p_team_b_color text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được chia đội.';
  end if;
  if p_team_a_color is null or p_team_b_color is null
    or char_length(btrim(p_team_a_color)) not between 1 and 40
    or char_length(btrim(p_team_b_color)) not between 1 and 40 then
    raise exception 'Màu áo mỗi đội phải có từ 1 đến 40 ký tự.';
  end if;
  -- Hàm cũ khóa trận, kiểm tra danh sách và chặn sửa trận đã chốt.
  -- Cả đội hình và màu áo được lưu trong cùng một giao dịch.
  perform public.save_lineup(p_session,p_lineup);
  update public.sessions
    set team_a_color=btrim(p_team_a_color),
        team_b_color=btrim(p_team_b_color)
    where id=p_session;
end;
$$;
revoke all on function public.save_lineup_with_colors(uuid,jsonb,text,text) from public,anon;
grant execute on function public.save_lineup_with_colors(uuid,jsonb,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
