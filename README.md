# MEM FC

App Next.js + Supabase dành cho đội bóng, triển khai trên Vercel. Giao diện tiếng Việt, dùng trên điện thoại và máy tính, múi giờ Việt Nam (UTC+7).

## Luồng sử dụng

1. Có sẵn danh sách 25 thành viên MEM FC, level 1–3 (lv3 cao nhất). Vị trí GK = thủ môn, HV = hậu vệ, TV = tiền vệ, TĐ = tiền đạo. Nhật Linh có hai vị trí HV / GK; Đăng logout là TĐ lv1. Quản trị viên có thể thêm thành viên, đổi vị trí hoặc level.
2. Tạo trận: ngày giờ, thời lượng, sân, địa chỉ và lời nhắn. Chưa cần nhập tiền sân.
3. Mở trang **Điểm danh**, lọc **Tất cả / Sắp diễn ra / Đã diễn ra**, rồi chọn một trận để mở **Bình chọn tham gia**. Trang **Lịch ra sân** đã được gộp vào đây. Có thể gửi link mở thẳng trận đã chọn. Thành viên chọn đúng tên và bấm **Có tham gia** hoặc **Không tham gia**, không cần tài khoản. Một tên chỉ có một kết quả hiện tại cho mỗi trận, có thể đổi khi bình chọn còn mở, có lịch sử thay đổi. Quản trị viên bấm **Khóa bình chọn** để ẩn phần chọn tên và hai nút Có/Không cho trận đó; Supabase cũng chặn ghi bình chọn mới hoặc đổi lựa chọn. Danh sách đã đăng ký được giữ nguyên, vẫn chia đội và chốt thu tiền được. Chỉ có thể **Mở lại bình chọn** khi trận chưa bắt đầu và chưa chốt quỹ. Từ giờ bắt đầu, app tự ẩn phần chọn tên và các nút bình chọn, chỉ hiển thị thông tin đăng ký và lịch sử đã có; Supabase cũng từ chối bình chọn mới hoặc đổi lựa chọn, kể cả từ tab cũ.
4. Xem **đã trả lời / tổng thành viên**, số có đá, không đá, chưa trả lời. Bấm chia đội, nhập màu áo đội A và B trong popup rồi xác nhận. App chia đội theo số người, level, vị trí và lưu đội hình cùng màu áo theo từng trận trên Supabase để mọi thiết bị cùng xem được. Đổi bình chọn hoặc level/vị trí sẽ xóa đội hình chưa chốt để chia lại.
5. Sau giờ bắt đầu, chia và lưu đội A/B rồi bấm **Chốt thu tiền**. Nhập mức đóng mỗi người đội A, mức đóng mỗi người đội B và tiền sân. App tính tổng phải thu, phần cần bù từ số dư quỹ hiện có và số dư dự kiến sau khi thu đủ. Nếu vẫn thiếu tiền, chặn chốt để điều chỉnh. Chốt lưu tên / level / vị trí / đội và khoản phải đóng, khóa bình chọn, ghi đúng một khoản chi tiền sân; chưa ghi thu. Mức đóng 0 được ghi là miễn đóng.
6. Khi thực nhận tiền, quản trị viên xác nhận đã thu cho từng người. Báo cáo tháng tính theo ngày thực thu/chi; nợ đóng quỹ theo tháng diễn ra buổi đá. Có số dư đầu kỳ, tổng thu, tổng chi, số dư cuối kỳ, khoản chưa thu.

Danh sách thành viên của trận được lưu tại thời điểm tạo. Thêm hoặc tạm ngừng thành viên chỉ ảnh hưởng danh sách mặc định của trận tạo sau đó. Thành viên cũ và lịch sử không bị xóa.

