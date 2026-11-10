# Bơ & Bột — báo cáo Sprint 5 và mức sẵn sàng triển khai

> **Cập nhật readiness 10/11/2026:** Phần Sprint 5 bên dưới là báo cáo lịch sử ngày 06/11, không phản ánh catalog/store đã được áp dụng sau đó. LOCAL chính hiện có 63 sản phẩm active, 11 đơn, 3 VNPAY payment lịch sử không đổi. Promotion FINAL 12/11 được phê duyệt, migration Admin RPC đã áp dụng và test disposable PASS, nhưng row active trên LOCAL chính kết thúc lúc **23:59:00** thay vì **23:59:59** do form cũ cắt giây; form đã sửa và đang chờ Admin lưu lại đúng giây. Churn Research Dashboard Level 1, Delivery backend chain và VNPAY Edge IPN với HMAC TEST đều PASS trên disposable; Geoapify provider thật và VNPAY Sandbox với IPN công khai vẫn chưa nghiệm thu. ML Search kỹ thuật giữ PASS trước; owner không yêu cầu đánh giá chất lượng chuyên sâu thêm. **Verdict hiện hành: `NOT_READY_FOR_CLOUD`**; không deploy. Xem [báo cáo tiếp nối](research/output/completion/CONTINUATION_REPORT.md) để biết test và blocker mới.

**Ngày:** 06/11/2026 (Asia/Ho_Chi_Minh)  
**Phạm vi xác nhận:** Supabase LOCAL `127.0.0.1:54321/54322`, static site local; Cloud **NOT DEPLOYED**. Toàn bộ giao dịch dùng fixture TEST, đã dọn sau test.  
**Kết luận:** **NOT READY cho Cloud production**. Phần code LOCAL đạt các test dưới đây; catalog, store settings, danh tính Admin và quy trình triển khai production chưa được chủ dự án phê duyệt. Không có lỗi P0 mới phát hiện trong phạm vi đã kiểm thử.

## 1. Thành phần đã nghiệm thu ở LOCAL

- Storefront: Menu, Product Detail, Cart/Checkout, Custom Cake, Wishlist, Profile, Auth và Admin Orders dùng Supabase Auth/Data API/RPC trong Supabase mode. Guest giữ giỏ khi login; giá, khuyến mãi, điểm, tồn và đơn được backend tính lại. Demo mode vẫn tồn tại riêng.
- POS guest `offline/counter/cash_demo` và Staff Orders hoạt động theo role. POS chưa liên kết Customer vì chưa duyệt phương án xác minh tài khoản.
- Manager Dashboard Admin-only: tổng/Online/Offline, doanh thu sản phẩm ròng, phí ship tách riêng, AOV, đơn, khách mới/quay lại, top products, tồn và đơn chờ. Đã sửa thang biểu đồ theo kênh đang lọc; thêm trạng thái loading/empty/error/retry. Không tạo KPI giả.
- Database LOCAL: 18 bảng ứng dụng, năm migration versioned, RLS/GRANT, RPC transaction, audit, idempotency, E-01 promotion quota và E-02 loyalty debt. Không có bảng ứng dụng thứ 19.

## 2. Kết quả kiểm thử thực tế

**Tổng hợp:** Các suite LOCAL đã chạy đều PASS; **FAIL: 0**, **BLOCKED: 0** trong môi trường LOCAL đã kiểm tra. Các hạng mục Cloud/production được ghi **SKIPPED**, không suy diễn thành PASS.

