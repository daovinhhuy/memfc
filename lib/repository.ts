import { supabase } from "./supabase";
import { DEMO_KEY, demoData } from "./demo";
import { cashBalance, settlementPlan } from "./domain";
import { MAX_LEVEL, positions } from "./types";
import type {
  ClubData,
  Lineup,
  MatchInput,
  Position,
  SettlementInput,
  TeamColors,
  VoteStatus,
} from "./types";

function demoRead(): ClubData {
  const stored = localStorage.getItem(DEMO_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as ClubData;
    } catch {
      localStorage.removeItem(DEMO_KEY);
    }
  }
  const data = demoData();
  localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  return data;
}
function demoWrite(mutate: (data: ClubData) => void) {
  const data = demoRead();
  mutate(data);
  localStorage.setItem(DEMO_KEY, JSON.stringify(data));
}
async function rpc(name: string, params: Record<string, unknown>) {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const { error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
}
function validateMember(position: Position, level: number) {
  if (
    !Object.hasOwn(positions, position) ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > MAX_LEVEL
  )
    throw new Error("Chọn vị trí hợp lệ và level từ 1 đến 3.");
}
export async function loadData(demo: boolean): Promise<ClubData> {
  if (demo) return demoRead();
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const tables = [
    "team_members",
    "sessions",
    "votes",
    "vote_history",
    "session_charges",
    "transactions",
  ] as const;
  const results = await Promise.all(
    tables.map((t) => supabase!.from(t).select("*", { count: "exact" })),
  );
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
    if (result.count !== null && result.count > (result.data?.length || 0))
      throw new Error(
        "Dữ liệu vượt giới hạn đọc một lần. Cần bật phân trang trước khi tiếp tục để báo cáo không bị thiếu.",
      );
  }
  const data = Object.fromEntries(
    results.map((result, i) => [
      tables[i] === "session_charges"
        ? "charges"
        : tables[i] === "team_members"
          ? "profiles"
          : tables[i],
      result.data,
    ]),
  ) as ClubData;
  data.profiles.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  return data;
}
export async function castVote(
  demo: boolean,
  sessionId: string,
  memberId: string,
  status: VoteStatus,
) {
  if (!demo)
    return rpc("cast_vote", {
      p_session: sessionId,
      p_member: memberId,
      p_status: status,
    });
  demoWrite((data) => {
    const match = data.sessions.find((s) => s.id === sessionId);
    if (!match || match.finalized_at)
      throw new Error("Buổi đá đã chốt danh sách.");
    if (match.voting_locked_at)
      throw new Error("Bình chọn của trận này đã bị khóa.");
    if (new Date(match.starts_at).getTime() <= Date.now())
      throw new Error("Trận đã diễn ra, không thể bình chọn hoặc đổi lựa chọn.");
    if (!match.roster_ids.includes(memberId))
      throw new Error("Tên này không có trong danh sách trận.");
    if (
      data.votes.some(
        (v) =>
          v.session_id === sessionId &&
          v.user_id === memberId &&
          v.status === status,
      )
    )
      return;
    const vote = {
      session_id: sessionId,
      user_id: memberId,
      status,
      updated_at: new Date().toISOString(),
    };
    data.votes = [
      ...data.votes.filter(
        (v) => !(v.session_id === sessionId && v.user_id === memberId),
      ),
      vote,
    ];
    data.vote_history.push({ ...vote, id: crypto.randomUUID() });
    match.lineup = null;
  });
}
export async function setVotingLocked(demo: boolean, sessionId: string, locked: boolean) {
  if (!demo)
    return rpc("set_voting_locked", { p_session: sessionId, p_locked: locked });
  demoWrite((data) => {
    const match = data.sessions.find((s) => s.id === sessionId);
    if (!match || match.finalized_at)
      throw new Error("Buổi đá không tồn tại hoặc đã chốt.");
    if (!locked && new Date(match.starts_at).getTime() <= Date.now())
      throw new Error("Trận đã diễn ra, không thể mở lại bình chọn.");
    match.voting_locked_at = locked
      ? match.voting_locked_at || new Date().toISOString()
      : null;
  });
}
export async function saveMatch(demo: boolean, input: MatchInput, id?: string) {
  if (!demo) {
    if (!supabase) throw new Error("Chưa cấu hình Supabase.");
    const { data, error } = await supabase.rpc("save_session_v2", {
      p_id: id || null,
      p_title: input.title,
      p_starts: input.starts_at,
      p_duration: input.duration,
      p_venue: input.venue,
      p_address: input.address,
      p_notes: input.notes,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  const resultId = id || crypto.randomUUID();
  demoWrite((data) => {
    if (id) {
      const match = data.sessions.find((s) => s.id === id);
      if (!match || match.finalized_at)
        throw new Error("Buổi đá đã chốt, không thể sửa.");
      Object.assign(match, input);
    } else {
      const ids = data.profiles.filter((p) => p.active).map((p) => p.id);
      if (!ids.length)
        throw new Error("Hãy thêm thành viên vào danh sách đội trước.");
      data.sessions.push({
        ...input,
        cost: null,
        roster_ids: ids,
        id: resultId,
        finalized_at: null,
        voting_locked_at: null,
        lineup: null,
        created_at: new Date().toISOString(),
      });
    }
  });
  return resultId;
}
export async function saveLineup(
  demo: boolean,
  sessionId: string,
  lineup: Lineup,
  colors: TeamColors,
) {
  const a = colors.a.trim(), b = colors.b.trim();
  if (!a || !b || a.length > 40 || b.length > 40)
    throw new Error("Màu áo mỗi đội phải có từ 1 đến 40 ký tự.");
  if (!demo)
    return rpc("save_lineup_with_colors", {
      p_session: sessionId, p_lineup: lineup,
      p_team_a_color: a, p_team_b_color: b,
    });
  demoWrite((data) => {
    const match = data.sessions.find((s) => s.id === sessionId);
    if (!match || match.finalized_at) throw new Error("Buổi đá đã chốt.");
    match.lineup = lineup;
    match.team_a_color = a;
    match.team_b_color = b;
  });
}
export async function updateLineup(
  demo: boolean,
  sessionId: string,
  lineup: Lineup,
) {
  if (!demo) return rpc("save_lineup", { p_session: sessionId, p_lineup: lineup });
  demoWrite((data) => {
    const match = data.sessions.find((s) => s.id === sessionId);
    if (!match || match.finalized_at) throw new Error("Buổi đá đã chốt.");
    match.lineup = lineup;
  });
}
export async function finalize(demo: boolean, sessionId: string, input: SettlementInput) {
  if (!demo) return rpc("finalize_team_fees", {
    p_session: sessionId, p_team_a_fee: input.teamAFee,
    p_team_b_fee: input.teamBFee, p_cost: input.cost, p_lineup: input.lineup,
  });
  demoWrite((data) => {
    const match = data.sessions.find((s) => s.id === sessionId);
    if (!match || match.finalized_at) throw new Error("Buổi đá đã chốt.");
    if (new Date(match.starts_at).getTime() > Date.now())
      throw new Error("Chỉ chốt quỹ sau giờ bắt đầu buổi đá.");
    const ids = data.votes
      .filter((v) => v.session_id === sessionId && v.status === "yes")
      .map((v) => v.user_id);
    if (!match.lineup || JSON.stringify(match.lineup) !== JSON.stringify(input.lineup))
      throw new Error("Đội hình đã thay đổi. Hãy mở lại màn hình chốt.");
    const plan = settlementPlan(input, ids, cashBalance(data.transactions));
    if (plan.shortfall) throw new Error(`Quỹ và khoản thu dự kiến còn thiếu ${plan.shortfall.toLocaleString("vi-VN")} đ. Hãy điều chỉnh mức thu.`);
    const finalizedAt = new Date().toISOString();
    for (const id of ids) {
      const p = data.profiles.find((p) => p.id === id)!;
      data.charges.push({
        id: crypto.randomUUID(),
        session_id: sessionId,
        user_id: id,
        full_name: p.full_name,
        position: p.position,
        level: p.level,
        team: input.lineup.a.includes(id) ? "A" : "B",
        amount: input.lineup.a.includes(id) ? input.teamAFee : input.teamBFee,
        paid_at: (input.lineup.a.includes(id) ? input.teamAFee : input.teamBFee) === 0 ? finalizedAt : null,
      });
    }
    match.cost = input.cost;
    match.finalized_at = finalizedAt;
    data.transactions.push({
      id: crypto.randomUUID(),
      session_id: sessionId,
      charge_id: null,
      kind: "expense",
      amount: match.cost,
      description: `Tiền sân: ${match.title}`,
      occurred_at: match.finalized_at,
    });
  });
}
export async function markPaid(demo: boolean, chargeId: string) {
  if (!demo) return rpc("mark_charge_paid", { p_charge: chargeId });
  demoWrite((data) => {
    const c = data.charges.find((c) => c.id === chargeId);
    if (!c || c.paid_at) throw new Error("Khoản quỹ đã được ghi nhận.");
    c.paid_at = new Date().toISOString();
    data.transactions.push({
      id: crypto.randomUUID(),
      session_id: c.session_id,
      charge_id: c.id,
      kind: "income",
      amount: c.amount,
      description: `Đóng quỹ · ${c.full_name}`,
      occurred_at: c.paid_at,
    });
  });
}
export async function addTransaction(
  demo: boolean,
  kind: "income" | "expense",
  amount: number,
  description: string,
  occurredAt: string,
) {
  if (!demo)
    return rpc("add_transaction", {
      p_kind: kind,
      p_amount: amount,
      p_description: description,
      p_occurred: occurredAt,
    });
  demoWrite((data) =>
    data.transactions.push({
      id: crypto.randomUUID(),
      session_id: null,
      charge_id: null,
      kind,
      amount,
      description,
      occurred_at: occurredAt,
    }),
  );
}
export async function updateMember(
  demo: boolean,
  id: string,
  position: Position,
  level: number,
  active: boolean,
) {
  validateMember(position, level);
  if (!demo)
    return rpc("update_member", {
      p_user: id,
      p_position: position,
      p_level: level,
      p_active: active,
    });
  demoWrite((data) => {
    const p = data.profiles.find((p) => p.id === id)!;
    Object.assign(p, { position, level, active });
    for (const session of data.sessions)
      if (!session.finalized_at) session.lineup = null;
  });
}
export async function addMember(
  demo: boolean,
  fullName: string,
  position: Position,
  level: number,
) {
  validateMember(position, level);
  if (!fullName.trim() || fullName.trim().length > 80)
    throw new Error("Tên thành viên phải có từ 1 đến 80 ký tự.");
  if (!demo)
    return rpc("add_member", {
      p_name: fullName,
      p_position: position,
      p_level: level,
    });
  demoWrite((data) =>
    data.profiles.push({
      id: crypto.randomUUID(),
      full_name: fullName.trim(),
      position,
      level,
      active: true,
      role: "member",
      created_at: new Date().toISOString(),
    }),
  );
}
