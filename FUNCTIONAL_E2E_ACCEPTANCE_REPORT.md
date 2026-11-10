# Bơ & Bột — Functional E2E Acceptance trên Supabase LOCAL

**Cập nhật mới nhất 10/11/2026:** Promotion FINAL đã được chủ dự án phê duyệt và Admin đã kích hoạt một row trên LOCAL chính, nhưng thao tác lưu qua form cũ cắt `ends_at` từ 23:59:59 còn 23:59:00. Form đã sửa và regression disposable PASS; cần Admin sửa lại giây trên LOCAL chính rồi đối soát read-only. Delivery backend proof→quote→COD order→Customer/Staff/Admin đã PASS trên disposable; Geoapify thật chưa nằm trong harness này. Churn nghiên cứu Admin/PNG, phân bố 8.500 và trạng thái lỗi/đăng xuất PASS trên disposable. VNPAY Edge IPN với HMAC TEST PASS trên disposable, nhưng Sandbox provider vẫn BLOCKED vì thiếu IPN HTTPS công khai. Ba payment VNPAY cũ không đổi. Chi tiết và chứng cứ mới ở [báo cáo tiếp nối](research/output/completion/CONTINUATION_REPORT.md). Verdict hiện tại: `NOT_READY_FOR_CLOUD`.

**Cập nhật tiếp nối 10/11/2026:** Phần ma trận bên dưới là ảnh chụp nghiệm thu tại 05:21 UTC. Sau đó owner đã xác nhận Delivery hoạt động và LOCAL chính có thêm một đơn Delivery lưu phí 20.000đ; baseline store settings cũ không còn phản ánh cấu hình đã phê duyệt. Promotion/Reviews/ML Search và các ca concurrency cô lập được ghi trong [báo cáo tiếp nối](research/output/completion/CONTINUATION_REPORT.md). Không dùng kết luận Delivery `BLOCKED` lịch sử bên dưới để phủ nhận trạng thái mới; full Delivery proof→quote→order vẫn chưa có bài E2E cô lập trong lượt tiếp nối. Verdict Cloud hiện vẫn `NOT_READY_FOR_CLOUD` vì promotion chưa kích hoạt trên backend, VNPAY Sandbox chưa nghiệm thu và ML Search chưa có đánh giá độ liên quan độc lập.

**Ngày kiểm thử:** 10/11/2026 · **Kết luận:** `NOT_READY_FOR_CLOUD`

## Môi trường, phạm vi và an toàn dữ liệu

- Website tĩnh tại `http://127.0.0.1:4173`; Supabase LOCAL `127.0.0.1:54321`; PostgreSQL LOCAL `127.0.0.1:54322`; Chrome/Playwright và Supabase Auth/session thật. Truy vấn đối soát dùng transaction PostgreSQL `READ ONLY`.
- Baseline trước mọi ghi dữ liệu: `research/output/functional-e2e/baseline.json` lúc **2026-11-10 01:53:06 UTC**. Dữ liệu TEST tạo trong lượt này dùng tiền tố `TEST-E2E-20261110020020-510943`, email miền `.test` và request ID riêng. Không gọi gateway/thanh toán thật, email thật hoặc dịch vụ giao hàng thật.
- Không chạy `db reset`, seed, cleanup, full suite, deploy, push hoặc commit. Không sửa 4 đơn cũ. Giữ 6 đơn TEST và 4 tài khoản TEST để không phá FK/lịch sử giao dịch.
- Inventory script: `baseline.mjs`, `preflight.mjs`, `guest.mjs`, `final-check.mjs` chỉ đọc database; `journeys.mjs`, `followup.mjs`, `ui-followup.mjs`, `security-smoke.mjs`, `permission-gap.mjs` chỉ ghi vào tài khoản/đơn TEST đã nhận diện. Các script cũ `test-supabase-frontend.mjs`, `test-supabase-omnichannel.mjs`, `test-production-import-local.mjs` có `db reset`; `test-vnpay-edge-local.mjs` có xóa fixture/analytics; tất cả **không chạy trên LOCAL chính**.

## Baseline và đối soát cuối

