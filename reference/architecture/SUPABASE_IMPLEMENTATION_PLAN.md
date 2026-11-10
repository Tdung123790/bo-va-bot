# Kế hoạch triển khai Supabase — Bơ & Bột

**Trạng thái 05/11/2026:** S-01–S-05 và E-01/E-02 đã duyệt. Baseline 18 bảng, RLS/RPC và SQL tests đã PASS trên Supabase LOCAL; Cloud **NOT DEPLOYED** và chưa có project Cloud. Phần bên dưới giữ lịch sử lập kế hoạch, không phải kết quả introspection Cloud.

## 1. Căn cứ và hiện trạng

- Nghiệp vụ: `reference/contracts/BoBot_FUNCTIONAL_REQUIREMENTS_FINAL_APPROVED_2026-11-04.md` (DEC-01–DEC-10, R01–R35). Mô hình dữ liệu: các mục *Database, Gộp dữ liệu, Cart, Custom Cake, Order, Loyalty, Analytics* và bảng USER–ADMIN_AUDIT_LOG trong `reference/docs/BơbộtCSDL.docx`. API demo: `site/CONTRACT.md`, `site/js/services/`.
- DOCX nêu mục tiêu khoảng 15–18 bảng, dùng `carts.items` JSON, snapshot địa chỉ trên `orders`, ảnh chính trong `products`, `daily_analytics` để Dashboard đọc tổng hợp. Phần mô tả bảng có USER, CUSTOMER_PROFILE, PRODUCT, ORDER, ORDER_ITEM, PAYMENT, PROMOTION, LOYALTY, ORDER_STATUS_HISTORY, ADMIN_AUDIT_LOG và các bảng liên quan. Đây là **schema được mô tả**, chưa phải schema đã kiểm tra trong Supabase.
- `site/` hiện đọc catalog/promotion từ JSON; auth, cart, custom cake, order, payment/history, loyalty lưu localStorage. `orders.items` giữ snapshot, `orderItems` là read model. Chưa có adapter Supabase/RPC hoặc bằng chứng migration SQL trong phần repo được kiểm tra. `reference/contracts/CONTRACT.md` mô tả dữ liệu public Wix nhưng không xác nhận DB triển khai.
- Ưu tiên khi mâu thuẫn: FINAL quyết định nghiệp vụ; DOCX làm nguồn schema. Chỗ cần thay schema phải được chủ dự án duyệt trước khi triển khai.

## 2. Đối chiếu bảng và quan hệ đề xuất

| Nhóm | Bảng/quan hệ theo CSDL | Dùng chung Online/POS và ghi chú |
|---|---|---|
| Tài khoản | USER, CUSTOMER_PROFILE | Supabase `auth.users` quản lý đăng nhập; đề xuất một bảng `profiles` ứng dụng khóa theo Auth user ID cho hồ sơ/role, thay vì giữ `password_hash` riêng. Role chỉ do backend/Admin có quyền gán. Đây là thay đổi ánh xạ cần duyệt. Customer online bắt buộc có profile; POS guest để `orders.customer_id` rỗng. |
| Catalog | CATEGORY → PRODUCT → PRODUCT_VARIANT | Một catalog, giá và tồn chung cho hai kênh; ảnh chính trong PRODUCT. Chỉ hàng có sẵn trừ tồn thành phẩm. Không đưa JSON public hiện tại thành nguồn giá tin cậy. |
| Tùy chỉnh | CUSTOMIZATION_CATEGORY → CUSTOMIZATION_OPTION; CUSTOM_CAKE trong danh sách bảng chính của DOCX | Dùng lựa chọn hợp lệ do Admin cấu hình; `ORDER_ITEM.customization_data` luôn giữ snapshot đầy đủ. Bản nháp/thiết kế lưu lâu dài ở CUSTOM_CAKE chỉ cần nếu xác nhận yêu cầu lưu/đồng bộ thiết kế; không bắt buộc để tạo order có snapshot. Không tách text/font/color/preview thành nhiều bảng. |
| Giỏ | CART với `items` JSON/Array; không cần CART_ITEM | Giỏ guest có thể ở cache trình duyệt; giỏ Customer nếu cần đồng bộ đa thiết bị dùng CART. RPC tạo đơn vẫn phải đọc/kiểm tra lại toàn bộ ID, số lượng và giá; không tin giá trong JSON giỏ. |
| Giao dịch | ORDER → ORDER_ITEM, ORDER_STATUS_HISTORY, PAYMENT | Cùng một cấu trúc đơn cho online/POS; `sales_channel` phân biệt, không tạo bảng POS order riêng. ORDER_ITEM giữ tên/giá/cấu hình tại lúc mua. ORDER_STATUS_HISTORY ghi người/lý do/thời điểm. PAYMENT ghi phương thức, số tiền, trạng thái; history xác nhận demo dùng audit log hoặc sự kiện payment trong cùng giao dịch. |
| Ưu đãi/điểm | PROMOTION; LOYALTY → LOYALTY_TRANSACTION | Một promotion tối ưu, không voucher nhập tay. Ledger điểm là nguồn đối soát; balance là số dư dẫn xuất/cập nhật nguyên tử. Không thêm bảng campaign vì DEC-07. |
| Khách hàng | WISHLIST_ITEM, REVIEW | RLS theo chủ; review chỉ khi có item trong đơn completed, mỗi order/product tối đa một review. Có thể chuyển sau luồng order nhưng phải giữ giao diện hiện có hoạt động. |
| Kiểm toán/báo cáo | ADMIN_AUDIT_LOG; DAILY_ANALYTICS | Audit chung cho thao tác Staff/Admin, kể cả payment/POS; không cần log riêng cho mỗi màn hình. `daily_analytics` là bảng tổng hợp theo ngày Việt Nam và kênh, Dashboard đọc từ đây. DOCX gọi tên DAILY_ANALYTICS nhưng chưa cung cấp bảng cột chi tiết trong phần bảng trích được. |

