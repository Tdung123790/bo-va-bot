# Bơ & Bột — Omnichannel Bakery

Website bán bánh kết hợp bán hàng trực tuyến và tại quầy. Frontend sử dụng **HTML, CSS và JavaScript ES Modules thuần**; backend sử dụng **Supabase PostgreSQL, Auth, RPC và Edge Functions**. Mục tiêu triển khai là **GitHub private → Cloudflare Pages → Supabase Cloud**, với staging và production tách biệt.

> **Trạng thái: LOCAL đang hoàn thiện; CHƯA triển khai Cloud production.** Các chức năng cốt lõi đã qua nhiều bài kiểm thử trên Supabase LOCAL và môi trường disposable. VNPAY mới PASS unit/mock và Edge integration trong môi trường thử; **VNPAY Sandbox qua IPN HTTPS công khai chưa được nghiệm thu**. Frontend premium đang được chỉnh sửa; việc bỏ COD trên frontend **chưa đồng nghĩa backend đã chặn COD**. Không mở nhận thanh toán thật khi chưa vượt qua release gates.

## Cấu trúc repository

| Đường dẫn | Vai trò |
| --- | --- |
| `site/` | HTML, CSS, JavaScript, partials, JSON public và vendor assets cho website |
| `site/js/pages/` và `site/js/services/` | Điều khiển trang và adapter dữ liệu Supabase |
| `supabase/migrations/` | Schema, RLS, RPC, logic đơn hàng, thanh toán, loyalty, promotion và các migration bổ sung |
| `supabase/functions/` | Edge Functions: Delivery verification, VNPAY, Churn Research, Product Search và Related Products |
| `supabase/sql-tests/` | Kiểm thử logic database và bảo mật; **chỉ chạy khi biết rõ tác động của từng bài** |
| `scripts/` | Công cụ local, migration/import preview, audit và test |
| `reference/architecture/` | Thiết kế và các quyết định schema/bảo mật |
| `reference/production/` | Manifest dữ liệu/khuyến mãi được phê duyệt và chính sách phát hành |
| `research/docs/` và `research/scripts/` | Tài liệu nghiên cứu và công cụ ML; dữ liệu đầu vào/model gốc được lưu riêng |
| `staging/` | Tài nguyên cho môi trường staging |

## Chạy ứng dụng tại máy (Windows PowerShell)

Yêu cầu: Node.js, npm và Docker Desktop hoạt động. Cài dependency từ **thư mục gốc**:

```powershell
cd D:\ML\bo-va-bot
npm.cmd ci
npx.cmd supabase start
```

`npm.cmd ci` dùng `package-lock.json` đã commit. Nếu chưa có lockfile, cần tạo và kiểm tra lockfile trước khi dùng `npm install`.

Chạy frontend trong một terminal khác:

```powershell
cd D:\ML\bo-va-bot
node scripts/serve-site.cjs
```

Mở `http://127.0.0.1:4173/` (Menu: `/menu.html`, Admin Management: `/admin-management.html`, Manager Dashboard: `/dashboard.html`). Web server chỉ phục vụ thư mục `site/` trên `127.0.0.1:4173`; **không mở trang bằng `file://`**.

Khi cần các Edge Functions, chạy trong terminal riêng sau khi xác minh cấu hình môi trường:

```powershell
cd D:\ML\bo-va-bot
npx.cmd supabase functions serve --env-file supabase/.env.local
```

File `supabase/.env.local` chứa cấu hình riêng của máy và **không được commit**. Nếu file chưa tồn tại, thiết lập theo cấu hình của từng dịch vụ; không đưa secret vào `site/`, README hoặc Git. Frontend dùng cấu hình từ `site/backend-config.json` và override local được ignore khi áp dụng. Bản cấu hình đang trỏ LOCAL không được dùng nguyên trạng cho Cloud.

## Các luồng chức năng hiện có

- **Storefront:** trang chủ, menu, chi tiết bánh, giỏ hàng, bánh tùy chỉnh, danh sách yêu thích, khuyến mãi và đánh giá.
- **Customer:** đăng ký/đăng nhập Supabase Auth, Checkout Pickup/Delivery, theo dõi đơn, điểm thưởng và gửi đánh giá chờ duyệt.
- **Staff/POS:** xử lý đơn, bán tại quầy và thao tác thanh toán mô phỏng theo quyền.
- **Admin:** quản lý catalog, khuyến mãi, reviews, vận hành và Manager Dashboard.
- **Promotion:** chương trình 12/11 đã được phê duyệt và kích hoạt trên LOCAL; các hạn mức, tính tiền và chống tạo trùng đã được test trên disposable. Không tự kích hoạt chương trình lịch sử chưa phê duyệt.
- **Reviews:** hiển thị 234 đánh giá lịch sử từ JSON chỉ đọc; review mới được lưu ở Supabase với quy trình `pending → published`. Không gán quan hệ đơn hàng/sản phẩm giả cho review lịch sử.
- **Churn Research:** Dashboard Admin hiển thị kết quả nghiên cứu trên **8.500 khách hàng giả lập**, không phải dự đoán về khách hàng vận hành thật.
- **Search/Related Products:** các endpoint và artifact runtime đặt trong `supabase/functions/`; không yêu cầu phát triển thêm ML Search trong giai đoạn hiện tại.

