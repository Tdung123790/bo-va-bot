# Bơ & Bột — Schema Freeze Approval

**Ngày phê duyệt:** 04/11/2026 (Asia/Ho_Chi_Minh)
**Trạng thái:** APPROVED FOR LOCAL IMPLEMENTATION — NOT DEPLOYED
**Môi trường:** Greenfield — chủ dự án xác nhận CHƯA tạo Supabase Cloud project. Không có schema remote để migration tương thích.

## 1. Quy tắc thứ tự ưu tiên

1. `reference/contracts/BoBot_FUNCTIONAL_REQUIREMENTS_FINAL_APPROVED_2026-11-04.md`: chuẩn nghiệp vụ DEC-01–DEC-10, R01–R35.
2. `reference/architecture/SUPABASE_SCHEMA_TARGET.md`: baseline 18 bảng, đã được chủ dự án chấp thuận qua S-01–S-05.
3. `reference/architecture/SUPABASE_SECURITY_TEST_MATRIX.md`: yêu cầu kiểm chứng RLS/RPC/giao dịch.
4. `reference/architecture/SUPABASE_IMPLEMENTATION_PLAN.md` và CSDL DOCX: tư liệu thiết kế và đối chiếu.
5. Code `site/` demo: tham khảo contract/shape, KHÔNG phải nguồn tin cậy của tiền/quyền/stock.

Mọi thay đổi nghiệp vụ ngoài các quyết định đã duyệt phải được báo `BLOCKED_BY_BUSINESS_DECISION`, không tự coi là đã duyệt.

## 2. S-01—S-05: PHÊ DUYỆT

| Quyết định | Kết luận phê duyệt |
|---|---|
| **S-01 — Auth & ID** | Supabase `auth.users` + `public.profiles`; PK UUID nội bộ, giữ ID Wix/JSON nguyên văn qua `source_id` unique hoặc `legacy_contact_id`/`source_legacy_id`. **Không** nhập password/hash hoặc role localStorage. Không nối ID số của 186 variants hay 234 reviews nếu chưa có nguồn mapping. |
| **S-02 — Phạm vi** | Baseline **18 bảng ứng dụng** theo SCHEMA_TARGET; **không** tạo `carts`, `custom_cakes` lưu nháp, `loyalty_rewards`, tier benefits, Campaign/Tags/RFM/ML. Giỏ/bản nháp vẫn là cache frontend; `order_items.customization_data` lưu snapshot đơn hoàn chỉnh. |
| **S-03 — Orders & payments** | Bổ sung `sales_channel=online/offline`, `fulfillment_type=delivery/pickup/counter` (`counter` chỉ POS), `client_request_id`, actor/audit, refund tách tiền hàng/phí ship. `payments` là nguồn chuẩn giao dịch; `orders.payment_status` là projection đồng bộ nguyên tử. Online yêu cầu Customer đăng nhập, POS Staff/Admin cho phép khách vãng lai. |
| **S-04 — Promotion** | Một khuyến mãi tự động có giá trị giảm VND cao nhất, không cộng dồn; hòa chọn ID tăng dần. Kiểm soát usage limit/per-customer limit **atomically**; không kích hoạt promotion CMS thiếu nguồn target/usage/discount tin cậy. Không có ô voucher. |
| **S-05 — Store & analytics** | `store_settings` giữ giờ nhận, khu vực, phí ship; chưa xác nhận thì `NULL` và không tự bịa. `daily_analytics` theo ngày Asia/Ho_Chi_Minh và kênh. Revenue sản phẩm chỉ của đơn completed + paid, **không gồm ship**; ship riêng. Khách mới là lần mua completed + paid đầu tiên xét toàn kênh, khách quay lại là lần tiếp theo; POS guest không phân loại. |

## 3. Danh sách 18 bảng đã khóa

1. `profiles`
2. `categories`
3. `products`
4. `product_variants`
5. `customization_categories`
6. `customization_options`
7. `promotions`
8. `orders`
9. `order_items`
10. `order_status_history`
11. `payments`
12. `loyalty_accounts`
13. `loyalty_transactions`
14. `wishlist_items`
15. `reviews`
16. `daily_analytics`
17. `audit_log`
18. `store_settings`

Cột, kiểu, FK, UQ, CHECK và trạng thái theo `SUPABASE_SCHEMA_TARGET.md`; không mở rộng bảng ngoài 18 nếu chưa có lý do kỹ thuật rõ và phê duyệt. `auth.users` là bảng hệ thống, không nằm trong 18 bảng ứng dụng.

