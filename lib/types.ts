export type Position = "GK" | "DF" | "MF" | "FW" | "DF_GK";
export type VoteStatus = "yes" | "no";
export type Profile = {
  id: string;
  full_name: string;
  position: Position;
  level: number;
  role: "admin" | "member";
  active: boolean;
  created_at: string;
};
export type Lineup = { a: string[]; b: string[] };
export type TeamColors = { a: string; b: string };
export type Match = {
  id: string;
  title: string;
  starts_at: string;
  duration: number;
  venue: string;
  address: string;
  cost: number | null;
  notes: string;
  roster_ids: string[];
  finalized_at: string | null;
  voting_locked_at?: string | null;
  lineup: Lineup | null;
  team_a_color?: string | null;
  team_b_color?: string | null;
  created_at: string;
};
export type Vote = {
  session_id: string;
  user_id: string;
  status: VoteStatus;
  updated_at: string;
};
export type VoteHistory = Vote & { id: string };
export type Charge = {
  id: string;
  session_id: string;
  user_id: string;
  full_name: string;
  position: Position;
  level: number;
  amount: number;
  paid_at: string | null;
  team?: "A" | "B" | null;
};
export type Transaction = {
  id: string;
  session_id: string | null;
  charge_id: string | null;
  kind: "income" | "expense";
  amount: number;
  description: string;
  occurred_at: string;
};
export type ClubData = {
  profiles: Profile[];
  sessions: Match[];
  votes: Vote[];
  vote_history: VoteHistory[];
  charges: Charge[];
  transactions: Transaction[];
};
export type MatchInput = Pick<
  Match,
  "title" | "starts_at" | "duration" | "venue" | "address" | "notes"
>;
export type SettlementInput = {
  teamAFee: number;
  teamBFee: number;
  cost: number;
  lineup: Lineup;
};
export const positions: Record<Position, string> = {
  GK: "Thủ môn",
  DF: "Hậu vệ",
  MF: "Tiền vệ",
  FW: "Tiền đạo",
  DF_GK: "Hậu vệ / Thủ môn",
};

export const MAX_LEVEL = 3;
export const LEVELS = [1, 2, 3] as const;
export const positionCodes: Record<Position, string> = {
  GK: "GK",
  DF: "HV",
  MF: "TV",
  FW: "TĐ",
  DF_GK: "HV / GK",
};