| Kết quả | Lệnh / phạm vi | Log xác nhận |
|---|---|---|
| **PASS** | `node scripts/test-supabase-frontend.mjs` | Auth signup/login/logout/profile trigger; Admin bootstrap TEST có audit; catalog/settings TEST idempotent; Guest bị chặn order; RLS Customer A/B, Staff direct edits, blocked account; quote, promotion, loyalty, custom cake 24h, COD/bank demo, Wishlist, Admin payment; browser 1440/390; `local TEST fixture removed by database reset`. |
| **PASS** | `node scripts/test-supabase-omnichannel.mjs` | Staff POS guest, guest/customer bị chặn POS, Staff không sửa financial/role; cash_demo, retry, stock/payment một lần; hủy hoàn quota/stock; unpaid không tính revenue, late payment và refund cập nhật một lần; race Online/POS stock=1; browser POS/Staff/Dashboard ở 1440×900, 768×1024, 390×844 không overflow hoặc `pageerror`; Dashboard Online/Offline bar max 144px, empty, API error và retry; fixture được reset. |
| **PASS** | `npm.cmd run db:test:local` | PostgreSQL LOCAL: `001_security_and_orders.sql`, `003_shipping_kpi.sql`, `004_customer_classification.sql`, `005_unverified_delivery.sql`, `006_admin_dashboard.sql`. Test 001 gồm E-02 debt/clawback/offset; 003/006 tách shipping, refund/KPI, khách theo toàn kênh. |
| **PASS** | `npm.cmd run db:test:concurrency` | `stock=1 concurrent requests: committed, rolled back: P0001`; tồn/payment/history đúng. Promotion `usage_limit=1` chọn đúng một ưu đãi; E-01 cancel/retry trả quota một lần. DB trống được xác nhận trước; sau đó reset **LOCAL**. |
| **PASS** | `node scripts/test-business-sprint1.cjs` | 8 nhóm demo regression: promotion, auth/cart, custom cake, COD/bank, requestId độc lập, hủy đơn/payment, responsive 1440/390. File cấu hình Supabase local được khôi phục nguyên byte sau test. |
| **PASS** | `node scripts/test-ui-readiness.mjs` | 17 route HTML × 1440/768/390: `failures: []`, `brokenImages: []` trong guest crawl; không có local HTTP >=400 hoặc `pageerror`. Đây không phải visual parity audit với Wix hay kiểm tra mọi URL ảnh production. |
| **PASS** | `node scripts/audit-supabase-security.mjs` | 18 bảng bật RLS, 13 bảng nhạy cảm không cấp ghi trực tiếp cho `anon`/`authenticated`; 39 functions, 24 definer functions đều ở `private`, `search_path=''`, owner `postgres`; `private` không trong Data API exposed schemas; chỉ `quote_order` là public RPC gọi được bằng anon; đủ năm migration đã áp dụng LOCAL. |
| **PASS** | `npm.cmd run db:check` | Năm migration, 18 bảng, RLS và kiểm tra cấu trúc SQL. Đây là structural check; PostgreSQL execution được chứng minh bằng các SQL tests ở trên. |
| **PASS** | `npm.cmd run db:verify:empty` | Sau cleanup: toàn bộ 18 bảng ứng dụng và `auth.users` trống. |
| **PASS** | `node scripts/check-handoff.cjs` | 12 Router route targets và 123 site files: local paths/import, JavaScript syntax và JSON parse OK. |
| **PASS** | `node --check` trên `site/js` và `scripts` | 70 file JavaScript/CJS/MJS, 0 lỗi cú pháp. |
| **PASS** | `node scripts/import-catalog-local.mjs --dry-run` | Nguồn có 7 categories, 65 products, 16 options; 2 thiếu tên, 3 thiếu/0 giá, 4 thiếu ảnh, 3 thiếu category; 62 structurally importable nhưng chưa duyệt bán. Không ghi DB. |
| **PASS** | `git diff --check` và `git status --short` | Không có whitespace error; Git báo line-ending LF→CRLF trên các file đã sửa từ trước. Nhiều thay đổi/untracked của các sprint trước vẫn được giữ nguyên; không reset/commit. |
| **SKIPPED** | Cloud smoke, backup/restore Cloud, production catalog import, email thực, payment gateway thực | Chưa được phép tạo/deploy Cloud và dữ liệu production chưa duyệt. Không báo PASS cho các hạng mục này. |

Các script PostgreSQL local hiện yêu cầu `BOBOT_LOCAL_DB_PASSWORD` trong biến môi trường process. Chúng đã PASS khi có biến này; thiếu biến thì dừng với thông báo rõ, không thử mật khẩu mặc định. `import-catalog-local.mjs --dry-run` không cần DB password. File `site/backend-config.local.json` được Git ignore và sau demo test đã trở lại `mode=supabase`, URL LOCAL và có publishable key. Không ghi mật khẩu vào repo.

## 3. Lỗi/giới hạn còn lại

