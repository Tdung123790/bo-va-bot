# Bơ & Bột — kiểm chứng dataset synthetic

Ngày chạy: 2026-11-09T11:03:33.191Z

Nguồn: `research/input/Bo_Bot_data.zip`. Chỉ nghiên cứu, không import vào Supabase hoặc website công khai. Không kiểm PostgreSQL LOCAL.

- ZIP 38 mục; 34 CSV. PK trùng/rỗng: 0; FK mồ côi trong các quan hệ kiểm tra: 0.
- Catalog: 62/62 product và 186/186 variant khớp mapping, tên và giá sau quy đổi ×1.000 VND. Site có 65 hàng, 3 hàng ngoài crosswalk (gồm bánh tùy chỉnh và hai hàng thiếu thông tin). Mapping chưa xác minh với Supabase LIVE.
- Custom options: CSV 13, frontend 16; không thay customizer.
- Refund COMPLETED 567; 567 gắn đơn CANCELLED/PENDING, thiếu paid source. Không dùng làm chứng từ.
- 12360 đơn có tỷ lệ cũ 1.000 VND/điểm, sai FINAL 10 VND/điểm; không import/sửa lịch sử.
- 25303 review cùng nội dung mô phỏng; holdout có 0 product ID ngoài catalog. 18282 đơn POS mang pickup cũ.
- DATASET_SUMMARY.json có 8 tổng lệch CSV bản điều chỉnh: auth_users 8514→8505; user_profile 8514→8505; user_role 8514→8505; category 8→7; product 80→62; product_variant 160→186; customization_option 16→13; promotion 20→5.
- File tên chính xác `BoBot_ML_CATALOG_MAPPING_VERIFIED.json`: không có. Đã dùng `ML_CATALOG_MAPPING_VERIFIED.json` do nội dung nêu cùng ZIP, snapshot và có 62/186 mapping đối chiếu được.

Chi tiết số dòng không chứa PII nằm ở `research/output/dataset-audit.synthetic.json`.
