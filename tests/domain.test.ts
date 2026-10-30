import test from "node:test";
import assert from "node:assert/strict";
import {
  balanceTeams,
  canPlay,
  csvCell,
  monthKey,
  monthlySummary,
  splitCost,
} from "../lib/domain";
import { demoData } from "../lib/demo";
import type { Profile } from "../lib/types";

test("Chia quỹ: tổng luôn chính xác, chênh lệch không quá 1 đồng", () => {
  for (const total of [0, 1, 2, 100, 700000, 100000000])
    for (let count = 1; count < 31; count++) {
      const ids = Array.from({ length: count }, (_, i) => `member-${i}`);
      const values = Object.values(splitCost(total, ids));
      assert.equal(
        values.reduce((n, x) => n + x, 0),
        total,
      );
      assert.ok(Math.max(...values) - Math.min(...values) <= 1);
      assert.deepEqual(
        splitCost(total, ids),
        splitCost(total, [...ids].reverse()),
      );
    }
  assert.throws(() => splitCost(100, []));
  assert.throws(() => splitCost(100, ["a", "a"]));
  assert.throws(() => splitCost(-1, ["a"]));
  assert.throws(() => splitCost(2.5, ["a"]));
});
test("Chia đội: không mất / trùng người; cân số người, level, thủ môn", () => {
  for (let count = 2; count <= 30; count++) {
    const players: Profile[] = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      full_name: `Người ${i}`,
      level: (i % 3) + 1,
      position:
        i < 2 ? "GK" : (["DF", "MF", "FW"][i % 3] as Profile["position"]),
      active: true,
      role: "member",
      created_at: "2026-01-01",
    }));
    const teams = balanceTeams(players);
    assert.deepEqual(
      [...teams.a, ...teams.b].sort(),
      players.map((p) => p.id).sort(),
    );
    assert.ok(Math.abs(teams.a.length - teams.b.length) <= 1);
    assert.notEqual(teams.a.includes("0"), teams.a.includes("1"));
    assert.deepEqual(teams, balanceTeams([...players].reverse()));
  }
  assert.throws(() => balanceTeams([]));
});
test("Tháng báo cáo dùng múi giờ Việt Nam tại ranh giới tháng", () => {
  assert.equal(monthKey("2026-09-30T16:59:59Z"), "2026-09");
  assert.equal(monthKey("2026-09-30T17:00:00Z"), "2026-10");
});
test("Thu thực nhận vào tháng thu, nợ theo tháng đá, số dư chuyển kỳ", () => {
  const data = demoData();
  data.sessions = [
    {
      id: "match",
      title: "Trận tháng trước",
      starts_at: "2026-09-29T12:00:00Z",
      duration: 90,
      venue: "Sân A",
      address: "",
      cost: 720000,
      notes: "",
      roster_ids: data.profiles.slice(0, 12).map((p) => p.id),
      finalized_at: "2026-09-29T14:00:00Z",
      lineup: null,
      created_at: "2026-09-28T00:00:00Z",
    },
  ];
  data.charges = data.profiles
    .slice(0, 12)
    .map((p, i) => ({
      id: `charge-${i}`,
      session_id: "match",
      user_id: p.id,
      full_name: p.full_name,
      position: p.position,
      level: p.level,
      amount: 60000,
      paid_at: i < 9 ? "2026-10-01T10:00:00Z" : null,
    }));
  data.transactions = [
    {
      id: "1",
      session_id: null,
      charge_id: null,
      kind: "income",
      amount: 1000000,
      description: "Đầu kỳ",
      occurred_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "2",
      session_id: data.sessions[0].id,
      charge_id: null,
      kind: "expense",
      amount: 720000,
      description: "Tiền sân",
      occurred_at: "2026-09-29T14:00:00Z",
    },
    {
      id: "3",
      session_id: data.sessions[0].id,
      charge_id: data.charges[0].id,
      kind: "income",
      amount: 60000,
      description: "Đóng quỹ tháng trước",
      occurred_at: "2026-10-01T10:00:00Z",
    },
  ];
  assert.equal(monthlySummary(data, "2026-10").opening, 280000);
  assert.equal(monthlySummary(data, "2026-10").closing, 340000);
  assert.equal(monthlySummary(data, "2026-10").income, 60000);
  assert.equal(monthlySummary(data, "2026-10").unpaid, 0);
  assert.equal(monthlySummary(data, "2026-09").unpaid, 180000);
});
test("CSV escape dấu nháy và chặn công thức từ nội dung người nhập", () => {
  assert.equal(csvCell('Anh "Huy"'), '"Anh ""Huy"""');
  assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
});

test("Hậu vệ kiêm thủ môn hỗ trợ chia đều thủ môn, không nhân đôi người", () => {
  const players = demoData().profiles;
  const flex = players.find((p) => p.full_name === "Nhật Linh")!;
  const keeper = players.find((p) => p.full_name === "Huy Đào")!;
  assert.ok(canPlay(flex, "DF"));
  assert.ok(canPlay(flex, "GK"));
  assert.ok(!canPlay(flex, "FW"));
  const available = [
    flex,
    keeper,
    ...players.filter((p) => !canPlay(p, "GK")).slice(0, 8),
  ];
  const teams = balanceTeams(available);
  assert.equal(teams.a.length, 5);
  assert.equal(teams.b.length, 5);
  assert.equal(new Set([...teams.a, ...teams.b]).size, available.length);
  assert.notEqual(teams.a.includes(flex.id), teams.a.includes(keeper.id));
});

test("Danh sách khởi tạo đủ 25 người, đúng level 1–3, không gán bình chọn hoặc khoản quỹ mẫu", () => {
  const data = demoData();
  assert.equal(data.profiles.length, 25);
  assert.equal(new Set(data.profiles.map((p) => p.id)).size, 25);
  assert.equal(new Set(data.profiles.map((p) => p.full_name)).size, 25);
  assert.ok(
    data.profiles.every((p) => p.level >= 1 && p.level <= 3 && p.active),
  );
  assert.deepEqual(
    data.profiles.filter((p) => p.level === 1).map((p) => p.full_name),
    ["Đăng logout", "Duy nguyễn", "Đăng Thiên", "Vũ Nguyên"],
  );
  assert.equal(
    data.profiles.find((p) => p.full_name === "Đăng logout")!.position,
    "FW",
  );
  assert.equal(
    data.profiles.find((p) => p.full_name === "Nhật Linh")!.position,
    "DF_GK",
  );
  assert.deepEqual(
    [
      data.sessions,
      data.votes,
      data.vote_history,
      data.charges,
      data.transactions,
    ],
    [[], [], [], [], []],
  );
});
