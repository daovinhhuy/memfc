import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { settlementPlan } from "../lib/domain";

test("Mức thu từng đội: bù quỹ vừa đủ, dư quỹ, thiếu tiền và đội hình không hợp lệ", () => {
  const input = { lineup: { a: ["a", "b"], b: ["c", "d"] }, teamAFee: 100000, teamBFee: 150000, cost: 600000 };
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(settlementPlan(input, ids, 100000), {
    aTotal: 200000, bTotal: 300000, total: 500000, fundUsed: 100000,
    surplus: 0, projectedBalance: 0, shortfall: 0,
  });
  assert.equal(settlementPlan(input, ids, 99000).shortfall, 1000);
  assert.equal(settlementPlan({ ...input, cost: 400000 }, ids, 100000).projectedBalance, 200000);
  assert.equal(settlementPlan({ ...input, teamAFee: 0 }, ids, 300000).projectedBalance, 0);
  assert.equal(settlementPlan(input, ids, -1000).shortfall, 101000);
  for (const value of [-1, 0.5, NaN, Infinity, 100000001])
    assert.throws(() => settlementPlan({ ...input, teamAFee: value }, ids, 100000));
  assert.throws(() => settlementPlan({ ...input, lineup: { a: ["a", "a"], b: ["c", "d"] } }, ids, 100000));
  assert.throws(() => settlementPlan(input, ["a", "b", "c", "e"], 100000));
  assert.throws(() => settlementPlan({ ...input, lineup: { a: ids, b: [] } }, ids, 100000));
});

