# Bơ & Bột — runbook triển khai sau phê duyệt

**Trạng thái Sprint 6: CHƯA TRIỂN KHAI CLOUD.** P-09 duyệt mục tiêu website công khai nhưng **chưa duyệt release**. Staging và production phải là hai Supabase projects, hai Pages deployments/origins và cấu hình Auth tách biệt. Không chạy `supabase link`, `db push` hoặc Cloudflare deploy trong lượt chuẩn bị này.

## Tái lập local để kiểm tra trước khi mở Cloud

1. Cài Node.js/npm, Docker Desktop và `npm install` trong repository. Kiểm tra `npx supabase --version`; cấu hình `supabase/config.toml` đã có, không `supabase init` lần nữa.
2. `npx supabase start`, rồi `npx supabase db reset --local --no-seed` **chỉ trên LOCAL TEST database**. Lấy mật khẩu PostgreSQL local từ môi trường local, đặt vào biến process `BOBOT_LOCAL_DB_PASSWORD` (PowerShell: `$env:BOBOT_LOCAL_DB_PASSWORD = Read-Host -MaskInput 'Local DB password'`). Không ghi vào repository/chat.
3. Chạy `npm.cmd run db:check`, `npm.cmd run db:test:local`, `node scripts/audit-supabase-security.mjs`, `node scripts/test-supabase-frontend.mjs`, `node scripts/test-supabase-omnichannel.mjs`. Các runner frontend sẽ dọn fixture TEST. Chạy concurrency riêng trên DB trống; chỉ reset LOCAL sau khi xác minh fixture.
4. `npm.cmd run db:configure:local` chỉ viết URL và publishable key vào file local bị Git ignore. `node scripts/serve-site.cjs` phục vụ `site/` tại `http://127.0.0.1:4173/`.

## Hai môi trường Cloud — thực hiện sau phê duyệt riêng

| Quy tắc | STAGING | PRODUCTION |
|---|---|---|
| Dữ liệu | Fixture TEST, tài khoản TEST, giờ DEMO 08:00–20:00 và promotion DEMO có thể dùng khi gắn nhãn rõ | Chỉ manifest APPROVED; không TEST account/fixture, promotion DEMO, giờ DEMO hoặc dữ liệu doanh thu giả |
| Đơn hàng | Không nhận đơn thật; banner/domain riêng để tránh nhầm | Chỉ mở sau khi payment reconciliation, catalog, store và release gate đạt |
| Supabase/Auth/Pages | Project, redirect URLs, publishable key và domain staging riêng | Project, redirect URLs, publishable key và domain production riêng; không chia sẻ database/keys |
| Kiểm thử | SQL/API/browser fixture và reset **chỉ** staging disposable theo kế hoạch | Smoke không reset/xóa DB và không tạo đơn TEST làm lệch doanh thu thật; kiểm tra read-only trước, giao dịch kiểm soát nếu có quy trình đã duyệt |

`reference/production/release-environments.json` để trống Project URLs/origins. `scripts/validate-production-release-local.mjs` là preflight read-only trên DB **LOCAL**, trả BLOCKED cho đến khi môi trường, catalog/store, payment và release được duyệt; không tự kết nối Cloud.

Giờ DEMO được P-05 duyệt nằm riêng ở `reference/staging/store-hours-demo-P05.json` (08:00–20:00 mỗi ngày, không có delivery). Fixture 00:00–23:59 trong `scripts/fixtures/` chỉ hỗ trợ kiểm thử kỹ thuật mốc 24 giờ, không phải giờ kinh doanh staging. Cả hai đều không được dùng làm store config production.

1. Sau phê duyệt triển khai riêng, tạo **hai** Supabase projects mới trong tổ chức được chỉ định, chọn region/người quản trị và đặt tên staging/production phân biệt. Không dùng tài khoản/mật khẩu mẫu trong production. Thiết lập backup phù hợp gói dịch vụ; kiểm tra restore ở môi trường tách biệt trước migration production.
2. Cấu hình Auth độc lập: signup/email verification theo chính sách đã duyệt, `SITE_URL` và redirect URLs đúng origin/path **của từng môi trường**, không dùng wildcard nối staging với production. Kiểm tra session refresh, signout, email confirmation, blocked profile, CORS/origin và rate limits.
3. Review đủ migration versioned trong `supabase/migrations/` trên staging mới. Sau khi được phép, apply bằng CI/CD được bảo vệ hoặc CLI liên kết project staging được xác nhận; kiểm tra migration history, 18 bảng, RLS/GRANT, RPC, trigger và quyền EXECUTE. Chỉ apply production sau staging smoke test, backup và phê duyệt release riêng. Không chạy `db reset` trên remote.
4. Tạo tài khoản Admin đầu tiên qua Supabase Auth, xác minh email và UUID thực. Script `bootstrap-admin-local.mjs` bị khóa local nên **không** dùng trực tiếp trên Cloud; chuẩn bị thao tác trusted tương đương, giới hạn người vận hành, audit `first_admin_bootstrap` trong cùng transaction, kiểm tra không có quyền tự nâng role. Không đặt service-role key ở frontend.
5. Staging chỉ dùng fixture TEST rõ nhãn, có dọn dẹp. Production chỉ import catalog/option từ `reference/production/` đã ký duyệt và được kiểm tra diff/reconciliation trên bản sao, bảo toàn `source_id` Wix, tồn vận hành và audit. Giá/stock/ảnh trong JSON Wix không tự thành giá/stock/ảnh đã duyệt. Thiết lập giờ nhận thật và cấu hình qua trusted path; không mang 08:00–20:00 DEMO sang production. Promotion DEMO không kích hoạt production; release preflight kiểm active promotion với whitelist. Delivery tiếp tục khóa cho tới khi phương án xác minh địa chỉ/tọa độ được duyệt và triển khai. Không nối variants/reviews numeric ID khi thiếu mapping.