Những chức năng đã PASS trên môi trường thử **không tự động được xem là đã nghiệm thu production**.

## Các giới hạn trước khi phát hành

1. **Frontend premium:** hoàn thiện layout, animation và responsive; kiểm tra lại toàn bộ luồng mua hàng sau các thay đổi UI.
2. **VNPAY:** hoàn tất Sandbox thật với Return URL, IPN HTTPS công khai, chữ ký, idempotency, trạng thái thanh toán và reconciliation. Mock/integration test không thay thế Sandbox thật.
3. **COD:** đồng bộ chính sách bỏ COD giữa giao diện và **backend RPC tạo đơn mới**, giữ nguyên các đơn COD lịch sử. POS `cash_demo` là luồng khác với COD online.
4. **Cloud:** dùng GitHub repository private, Cloudflare Pages và hai Supabase Cloud project hoặc môi trường tách biệt staging/production; kiểm soát secrets, migrations, backup/restore, Auth redirect, CORS và release gates.
5. **Payment production:** chưa mở thanh toán hoặc nhận đơn thật cho đến khi cấu hình merchant, nghiệp vụ thanh toán và việc nghiệm thu production được xác nhận.

Newsletter không thuộc phạm vi ưu tiên phát triển hiện tại. Contact form và các kênh xã hội cần kiểm tra lại thông tin công khai trước khi phát hành.

## Dữ liệu và an toàn khi kiểm thử

**Không chạy `supabase db reset`, seed/cleanup phá dữ liệu hoặc các bộ test có reset trên Supabase LOCAL chính đang chứa đơn, tài khoản, payment và lịch sử vận hành.** Mọi ca tạo/sửa đơn, payment, stock, loyalty, promotion hoặc role phải được chạy trên **disposable** riêng trừ khi chủ dự án cho phép rõ ràng. Trước khi chạy script, đọc nội dung để xác định tác động và đích kết nối.

Các thư mục `research/input/`, `research/output/` và `research/models/` được ignore để tránh commit ZIP, notebook artifact, dataset synthetic hay dữ liệu riêng tư. **Sao lưu riêng ngoài Git** nếu cần tái tạo nghiên cứu. Trong khi đó, những asset phục vụ website tại `supabase/functions/churn-research/`, `product-search/` và `related-products/` phải được commit đầy đủ.

Không commit `.env`, Supabase service-role key, mật khẩu PostgreSQL, VNPAY credentials, Geoapify secret, Auth JWT, session hay dữ liệu cá nhân. **Git commit chỉ lưu repository, không sao lưu PostgreSQL LOCAL**; cần backup database riêng trước các migration quan trọng.

Các quy tắc Loyalty FINAL: **tích 1 điểm trên mỗi 1.000 VND tiền hàng hợp lệ; đổi 1 điểm = 10 VND**, không tính shipping; tính sau promotion/đổi điểm, chỉ EARN khi completed và paid, và giữ quy tắc idempotency/refund/debt đã được phê duyệt.

## Tài liệu quan trọng

- [Các quyết định sản phẩm đã duyệt](PRODUCTION_DECISIONS_APPROVED.md)
- [Hướng dẫn Cloud Deployment](CLOUD_DEPLOYMENT_RUNBOOK.md)
- [Báo cáo sẵn sàng phát hành](FINAL_READINESS_REPORT.md)
- [Báo cáo nghiệm thu E2E](FUNCTIONAL_E2E_ACCEPTANCE_REPORT.md)
- [Báo cáo tích hợp VNPAY](VNPAY_INTEGRATION_REPORT.md)
- [Product brief](PRODUCT.md)
- [Frontend contract](site/CONTRACT.md)
- [Hồ sơ kiến trúc Supabase](reference/architecture/SUPABASE_SCHEMA_TARGET.md)
- [Hướng dẫn manifest production](reference/production/README.md)
- [Báo cáo Churn](research/docs/CHURN_PHASE_B_REPORT.md)

Các file `*_PROGRESS.md`, báo cáo Sprint cũ và tài liệu đã chuyển sang kho lưu trữ ngoài repository không còn được liên kết từ README này. Nếu thay đổi cấu trúc thư mục, cập nhật đường dẫn và kiểm tra link trước khi commit.

## Kiểm tra trước commit

```powershell
git status --short --untracked-files=all
git add -A
git diff --cached --name-status
git diff --cached --check
git diff --cached --stat
@(git diff --cached --name-only).Count
```

Chỉ commit sau khi kiểm tra danh sách staged, đặc biệt các migration/Edge Functions mới, asset Churn, manifest phê duyệt và file nhạy cảm. Không dùng `git add -f` để ép commit file đang bị ignore khi chưa kiểm tra lý do. Nếu đã commit checkpoint rồi mới chỉnh tiếp Frontend, tạo commit tiếp theo thay vì gộp hết vào một thay đổi khó kiểm toán.
