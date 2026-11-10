# Bơ & Bột — Supabase security & transaction test matrix

**Trạng thái 05/11/2026:** Schema đã duyệt; migration, RLS/RPC và SQL tests đã PASS trên Supabase LOCAL. Cloud **NOT DEPLOYED** và chưa có project Cloud. Bảng ca kiểm thử bên dưới là acceptance matrix; kết quả đã chạy nằm trong `SUPABASE_IMPLEMENTATION_PROGRESS.md`, các ca frontend Auth/Data API thuộc Sprint 3.

## 1. Chủ thể, ranh giới và điều kiện test

| Ký hiệu | Danh tính test | Điều kiện |
|---|---|---|
| G | Guest/`anon` | Không có JWT/Auth user; vẫn xem catalog public và giỏ tạm. |
| A, B | Hai Customer khác nhau | Mỗi người có Auth ID/profile/đơn/điểm riêng; không được xem dữ liệu của nhau. |
| S | Staff | Role do bảng profile tin cậy cấp; có đơn vận hành/POS guest, không có quyền Admin. |
| M | Admin | Role do backend cấp; quản trị có audit, vẫn tuân quy tắc giá/điểm/order. |
| X | Client giả mạo | JWT của A nhưng body/metadata/localStorage tự khai `role=admin`, `customer_id=B`, giá/paid khác dữ liệu DB. |

Auth `anon`/`authenticated` là database role, còn Customer/Staff/Admin là vai trò ứng dụng lấy từ nguồn server, không tin trường client gửi. Test phải chạy bằng session/JWT riêng cho từng nhân vật và kiểm tra trạng thái DB **sau thao tác bị từ chối**; chỉ kiểm HTTP 403 là chưa đủ. Dùng fixture tổng hợp trong môi trường thử, cô lập/rollback; không seed project thật trong nhiệm vụ này.

## 2. Ma trận RLS và quyền cột/bảng

**Nguyên tắc chung:** mọi bảng exposed bật RLS, kiểm tra `GRANT` bên cạnh policy; mặc định không cho client ghi dữ liệu giao dịch/tài chính. `auth.users` nằm trong schema Supabase quản lý, không expose trực tiếp. Bảng `private` và helper privileged không nằm trong exposed schemas. Các ô “RPC” nghĩa là **direct INSERT/UPDATE/DELETE bị từ chối**, chỉ function tin cậy được thực hiện.

| Nhóm bảng | Guest G | Customer A/B | Staff S | Admin M | Kiểm tra âm bắt buộc |
|---|---|---|---|---|---|
| `categories`, `products`, `product_variants`, `customization_*`, `promotions` | SELECT bản active/public | SELECT public | SELECT phục vụ bán hàng | SELECT và quản lý qua đường có audit | G/A/S không sửa giá, stock, `discount_value`, target hay status bằng Data API; M không vượt qua audit/RPC đã thiết kế. |
| `store_settings` | Chỉ đọc cột cấu hình công khai qua projection/column grant, không thấy `updated_by` | Như G | SELECT vận hành | Sửa qua đường Admin có audit | G/A/S không sửa giờ, vùng, phí; config NULL không bị coi là mở cả ngày/phí 0. RLS hàng **không thay thế** giới hạn quyền cột. |
| `profiles` | Không đọc | A chỉ đọc chính A, sửa các trường hồ sơ được phép; B tương tự | Chỉ thông tin tối thiểu từ snapshot đơn vận hành, không SELECT toàn bộ profile | Quyền quản trị tài khoản đã duyệt, role đổi qua trusted RPC/audit | A không đổi `role/status/id`, không đọc B; S không đổi role; X giả `role=admin` không hiệu lực. Cần column grants hoặc đường cập nhật tách biệt vì RLS chỉ kiểm hàng. |
| `orders`, `order_items`, `order_status_history` | Không đọc/ghi order online | Chỉ SELECT đơn và dòng/history của chính mình; tạo/hủy qua RPC hợp lệ | SELECT đơn cần vận hành kể cả POS guest; xử lý qua RPC | SELECT/điều hành theo role, có audit | A không SELECT/UPDATE/DELETE đơn B bằng ID; G không INSERT order; S không sửa trực tiếp tổng tiền/trạng thái; không ai ghi history giả. |
| `payments`, `audit_log` | Không đọc/ghi | A chỉ đọc trạng thái/phương thức/số tiền demo của đơn A; không đọc audit nội bộ | S đọc payment cần xử lý, gọi xác nhận demo; không tự UPDATE payment hoặc log | Đọc audit và xác nhận demo theo quyền; không tạo bằng chứng ngân hàng thật | A/G không đánh dấu paid; S không ghi paid bằng Data API; audit append-only, không xóa/sửa. B không đọc payment của A. |
| `loyalty_accounts`, `loyalty_transactions` | Không đọc/ghi | Chỉ đọc của chính mình; dùng điểm qua order RPC | Không sửa hoặc cấp điểm | Xem/đối soát theo quyền, không cộng điểm thủ công qua client | A không tự UPDATE balance/INSERT EARN, không xem B; S/M cũng không bypass ledger bằng Data API. |
| `wishlist_items` | Không đọc/ghi | CRUD chính mình nếu FK product hợp lệ | Không sửa wishlist khách | Đọc khi có nghiệp vụ được duyệt; không giả thao tác của khách | A không thêm/xóa wishlist B, không giả customer_id trong body. |
| `reviews` | SELECT bản public đã duyệt | Đọc public; tạo tối đa một review/order/product của chính mình sau completed qua RPC | Không giả review của khách | Duyệt/ẩn qua đường có audit | A không review đơn B, đơn chưa completed hoặc trùng; G không POST review. |
| `daily_analytics` | Không truy cập | Không truy cập số liệu quản trị | Chỉ số vận hành nếu sau này được cấp riêng; baseline không đọc tổng hợp quản trị | SELECT tổng hợp, cập nhật chỉ bởi job/RPC | A/S không đọc bảng KPI quản trị hoặc ghi số doanh thu; không lộ PII trong read model. |