**Bình chọn theo tên dựa trên sự tin tưởng:** người có link có thể chọn bất kỳ tên nào trong danh sách. App không xác thực danh tính người bình chọn. Tên, lịch, đội hình và lịch sử bình chọn có thể xem bằng link public; sổ quỹ, khoản phải đóng và trạng thái đã thu / chưa thu cũng được xem công khai. Chỉ quản trị viên được xác nhận đã thu hoặc ghi thu / chi. Tiền được theo dõi trong sổ, không có cổng thanh toán hoặc tự xác minh chuyển khoản.

## Chạy thử

Yêu cầu Node.js 22 trở lên (theo phiên bản Supabase SDK đang dùng).

```powershell
npm install
npm run dev
```

Mở http://localhost:3000. Khi chưa cấu hình Supabase, app có **chế độ dùng thử** được ghi rõ trên giao diện. Danh sách 25 thành viên đã sẵn sàng; lịch đá, bình chọn và sổ quỹ khởi tạo trống. Có đủ quyền thử chức năng quản trị. Dữ liệu lưu trong localStorage của trình duyệt, không chia sẻ giữa các thiết bị và không tự đồng bộ lên Supabase. Bộ dữ liệu mẫu cũ được giữ tại key `memfc-demo-v1`; bản mới dùng key `memfc-team-preview-v2` để không gán bình chọn hoặc khoản tiền mẫu cho tên thật.

Danh sách gốc nằm ở `lib/roster.ts`. File `supabase/seed.sql` được sinh bằng `npm run seed:generate`, dùng ID cố định; chạy lại không tạo trùng hoặc ghi đè chỉnh sửa của quản trị viên. File này chỉ chứa thành viên, không có trận, bình chọn, tiền thu hay khoản nợ.

## Kết nối Supabase Free

