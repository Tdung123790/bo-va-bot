# Bơ & Bột — Sprint 7: VNPAY LOCAL, báo cáo kiểm chứng

**Ngày:** 06/11/2026 (Asia/Ho_Chi_Minh). **Phạm vi:** Supabase LOCAL và mock. **VNPAY SANDBOX: NOT TESTED. Production/Cloud: NOT DEPLOYED. Sprint 7 chưa fully verified.**

## 1. Quyết định và nguồn kỹ thuật

`PRODUCTION_DECISIONS_APPROVED.md` đã ghi P-10: VNPAY là provider chính thức, PAY API 2.1.0, backend xác nhận payment, Return chỉ đọc; credentials sandbox/production tách biệt. COD, chuyển khoản demo và POS cash demo vẫn là luồng riêng. P-10 thay đúng phần DEC-09/R20 trước đây loại trừ gateway thật; không thay các chính sách khác. Hoàn tiền một phần theo R05 vẫn là phạm vi mở rộng chưa có quy tắc phân bổ tiền hàng, phí giao, điểm và KPI được duyệt.

Đối chiếu [PAY API 2.1.0](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [QUERYDR/REFUND](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html), [FAQ](https://sandbox.vnpayment.vn/apis/docs/faqs/). Các trang chính thức có kết quả được công cụ tìm kiếm lập chỉ mục; thao tác mở trực tiếp đã timeout, nên canonicalization và protocol vẫn cần nghiệm thu với merchant sandbox. FAQ nêu mức tối thiểu 5.000 VND và phân biệt Return (hiển thị) với IPN (cập nhật server). Không có merchant credentials được cung cấp hoặc sử dụng.

## 2. Thành phần triển khai

| Phần | File chính | Hiện trạng |
|---|---|---|
| PAY signing/URL, HMAC-SHA512, VND × 100, GMT+7, QUERYDR/REFUND request/response signing | `supabase/functions/_shared/vnpay.js` | Code + unit mock PASS; endpoint được cố định tới sandbox. Giới hạn 5.000–9.999.999.999 VND. |
| Edge Function `start`, `availability`, `status`, `ipn`, `reconcile`, `refund` | `supabase/functions/vnpay-gateway/index.js`, `supabase/config.toml` | `ipn` công khai nhưng bắt buộc chữ ký; action khác kiểm Auth/role hoặc chỉ trả boolean availability. Bản hiện tại đã chạy lại Edge mock LOCAL. |
| Database | `20261104000300_order_rpc.sql`, `20261106000100_vnpay_gateway.sql` | Online order nhận riêng `vnpay`, quote/server chặn số tiền ngoài giới hạn trước khi giữ tồn. 18 bảng giữ nguyên; RPC giữ order/payment/idempotency/audit/projection. |
| Checkout và Return | `site/js/components/checkout-form.js`, `site/js/services/orderService.js`, `site/js/services/vnpayService.js`, `site/vnpay-result.html`, `site/js/pages/vnpay-result.js`, `site/js/pages/profile.js` | VNPAY chỉ hiện ở Supabase mode; không có cấu hình thì radio vô hiệu hóa. Sau create, giỏ chỉ xóa khi Edge trả payment URL; thất bại giữ giỏ và requestId để retry. Return page chỉ đọc trạng thái qua Auth/RLS. |
| Tests/tooling | `scripts/test-vnpay-unit.mjs`, `scripts/test-vnpay-edge-local.mjs`, `scripts/test-vnpay-checkout-browser.mjs`, `supabase/sql-tests/007_vnpay_gateway.sql`, `scripts/test-supabase-concurrency.mjs`, `scripts/cleanup-supabase-concurrency.mjs` | Mock sử dụng HashSecret TEST ngẫu nhiên. Concurrency runner nay chỉ chạy khi DB trống và tự dọn fixture theo ID TEST. |

**Payment lifecycle:** tạo order → charge `pending` → payment session/URL → IPN hoặc QUERYDR có chữ ký hợp lệ và identity/amount khớp → `paid`, `failed` hoặc `reconciliation_required`. Success sau hủy giữ `pending` và đánh dấu đối soát, không ghi `paid`. Refund VNPAY chỉ full: tạo bút toán `pending`; `94` hoặc status `05/06` giữ pending; chỉ kết quả hoàn tất được xác minh mới ghi `refunded`, clawback điểm và tính lại KPI. Charge gốc không bị xóa. Callback cũ/đối nghịch không tự ghi đè kết quả đã chốt; requestId/txnRef, lock và audit giới hạn xử lý lặp. Return query `vnp_ResponseCode=00` không gọi RPC ghi paid.

## 3. Schema diff và bảo mật

Migration mới thêm `vnpay` vào CHECK của `payments.payment_method`; thêm 7 cột trên `payments`: `gateway_txn_ref`, `gateway_create_date`, `gateway_expires_at`, `gateway_transaction_no`, `gateway_event_hash`, `gateway_result`, `gateway_verified_at`, cùng CHECK và unique indexes. Không tạo bảng ứng dụng thứ 19, không sửa production schema. `payments` là nguồn chuẩn; `orders.payment_status` cập nhật bởi trigger trong transaction. Gateway write RPC chỉ cấp EXECUTE cho `service_role`; begin session và yêu cầu full refund kiểm actor server-managed/ownership/role. Edge giữ service key và HashSecret trong môi trường server, không đưa vào browser. Audit bản cuối PASS: 18 bảng RLS, 13 bảng chặn direct financial writes, 47 functions, 28 private SECURITY DEFINER có `search_path=''`, 6 migrations LOCAL.

## 4. Kết quả kiểm thử, phân biệt lần chạy

| Loại | Kết quả | Bằng chứng và giới hạn |
|---|---|---|
| UNIT TEST hiện tại | **PASS** | `node scripts/test-vnpay-unit.mjs`: min 5.000đ, VND × 100, GMT+7, PAY/QUERYDR/REFUND canonical HMAC, tamper, response signature, lỗi mạng, HTTP 503, timeout, mock transport, chặn endpoint khác. |
| INTEGRATION MOCK bản cuối | **PASS** | `node scripts/test-vnpay-edge-local.mjs` trên Edge + Auth/Data API LOCAL, HashSecret TEST ngẫu nhiên: availability, start/status, Customer A/B ownership, Customer bị từ chối reconcile/refund, Staff bị từ chối partial refund, callback giả/sai tiền, IPN duplicate/concurrent, success sau cancel, browser CORS. Không gọi cổng VNPAY thật. |
| LOCAL DATABASE migrations và SQL regressions | **PASS** | 6 migration đã áp trên LOCAL trước lượt này. `npm.cmd run db:test:local`: 001,003,004,005,006,007 đều PASS trên PostgreSQL, gồm 4.999đ từ chối không đổi stock/order, 5.000đ được nhận, refund request key khác bị từ chối, QUERYDR đến muộn, refund pending/verified/replay. Không reset DB ở lượt này. |
| Concurrency | **PASS** | `npm.cmd run db:test:concurrency`: stock=1 chỉ một commit; promotion quota=1, E-01 hoàn và dùng lại một lần. Runner cũ để lại fixture; đã sửa preflight/cleanup, chạy lại và xác minh DB trống. |
| Auth/Data API, POS/Dashboard | **PASS từ lượt trước** | Auth/profile/RLS, Online/POS, KPI và browser POS/Dashboard đã PASS sau migration. Không chạy lại harness POS/Dashboard vì script hiện reset toàn DB ở cuối, trái giới hạn lượt này; code thay đổi sau đó chỉ thuộc VNPAY và test fixture. |
| Browser 18 route 1440/768/390 và demo mode | **PASS trước availability** | 18 route không pageerror/overflow/broken image; demo regression 8 nhóm PASS và cấu hình local đã được khôi phục. |
| Browser checkout VNPAY 1440/768/390 hiện tại | **PASS — mock availability** | `node scripts/test-vnpay-checkout-browser.mjs`: radio VNPAY bật khi mock available, tắt khi mock unavailable; COD/bank demo riêng, không overflow/pageerror. Đây là UI mock, không chứng minh gateway sandbox. |
| RLS/GRANT và SECURITY DEFINER | **PASS** | `node scripts/audit-supabase-security.mjs`: 18 bảng RLS, 13 bảng chặn ghi tài chính trực tiếp, 47 functions, 28 private definers, private schema không expose, 6 migration đã áp LOCAL. |
| Fixture cleanup và kiểm tra tĩnh | **PASS** | `node scripts/verify-supabase-greenfield.mjs`: 18 bảng và Auth trống sau test. `node --check` 86 JS files, `npm.cmd run db:check`, `node scripts/check-handoff.cjs` (12 routes/126 site files), secret-pattern scan, config LOCAL, `git diff --check` đều PASS. Git vẫn có thay đổi chưa commit; không reset/commit/push. |
| QUERYDR/REFUND Edge với provider sandbox | **NOT RUN** | Unit mock kiểm chữ ký và lỗi mạng/timeout; SQL kiểm state machine/retry. Chưa có merchant sandbox credentials để kiểm response thật và transport lỗi tại Edge với provider. |
| VNPAY SANDBOX TEST | **NOT RUN** | Không có merchant sandbox TmnCode/HashSecret và HTTPS IPN public đã đăng ký; localhost không nhận IPN thật. |
| PRODUCTION | **NOT TESTED / NOT READY** | Không tạo/link/deploy Cloud hoặc thanh toán thật. |

**Cấu hình DB LOCAL:** `BOBOT_LOCAL_DB_PASSWORD` chưa được đặt thường trực. Các lượt trước đặt biến trong từng PowerShell process nên biến mất khi process kết thúc. `scripts/configure-supabase-local.mjs` chỉ lưu URL/API publishable key, không lưu DB password. Lượt này `npx.cmd supabase status -o json` cung cấp DB_URL của project LOCAL; đã kiểm host `127.0.0.1`, port `54322`, DB/user `postgres`, chỉ chuyển password vào biến môi trường trong bộ nhớ của cùng process khi chạy test, rồi xóa biến. Không in hoặc lưu secret, không cần chủ dự án cung cấp mật khẩu.

**Fixture:** sau Edge và concurrency test, `node scripts/verify-supabase-greenfield.mjs` PASS: cả 18 bảng và `auth.users` trống. Trước đó bản concurrency runner cũ để lại 3 Auth TEST users, 4 TEST orders và một hàng KPI TEST; truy vấn chỉ đọc đã xác nhận nguồn gốc. Cleanup ban đầu bị auto-review từ chối vì câu lệnh xóa `daily_analytics` quá rộng. Sau khi xác minh hàng KPI và sửa cleanup thành giao dịch có guard và điều kiện ID/ngày/kênh cụ thể, approval cho chạy; runner được sửa để preflight DB trống và cleanup tự động. Không reset DB hoặc xóa dữ liệu ngoài fixture TEST trong lượt này.

**Auto-review trước lượt này:** lệnh Edge dùng PowerShell đặt password cứng từng bị từ chối trước khi chạy do review đạt usage limit; thông báo nêu đây là lỗi quy trình review, không phải kết luận không an toàn. Lượt này đã dùng credential do Supabase LOCAL CLI cung cấp qua cơ chế approval thông thường; Edge test bản cuối PASS. Một lệnh `npx supabase status` trong sandbox bị `EPERM` do CLI ghi telemetry ngoài workspace, sau đó lệnh tương tự được approval và chạy thành công.

## 5. Giới hạn và quyết định còn cần duyệt

1. **Sandbox merchant:** cần TmnCode và HashSecret sandbox được đặt bằng environment/secret manager, Return URL và IPN HTTPS đã đăng ký. Không paste secret vào chat, Git hoặc frontend. Cần nghiệm thu PAY/IPN/QUERYDR/REFUND thật trên sandbox trước bất kỳ release nào; công cụ mở trực tiếp tài liệu chính thức timeout nên canonicalization cần xác nhận thực nghiệm.
2. **QUERYDR:** Edge chỉ cho Staff/Admin gọi. Mock/unit kiểm request/response signing; SQL test chứng minh payment đến muộn được ghi một lần. Chưa kiểm bằng VNPAY sandbox. QUERYDR hiện truy vấn charge; chưa có luồng đối soát riêng cho refund đang pending nếu VNPAY chưa trả trạng thái hoàn tất. Refund pending sau timeout giữ nguyên, không tự gửi lại để tránh hoàn trùng.
3. **REFUND:** chỉ full refund được mở về mặt API; không có nút quản trị riêng cho VNPAY refund. Hoàn tiền một phần bị từ chối (`PARTIAL_REFUND_REQUIRES_POLICY_APPROVAL`) cho đến khi chủ dự án duyệt cách phân bổ product/shipping, điểm và KPI. Chưa kiểm refund thật trên sandbox; `status=05/06` không được coi là hoàn tất.
4. **Payment timeout và order chờ:** nếu tạo order thành công mà URL thất bại, giỏ/requestId được giữ để retry; payment còn pending và cần vận hành đối soát. Không tự thả tồn/điểm khi hết hạn vì chưa có chính sách hết hạn order được duyệt.
5. **Release gates cũ:** catalog/stock/option/giờ pickup production chưa duyệt; delivery và POS linked vẫn blocked; COD/POS cash vẫn demo. P-10 không tự mở production checkout.

## 6. Việc còn lại trước review sandbox

- QUERYDR/REFUND hiện PASS ở mức unit ký request/response và SQL state machine; Edge LOCAL đã kiểm quyền Customer/Staff và chặn partial refund, nhưng luồng Edge gọi transaction API thực **NOT RUN** vì chưa có merchant sandbox credentials/endpoint nhận IPN. Cần nghiệm thu response canonicalization, lỗi mạng/timeout và retry với sandbox cô lập. Không tự gửi lại refund pending vì có nguy cơ hoàn hai lần.
- POS/Dashboard harness cũ reset toàn DB sau khi chạy; không dùng harness đó trong lượt cấm reset này. Kết quả PASS trước đó vẫn có hiệu lực cho mã không đổi; nếu cần nghiệm thu lại toàn luồng, tạo bản harness cleanup có kiểm soát và chạy trên LOCAL trống.
- Đăng ký và nghiệm thu merchant sandbox riêng; chỉ sau đó xin phê duyệt release Cloud riêng theo P-09. **Không đưa khóa TEST hoặc giờ/promotion DEMO sang production.**

## Sprint 3.5 — cập nhật 09/11/2026

Đã có `VNPAY_MODE`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` trong `supabase/.env.local`: **configured**; mode là sandbox, TmnCode đúng định dạng, Return trỏ đúng trang `vnpay-result.html` ở loopback. `VNPAY_IPN_URL`: **missing**; `VNPAY_QUERY_IP`: **missing** (biến tùy chọn, fallback địa chỉ request có thể không phù hợp Sandbox). File `.env.local` được `.gitignore` bỏ qua, không được đọc tự động chỉ vì nằm trong `supabase/`; khi chạy Edge local phải truyền `--env-file supabase/.env.local`. Không in giá trị bí mật hoặc đưa vào frontend.

Migration cộng thêm `20261109000400_vnpay_customer_querydr.sql` cho phép Customer active dành lượt QUERYDR 30 giây/lần đối với chính order online của họ; Staff/Admin active cũng được đối soát. Edge vẫn xác minh response signature, merchant, TxnRef, amount và transaction type trước khi cập nhật payment qua service-role RPC. Return chỉ hiển thị dữ liệu backend, tự thử QUERYDR khi pending, không tin `vnp_ResponseCode` từ browser. `availability` kiểm backend có cột migration mới; `start` kiểm Return/merchant trước khi tạo session. Đường refund VNPAY trực tiếp bị khóa ở Edge và RPC để không vượt quy trình Staff yêu cầu → Admin duyệt → Staff thực hiện; refund VNPAY theo quy trình đó chưa được triển khai.

**PASS:** `test-vnpay-unit.mjs`, `test-vnpay-customer-querydr-mock.mjs`, `test-vnpay-checkout-browser.mjs` 1440/768/390, `test-vnpay-return-browser.mjs` ba trạng thái, `test-loyalty-final.mjs`, structural check 10 migrations/18 public tables. **NOT RUN:** SQL migration 004, Auth/Data API, Edge với merchant credentials thật, VNPAY Sandbox PAY/QUERYDR/IPN và giao dịch end-to-end. Supabase LOCAL API không truy cập được trong phiên này; không reset, không fixture, không ghi vào hai VNPAY TEST orders. Chưa có IPN HTTPS công khai, chưa xác minh merchant sandbox có chấp nhận Return loopback hay không. Đây chưa phải nghiệm thu Sandbox end-to-end.