test("Nâng cấp PostgreSQL: giữ lịch sử cũ, mức thu A/B, bù quỹ và quyền quản trị", async (t) => {
  const db = new PGlite();
  const admin = "10000000-0000-0000-0000-000000000001";
  const outsider = "10000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users values('${admin}'),('${outsider}');`);
    await db.exec(await readFile(new URL("../supabase/migrations/001_memfc.sql", import.meta.url), "utf8"));
    await db.exec(`insert into public.admins(user_id) values('${admin}'); set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`);
    await db.query("select public.add_member('Một','GK',3), public.add_member('Hai','FW',2)");
    const first = (await db.query<{ id: string }>("select id from public.team_members order by id")).rows.map(p => p.id);
    const legacy = (await db.query<{ id: string }>("select public.save_session(null,'Trận cũ',now()-interval '1 day',90,'Sân','',101,'') id")).rows[0].id;
    for (const id of first) await db.query("select public.cast_vote($1,$2,'yes')", [legacy,id]);
    await db.query("select public.add_transaction('income',100101,'Số dư chuyển kỳ',now()-interval '1 month')");
    await db.query("select public.finalize_session($1)", [legacy]);
    const before = (await db.query("select id,amount,full_name,paid_at from public.session_charges order by id")).rows;
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261021065505_team_fees_at_settlement.sql", import.meta.url), "utf8"));
    assert.deepEqual((await db.query("select id,amount,full_name,paid_at from public.session_charges order by id")).rows,before);
    assert.ok((await db.query<{team:null}>("select team from public.session_charges")).rows.every(c => c.team === null));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false)`);
    await db.query("select public.add_member('Ba','DF',2), public.add_member('Bốn','FW',1)");
    const ids = (await db.query<{id:string}>("select id from public.team_members order by id")).rows.map(p=>p.id);
    const lineup = { a: ids.slice(0,2), b: ids.slice(2) };
    const session = (await db.query<{id:string}>("select public.save_session_v2(null,'Trận mới',now()-interval '1 hour',90,'Sân A','','') id")).rows[0].id;
    const close = (cost = 600000, a = 100000, b = 150000, teams = lineup, id = session) =>
      db.query("select public.finalize_team_fees($1,$2,$3,$4,$5::jsonb)",[id,a,b,cost,JSON.stringify(teams)]);
    const collect = async (id:string) => {
      const rows = (await db.query<{id:string}>("select id from public.session_charges where session_id=$1 and paid_at is null",[id])).rows;
      for (const c of rows) await db.query("select public.mark_charge_paid($1)",[c.id]);
    };
    for (const id of ids) await db.query("select public.cast_vote($1,$2,'yes')",[session,id]);

    await t.test("Lịch mới không cần tiền sân; chặn chốt khi chưa có đội hình hoặc trước giờ đá", async () => {
      assert.equal((await db.query<{cost:null}>("select cost from public.sessions where id=$1",[session])).rows[0].cost,null);
      await assert.rejects(close(),/Đội hình/);
      await db.query("select public.save_lineup($1,$2::jsonb)",[session,JSON.stringify(lineup)]);
      const future = (await db.query<{id:string}>("select public.save_session_v2(null,'Trận tương lai',now()+interval '1 day',90,'Sân','','') id")).rows[0].id;
      await assert.rejects(close(600000,100000,150000,lineup,future),/sau giờ bắt đầu/);
    });
    await t.test("Khách và tài khoản chưa cấp quyền không được chốt hoặc tạo lịch", async () => {
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(close(),/permission denied/);
      await assert.rejects(db.query("select public.save_session_v2(null,'Sai',now(),90,'Sân','','')"),/permission denied/);
      await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false)`);
      await assert.rejects(close(),/Chỉ quản trị viên/);
      await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
    });
    await t.test("Chặn thiếu quỹ, số tiền sai, đội hình cũ và cách chốt cũ; không ghi dở", async () => {
      await assert.rejects(close(600001),/còn thiếu 1 đ/);
      await assert.rejects(close(600000,-1),/Số tiền/);
      await assert.rejects(close(600000,100000,150000,{a:lineup.b,b:lineup.a}),/Đội hình đã thay đổi/);
      await assert.rejects(db.query("select public.finalize_session($1)",[session]),/tải lại trang/);
      assert.equal((await db.query("select * from public.session_charges where session_id=$1",[session])).rows.length,0);
      assert.equal((await db.query("select * from public.transactions where session_id=$1",[session])).rows.length,0);
    });
    await t.test("Bù 100.000 từ số dư: chốt chỉ tạo nợ và một khoản chi, chưa tạo thu", async () => {
      await close();
      const charges = (await db.query<{team:string;amount:number;paid_at:null}>("select * from public.session_charges where session_id=$1",[session])).rows;
      assert.equal(charges.length,4);
      assert.equal(charges.reduce((s,c)=>s+c.amount,0),500000);
      assert.ok(charges.every(c=>c.paid_at===null));
      assert.ok(charges.every(c=>c.amount===(c.team==='A'?100000:150000)));
      const tx = (await db.query<{kind:string;amount:number}>("select * from public.transactions where session_id=$1",[session])).rows;
      assert.deepEqual(tx.map(t=>[t.kind,t.amount]),[['expense',600000]]);
      await assert.rejects(close(),/đã chốt/);
      await assert.rejects(db.query("select public.cast_vote($1,$2,'no')",[session,ids[0]]),/đã chốt/);
      const other = (await db.query<{id:string}>("select public.save_session_v2(null,'Không dùng quỹ hai lần',now()-interval '1 hour',90,'Sân','','') id")).rows[0].id;
      for (const id of ids) await db.query("select public.cast_vote($1,$2,'yes')",[other,id]);
      await db.query("select public.save_lineup($1,$2::jsonb)",[other,JSON.stringify(lineup)]);
      await assert.rejects(close(600000,100000,150000,lineup,other),/còn thiếu/);
    });
    await t.test("Thu từng người đúng mức, không trùng thu, số dư về đúng 0", async () => {
      await collect(session);
      const tx = (await db.query<{kind:string;amount:number}>("select kind,amount from public.transactions")).rows;
      assert.equal(tx.filter(t=>t.kind==='income').length,5);
      assert.equal(tx.reduce((s,t)=>s+(t.kind==='income'?t.amount:-t.amount),0),0);
      const c = (await db.query<{id:string}>("select id from public.session_charges where session_id=$1 limit 1",[session])).rows[0];
      await assert.rejects(db.query("select public.mark_charge_paid($1)",[c.id]),/đã ghi nhận/);
    });
    await t.test("Đội được miễn đóng và tiền thu dư được cộng quỹ khi thực nhận", async () => {
      const free = (await db.query<{id:string}>("select public.save_session_v2(null,'Một đội miễn đóng',now()-interval '1 hour',90,'Sân','','') id")).rows[0].id;
      for (const id of ids) await db.query("select public.cast_vote($1,$2,'yes')",[free,id]);
      await db.query("select public.save_lineup($1,$2::jsonb)",[free,JSON.stringify(lineup)]);
      await close(200000,0,150000,lineup,free);
      assert.equal((await db.query("select * from public.session_charges where session_id=$1 and team='A' and amount=0 and paid_at is not null",[free])).rows.length,2);
      assert.equal((await db.query("select * from public.transactions where session_id=$1 and kind='income'",[free])).rows.length,0);
      await collect(free);
      assert.equal((await db.query<{balance:number}>("select sum(case when kind='income' then amount else -amount end)::integer balance from public.transactions")).rows[0].balance,100000);
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      assert.equal((await db.query("select * from public.session_charges")).rows.length,0);
      assert.equal((await db.query("select * from public.transactions")).rows.length,0);
    });
  } finally { await db.close(); }
});