**Ranh giới Staff/Admin UI hiện tại:** `paymentService.js` demo cho Staff/Admin xác nhận, nhưng `admin-orders.html` và `adminOrderService.js` hiện chỉ mở cho Admin. RLS/RPC mục tiêu cho phép Staff thực hiện thao tác vận hành theo R16/R19; **không cấp role Admin cho Staff** để dùng trang hiện tại. UI Staff sẽ là phần triển khai khác.

## 3. RPC và quyền EXECUTE mục tiêu

| RPC/đường tin cậy dự kiến | Guest | Customer | Staff | Admin | Guard bên trong và dữ liệu ghi |
|---|---|---|---|---|---|
| `quote_order` | Có thể gọi cho giỏ public | Có | Có | Có | Chỉ trả báo giá cần thiết; tính giá/promotion/ship từ DB, không trả PII, không lấy giá client. Config thiếu thì trả lỗi rõ. |
| `create_online_order` | **Deny** | Chỉ Customer hiện tại | Deny trong vai Staff | Deny trong vai Admin | `auth.uid()` phải bằng Customer ID trên order; requestId bắt buộc, lock stock/loyalty, tính lại quote, tạo order/items/payment/history nguyên tử. Admin muốn mua cần tài khoản Customer riêng, không tự bypass. |
| `record_pos_sale` | Deny | Deny | Allow | Allow | Caller Staff/Admin, `sales_channel=offline`, cho guest `customer_id=NULL`; dùng cùng lõi tính giá/tồn; cash demo, audit actor. |
| `transition_order`, `cancel_order` | Deny | Customer chỉ hủy đơn mình trước preparing | Theo trạng thái/phạm vi vận hành | Theo trạng thái/phạm vi vận hành | Khóa order, kiểm tra R17/R18, lý do khi cần, hoàn stock/điểm đúng một lần, ghi history; completed không bị đổi ngược thành cancelled. |
| `confirm_demo_payment`, `refund_demo_payment` | Deny | Deny | Allow theo đơn vận hành | Allow | Lock order/payment, từ chối cancelled và gửi lặp; xác nhận demo có actor/time/audit, refund là bút toán riêng; không xác minh ngân hàng thật. |
| `admin_manage_catalog`, `admin_manage_promotion`, `assign_role` | Deny | Deny | Deny | Allow | Chỉ Admin, validate giá/stock/target/role, audit old/new; không trao quyền qua profile tự sửa. |
| `get_dashboard_summary` | Deny | Deny | Deny baseline | Allow | Đọc `daily_analytics`, không tính từ dữ liệu local/client; Online+Offline=Tổng theo R22. |

