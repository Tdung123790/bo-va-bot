# Bơ & Bột — quyết định P-01–P-10 đã được chủ dự án duyệt

**Ngày ghi nhận:** 06/11/2026. **Phạm vi:** chuẩn bị kinh doanh thật, chưa phê duyệt release/deploy Cloud. Các quyết định DEC-01–DEC-10, R01–R35, S-01–S-05 và E-01/E-02 vẫn giữ hiệu lực nếu không có thay thế được nêu rõ dưới đây.

| ID | Quyết định đã duyệt | Tác động và giá trị chưa được duyệt |
|---|---|---|
| P-01 | Mục tiêu là kinh doanh thật. | Các payment demo, dữ liệu TEST và localStorage demo không được mô tả là vận hành production. Quy trình thu/đối soát tiền thật chưa duyệt. |
| P-02 | Chỉ sản phẩm đầy đủ và xác minh mới nhập/kích hoạt/bán backend. | 65 nguồn được giữ trong manifest; không sản phẩm nào có phê duyệt production hiện tại. |
| P-03 | Giá/tồn production do chủ dự án duyệt riêng theo sản phẩm. | `sourcePriceVnd` Wix chỉ tham khảo; giá/tồn được duyệt đều để `null`. Importer cũ buộc giá bằng Wix không còn phù hợp đường production. |
| P-04 | Duyệt lại cả 16 customization options và giá trước khi kích hoạt. | Giá option và quan hệ hợp lệ chưa được xác nhận. Backend chỉ cho custom order với option active/có giá; đường import production khóa custom product nếu chưa đủ 16 option APPROVED. |
| P-05 | 08:00–20:00 hằng ngày chỉ cho DEMO. | Giờ pickup/delivery production `null`; không chuyển fixture TEST hoặc giờ DEMO sang production. |
| P-06 | Delivery cần địa chỉ/vị trí đáng tin cậy và backend kiểm vùng/phí. | RPC vẫn chặn delivery. Nguồn geocoding, quy trình xác minh, vùng, bảng phí và cách lưu chứng cứ chưa được duyệt. |
| P-07 | Promotion DEMO chỉ cho test/staging cô lập. Quyết định trực tiếp ngày 10/11/2026 phê duyệt riêng `FINAL_2026_11_12_15_PERCENT`: giảm 15% cho đơn từ 150.000đ, tối đa 90.000đ, ALL, tự áp dụng từ 00:00 ngày 10/11 đến hết 23:59:59 ngày 12/11 theo Asia/Ho_Chi_Minh, không giới hạn lượt hoặc mỗi khách. | Whitelist production chỉ chứa chương trình này; các promotion lịch sử và DEMO không được kích hoạt. Release Cloud vẫn cần phê duyệt riêng theo P-09. |
| P-08 | POS gắn Customer/tích điểm chỉ sau xác minh chủ tài khoản. | POS guest vẫn hoạt động; mọi `customer_id` do Staff gửi bị RPC từ chối. Cơ chế mã một lần cần phê duyệt schema/hạ tầng trước triển khai. |
| P-09 | Đích là Supabase Cloud + Cloudflare Pages công khai. | Đây là mục tiêu, **không** phải lệnh tạo project, link, push migration hoặc deploy. Cần một lần phê duyệt release riêng. |
| P-10 | Nhà cung cấp thanh toán tự động chính thức là **VNPAY**, tham chiếu PAY API 2.1.0; backend tạo payment URL, xử lý IPN, truy vấn QUERYDR và yêu cầu REFUND theo quyền. Return URL chỉ đọc trạng thái backend; sandbox/production dùng credentials tách biệt. | Chỉ triển khai và thử LOCAL/mocks trong Sprint 7. Chưa có merchant sandbox credentials, chưa nghiệm thu sandbox hay phê duyệt production release. COD và POS cash giữ luồng riêng; `bank_transfer_demo` không thay VNPAY production. Hoàn tiền một phần chưa có chính sách phân bổ R05 được duyệt. |

## Đối chiếu với contract và code cũ

| Nguồn cũ | Điểm khác | Kết luận áp dụng |
|---|---|---|
| Sprint 1–5 demo và `PRODUCT.md`/`site/CONTRACT.md` | Các đoạn gọi hệ thống là đồ án/demo. | P-01 thay mục tiêu triển khai, nhưng payment hiện vẫn demo theo DEC-09; đây là **release blocker**, không âm thầm chuyển payment thành tiền thật. |
| `scripts/import-catalog-local.mjs` | Khi `saleApproved`, `approvedPrice === row.price` Wix. | P-03 thay giả định này cho đường production. Dùng `import-approved-catalog-local.mjs` với manifest riêng; script cũ giữ để tái hiện TEST/historical workflow, không dùng cho production. |
| Giá/ảnh/tồn trong `site/data/products.json` | Dữ liệu hiển thị Wix có thể có giá nhưng không phải phê duyệt bán thật. | P-02/P-03: không nhập hoặc kích hoạt bản ghi thiếu approval. Giữ JSON nguồn, không tự sửa giá 0 hay stock. |
| Cake options JSON và TEST fixture | Giá option đã đủ cho demo kỹ thuật. | P-04: production cần approval độc lập từng option; custom product bị khóa nếu chưa đủ 16 option được duyệt. |
| `store_settings` và fixture TEST | Giờ TEST phục vụ SQL/browser test; P-05 duyệt 08:00–20:00 cho DEMO, chưa duyệt production. | Manifest production để `null`; backend pickup trả lỗi chưa cấu hình, delivery tiếp tục chặn. Fixture cũ 00:00–23:59 là dữ liệu tổng hợp kiểm thử mốc thời gian, **không phải giờ kinh doanh DEMO 08:00–20:00** để triển khai staging. |
| `private.quote_core` | Logic phí ship theo lat/lng browser nằm sau chốt chặn vô điều kiện. | P-06: không tháo chốt khi chưa có trusted verification; phần tính theo tọa độ client không được dùng làm nguồn phí production. |
| `promotions`/Admin RPC | DB chưa có trường environment/approval provenance, Admin có thể cấu hình promotion. | P-07 cập nhật: chương trình FINAL 12/11 đã được duyệt; production release gate so whitelist và điều kiện của đúng chương trình này. DEMO/lịch sử vẫn không được kích hoạt. |
| `record_pos_sale` và POS UI | Chỉ guest, từ chối `customer_id`. | P-08 xác nhận bảo vệ hiện tại; thêm liên kết cần thay đổi schema/RPC được duyệt riêng. |
| Runbook Sprint 5 | Cloud là bước sau. | P-09 cho phép chuẩn bị hai môi trường; **không** cho phép deploy trong Sprint 6. |
| DEC-09, R19/R20 và payment demo | Contract đã duyệt trước đây loại trừ gateway thật. | P-10 thay thế đúng phần **không tích hợp cổng thật** cho luồng VNPAY, vẫn giữ COD, chuyển khoản demo và POS cash là các luồng riêng. Trạng thái `paid` VNPAY chỉ do backend xác minh; Return URL không được xác nhận thanh toán. Chưa phê duyệt quy trình vận hành thật cho COD/cash hoặc refund một phần. |

**Còn cần chủ dự án quyết định:** danh tính/cách ký duyệt giá và stock từng sản phẩm, option, giờ/cấu hình cửa hàng, nguồn địa chỉ đáng tin cậy và đối soát payment; phê duyệt extension lưu mã POS một lần; promotion production được phép; staging/production project và release authorization. Không tự thay đổi các quy tắc DEC/R/S/E đã duyệt.
