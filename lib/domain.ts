import type { Charge, ClubData, Lineup, Position, Profile, SettlementInput, Transaction } from "./types";

export const money = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
export const day = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    ...options,
  }).format(new Date(value));
export const time = (value: string) =>
  day(value, {
    day: undefined,
    month: undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const monthKey = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(value));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
};
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

export function splitCost(
  total: number,
  userIds: string[],
): Record<string, number> {
  if (!Number.isSafeInteger(total) || total < 0 || total > 100_000_000)
    throw new Error("Chi phí phải là số nguyên từ 0 đến 100 triệu đồng.");
  if (!userIds.length)
    throw new Error("Cần ít nhất một người tham gia để chốt quỹ.");
  if (new Set(userIds).size !== userIds.length)
    throw new Error("Danh sách tham gia bị trùng.");
  const ids = [...userIds].sort();
  const base = Math.floor(total / ids.length),
    remainder = total % ids.length;
  return Object.fromEntries(
    ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]),
  );
}

export function canPlay(player: Pick<Profile, "position">, position: Position) {
  return (
    player.position === position ||
    (player.position === "DF_GK" && (position === "DF" || position === "GK"))
  );
}

export function cashBalance(transactions: Transaction[]) {
  return transactions.reduce((sum, tx) => sum + (tx.kind === "income" ? tx.amount : -tx.amount), 0);
}

export function settlementPlan(input: SettlementInput, participantIds: string[], balance: number) {
  for (const value of [input.teamAFee, input.teamBFee, input.cost]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000)
      throw new Error("Số tiền phải là số nguyên từ 0 đến 100 triệu đồng.");
  }
  if (!Number.isSafeInteger(balance)) throw new Error("Số dư quỹ không hợp lệ.");
  const { a, b } = input.lineup;
  const ids = [...a, ...b];
  if (!a.length || !b.length || new Set(ids).size !== ids.length ||
      ids.length !== participantIds.length || new Set(participantIds).size !== participantIds.length ||
      ids.some(id => !participantIds.includes(id)))
    throw new Error("Đội hình chưa đủ hoặc danh sách đã thay đổi. Hãy chia và lưu lại đội.");
  const aTotal = a.length * input.teamAFee;
  const bTotal = b.length * input.teamBFee;
  const total = aTotal + bTotal;
  const projectedBalance = balance + total - input.cost;
  return {
    aTotal, bTotal, total,
    fundUsed: Math.max(0, input.cost - total),
    surplus: Math.max(0, total - input.cost),
    projectedBalance,
    shortfall: Math.max(0, -projectedBalance),
  };
}

function imbalance(a: Profile[], b: Profile[]) {
  let score =
    Math.abs(
      a.reduce((n, p) => n + p.level, 0) - b.reduce((n, p) => n + p.level, 0),
    ) * 3;
  for (const pos of ["GK", "DF", "MF", "FW"] as const) {
    score +=
      Math.abs(
        a.filter((p) => canPlay(p, pos)).length -
          b.filter((p) => canPlay(p, pos)).length,
      ) * (pos === "GK" ? 18 : 4);
  }
  return score;
}

export function balanceTeams(players: Profile[]): Lineup {
  if (players.length < 2)
    throw new Error("Cần ít nhất 2 người chọn Có đá để chia đội.");
  const sorted = [...players].sort(
    (a, b) =>
      Number(canPlay(b, "GK")) - Number(canPlay(a, "GK")) ||
      b.level - a.level ||
      a.id.localeCompare(b.id),
  );
  const a: Profile[] = [],
    b: Profile[] = [];
  const maxA = Math.ceil(players.length / 2),
    maxB = Math.floor(players.length / 2);
  for (const p of sorted) {
    if (a.length >= maxA) b.push(p);
    else if (b.length >= maxB) a.push(p);
    else if (imbalance([...a, p], b) <= imbalance(a, [...b, p])) a.push(p);
    else b.push(p);
  }
  let improved = true;
  while (improved) {
    improved = false;
    const current = imbalance(a, b);
    outer: for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) {
        [a[i], b[j]] = [b[j], a[i]];
        if (imbalance(a, b) < current) {
          improved = true;
          break outer;
        }
        [a[i], b[j]] = [b[j], a[i]];
      }
  }
  return { a: a.map((p) => p.id), b: b.map((p) => p.id) };
}

export function monthlySummary(data: ClubData, month: string) {
  const tx = data.transactions.filter((t) => monthKey(t.occurred_at) === month);
  const income = tx
    .filter((t) => t.kind === "income")
    .reduce((n, t) => n + t.amount, 0);
  const expense = tx
    .filter((t) => t.kind === "expense")
    .reduce((n, t) => n + t.amount, 0);
  const opening = data.transactions
    .filter((t) => monthKey(t.occurred_at) < month)
    .reduce((n, t) => n + (t.kind === "income" ? t.amount : -t.amount), 0);
  const sessionIds = new Set(
    data.sessions
      .filter((s) => monthKey(s.starts_at) === month)
      .map((s) => s.id),
  );
  const charges: Charge[] = data.charges.filter((c) =>
    sessionIds.has(c.session_id),
  );
  return {
    tx,
    income,
    expense,
    opening,
    closing: opening + income - expense,
    unpaid: charges.filter((c) => !c.paid_at).reduce((n, c) => n + c.amount, 0),
    charges,
  };
}

export function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