1. Tạo một project trên [Supabase](https://supabase.com/dashboard).
2. Chạy toàn bộ `supabase/migrations/001_memfc.sql` trong SQL Editor **một lần trên project mới**, tiếp theo chạy lần lượt `supabase/migrations/20261021065505_team_fees_at_settlement.sql`, `supabase/migrations/20261021075712_team_shirt_colors.sql`, `supabase/migrations/20261021081549_session_voting_lock.sql`, `supabase/migrations/20261021083647_attendance_vote_deadline.sql`, `supabase/migrations/20261021091543_public_fund_read_access.sql`, sau đó chạy `supabase/seed.sql` để thêm đúng 25 thành viên. Migration tạo bảng, RLS và các RPC, giới hạn level 1–3 và hỗ trợ hậu vệ kiêm thủ môn. Khi nâng cấp project đã có dữ liệu, tạo migration mới; không chạy lại file khởi tạo.
3. Sao chép `.env.example` thành `.env.local` rồi điền Project URL và **publishable key** (hoặc anon key cũ vào biến `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Không dùng `service_role` hoặc secret key ở biến `NEXT_PUBLIC_*`.
4. Trong Authentication → Users, tạo một tài khoản email/mật khẩu cho quản trị viên và xác nhận email. Tắt **Allow new users to sign up** nếu không cần đăng ký tài khoản công khai. Thành viên của đội không cần Supabase Auth.
5. Cấp quyền quản trị bằng SQL, thay đúng email đã tạo:

```sql
insert into public.admins(user_id)
select id from auth.users where lower(email) = lower('EMAIL_QUAN_TRI_CUA_BAN')
on conflict do nothing;
```

6. Khởi động lại app. Bấm biểu tượng huy hiệu góc trên bên phải để đăng nhập quản trị (hoặc mục Quản trị viên ở thanh bên). Kiểm tra danh sách đã nhập, rồi tạo trận đầu tiên với thời gian và địa điểm thật. Mỗi trận bắt đầu với 0/25 người trả lời nếu cả 25 thành viên vẫn đang hoạt động.

Danh sách tự tải lại mỗi 30 giây khi trang đang hiển thị và khi quay lại cửa sổ. Không cần cấu hình Supabase Realtime. Mọi thay đổi nhạy cảm được kiểm tra quyền trong PostgreSQL RPC. Khách chỉ được ghi bình chọn theo tên trong danh sách trận; không được sửa trực tiếp bảng, chi phí, level, đội hình, quỹ hoặc quyền admin. Chốt quỹ và bình chọn dùng cùng khóa hàng để không lệch dữ liệu khi thao tác đồng thời. Xác nhận đã thu có khóa và ràng buộc unique để chống ghi nhận hai lần.

## Nâng cấp luồng chốt tiền trên project đang dùng

Chạy **chỉ** `supabase/migrations/20261021065505_team_fees_at_settlement.sql` một lần, rồi triển khai mã nguồn mới. Migration giữ nguyên lịch, bình chọn, khoản phải đóng và giao dịch cũ; không chạy lại file khởi tạo hoặc seed để nâng cấp. Bản cũ trong tab đang mở sẽ yêu cầu tải lại trước khi chốt. Hai RPC mới vẫn chỉ cho quản trị viên thao tác.

Số dư dùng để bù là toàn bộ tiền thực thu trừ thực chi đến hiện tại, gồm tiền chuyển từ kỳ trước. Các khoản chưa thu không được dùng lại để bù trận khác. Sau khi ghi tiền sân và trong lúc chờ thu, số dư thực tế có thể tạm âm; số dư dự kiến sau khi thu đủ phải từ 0 trở lên mới cho chốt. Tiền sân chỉ bị trừ một lần, không ghi thêm khoản chi cho phần bù.

## Triển khai Vercel Hobby

Quỹ công khai: project hiện tại đã áp dụng `supabase/migrations/20261021091543_public_fund_read_access.sql`. Mọi người được đọc `session_charges` và `transactions`; RLS vẫn bật, không cấp quyền ghi trực tiếp. RPC xác nhận thu tiền và ghi thu / chi vẫn kiểm tra quyền admin tại database. Website cần deploy bản mới để mở trang quỹ cho khách.

Tài khoản đóng quỹ hiển thị ở đầu trang: **VIB — 020568736 — NGUYỄN PHƯƠNG ĐỈNH**. QR chuyển khoản tĩnh nằm tại `public/vib-020568736.svg`, tạo bằng [VietQR Quick Link](https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh/) với mã ngân hàng VIB và số tài khoản được cung cấp, không ấn định số tiền. Nhấn QR để mở ảnh lớn.

Điểm danh và hạn bình chọn: project Supabase hiện tại đã được cập nhật bằng `supabase/migrations/20261021083647_attendance_vote_deadline.sql`. RPC dùng giờ máy chủ để chặn bình chọn và mở lại bình chọn từ giờ bắt đầu trận. Không đổi dữ liệu bình chọn cũ, đội hình hoặc thu chi. Cần deploy mã nguồn mới để có giao diện Điểm danh mới.

Khóa bình chọn: project Supabase hiện tại đã được nâng cấp bằng `supabase/migrations/20261021081549_session_voting_lock.sql`. Cột `sessions.voting_locked_at` lưu trạng thái khóa theo trận. RPC `set_voting_locked` kiểm tra quyền quản trị; `cast_vote` dùng cùng khóa hàng và chặn mọi lượt bình chọn khi trận khóa hoặc đã chốt. Việc khóa không đổi danh sách, lịch sử, đội hình hoặc thu chi. Mã nguồn mới cần được deploy lên Vercel để hiển thị nút khóa/mở lại và ẩn phần bình chọn. Trang khác tự cập nhật theo chu kỳ 30 giây hoặc khi quay lại tab; có thể tải lại trang để thấy ngay.

Màu áo: project Supabase hiện tại đã được nâng cấp bằng `supabase/migrations/20261021075712_team_shirt_colors.sql`. Hai cột `team_a_color`, `team_b_color` nằm trong `sessions`; RPC `save_lineup_with_colors` chỉ cho quản trị viên lưu màu áo cùng đội hình. Website cần triển khai mã nguồn mới để có popup màu áo. Với project khác đã có dữ liệu, chỉ chạy migration này một lần để thêm tính năng; không khởi tạo lại dữ liệu.

Website hiện tại: [memfc-it.vercel.app](https://memfc-it.vercel.app). Project [Vercel MEM FC](https://vercel.com/mem-fc/memfc) thuộc team `mem-fc`, dùng Hobby. Project [Supabase MEM FC](https://supabase.com/dashboard/project/spgkhligurnsgxutlwhc) thuộc org `dfzsiotvptnvlbrvjriq`, vùng Singapore, dùng Free. Cơ sở dữ liệu đã khởi tạo 25 thành viên; không chạy lại migration khởi tạo trên project này.

Bản đầu được tải qua **Vercel Drop**, chưa kết nối GitHub. Để cập nhật, tải thư mục mã nguồn đã lọc lên project hiện có; không tải `node_modules`, `.next`, `artifacts` hoặc `.env.local`. Thay đổi biến môi trường có thể dùng **Redeploy** từ dashboard, không cần tải lại mã nguồn.

Khi muốn kết nối GitHub hoặc tạo môi trường mới:

1. Đưa mã nguồn lên repository GitHub của bạn (không commit `.env.local`).
2. Trong [Vercel](https://vercel.com/new), Import repository, chọn framework **Next.js**; giữ lệnh build mặc định `npm run build`. Với project hiện có, dùng **Connect Git** trong phần Settings thay vì tạo project trùng.
3. Thêm hai biến production `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` giống `.env.local`.
4. Deploy. Đặt tên project `memfc` nếu còn khả dụng; địa chỉ `memfc.vercel.app` chỉ có sau khi Vercel cấp thành công. Nếu đã có người dùng tên này, chọn tên khác. Thay đổi biến `NEXT_PUBLIC_*` cần redeploy vì chúng được nhúng vào bản build.
5. Thử trên một trình duyệt khác: mở link, chọn tên, bình chọn; kiểm tra trên trình duyệt quản trị sau khi tải lại. Khách xem được quỹ và trạng thái đóng tiền; chỉ quản trị viên thấy nút xác nhận đã thu và ghi thu / chi.

Hosting Hobby phù hợp cho dự án cá nhân phi thương mại theo [điều kiện Vercel](https://vercel.com/docs/plans/hobby). Miễn phí trong hạn mức của [Supabase Free](https://supabase.com/pricing) và Vercel; không cần thuê server hoặc mua tên miền. Tài khoản, project và deployment phải được kết nối trước khi có link dùng chung.

## Kiểm tra

```powershell
npm run typecheck
npm test
npm run build
```

Test domain kiểm tra chia tiền chính xác, chia đội, ranh giới tháng theo UTC+7, khoản chưa thu và CSV. Test PostgreSQL dùng PGlite chạy migration thực, kiểm tra quyền anon / tài khoản chưa cấp quyền / admin, bình chọn và lịch sử, snapshot danh sách, chốt quỹ và chống ghi thu trùng. Test này không thay thế kiểm tra cấu hình và hạn mức trên Supabase production.

## Phạm vi phiên bản đầu

Một đội bóng, hai đội trong mỗi buổi, hai lựa chọn Có / Không, mỗi đội có một mức đóng cho mỗi người. Không có xác thực danh tính thành viên, phí vắng mặt, tích hợp ngân hàng, tự gửi tin nhắn, xóa sổ hoặc sửa giao dịch đã ghi. Khoản thu/chi bổ sung có thể dùng để ghi điều chỉnh với mô tả rõ ràng. Khi có nhiều dữ liệu cần bổ sung phân trang phía server (PostgREST mặc định giới hạn số hàng trả về); bản hiện tại phục vụ quy mô một đội và sẽ báo lỗi khi tập dữ liệu vượt mức đọc an toàn, không tính báo cáo trên tập dữ liệu bị cắt.
# memfc