| Chỉ tiêu | Baseline | Cuối cùng | Giải thích |
|---|---:|---:|---|
| Products | 65: 63 active, 2 inactive | 65, status/giá không đổi | Menu chỉ hiển thị 63 active |
| Categories active | 9 | 9 | 8 danh mục kinh doanh; `TEST-sprint35-category` còn active nhưng không có sản phẩm active |
| Customization options active | 16/5 nhóm | 16/5 nhóm | Size 3, flavor 3, cream 3, font 3, color 4 |
| Orders | 4 | 10 | Đúng 6 đơn `TEST-E2E` mới |
| Payments | 4 | 11 | 6 charge TEST và 1 refund TEST |
| Profiles / loyalty accounts | 2 / 2 | 6 / 6 | 2 Customer, 1 Staff, 1 Admin TEST mới |
| Loyalty transactions | 0 | 4 | EARN, REDEEM, RESTORE, CLAWBACK, mỗi loại 1 |
| Audit log | 101 | 118 | 17 event liên quan account/order TEST |
| Reviews | 0 | 1 | Review TEST 1 sao, published |
| Daily analytics | 3 | 4 | Thêm lát cắt Offline trong ngày TEST |

**Đối soát read-only cuối:** `research/output/functional-e2e/final-reconciliation.json`, **2026-11-10 05:21:00 UTC**. Script xác nhận 6 ID TEST, 4 ID đơn cũ còn nguyên, 4 profile TEST active, toàn bộ giá/status của 65 sản phẩm và mọi tồn kho ngoài hai dòng dưới đây không đổi:

| Sản phẩm | Tồn trước | Tồn sau | Nguyên nhân |
|---|---:|---:|---|
| Apple Turnover | 81 | 80 | 1 đơn Pickup đã hoàn tất; các đơn hủy hoàn tồn |
| Salted Egg Yolk Lava Cake | 81 | 79 | 2 đơn POS đã hoàn tất |
| Bánh Tùy Chỉnh template | 0 | 0 | Làm theo đơn, không trừ tồn thành phẩm |

Sáu đơn TEST có trạng thái cuối: Pickup COD `completed/refunded`; Pickup bank demo `cancelled/pending`; Custom Cake `cancelled/unpaid` sau hủy từ `confirmed`; POS cash demo ×2 `completed/paid`; đơn dùng 100 điểm `cancelled/unpaid`. Tất cả phí Pickup/POS bằng 0. Ledger Customer TEST: `EARN +140`, `REDEEM −100`, `RESTORE +100`, `CLAWBACK −140`; số dư cuối 0. Audit gồm 3 cancel, 4 status transition, 2 POS created, 2 POS completed, xác nhận tiền demo, 3 bước refund và moderation review.

**Bảo toàn VNPAY:** 3 payment cũ vẫn có SHA-256 trạng thái `996476dd1f5bb00e7ffe1e258d9d2bbdc59b4eb4efd3d18d0a4d2097af164b96`, bằng baseline. Hash toàn bản ghi `store_settings` và promotions cũng bằng baseline; không có promotion nào được thêm/sửa. Sau đối soát chỉ có thay mật khẩu của tài khoản Staff TEST phục vụ kiểm quyền promotion, không có thêm giao dịch hoặc thay đổi bảng ứng dụng.

## Ma trận nghiệm thu Guest / Customer / Staff / Admin

| Vai trò | Browser / Auth | Backend / dữ liệu | Kết quả |
|---|---|---|---|
| Guest | Menu 63, Product Detail, giỏ và redirect Login | Related Products từ Edge; Churn 403; không đọc CRM | PASS cho các ca đã chạy |
| Customer | Register, Login, Pickup checkout, Custom Cake, Profile, Logout | Chỉ đọc đơn/profile của mình; không xác nhận thanh toán; Delivery không có proof bị từ chối | PASS cho các ca đã chạy |
| Staff | POS và Staff Orders | Ghi Offline cash demo; không đổi giá, promotion, role, điểm; Churn 403 | PASS cho các ca đã chạy |
| Admin | Dashboard, Order Management, CRM | Dashboard RPC, 2 PNG Churn; blocked Admin 403, active Admin 200 | PASS cho các ca đã chạy |

## Nhóm A–G và bằng chứng

Ma trận dưới đây có **21 ca PASS, 0 FAIL còn mở, 5 BLOCKED, 2 NOT_RUN**. Các FAIL ban đầu của harness được giải thích ở phần sau và đã có bài kiểm tra thay thế; không tính là lỗi sản phẩm còn mở.