## 4. Gate kỹ thuật bắt buộc

- Dùng Postgres migration SQL lưu version trong repo; không chạy trên cloud nếu chưa có phê duyệt riêng.
- Mọi bảng exposed phải có RLS **và** GRANT được rà soát. Khóa direct INSERT/UPDATE/DELETE của dữ liệu tài chính, role, tồn kho và audit.
- RPC nhận danh tính qua `auth.uid()`, không tin actor/role/amount do client khai; kiểm `profiles.status='active'` cho thao tác nhạy cảm.
- Giữ `SECURITY DEFINER` ở schema `private` không exposed, đặt `search_path=''`, schema-qualify mọi bảng; wrapper exposed có kiểm quyền và `EXECUTE` tối thiểu.
- Mọi tính giá, giữ/trừ/hoàn stock, loyalty ledger, payment/refund, order status, idempotency và promotion usage phải nguyên tử; rollback hoàn toàn nếu lỗi.
- `client_request_id` cùng customer/actor trả lại đơn cũ chỉ khi payload khớp; khác key độc lập; requestId của khách khác không được đọc được kết quả của nhau.
- Không đưa `service_role`/secret lên frontend, không import lịch sử riêng tư hoặc seed dữ liệu giả vào cloud.
- Dữ liệu variant/review chưa map **không tạo FK giả**, không xóa 234 review khỏi giao diện tĩnh hiện hành. Chưa có dữ liệu giờ/ship thì luồng quote cần config phải trả thông báo chưa cấu hình.

## 5. E-01—E-02: ĐÃ PHÊ DUYỆT BỔ SUNG (04/11/2026)

| Quyết định | Kết luận phê duyệt |
|---|---|
| **E-01 — Hoàn quota khuyến mãi khi hủy đơn** | Khi một đơn có khuyến mãi được **hủy hợp lệ**, hoàn lại lượt sử dụng khuyến mãi tương ứng, bao gồm giới hạn toàn chương trình và giới hạn theo khách hàng. **Chỉ hoàn đúng một lần** bằng thao tác giao dịch nguyên tử và khóa/chống xử lý lặp. Đơn không hủy hợp lệ không được hoàn quota. |
| **E-02 — Thu hồi điểm thiếu khi hoàn tiền** | Khi khoản hoàn tiền yêu cầu thu hồi điểm đã tích nhưng số điểm khả dụng không đủ, thu hồi phần còn khả dụng và **ghi nhận phần thiếu là nợ điểm**. Điểm khả dụng hiển thị **không âm**; những lần cộng điểm hợp lệ sau này phải cấn trừ nợ trước, chỉ phần còn lại mới tăng số dư khả dụng. Ghi ledger đối ứng để truy vết, chống thu hồi/cấn nợ lặp. |

**Yêu cầu khi viết SQL/RPC:**
- E-01 phải kiểm tra/khóa theo giao dịch tại `cancel_order`, bảo toàn giới hạn usage global/per-customer và tránh hoàn hai lần khi retry; không cộng lại lượt khuyến mãi cho đơn chưa từng chiếm lượt hợp lệ.
- E-02 bổ sung dữ liệu nợ điểm trong `loyalty_accounts` và các loại bút toán thích hợp trong `loyalty_transactions`, **không tạo bảng thứ 19**. Thiết kế kiểm tra toàn vẹn `available_points >= 0` và `point_debt >= 0`, ledger nhất quán, refund lặp không tạo thêm nợ.
- Các quy tắc này là **đã duyệt**, không còn được đánh dấu `BLOCKED_BY_BUSINESS_DECISION` chỉ vì E-01/E-02. Nếu gặp trường hợp nghiệp vụ mới khác chưa có quyết định, báo lại trước khi mặc định.

## 6. Cửa kiểm soát triển khai

**Cho phép ngay:** Codex viết migration SQL/DB tests, chạy Supabase local nếu có Docker, cập nhật architecture docs/checklist.
**Không cho phép ở lượt này:** tạo/link/deploy Cloud project; `db push --remote` hoặc `db reset --remote`; chạy migration remote; seed lịch sử Wix chưa mapping; sửa UI/POS/Dashboard/ML; tự thay DEC/R.

Điều kiện xem xét deploy lần sau: local `supabase db reset` (CHỈ local) + DB tests bảo mật/giao dịch PASS, review schema diff và các blockers còn mở, người dùng xác nhận Supabase cloud project và cho phép triển khai remote riêng.