## Cloudflare Pages và smoke test

1. Sau phê duyệt release, deploy thư mục `site/` làm static output trên **hai** Cloudflare Pages projects/branches tách biệt bằng Git integration hoặc Direct Upload. Không cần build frontend framework. Cung cấp `site/backend-config.json` riêng cho mỗi môi trường với `mode: "supabase"`, đúng Project URL HTTPS và **publishable key**; giữ file local override và mọi fixture TEST khỏi artifact production. Publishable key là public; tuyệt đối không đưa database password, service-role key, JWT secret hoặc access token vào Pages/browser.
2. Trỏ domain/HTTPS, hoàn tất Supabase Auth redirect URLs theo origin thực tế. Kiểm tra route HTML, asset và nguồn font/ảnh/Leaflet bên ngoài.
3. Staging smoke đầy đủ với TEST fixture: Guest Menu/cart → Auth → quote/pickup/order → Profile; Wishlist; Staff POS guest/Orders; Admin Orders/Dashboard; RLS chéo tài khoản/blocked profile, retry, refund, audit, payment demo. Dọn fixture staging có kiểm soát. Production smoke ban đầu chỉ đọc catalog/asset/Auth/RLS và cấu hình; giao dịch thật chỉ khi có kịch bản đối soát/hoàn được duyệt, không dùng TEST fixture hoặc reset/xóa DB production. Nếu payment vẫn chỉ là demo, **không mở checkout/POS kinh doanh thật**.

## Cổng thanh toán VNPAY — gate bổ sung trước release

Sprint 7 chỉ chạy Supabase LOCAL với khóa TEST ngẫu nhiên; **VNPAY SANDBOX NOT VERIFIED**. Staging cần merchant sandbox `TmnCode`/`HashSecret` cấp riêng qua secret manager, Return URL và IPN HTTPS công khai được đăng ký đúng merchant. Không đưa HashSecret hoặc service-role key vào Cloudflare Pages, HTML, cấu hình JSON công khai hay Git. `VNPAY_MODE=sandbox` chỉ dùng staging; môi trường production cần cấu hình riêng sau nghiệm thu sandbox, đối soát QUERYDR/REFUND và phê duyệt release P-09. Không copy credentials giữa hai môi trường.

Kiểm thử staging trước release: PAY đúng số tiền/chữ ký; Return giả không ghi paid; IPN mất/lặp/đồng thời; hủy trước success; QUERYDR khi thiếu IPN; refund pending rồi xác nhận thành công; phân quyền Staff/Admin và Customer A/B; KPI/loyalty sau paid/refund. Supabase LOCAL không nhận IPN thật vì thiếu HTTPS public. Không tự tạo tunnel hoặc expose local. Production smoke trước mở bán chỉ đọc; không dùng test reset/xóa DB hoặc giao dịch tiền thật để smoke.

## Backup, rollback và vận hành

### Gate tiếp nối cho Promotion, Reviews và ML Search

Trước khi tạo tài nguyên Cloud hoặc triển khai, chụp backup/PITR và snapshot chỉ đọc cho `reviews`, `promotions`, `orders`, `payments`, `store_settings`, số sản phẩm active và migration ledger. Áp dụng migration `20261110000200_customer_my_reviews.sql` theo thứ tự sau các migration đã nghiệm thu; migration chỉ thêm RPC, không copy 234 review legacy vào bảng giao dịch. Test Guest/Staff không gọi được `my_reviews`, Customer chỉ đọc review của mình, Admin moderation giữ nguyên. Nếu lỗi, dừng release và tạo migration sửa tiến; không reset/xóa lịch sử.

Deploy Edge `product-search` cùng `model.json` đúng fingerprint catalog approved, cấu hình `static_files` và Supabase URL/anon key phía Edge. Smoke Guest/Customer với truy vấn mới, kiểm kết quả chỉ gồm sản phẩm active/còn hàng/có giá; giá, ảnh và stock vẫn đọc từ productService. Nếu catalog đổi sau khi tạo artifact, tái tạo artifact từ catalog approved và kiểm thử độ liên quan trước release. Rollback frontend/Edge về artifact phiên bản trước chỉ khi còn khớp catalog; giữ database nguyên trạng. Không đưa dữ liệu Customer hay khóa service-role vào model/site.

Promotion tháng 11 chỉ được import qua cơ chế Admin hợp lệ sau khi whitelist nguồn sản xuất xác nhận định danh, ngày và điều kiện. Chụp snapshot promotion trước/sau, xác nhận không trùng `source_id`, test quote dương tính/âm tính và Online/POS trên staging. Nếu cần dừng áp dụng, dùng RPC quản trị đặt `inactive` kèm audit; không xóa promotion hoặc sửa các order đã áp dụng. Dữ liệu archive `promotions.json` vẫn chỉ là nội dung hiển thị và không cấp quyền giảm giá.

Trước mỗi migration: chụp backup, ghi version và kiểm tra khôi phục trên staging. Nếu lỗi sau apply, dừng ghi mới, đánh giá dữ liệu đã thay đổi rồi dùng migration sửa tiến hoặc restore backup/PITR theo runbook đã duyệt; không `db reset` hay xóa bảng production. Với frontend, giữ artifact Pages phiên bản trước để rollback giao diện, nhưng schema và frontend phải tương thích trong quá trình chuyển. Theo dõi Auth errors, RPC failures, payment demo state, stock, audit và KPI sau phát hành.

Tài liệu nền chính thức: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [environments](https://supabase.com/docs/guides/deployment/managing-environments), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [backups](https://supabase.com/docs/guides/platform/backups), [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).
