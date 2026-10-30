-- Mọi người được xem quỹ; chỉ RPC có kiểm tra admin được ghi thu chi.
begin;
alter table public.session_charges enable row level security;
alter table public.transactions enable row level security;
alter policy charges_read on public.session_charges
  to anon, authenticated using (true);
alter policy transactions_read on public.transactions
  to anon, authenticated using (true);
grant select on public.session_charges, public.transactions to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.session_charges, public.transactions from anon, authenticated;
notify pgrst, 'reload schema';
commit;