Tập bảng ứng dụng cốt lõi ở mức đề xuất là khoảng 18 bảng nếu gộp USER + CUSTOMER_PROFILE thành `profiles` và dùng CART nhưng chưa cần bảng bản nháp CUSTOM_CAKE. Nếu cần cả CART và bản nháp CUSTOM_CAKE được đồng bộ, số bảng sẽ tăng; chỉ tạo khi yêu cầu sử dụng thực tế được chốt. `auth.users` là bảng do Supabase quản lý, không tự tạo bản sao chứa password hash. Không cần bảng POS hay Analytics thứ hai, không tạo CART_ITEM/SHIPPING_ADDRESS/PRODUCT_IMAGE riêng. Bảng CUSTOMER_ML_FEATURE, PRODUCT_INTERACTION và campaign được hoãn theo DEC-07/10, không dùng dữ liệu giả.

## 3. Trường/cấu trúc thiếu hoặc cần đối chiếu trước SQL

1. **Khóa định danh:** DOCX dùng `INT`, còn dữ liệu public Wix/site dùng ID chuỗi UUID. Chọn chiến lược giữ ID public làm khóa chính hay dùng khóa nội bộ + `legacy_id` duy nhất, rồi lập mapping khóa ngoại cho sản phẩm, danh mục, promotion, variant, custom option. Không đổi ID hiện tại trong frontend trước khi duyệt mapping.
2. **Auth/role:** USER trong DOCX có `password_hash` và role; Supabase Auth có kho đăng nhập riêng. Cần quyết định ánh xạ `auth.users.id` với profile/customer và loại bỏ việc giữ mật khẩu băm demo ở bảng ứng dụng. CUSTOMER_PROFILE có `loyalty_id`, LOYALTY lại có `customer_id`; tránh hai FK vòng, chọn một chiều + unique.
3. **ORDER:** bảng DOCX chưa nêu `sales_channel` (online/offline), `fulfillment_type`, thời điểm nhận thực tế (`requested_at`), `client_request_id` duy nhất theo Customer/Staff scope, điểm đã dùng/tiền quy đổi, các khoản hoàn tiền hàng/phí ship, và snapshot phương thức thanh toán/điều kiện promo nếu cần đối soát. `customer_id` cần nullable **chỉ cho POS guest do Staff/Admin xác thực**. VND là số nguyên; không tự thêm VAT. `ready_for_pickup` chỉ thêm nếu enum được duyệt (R17).
4. **PAYMENT và audit:** DOCX có PAYMENT.status, ORDER.payment_status nhưng chưa xác định nguồn chuẩn; đề xuất PAYMENT là nguồn sự kiện/trạng thái thanh toán, ORDER.payment_status là snapshot/cache được cập nhật trong cùng transaction hoặc view đọc. Cần actor/time/idempotency cho xác nhận, và bút toán hoàn riêng tiền hàng/phí ship. ADMIN_AUDIT_LOG hiện ghi `admin_id`, không bao quát Staff; cần trường actor chung hoặc thiết kế audit tương đương. Không đồng nhất hủy đơn với đã hoàn tiền.
5. **PROMOTION:** DOCX có `discount_type`, `discount_value`, `target_type`, `target_id`, giới hạn lượt; JSON CMS hiện có dữ liệu cũ không đủ quan hệ/usage đáng tin cậy. Chỉ áp khi dữ liệu target/usage được xác nhận. `target_id` đơn lẻ đủ cho một đích; chỉ tạo quan hệ nhiều đích nếu thực sự cần và được duyệt. Giờ bắt đầu/kết thúc được so trong Asia/Ho_Chi_Minh. Không kích hoạt `voucher_code` cũ.
6. **Giờ/ship:** chưa có cấu hình giờ phục vụ đã xác nhận; cần nguồn cấu hình cửa hàng để RPC kiểm tra nhận bánh và vùng/phí giao. Không hardcode giờ hoặc phí. Giá tùy chỉnh xác định từ PRODUCT + CUSTOMIZATION_OPTION, snapshot tại ORDER_ITEM.
7. **DAILY_ANALYTICS:** cần ngày HCM, `sales_channel`, số đơn completed/cancelled, gross product sales, promotion discount, points redeemed, product refund, **net_product_revenue**, shipping collected/refunded, AOV sản phẩm, khách mới/quay lại. Unique theo ngày + kênh; không trộn doanh thu ship vào KPI.

