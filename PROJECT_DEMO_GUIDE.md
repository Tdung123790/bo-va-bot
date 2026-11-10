# Bơ & Bột — hướng dẫn trình diễn đồ án

## Mục tiêu và phạm vi

Website phục vụ bán bánh online và vận hành tại quầy trên một cơ sở dữ liệu. Frontend là HTML5, CSS3 và JavaScript ES Modules; backend là Supabase PostgreSQL, Auth, RLS và RPC. Thanh toán COD, chuyển khoản và tiền mặt tại quầy hiện là **mô phỏng**. Dữ liệu kinh doanh trình diễn là fixture **TEST** trên Supabase LOCAL, không phải doanh thu thật. Chưa triển khai mô hình ML, CRM campaign hoặc cổng thanh toán thật.

## Kiến trúc

Trình duyệt tải các trang tĩnh trong `site/`, gọi Supabase Auth và Data API qua `@supabase/supabase-js` đã đóng gói cho static site. Các service JavaScript dùng `fetch`/AJAX bất đồng bộ để đọc JSON catalog, profile, đơn, wishlist và Dashboard; `site/data/*.json` là dữ liệu nguồn/demo, không phải nguồn giá chính thức trong Supabase mode. RPC PostgreSQL tính lại giá và khuyến mãi, kiểm tồn, tạo đơn, chuyển trạng thái, thanh toán demo, loyalty và KPI trong transaction. RLS giới hạn quyền đọc theo tài khoản; các bảng tài chính và tồn kho không cấp quyền ghi trực tiếp cho client.

## Use case theo vai trò

| Vai trò | Luồng trình diễn |
|---|---|
| Customer | Guest xem Menu, thêm giỏ → Login → nhận bánh tại cửa hàng → báo giá server → chọn điểm → COD hoặc bank demo → xem đơn, wishlist và điểm trong Profile. Bánh tùy chỉnh phải đặt trước ít nhất 24 giờ. |
| Staff | Login → POS tìm sản phẩm, thay số lượng, nhận quote → tạo đơn guest `offline/counter/cash_demo`; mở Staff Orders để xem, chuyển trạng thái, hủy hợp lệ hoặc xác nhận thanh toán demo. POS chưa liên kết Customer vì chưa duyệt quy trình xác minh. |
| Admin | Login → Admin Orders và Dashboard; lọc Online/Offline/ngày, xem doanh thu sản phẩm, phí ship riêng, AOV, khách mới/quay lại, top sản phẩm, tồn và đơn chờ. Có thể dùng trusted local script để kiểm tra quy trình bootstrap Admin và audit, không tự cấp quyền ở browser. |

## Dữ liệu và giao dịch minh họa

`auth.users` tạo `profiles`; `products`/`categories`/`customization_options` cung cấp giá và cấu hình; `orders` liên kết `order_items`, `payments`, `order_status_history`; `loyalty_accounts` và `loyalty_transactions` giữ số dư/ledger; `promotions` giữ quota; `daily_analytics` là read model KPI; `audit_log` ghi thao tác quản trị. Online và POS dùng chung sản phẩm, tồn, khuyến mãi, order và payment. Thử lại cùng `requestId` trả đơn cũ, không trừ tồn hai lần. Chỉ `completed + paid` ghi doanh thu sản phẩm; shipping được tách, refund điều chỉnh đúng một lần. Ngày KPI theo Asia/Ho_Chi_Minh.

## Kịch bản trước giảng viên

1. Khởi động Supabase LOCAL và static server theo `CLOUD_DEPLOYMENT_RUNBOOK.md` phần local; xác nhận URL local. Chạy `node scripts/test-supabase-frontend.mjs` và `node scripts/test-supabase-omnichannel.mjs` để quan sát kịch bản tự động với tài khoản/catalog TEST. Runner dọn fixture ngay sau test, nên không thể dùng các tài khoản đó để bấm thủ công về sau.
2. Trong browser automation Customer, chỉ ra Menu → guest cart → Login → Checkout: giỏ còn nguyên; pickup và quote từ backend; đổi điểm làm tổng tiền thay đổi. Giải thích kết quả từ log và màn hình test.
3. Chỉ ra đơn COD demo và bank demo riêng: retry cùng requestId chỉ tạo một đơn/payment; bank có trạng thái `pending`, chưa tự thành `paid`. Mở phần Profile/Admin payment trong browser test và log tương ứng.
4. Trong browser automation Staff, chỉ ra POS guest `offline/counter/cash_demo`, mã đơn và tổng tiền; Staff Orders xử lý đơn online và xác nhận demo payment. Nhấn mạnh payment status độc lập với order status.
5. Trong browser automation Admin, chỉ ra Dashboard trước/sau completed + paid, lọc Online/Offline, đối chiếu tổng và shipping riêng; xem top products, AOV, khách mới/quay lại. SQL/API logs chứng minh RLS, idempotency, stock race và audit.
6. Chỉ ra giới hạn: delivery bị chặn khi địa chỉ chưa xác minh, catalog production chưa duyệt, thanh toán không xác minh ngân hàng, Cloud chưa deploy. Chạy `npm.cmd run db:verify:empty` xác nhận fixture đã dọn. Nếu cần trình diễn bấm tay thay vì automation, phải chuẩn bị một phiên fixture TEST tạm trên LOCAL trước buổi diễn và dọn sau; repository chưa cung cấp một lệnh tạo fixture bền vững cho phiên này.

Hai runner cần `BOBOT_LOCAL_DB_PASSWORD` trong biến môi trường process, tạo rồi dọn fixture TEST; không cung cấp môi trường demo tồn tại lâu dài. Không dùng các tài khoản TEST làm tài khoản production.
