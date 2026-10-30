import type { Position, Profile } from "./types";

// Danh sách MEM FC do chủ đội cung cấp. Lv3 là mức cao nhất.
// ID cố định giúp nhập Supabase nhiều lần mà không tạo trùng thành viên.
const members: [string, Position, number][] = [
  ["Huy Đào", "GK", 3],
  ["Đỗ Tài", "FW", 3],
  ["Phương Đỉnh", "DF", 3],
  ["Thuận Nguyễn", "GK", 3],
  ["Nhật Huy(CR7)", "FW", 3],
  ["Đăng Gà", "DF", 2],
  ["Lượng", "FW", 2],
  ["Đăng logout", "FW", 1],
  ["Duy Hưng", "FW", 2],
  ["Khá", "DF", 3],
  ["Khang Hồ", "FW", 2],
  ["Huy nhỏ xíu", "FW", 3],
  ["Duy nguyễn", "FW", 1],
  ["Hoàng Linh", "MF", 3],
  ["Minh Tiến", "DF", 3],
  ["Ngô Phúc Quý", "GK", 2],
  ["Đăng Thiên", "FW", 1],
  ["Trung Tín", "FW", 2],
  ["Nhật Linh", "DF_GK", 2],
  ["Phương Trần", "FW", 2],
  ["Quốc Ân", "DF", 3],
  ["Thanh", "GK", 2],
  ["Thuận Mai", "DF", 3],
  ["Văn Tiến", "FW", 2],
  ["Vũ Nguyên", "FW", 1],
];

export const DEFAULT_ROSTER = members.map(
  ([full_name, position, level], i) => ({
    id: `a18f0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    full_name,
    position,
    level,
  }),
);

export function createDefaultRoster(): Profile[] {
  const created_at = new Date().toISOString();
  return DEFAULT_ROSTER.map((member) => ({
    ...member,
    role: "member",
    active: true,
    created_at,
  }));
}