| Nhóm | Ca nghiệm thu | Trạng thái | Bằng chứng |
|---|---|---|---|
| A | Menu 63 active, 8 danh mục kinh doanh, không thấy 2 TEST inactive | PASS | `guest.mjs`: 63 card, 8 filter category |
| A | Filter, tìm kiếm từ khóa, sort giá, giá/ảnh từ backend | PASS | Browser Guest + đối chiếu productService; URL ảnh có, không thấy ảnh hỏng tại lúc render ban đầu; chưa kiểm quyền ảnh bên ngoài |
| A | Product Detail và Related Products từ endpoint, lọc active/còn tồn | PASS | Kiwi Tart: giá/ảnh khớp backend, 4 sản phẩm liên quan khớp thứ hạng Edge sau lọc |
| A | Guest thêm giỏ, bị yêu cầu Login khi đặt, giữ giỏ sau Login | PASS | Browser Guest và browser register/login TEST |
| A | ML Search theo câu truy vấn tự nhiên | BLOCKED | Chưa có inference/vectorizer cho truy vấn mới; Menu hiện tìm chuỗi, Related Products không thay thế ML Search |
| B | Register, Login, session, Logout | PASS | Auth thật; `/auth/v1/logout` 204, session biến mất, về Home sau khi Profile tải xong |
| B | Pickup COD trên browser, giá backend, phí 0, 2 giờ lead time | PASS | Đơn `ORD-2026-2428C5135E9D`; quote và order snapshot; `preflight.mjs` |
| B | Idempotency request ID, trừ tồn một lần, từ chối số lượng quá tồn | PASS | Replay trả cùng order ID; stock Apple 81→80; `INSUFFICIENT_STOCK` |
| B | Customer A/B RLS, hủy pending/confirmed, hoàn tồn | PASS | Customer B đọc 0 đơn A; hủy 3 đơn TEST, stock released, template custom không trừ tồn |
| B | Tự áp dụng promotion hợp lệ tốt nhất | BLOCKED | `promotions=0` trước/sau; quote có giảm 0 và UI không có ô voucher, chưa có case dương tính |
| B | Thử race oversell giữa hai giao dịch đồng thời | NOT_RUN | Không dùng suite concurrency có cleanup trên LOCAL chính; chỉ kiểm oversell đơn lẻ và trừ tồn đúng một lần |
| C | Đủ 16 tùy chọn/5 nhóm, 324/324 tổ hợp quote đúng giá | PASS | `followup.mjs`: 324 quote RPC, giá size + phụ thu được đối chiếu |
| C | Custom Cake ≥24 giờ, backend snapshot, không trừ stock template | PASS | Order TEST custom, snapshot 5 nhóm + lời chúc, template stock 0→0 |
| C | Cart và chi tiết đơn Customer/Staff/Admin hiển thị tùy chỉnh | PASS | `ui-followup.mjs` Browser, cả 3 vai trò |
| D | POS Staff browser + API, cash demo, `offline`, stock/idempotency | PASS | 2 đơn POS `completed/paid`, Salted Egg 81→79, replay không bán thêm |
| D | Staff không sửa giá, promotion, role, điểm | PASS | REST/RPC thật bị từ chối; `permission-gap-result.json` kiểm riêng promotion |
| D | Promotion POS/Online cùng ưu đãi active | BLOCKED | Không có promotion active để đối chiếu case dương tính |
| E | Admin Dashboard Online/Offline/Tổng đọc PostgreSQL, tách shipping | PASS | Trước refund: 140.000 / 180.000 / 320.000 VND khớp SQL; sau refund: online net 0, offline 360.000; shipping 0 |
| E | Loyalty FINAL, idempotent EARN/REDEEM/RESTORE/CLAWBACK | PASS | Chỉ EARN sau `completed AND paid`, 140 điểm cho 140.000 VND; 100 điểm=1.000 VND; cap 20%; ledger mỗi loại 1 |
| E | Refund demo Staff yêu cầu → Admin duyệt → Staff thực hiện | PASS | Replay request/approve/execute không sinh refund hoặc clawback trùng |
| E | CRM/RLS và review 1 sao hợp lệ | PASS | Admin đọc 6 profile, Staff/Customer chỉ profile mình; review 1 sao published, Guest đọc được |
| E | Churn chỉ Admin, dữ liệu nghiên cứu có nhãn synthetic | PASS | Guest/Customer/Staff/invalid/blocked Admin 403; active Admin đọc JSON + 2 PNG 200; 1440/768/390/360 px không tràn ngang |
| E | Hoàn quota promotion sau hủy | BLOCKED | Không có promotion active/usage claim để nghiệm thu |
| F | Từ chối tọa độ/phí giả và delivery thiếu proof | PASS | `UNTRUSTED_DELIVERY_COORDINATES`, `DELIVERY_PROOF_REQUIRED`; Guest Edge 403 |
| F | Xác minh địa chỉ/ghim, quote phí 3/5/10 km, đơn Delivery thật | BLOCKED | Edge Customer 503 `DELIVERY_ORIGIN_NOT_APPROVED`; chưa có proof hợp lệ, không thể nghiệm thu các tier hoặc >10 km |
| G | COD/bank demo giữ payment độc lập, không tự `paid` | PASS | COD `unpaid` trước xác nhận; bank demo `pending`; chỉ Staff xác nhận demo có attestation mới `paid` |
| G | Bảo toàn 3 VNPAY payment cũ | PASS | SHA-256 trước/sau giống nhau; không gọi gateway |
| G | VNPAY sandbox callback/IPN với gateway thật | NOT_RUN | Bị loại khỏi lượt này theo giới hạn không gọi gateway thật |

