import { writeFile } from "node:fs/promises";
import { DEFAULT_ROSTER } from "../lib/roster";

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;
const values = DEFAULT_ROSTER.map(
  (p) =>
    `  (${sqlString(p.id)}, ${sqlString(p.full_name)}, ${sqlString(p.position)}, ${p.level})`,
).join(",\n");
async function main() {
  await writeFile(
    new URL("../supabase/seed.sql", import.meta.url),
    `-- Sinh từ lib/roster.ts bằng npm run seed:generate.\n-- Chạy sau migration 001. Chạy lại không ghi đè chỉnh sửa hoặc tạo trùng ID.\n-- Chỉ thêm danh sách thành viên, không tạo trận, bình chọn hay thu chi.\nbegin;\ninsert into public.team_members(id, full_name, position, level) values\n${values}\non conflict (id) do nothing;\ncommit;\n`,
    "utf8",
  );
  console.log(
    `Đã tạo supabase/seed.sql với ${DEFAULT_ROSTER.length} thành viên.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