| Mức | Nội dung | Hành động |
|---|---|---|
| **P0** | Không phát hiện trong các test đã chạy. | Tiếp tục smoke và theo dõi khi có staging/Cloud; không suy ra production an toàn tuyệt đối. |
| **P1 — blocker Cloud** | Giá/active/tồn/ảnh/category của 65 sản phẩm và 16 option chưa được duyệt; có nguồn Wix thiếu tên, giá hoặc ảnh. Catalog production trong DB hiện bằng 0. | Chủ dự án phê duyệt manifest theo [checklist](CATALOG_STORE_APPROVAL_CHECKLIST.md), dry-run rồi import bằng trusted path. |
| **P1 — blocker giao dịch production** | Giờ nhận/giao, địa chỉ cửa hàng, vùng/phí ship và phương án xác minh vị trí khách chưa có. Pickup cần giờ cấu hình; delivery bị RPC chặn với tọa độ client không xác minh. | Duyệt cấu hình và giải pháp xác minh; giữ delivery khóa đến khi hoàn tất. |
| **P1 — blocker phát hành** | Cloud project, Auth redirect/signup/email, Admin đầu tiên, backup/restore, staging migration và production smoke chưa thực hiện. | Làm theo [runbook](CLOUD_DEPLOYMENT_RUNBOOK.md) sau phê duyệt riêng. |
| **P2** | Font WOFF2 gốc chưa có; Google Fonts, ảnh Wix, Leaflet/OSM/Nominatim phụ thuộc mạng bên ngoài. Guest crawl không thay thế kiểm tra asset production. | Xác minh license/availability và screenshot khi có môi trường production. |
| **P2** | Staff Orders giới hạn 200 đơn mới; Dashboard top 10 sản phẩm/20 đơn chờ; chưa có ngưỡng tồn thấp được duyệt. Session refresh lúc token thực sự hết hạn và network request treo lâu chưa được test thực nghiệm. | Theo dõi quy mô, bổ sung pagination/timeout và test expiry ở sprint vận hành được phê duyệt nếu cần. |
| **P2** | Các runner TEST dọn fixture ngay sau khi chạy; chưa có lệnh tạo fixture tồn tại đủ lâu cho buổi trình diễn bấm tay. | Dùng kịch bản browser automation trong [demo guide](PROJECT_DEMO_GUIDE.md), hoặc chuẩn bị phiên fixture TEST local riêng trước buổi diễn và dọn sau. |

Thanh toán COD, bank transfer và cash tại POS đều **demo**; không chứng minh ngân hàng đã nhận tiền. Guest cart/bản nháp bánh lưu client theo S-02, không phải transaction bảo mật. Mapping 186 variants và 234 reviews legacy chưa giải được nên không import. Không triển khai ML/CRM campaign.

## 4. Security review

- SQL/RLS và Auth/Data API test xác nhận Customer không đọc/sửa đơn hoặc điểm của Customer khác; Staff không ghi trực tiếp giá, promotion, role, loyalty, analytics; blocked profile bị từ chối RPC dù JWT cũ còn hiệu lực.
- Các wrapper RPC trong `public` là invoker; helper definer ở `private` với `search_path` rỗng và check caller/role. `private` có USAGE cho client để wrapper hoạt động nhưng không nằm trong exposed schemas (`supabase/config.toml` chỉ expose `public`); Cloud API exposed schemas phải cấu hình giống vậy. Đã rà EXECUTE bằng audit script và SQL tests.
- Không thấy `sb_secret_`, service-role key, JWT secret, database URL có mật khẩu hoặc mật khẩu TEST cố định trong frontend/scripts được rà. `site/backend-config.local.json` bị Git ignore; publishable key là public. Demo localStorage role chỉ dùng trong demo mode, Supabase mode dùng Auth/profile backend. Khi API lỗi, order/payment không fallback sang demo.
- Retry checkout/POS giữ cùng requestId, backend unique/idempotent; timeout dài và Auth token expiry thực tế vẫn là giới hạn P2 cần xác minh trước tải thật.

## 5. Việc chủ dự án cần xác nhận và Cloud deployment

1. Duyệt đầy đủ [catalog/store checklist](CATALOG_STORE_APPROVAL_CHECKLIST.md), promotion được phép bán, mapping còn thiếu, ngưỡng tồn nếu muốn hiển thị.
2. Quyết định tổ chức/region/gói backup của Supabase Cloud, domain Cloudflare, chính sách Auth/signup/email và người vận hành Admin đầu tiên. Quy trình bootstrap Cloud phải là trusted path có audit; script hiện tại chỉ dùng LOCAL.
3. Duyệt kế hoạch staging → backup → migration versioned → import manifest → cấu hình → Pages deploy → smoke/RLS/rollback trong [runbook](CLOUD_DEPLOYMENT_RUNBOOK.md). Giữ `site/backend-config.local.json`, password và mọi secret ngoài artifact Cloud. Không dùng `db reset` remote.
4. Duyệt phương án xác minh Customer tại POS riêng nếu muốn mở POS loyalty cho khách có tài khoản. Hiện POS guest là phạm vi đã chấp nhận, không tự mở rộng.

**Đánh giá:** LOCAL TEST READY cho trình diễn với fixture TEST; **Cloud production NOT READY** đến khi các P1 và phê duyệt triển khai riêng được giải quyết. Sprint 5 dừng ở review, không deploy.
