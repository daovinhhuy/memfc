import type { ClubData } from "./types";
import { createDefaultRoster } from "./roster";

// Giữ nguyên bộ dữ liệu mẫu v1 cũ trong localStorage; bắt đầu bản xem thử
// mới với đúng danh sách đội, không gán bình chọn hoặc tiền nợ mẫu cho ai.
export const DEMO_KEY = "memfc-team-preview-v2";

export function demoData(): ClubData {
  return {
    profiles: createDefaultRoster(),
    sessions: [],
    votes: [],
    vote_history: [],
    charges: [],
    transactions: [],
  };
}
