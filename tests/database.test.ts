import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("PostgreSQL migration, RLS, chốt quỹ và thu tiền", async (t) => {
  const db = new PGlite();
  const admin = "10000000-0000-0000-0000-000000000001";
  const outsider = "10000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('${admin}'),('${outsider}');`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_memfc.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      `insert into public.admins(user_id) values('${admin}'); set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    await db.query("select public.add_member($1,$2,$3)", ["Nguyễn A", "GK", 3]);
    await db.query("select public.add_member($1,$2,$3)", ["Trần B", "MF", 3]);
    await db.query("select public.add_member($1,$2,$3)", ["Lê C", "FW", 2]);
    const members = (
      await db.query<{ id: string }>(
        "select id from public.team_members order by id",
      )
    ).rows;
    const [a, b, c] = members.map((m) => m.id);
    const result = await db.query<{ id: string }>(
      "select public.save_session(null,'Trận kiểm thử',now()-interval '1 day',90,'Sân A','Địa chỉ',100000,'') as id",
    );
    const session = result.rows[0].id;
    await db.query("select public.add_member('Thêm sau','DF',3)");
    const later = (
      await db.query<{ id: string }>(
        "select id from public.team_members where full_name='Thêm sau'",
      )
    ).rows[0].id;
    await db.exec(
      "reset role; set role anon; select set_config('request.jwt.claim.sub','',false);",
    );

    await t.test(
      "Khách xem lịch, chọn tên, đổi bình chọn; tổng theo danh sách gốc",
      async () => {
        const roster = (
          await db.query<{ roster_ids: string[] }>(
            "select roster_ids from public.sessions where id=$1",
            [session],
          )
        ).rows[0].roster_ids;
        assert.equal(roster.length, 3);
        await db.query("select public.cast_vote($1,$2,'yes')", [session, a]);
        await db.query("select public.cast_vote($1,$2,'no')", [session, a]);
        await db.query("select public.cast_vote($1,$2,'yes')", [session, a]);
        await db.query("select public.cast_vote($1,$2,'yes')", [session, a]);
        await db.query("select public.cast_vote($1,$2,'yes')", [session, b]);
        await db.query("select public.cast_vote($1,$2,'yes')", [session, c]);
        assert.equal(
          (await db.query("select * from public.votes")).rows.length,
          3,
        );
        assert.equal(
          (await db.query("select * from public.vote_history")).rows.length,
          5,
        );
        await assert.rejects(
          db.query("select public.cast_vote($1,$2,'yes')", [session, later]),
          /danh sách trận/,
        );
      },
    );
    await t.test(
      "Khách không sửa danh sách, chi phí, thu chi hoặc quyền quản trị",
      async () => {
        await assert.rejects(
          db.query("update public.team_members set level=5"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("update public.sessions set cost=0"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select public.finalize_session($1)", [session]),
          /permission denied/,
        );
        assert.equal(
          (await db.query("select * from public.transactions")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.session_charges")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("insert into public.admins(user_id) values($1)", [outsider]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "Tài khoản chưa cấp quyền không gọi được thao tác quản trị",
      async () => {
        await db.exec(
          `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false);`,
        );
        await assert.rejects(
          db.query("select public.finalize_session($1)", [session]),
          /Chỉ quản trị viên/,
        );
        await assert.rejects(
          db.query("select public.add_member('Sai quyền','DF',5)"),
          /Chỉ quản trị viên/,
        );
      },
    );
    await t.test(
      "Kiểm tra đội hình và lưu snapshot khoản tiền chính xác",
      async () => {
        await db.exec(
          `select set_config('request.jwt.claim.sub','${admin}',false);`,
        );
        await assert.rejects(
          db.query("select public.save_lineup($1,$2::jsonb)", [
            session,
            JSON.stringify({ a: [a, a], b: [b] }),
          ]),
          /chia lại đội/,
        );
        await db.query("select public.save_lineup($1,$2::jsonb)", [
          session,
          JSON.stringify({ a: [a, c], b: [b] }),
        ]);
        await db.query("select public.finalize_session($1)", [session]);
        const charges = (
          await db.query<{ amount: number; full_name: string }>(
            "select * from public.session_charges",
          )
        ).rows;
        assert.equal(charges.length, 3);
        assert.equal(
          charges.reduce((sum, c) => sum + c.amount, 0),
          100000,
        );
        assert.deepEqual(
          charges.map((c) => c.amount).sort(),
          [33333, 33333, 33334],
        );
        assert.equal(
          (
            await db.query(
              "select * from public.transactions where kind='expense'",
            )
          ).rows.length,
          1,
        );
        await assert.rejects(
          db.query("select public.finalize_session($1)", [session]),
          /đã chốt/,
        );
        await assert.rejects(
          db.query("select public.cast_vote($1,$2,'no')", [session, a]),
          /đã chốt/,
        );
        const before = (
          await db.query<{ level: number }>(
            "select level from public.session_charges where user_id=$1",
            [a],
          )
        ).rows[0].level;
        await db.query("select public.update_member($1,'DF',1,false)", [a]);
        assert.equal(
          (
            await db.query<{ level: number }>(
              "select level from public.session_charges where user_id=$1",
              [a],
            )
          ).rows[0].level,
          before,
        );
      },
    );
    await t.test(
      "Không thu trùng; chỉ thu thực nhận mới tạo giao dịch thu",
      async () => {
        const charge = (
          await db.query<{ id: string }>(
            "select id from public.session_charges limit 1",
          )
        ).rows[0].id;
        assert.equal(
          (
            await db.query(
              "select * from public.transactions where kind='income'",
            )
          ).rows.length,
          0,
        );
        await db.query("select public.mark_charge_paid($1)", [charge]);
        await assert.rejects(
          db.query("select public.mark_charge_paid($1)", [charge]),
          /đã ghi nhận/,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.transactions where kind='income'",
            )
          ).rows.length,
          1,
        );
        await db.exec(
          "reset role; set role anon; select set_config('request.jwt.claim.sub','',false);",
        );
        assert.equal(
          (await db.query("select * from public.transactions")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.session_charges")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "Seed 25 thành viên chạy lại không trùng, giữ chỉnh sửa; chỉ nhận level 1–3",
      async () => {
        await db.exec("reset role;");
        const seed = await readFile(
          new URL("../supabase/seed.sql", import.meta.url),
          "utf8",
        );
        await db.exec(seed);
        await db.exec(seed);
        const roster = (
          await db.query<{
            id: string;
            full_name: string;
            position: string;
            level: number;
          }>(
            "select * from public.team_members where id::text like 'a18f0000-%' order by id",
          )
        ).rows;
        assert.equal(roster.length, 25);
        assert.equal(roster[0].full_name, "Huy Đào");
        assert.equal(roster[24].full_name, "Vũ Nguyên");
        assert.equal(roster[7].position, "FW");
        assert.equal(roster[18].position, "DF_GK");
        assert.ok(roster.every((p) => p.level >= 1 && p.level <= 3));
        await db.query("update public.team_members set level=2 where id=$1", [
          roster[0].id,
        ]);
        await db.exec(seed);
        assert.equal(
          (
            await db.query<{ level: number }>(
              "select level from public.team_members where id=$1",
              [roster[0].id],
            )
          ).rows[0].level,
          2,
        );
        await assert.rejects(
          db.query("update public.team_members set level=4 where id=$1", [
            roster[0].id,
          ]),
          /check constraint/,
        );
        await assert.rejects(
          db.query("update public.team_members set level=0 where id=$1", [
            roster[0].id,
          ]),
          /check constraint/,
        );
        // Tạo trận mới sau khi seed: danh sách mặc định lấy đủ người đang hoạt động.
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`,
        );
        const created = (
          await db.query<{ id: string }>(
            "select public.save_session(null,'Trận mới',now()+interval '1 day',90,'Sân A','',700000,'') as id",
          )
        ).rows[0].id;
        const ids = (
          await db.query<{ roster_ids: string[] }>(
            "select roster_ids from public.sessions where id=$1",
            [created],
          )
        ).rows[0].roster_ids;
        assert.ok(roster.every((p) => ids.includes(p.id)));
        assert.equal(
          (
            await db.query("select * from public.votes where session_id=$1", [
              created,
            ])
          ).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