Quyền SQL `EXECUTE` phải thu hồi khỏi `PUBLIC`/`anon`/`authenticated` theo mặc định dự án rồi cấp lại từng wrapper cho vai trò DB cần thiết. Vì Customer/Staff/Admin đều đi qua `authenticated`, **grant EXECUTE cho authenticated chưa đủ**: function phải kiểm `auth.uid()`, role server và ownership trên từng order. Ưu tiên `SECURITY INVOKER`; nếu thao tác cần vượt RLS để ghi nguyên tử, đặt hàm `SECURITY DEFINER` trong schema `private` **không expose**, `search_path = ''`, mọi tên bảng/hàm schema-qualified, kiểm caller ngay trong thân hàm, giới hạn `EXECUTE` và kiểm chủ sở hữu function. Nếu cần wrapper Data API, wrapper public có quyền tối thiểu, gọi helper private đã kiểm actor; không đặt function đặc quyền trực tiếp trong exposed schema trừ khi phương án cụ thể được review. Không có service-role key ở browser. Đây là thiết kế phù hợp [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) và [database functions](https://supabase.com/docs/guides/database/functions), **đã triển khai và PASS trên Supabase local; Cloud NOT DEPLOYED**.

## 4. Test case bảo mật và giao dịch sau migration

`Expected` ở mỗi dòng là tiêu chí cần đạt, **không phải kết quả đã chạy**. Chạy cả pgTAP/DB test và client integration với session thật trong môi trường thử; negative case phải xác nhận order/payment/stock/loyalty/audit không đổi sau khi bị chặn.

| ID | Thao tác/điều kiện | Expected |
|---|---|---|
| AUTH-01 | G đọc catalog public; G gọi `create_online_order` hoặc INSERT `orders` trực tiếp | SELECT public hợp lệ; order bị chặn, không có bản ghi/stock/points thay đổi. |
| AUTH-02 | G hoặc A sửa `profiles.role=admin`, giả JWT metadata/localStorage role, giả `created_by` Staff | Deny/không tác dụng; server role giữ nguyên; RPC Staff/Admin không mở. |
| OWN-01 | A SELECT order B theo ID, lọc URL, join `order_items`, `payments`, status history | 0 hàng/deny trên mọi đường; không có lỗi rò chi tiết khách B. A vẫn đọc được đơn A. |
| OWN-02 | A UPDATE/DELETE order B hoặc gửi `customer_id=B` trong tạo/hủy/review | Deny; không đổi order B, item, payment, loyalty hay history. |
| OWN-03 | A truy cập/sửa `loyalty_accounts`, ledger, wishlist hoặc profile B | Deny; không có dòng bị sửa. |
| STAFF-01 | S thử sửa `products.base_price/stock_quantity`, `promotions`, `profiles.role`, loyalty balance qua Data API/RPC Admin | Deny; giá/role/điểm/history không đổi. |
| STAFF-02 | S tạo POS guest; G và A thử gọi cùng RPC | S tạo đúng một order `offline`, `customer_id=NULL`, actor S và payment `cash_demo`; G/A bị chặn. |
| ADMIN-01 | M quản lý catalog/promotion/role qua RPC; thử đường direct không có audit | RPC hợp lệ ghi audit actor/old/new; đường direct không audit bị chặn. M không được tự tạo paid/refund ngoài quy tắc. |
| FUNC-01 | Kiểm tra catalog/product/discount và `quote_order` khi thiếu cấu hình giờ/ship, giá NULL hoặc target promotion thiếu | Không bịa giá, giờ, phí hoặc target; order không được tạo nếu không thể kiểm tra điều kiện bắt buộc. |
| FUNC-02 | Hai promotion cùng hợp lệ, phần trăm/cố định, cùng mức giảm; giới hạn target/min/max | Chọn duy nhất mức giảm VND thực tế lớn nhất; hòa chọn ID tăng dần; giảm ≤ subtotal hợp lệ; không có voucher input. |
| FUNC-03 | Custom cake nhận sau 23:59 so với lúc tạo, đúng 24:00, ngày/giờ quá khứ theo HCM | 23:59/quá khứ bị từ chối; đúng ≥24h được xét theo giờ cấu hình; custom không trừ tồn thành phẩm. |
| IDEM-01 | A gửi 2 request đồng thời cùng `client_request_id`; reload/retry cùng key | Một order/code, một lần trừ stock/điểm, một charge; cả hai nhận cùng kết quả. Unique constraint và transaction là chứng cứ. |
| IDEM-02 | A gửi hai requestId **khác nhau** cùng lúc; B dùng cùng chuỗi requestId của A | Hai request A độc lập; B không nhận order A. Nếu hết stock, một yêu cầu bị từ chối thay vì dùng chung kết quả. |
| STOCK-01 | Hai session đặt sản phẩm còn stock 1, đồng thời Online/POS | Tối đa một đơn thành công; stock không âm, không oversell; kết quả thất bại không để order/payment/loyalty mồ côi. |
| STOCK-02 | Hủy order đã giữ stock, gửi hủy lặp; thử hủy completed | Hủy hợp lệ trả tồn đúng một lần và ghi một history; completed không đổi thành cancelled. |
| LOY-01 | Dùng điểm sát giới hạn 20% và sát số dư; hai session dùng cùng điểm đồng thời | 1 điểm = 1.000đ; cap `floor(20%/1.000)` đúng; không âm, không dùng trùng; ledger/balance/order khớp. |
| LOY-02 | Hoàn tất order chưa paid, sau đó xác nhận paid; lặp xác nhận; hủy/thất bại sau dùng điểm | Chưa paid không EARN; completed+paid EARN `floor((subtotal−promotion−points_discount)/10.000)` một lần; điểm đã dùng hoàn đúng một lần nếu hủy/thất bại. |
| PAY-01 | Tạo COD/bank transfer demo | COD `unpaid`, bank `pending`; không tự `paid`, không thông báo nhận tiền ngân hàng thật, order status độc lập. |
| PAY-02 | S/M xác nhận COD/bank đang hợp lệ, gửi hai lần đồng thời hoặc reload | Payment thành `paid` một lần với actor/time/audit, order status không bị sửa, một payment history; lần hai từ chối hoặc trả idempotent result đã định nghĩa. |
| PAY-03 | S/M xác nhận COD/bank sau khi order `cancelled`, kể cả dữ liệu legacy lệch hai cột trạng thái | Bị từ chối, payment status và history không đổi. Order đã paid rồi bị hủy không tự chuyển `refunded`; refund riêng. |
| PAY-04 | Refund demo đầy đủ đơn đã completed+paid, gửi lặp | Charge `paid` lịch sử còn để đối soát, một bút toán refund riêng, product/shipping amounts tách riêng, payment projection/history đồng bộ, điểm EARN được thu hồi/đối ứng đúng R05; không tạo lần hai. |
| STATUS-01 | A/S/M thử chuyển bước ngoài flow, A hủy từ preparing, S hủy từ preparing không lý do | Deny; không đổi order/payment/stock/points/history. Transition hợp lệ ghi actor/time/lý do khi cần. |
| KPI-01 | Order subtotal 100.000đ, promo 10.000đ, dùng 10 điểm, ship 15.000đ | Tổng trả 95.000đ; trước completed+paid revenue 0; sau đó product revenue 80.000đ, ship riêng 15.000đ, EARN 8 điểm; Online+Offline=Tổng. |
| KPI-02 | Payment đến muộn sau completed; refund sau ngày completed làm order projection thành `refunded`; query theo HCM và theo kênh | Bù/tính lại đúng ngày completed_at HCM một lần; vẫn nhận diện charge đã paid và trừ refund riêng, không bỏ cả order rồi trừ refund lần hai; ship riêng, không nhân đôi KPI. |
| API-01 | Kiểm tra mọi exposed table, view, RPC; cố gọi private definer qua Data API | RLS + GRANT đúng; private helper không lộ API; wrapper không cho caller khác quyền; không có service-role key ở JS. |

## 5. Cách đánh giá và gate triển khai

1. **Trước test Cloud:** inventory project Cloud: schemas expose, grants, bảng/cột/index/constraint/RLS/policy, function owner/`SECURITY DEFINER`/`search_path`, trigger và migration history. Cloud hiện `NOT VERIFIED`; local đã kiểm thử theo `SUPABASE_IMPLEMENTATION_PROGRESS.md`.
2. **Sau schema được duyệt:** dùng DB test/pgTAP cho policy, constraint và RPC; dùng client integration cho A/B/S/M/G; chạy concurrent test bằng các session độc lập. [Supabase Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview) mô tả pgTAP và test RLS. Không đánh dấu PASS chỉ vì UI ẩn nút hoặc vì JS `requireAdmin()`/`getCurrentMember()` hoạt động.
3. **Gate:** mọi OWN/STAFF/AUTH/PAY/IDEM/STOCK/LOY negative case đạt, không lộ dữ liệu A/B, không mất bản ghi khi exception/rollback, aggregate KPI khớp ledger; kiểm tra đổi role/revoke session, access qua URL và RPC trực tiếp. Chỉ sau đó mới chuyển nguồn frontend khỏi localStorage.

**Trạng thái quyết định:** S-01–S-05 và E-01/E-02 đã duyệt; payment projection và phân loại khách đã kiểm thử local. Mapping numeric variant/review và giờ/ship vẫn thiếu dữ liệu nguồn. Chưa có kết quả Cloud; kiểm thử Auth/Data API storefront thuộc Sprint 3.
