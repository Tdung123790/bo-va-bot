# ML search và recommendation query-time — thiết kế PHA A

**Trạng thái:** thiết kế, chưa triển khai vào storefront hoặc Supabase. Nguồn giao diện hiện tại: `site/js/pages/menu.js` tìm chuỗi trong tên/mô tả sau khi `productService.getAll()` tải catalog. Nguồn chỉ số và giao dịch vận hành vẫn là Supabase, không lấy từ ZIP synthetic.

## Phạm vi và nguồn dữ liệu

- Áp dụng cho mọi Guest/Customer có truy vấn; không buộc đăng nhập hoặc lịch sử mua. Chỉ index sản phẩm active, đã phê duyệt, có `source_id`, tên, mô tả và danh mục từ catalog hiện hành. Giá, stock và trạng thái bán do backend vận hành cung cấp lúc hiển thị, không copy từ model.
- Chuẩn hóa Unicode tiếng Việt, dấu/cách viết thường, token tên, nhóm bánh và mô tả; dùng TF-IDF hoặc BM25 content-based để xếp hạng. Kết hợp exact-name boost có giới hạn và filter category hiện có. Cần đánh giá query tiếng Việt có dấu/không dấu, từ đồng nghĩa, tên bánh ngắn, truy vấn vô nghĩa và out-of-catalog trước khi phát hành.
- `recommendation_holdout_2026_07_01.csv` chứa history trước mốc và future sau mốc của 8.500 khách **synthetic**. Có thể đánh giá offline co-purchase trên history-only bằng Recall@K/NDCG@K; future chỉ là nhãn đánh giá, tuyệt đối không dùng khi xây feature/candidate. Không đưa ID khách synthetic vào API.
- Không có cặp query→product relevance trong ZIP. Vì vậy không tuyên bố Recall@K từ holdout là chất lượng tìm kiếm theo truy vấn. Cần bộ câu hỏi tìm kiếm được gắn nhãn độc lập và phê duyệt để đo MRR/nDCG/Recall@K cho query search.

## Hợp đồng API dự kiến

`POST /search` công khai, không ghi DB core. Request JSON: `{ "query": "bánh tart trái cây", "limit": 12, "category_source_id": null }`. Server giới hạn độ dài query, số kết quả, rate limit và chỉ đọc catalog công khai. Response JSON: `{ "results": [{ "source_id": "...", "score": 0.0 }], "model_version": "content-index-v1", "catalog_version": "...", "mode": "model" }`. Không nhận `customer_id`, role, giá, stock hay thanh toán từ client. Kết quả trả ID để frontend lấy giá/trạng thái mới nhất từ catalog Supabase; sản phẩm inactive bị lọc lần nữa.

Khi model/index không sẵn sàng hoặc timeout, trả lỗi có mã rõ; frontend chuyển sang lọc tên/mô tả hiện có trên **catalog hiện hành**, hiển thị trạng thái fallback, không tạo kết quả hoặc giá giả. Cần tránh hiện kết quả cũ khi query thay đổi. Không thêm bảng thứ 19; index có thể là artifact riêng được tạo từ catalog approved và versioned, sau này mới duyệt hạ tầng thực thi.

## Quyền riêng tư và nghiệm thu

- Không log query kèm token/PII; nếu cần telemetry, giới hạn retention và ẩn thông tin nhận dạng. Không dùng synthetic purchase history để cá nhân hóa người dùng thật.
- Offline evaluation: tách lịch sử/future theo mốc 01/07/2026, giữ candidate set không chứa sản phẩm inactive, báo số user có future purchase và baseline popularity. Báo metric synthetic riêng khỏi KPI thật.
- Online nghiệm thu sau này: Guest và Customer cùng truy vấn trả kết quả hợp lệ, filter/sort hoạt động, fallback khi model down, không tràn UI, không ghi dữ liệu khách, catalog version khớp. Chưa triển khai hoặc kiểm thử online ở PHA A.