## 4. RLS và điểm ghi tin cậy

| Chủ thể | Đọc | Ghi |
|---|---|---|
| Guest | Catalog/promotion public đã duyệt; review đã công khai | Không trực tiếp tạo online order/payment/profile. Giỏ tạm không nhạy cảm ở client. |
| Customer | Profile, wishlist, cart và order/items/payment/history **của chính mình**; dữ liệu public | Chỉ sửa trường profile cho phép và giỏ/wishlist của mình. Đặt/hủy đơn, dùng điểm, review qua RPC kiểm tra sở hữu và điều kiện. Không tự cập nhật giá, role, stock, order/payment status. |
| Staff | Catalog và đơn cần xử lý kể cả POS guest, thông tin khách tối thiểu phục vụ giao hàng | Chỉ gọi RPC xử lý đơn, tạo POS và xác nhận thu tiền demo; không sửa catalog, promotion, role, loyalty hay analytics trực tiếp. Không cấp quyền Admin bằng localStorage/JWT client. |
| Admin | Dữ liệu quản trị và báo cáo theo chính sách riêng, có kiểm toán | Quản lý catalog/promotion/role qua API/RPC kiểm tra quyền và ghi audit; không vượt qua quy tắc tiền/điểm/trạng thái. |

Bật RLS và kiểm tra cả quyền SQL (`GRANT`) trên mọi bảng/schema expose; policy phải dùng danh tính Auth và role **do server quản lý**, không tin trường role client gửi. Với RPC có quyền nâng cao: giới hạn `EXECUTE`, cố định `search_path`, kiểm tra caller và đầu vào trong function, ghi audit. Service-role key chỉ ở môi trường trusted backend nếu thực sự cần, tuyệt đối không trong frontend. Các nguyên tắc này phù hợp [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth user data](https://supabase.com/docs/guides/auth/managing-user-data), [database functions/RPC](https://supabase.com/docs/guides/database/functions).

## 5. Giao dịch/RPC bắt buộc

- `quote_order`: đọc giá/tồn/lựa chọn/giờ nhận/vùng ship từ DB, tính lại tiền VND, chọn **một** promotion hợp lệ giảm thực tế nhiều nhất (hòa ID tăng dần); quote để hiển thị, không coi quote ở client là chứng cứ giá.
- `create_online_order`: xác thực Customer, lock các hàng có sẵn và số dư điểm, validate cấu hình/lead time, tính lại quote, giữ/trừ điểm và tồn, tạo ORDER + ORDER_ITEM snapshot + PAYMENT pending/unpaid + history trong **một transaction**. Unique `(customer_id, client_request_id)` và trả kết quả cũ cho retry cùng key; requestId khác nhau là yêu cầu độc lập. Giỏ chỉ xóa sau khi nhận kết quả thành công. Không tự timeout đơn chờ thanh toán demo khi chưa có chính sách.
- `transition_order` / `cancel_order`: khóa đơn, kiểm tra luồng R17/R18 và actor; ghi ORDER_STATUS_HISTORY, hoàn tồn/điểm đúng một lần. Hủy đơn `paid` không tự đánh dấu `refunded`; quy trình refund riêng có bút toán đối ứng.
- `confirm_demo_payment`: Staff/Admin đã xác thực, lock ORDER/PAYMENT; từ chối `cancelled`, từ chối xác nhận lặp, cập nhật payment status và history/audit **cùng transaction**. Không thay order status. Không giả xác minh ngân hàng.
- `redeem_or_award_loyalty` / refund: khóa balance, ledger unique theo order + loại thao tác; chỉ cộng khi completed **và** paid trên tiền hàng sau khuyến mãi/điểm, trừ điểm dùng tối đa R03, hoàn/thu hồi R04/R05. Không cho JavaScript ghi điểm hoặc payment trực tiếp.
- `record_pos_sale`: Staff/Admin đã xác thực, dùng lại lõi giá/tồn/đơn/payment với `sales_channel=offline`, cho `customer_id=NULL` khi guest, tiền mặt demo, audit actor. Không có bảng đơn POS biệt lập hay quyền guest gọi RPC này.

Các thao tác này cần Postgres function/RPC hoặc backend tin cậy với transaction DB; JavaScript ES Modules chỉ gọi API và hiển thị kết quả. Không đưa service-role key ra trình duyệt.

## 6. Online/POS/Dashboard cùng nguồn dữ liệu

`categories/products/options/promotions` → cùng bộ tính giá/stock → `orders + order_items + payments + loyalty_transactions + histories` → `daily_analytics`/CRM read model. POS và online khác `sales_channel` và quyền caller, không khác công thức doanh thu. Một order được tính **một lần** sau khi cả `completed` và `paid`; kỳ báo cáo dùng `completed_at` tại Asia/Ho_Chi_Minh, kể cả nếu payment được xác nhận sau đó. `net_product_revenue = max(0, tiền hàng + phụ thu − khuyến mãi − tiền điểm − hoàn tiền hàng)`; `shipping_collected`/`shipping_refunded` là chỉ tiêu riêng. Online + Offline = Tổng, cùng tập order đủ điều kiện và cùng cách hoàn tiền (R22). Dùng cơ chế cập nhật tổng hợp idempotent/backfill khi payment hoặc refund đến muộn; Dashboard đọc `daily_analytics`, không quét toàn bộ orders ở mỗi lần mở.

## 7. Chuyển dần từ localStorage

1. **Kiểm tra project thật trước:** inventory bảng/cột/constraint/RLS/functions/policies, dữ liệu và migration history bằng quyền đọc phù hợp; so với matrix trên. Không áp SQL từ tài liệu này.
2. **Chốt schema/ID/RLS và test trên môi trường thử:** bảng/field thiếu chỉ triển khai sau duyệt. Dùng dữ liệu public đã xác nhận; không tự nhập lịch sử khách/đơn Wix nhạy cảm. Chỉ tạo tài khoản thật bằng Supabase Auth theo luồng được duyệt, không chuyển hash localStorage thành mật khẩu thật.
3. **Giữ contract frontend:** thay phần bên trong `authService`, `productService`, `promotionService`, `cartService`, `orderService`, `paymentService`, `loyaltyService`, `adminOrderService` bằng adapter API; giữ export và shape dùng ở các trang cho đến khi một contract thay đổi được duyệt. UI HTML/CSS/ES Modules không cần framework mới.
4. **Giỏ và custom draft:** giỏ guest ở client; sau đăng nhập merge theo khóa sản phẩm/variant/cấu hình và kiểm tra lại trên server, không đưa giá cache vào đơn. Chỉ xóa local cart sau `create_online_order` thành công. Nếu lưu custom draft đa thiết bị được duyệt mới chuyển `bobot:v1:customCakes` sang bảng.
5. **Chuyển theo nhóm, có cờ môi trường và rollback không mất đơn:** public catalog → Auth/profile → quote/cart/checkout RPC → order/profile/admin → payment/loyalty → POS → daily_analytics. Test tương đương các ca Sprint 1/1.1, kiểm tra RLS Customer A/B, Staff/Admin, retry, stock contention, refund và timezone. Không chạy đồng thời hai nguồn ghi order/paid trong production.

## 8. Quyết định cần chủ dự án phê duyệt trước migration

1. Mapping ID `INT` trong DOCX với UUID/string Wix, cùng chiến lược import dữ liệu public/private.
2. Dùng `auth.users` + một `profiles` thay USER/CUSTOMER_PROFILE và bỏ password_hash ứng dụng; chọn chiều FK LOYALTY.
3. Các trường ORDER/PAYMENT/audit/analytics thiếu ở mục 3, đặc biệt `sales_channel`, idempotency, actor Staff, refund allocation và nguồn chuẩn payment status.
4. Có cần lưu giỏ Customer và bản nháp CUSTOM_CAKE đa thiết bị đồng thời hay chỉ giữ snapshot order + cache UI để gọn bảng.
5. Cấu hình giờ phục vụ, vùng/phí giao và nguồn quan hệ/usage promotion; không tự suy ra từ CMS thiếu dữ liệu.

Không có quyết định nào ở đây cho phép sửa chính sách FINAL, chạy migration, tạo project hay bắt đầu POS/Dashboard.