Giờ Pickup theo contract hiện hành là **`[10:00, 20:00)`**: 10:00 và 19:59 được chấp nhận; 09:45, 20:00, 20:15 bị từ chối. Không đổi giờ hoặc store settings.

## Lỗi đã sửa và files changed

| File | Thay đổi / kiểm chứng |
|---|---|
| `site/js/services/dashboardService.js` | Tải hai PNG Churn bằng `fetch` với bearer Admin và nhận `Blob`; Admin browser + PNG 200 PASS |
| `site/js/core/format.js`, `site/js/pages/profile.js`, `site/js/pages/admin-orders.js`, `site/js/pages/staff-orders.js` | Hiển thị snapshot 5 nhóm tùy chọn + lời chúc trong chi tiết đơn; Browser Customer/Staff/Admin PASS |
| `site/js/components/cart-drawer.js` | Hiển thị cấu hình Custom Cake từ draft/options trong giỏ; Browser PASS |
| `site/js/pages/login.js` | Ẩn cảnh báo localStorage demo khi đang dùng Supabase; Browser Login PASS |
| `site/CONTRACT.md` | Ghi export `formatOrderItem` mới |
| `FUNCTIONAL_E2E_ACCEPTANCE_REPORT.md` | Báo cáo nghiệm thu này |

Các file trong `research/output/functional-e2e/` là evidence/harness local, không đưa secrets vào log. Không đổi Git staging/commit. JavaScript syntax của các file web đã sửa và `git diff --check` theo đúng phạm vi đều PASS. Không chạy full suite.

**Phân biệt lỗi:** Churn PNG là lỗi frontend thật đã sửa và regression PASS. Chi tiết tùy chỉnh thiếu là lỗi UI thật đã sửa và regression PASS. Các FAIL đầu của harness dùng tên cột `kind` thay `transaction_type`, giả định 20:00 inclusive, và click Logout trước khi Profile sẵn sàng; ca chính xác sau đó PASS. Churn operational inference vẫn chưa được nghiệm thu; dashboard đang trình bày kết quả nghiên cứu 8.500 khách giả lập, không gán cho Customer vận hành.

## Blocker còn lại và bước tiếp theo

| Mức | Blocker | Việc cần làm trước Cloud |
|---|---|---|
| P0 | Delivery B chưa có `delivery_origin_approved_at`/`delivery_origin_approval_source`; môi trường LOCAL cũng chưa cấu hình `BOBOT_NOMINATIM_CONTACT_URL` | Xác minh và phê duyệt tọa độ cửa hàng, cấu hình geocoder tin cậy rồi nghiệm thu địa chỉ/ghim, quote phí và tạo đơn Delivery trên môi trường an toàn. Không tự phê duyệt hoặc bỏ Delivery khỏi sản phẩm cuối. |
| P0 | Query-based ML Search chưa có artifact inference/vectorizer cho truy vấn mới | Cung cấp artifact hoặc backend inference đã huấn luyện phù hợp, rồi E2E truy vấn tự nhiên. Không thay bằng rule-based và gọi là ML Search. |
| P1 | Không có promotion active | Nghiệm thu automatic-best, POS parity và hoàn quota trên fixture cô lập hoặc promotion đã được duyệt; không tự thêm promotion vào LOCAL chính. |
| P1 | Race oversell và VNPAY sandbox callback/IPN chưa chạy trong lượt an toàn này | Dùng disposable environment/luồng sandbox được phép, không chạy suite reset trên main hoặc tác động 3 payment cũ. |
| P2 | Category `TEST-sprint35-category` vẫn active nhưng rỗng; ảnh remote chưa kiểm quyền sử dụng và toàn bộ khả năng tải | Xử lý data hygiene/quyền ảnh bằng quy trình riêng; không sửa catalog FINAL trong lượt này. |

**Verdict: `NOT_READY_FOR_CLOUD`**. Các hành trình Pickup, Custom Cake, POS, Admin và Churn Research đã có bằng chứng LOCAL; Delivery B và ML Search còn BLOCKED, promotion dương tính và một số kiểm thử stress/gateway chưa được nghiệm thu.
