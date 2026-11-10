# Bơ & Bột — Kiểm toán bộ dữ liệu nhóm bàn giao

Ngày đối chiếu: 09/11/2026. Nguồn: `Bo_Bot_data.zip` và snapshot source `repomix-output(20261109-063422).xml`. Tài liệu này là kiểm toán tệp, **không phải** kết quả truy vấn PostgreSQL LOCAL.

## 1. Quyết định nhập dữ liệu

**Duyệt một phần.** Bộ dữ liệu này là **synthetic nghiên cứu**. Dùng cho huấn luyện/đánh giá Churn, đối chiếu Recommendation và tạo ánh xạ catalog; **không nhập 29 bảng CSV vào 18 bảng Supabase vận hành**; tuyệt đối không import `auth_users.csv`, đơn/tiền/điểm/đánh giá giả lập vào Auth, POS hay Dashboard doanh thu chính thức. Không ghi đè danh mục/cấu hình bánh hiện tại. Giữ nguyên hai đơn VNPAY TEST và database LOCAL.

- 38 mục trong ZIP, khoảng 18,4 MB nén và 82,4 MB giải nén. Tất cả mục là CSV/TXT/JSON, không có đường dẫn thoát thư mục (`../`).
- 8.500 khách hàng giả lập, 5 nhân viên giả lập: tổng `auth_users` và `user_profile` đều **8.505**. Đây không phải 8.505 tài khoản thực.
- 108.068 đơn, 166.266 dòng hàng, 108.068 payment, 109.374 bút toán điểm, 25.303 review, 28.474 log gợi ý; 567 refund.
- `README_HUONG_DAN.txt` và `DATASET_SUMMARY.json` còn mô tả **80 sản phẩm / 8 danh mục / 16 tùy chọn / 20 khuyến mãi**, trong khi CSV bản điều chỉnh thực tế có **62 / 7 / 13 / 5**. Dùng số dòng CSV thực tế và `README_DIEU_CHINH.txt`, không dùng các tổng cũ làm cơ sở import.

## 2. Catalog và khóa ngoại

- **62/62 sản phẩm thông thường** trong CSV khớp tên duy nhất với 62 sản phẩm thông thường của `site/data/products.json`. `base_price` CSV ở đơn vị nghìn VND; khi nhân 1.000, **62/62 giá trùng** nguồn website (ví dụ Kiwi Tart 180 → 180.000đ). Không import nguyên giá 180 thành 180đ.
- **Sản phẩm thứ 63** trong bản FINAL là `Bánh Tùy Chỉnh`, không có trong CSV nghiên cứu. Danh mục thứ tám của FINAL cũng liên quan tới sản phẩm này; không coi đây là lỗi mất sản phẩm trong dataset nghiên cứu.
- **186/186 biến thể** khớp `id`, `productId` số, tên và phụ thu sau quy đổi ×1.000 với `site/data/product-variants.json`. Bảng `BoBot_ML_CATALOG_MAPPING_VERIFIED.json` ghi ánh xạ nghiên cứu numeric ID → sản phẩm website UUID; đây là ánh xạ đối chiếu source, **chưa phải bằng chứng đã nhập vào Supabase**.
- **13 tùy chọn custom** trong CSV không có cùng cấu trúc với **16 tùy chọn** của frontend (size/flavor/cream/font/color); không overwrite customizer.
- Cột ảnh sản phẩm là URI nội bộ `wix:image://`, không phải URL có thể sử dụng trực tiếp trên website. Giữ ảnh và giá hiện có của website.
- Với các quan hệ FK chủ đạo (order→customer, order_item→order/product/variant, variant→product, review→order_item/product/customer, payment→order, recommendation_log→product/customer), kiểm toán tệp cho kết quả **0 khóa mồ côi**. Không có duplicate/empty PK ở những bảng trọng yếu được đối chiếu.

## 3. Churn ML

- `ml_churn_training_asof_2026_07_01.csv`: **8.500 dòng**, 14 cột. `as_of_date=2026-07-01`; nhãn `churn_60d` bằng 1 khi không có đơn COMPLETED từ 01/07 đến trước 01/09/2026. Tái đối chiếu với đơn hoàn tất trong ZIP cho **0 nhãn lệch**.
- Tái lập mô hình HistGradientBoostingClassifier (`max_iter=110, max_leaf_nodes=15, l2_regularization=3, random_state=42`), chia 75/25 stratify customer, 8 biến đặc trưng lịch sử: **ROC-AUC 0,8884; PR-AUC 0,7252; accuracy 0,8245; F1 churn 0,6748**; confusion matrix `[[1365,188],[185,387]]`.
- Kết quả đo được và lặp lại trên **dữ liệu do chương trình giả lập sinh**, không thể suy ra chất lượng mô hình đối với khách hàng thật. Không thay thế các chỉ số mô hình xuất hiện trong báo cáo nhóm cũ mà không ghi rõ nguồn dataset, mô hình, phiên bản và quy trình đánh giá mới. Không nhập các customer_id giả lập vào bảng `profiles` đang vận hành.
- `churn_prediction.csv` là file **chỉ có header**. Muốn trình diễn, tạo đầu ra dự đoán từ mô hình đã train và ghi rõ nhãn **DỮ LIỆU GIẢ LẬP**. Nếu gắn vào Dashboard Admin, dùng nguồn nghiên cứu tách biệt hoặc gọi model bằng đầu vào được phép; tuyệt đối không gán xác suất giả cho khách hàng kinh doanh thật.

## 4. Recommendation/search

- `recommendation_holdout_2026_07_01.csv`: 8.500 khách; `history_product_ids` và `future_product_ids` đều chỉ tham chiếu các mã sản phẩm hợp lệ (0 tham chiếu ngoài danh mục). `has_future_purchase` khớp dữ liệu mua sau mốc cho toàn bộ 8.500 khách.
- `recommendation_log.csv`: 28.474 dòng, `source` tất cả là **SYNTHETIC_BASELINE**; chưa phải đề xuất được mô hình học máy kiểm chứng. Dùng tệp holdout để tính Recall@K/NDCG@K, **không dùng future_product_ids để tạo feature hay đề xuất**.
- **Không có cặp query tìm kiếm → sản phẩm phù hợp** trong ZIP. Yêu cầu FINAL là đề xuất khi **mọi** khách nhập truy vấn (kể cả Guest/new), nên cần mô hình truy hồi dựa trên tên/mô tả/đặc tính catalog (TF-IDF hoặc phương pháp có kiểm chứng), đánh giá bằng bộ câu truy vấn gắn nhãn độc lập. Lịch sử mua chỉ bổ trợ khi được phép; không buộc khách phải mua trước.

## 5. Các điểm khiến CSV tài chính không thể import sang vận hành

- **12.360 đơn có dùng điểm** có `points_discount / points_used = 1.000 VND/điểm`, trái quy tắc FINAL mới **1 điểm = 10 VND**, tích **1 điểm/1.000 VND**. Không tính lại hay ghi đè order/ledger lịch sử LOCAL bằng các bản ghi giả lập này.
- **567/567 dòng `refund` có `status=COMPLETED`, nhưng đơn liên quan đều `CANCELLED` với `payment_status=PENDING`**. Không có dữ kiện charge `PAID` tương ứng để đối soát tiền thực hoàn. Dùng các dòng này chỉ như dữ liệu mô phỏng luồng, không công nhận thành chứng từ thanh toán.
- `orders.order_status` chỉ gồm `COMPLETED`, `CANCELLED`, `PROCESSING`, không bao phủ 6 trạng thái FINAL (`pending/confirmed/preparing/shipping/completed/cancelled`). `sales_channel` dùng `POS` thay cho `offline`; 18.282 đơn POS đều có `fulfillment_method=PICKUP` thay vì `counter` của phiên bản FINAL. `role` có 4 vai trò gồm `CASHIER` riêng, trong khi phiên bản FINAL thống nhất Customer/Staff/Admin; không import roles thẳng vào bảng `profiles`.
- `daily_analytics.csv` chỉ có 6 cột, **không phân tách Online/Offline**, thiếu KPI sản phẩm, shipping và refund theo schema FINAL. Không dùng thay `daily_analytics` của Supabase.
- `review.csv`: **25.303/25.303** bình luận có cùng nội dung `Danh gia mo phong`; ratings không chứa đánh giá 1 sao (chỉ 2–5). Không sử dụng để huấn luyện kiểm duyệt nội dung, không công khai thành review thật. Chính sách FINAL: chấp nhận cả đánh giá xấu hợp lệ, chỉ từ chối nội dung thô tục/xúc phạm nghiêm trọng hoặc cực kỳ phản cảm.
- 5 promotion trong CSV thuộc giai đoạn cũ (chủ yếu trước 11/2026) nên không ghi đè các khuyến mãi FINAL tháng 11. Không mang 8.500 tài khoản `example.invalid` vào Auth.

## 6. Phạm vi dùng được ngay (an toàn)

1. **Research/Churn offline:** train/validate model, lưu metric + model version và output synthetic trong thư mục riêng, chưa ghi vào 18 bảng giao dịch.
2. **Research/Recommendation:** sử dụng purchase history trước 01/07 và holdout sau mốc để đánh giá; kết hợp catalog thật và nội dung mô tả để xây chức năng ML search cho mọi khách.
3. **Catalog crosswalk:** dùng `BoBot_ML_CATALOG_MAPPING_VERIFIED.json` để Codex đối chiếu 62 sản phẩm/186 variants và xây adapter nghiên cứu → UUID; không giả định numeric ID là PK của bảng `products` trong Supabase.
4. **Frontend vận hành:** giữ catalog, transaction, loyalty, reviews và dashboard từ nguồn Supabase chính thức. Không đưa raw synthetic dataset lên thư mục `site/`, không push công khai file chứa lịch sử giả lập nếu chưa cần.

**Giới hạn kiểm tra:** Không chạy trực tiếp trên máy Windows/Supabase LOCAL của người dùng. Đã kiểm tra dữ liệu ZIP, tham chiếu với snapshot Repomix, tái chạy huấn luyện Churn. Kiểm tra trùng số liệu và migration trên cơ sở dữ liệu thật do Codex thực hiện tại local sau khi người dùng đặt tệp vào workspace.
