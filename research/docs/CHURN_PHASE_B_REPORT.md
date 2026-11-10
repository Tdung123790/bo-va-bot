# Churn Phase B — 10/11/2026

## Chênh lệch trước sửa

- Manager Dashboard chỉ có KPI vận hành; chưa có khu vực Churn.
- Chưa có backend phục vụ artifact nghiên cứu theo quyền Admin. Browser guard không đủ để bảo vệ asset.
- Notebook chọn tám cột từ CSV nhưng không định nghĩa công thức trích xuất chúng từ đơn hàng thật.

## Artifact và nguồn

- Nguồn owner bàn giao: `research/input/ml_handoff/Bo_Bot_Churn.ipynb` và `Bo_Bot_Churn_Ketqua-20261109T221831Z-1-001.zip`. ZIP đọc được, đủ sáu file, `testzip()` không báo lỗi.
- `churn_model.joblib`: 211.810 byte; SHA-256 `49cd3c7e2ae75d330d547d25b2a13c03e353f26906c54ce88d9e43bc493b90d2`. SHA ghi dấu file đã nhận, không phải chữ ký xác thực nguồn.
- Notebook ghi model `HistGradientBoostingClassifier`, `features` theo thứ tự: `tenure_days`, `recency_days`, `frequency_orders`, `orders_last_90d`, `orders_prev_90d`, `trend_90d`, `monetary_total`, `avg_order_value`; `threshold=0.5`; `as_of_date=2026-07-01`. Các tên model, khóa metadata, tám feature và ngày mốc cũng có trong byte artifact; thứ tự và giá trị metadata chưa xác nhận bằng load model thành công. Notebook dự đoán 62 ngày tiếp theo nhưng giữ tên nhãn `churn_60d` từ dữ liệu. Inference cần Python, NumPy, scikit-learn, joblib; notebook không khóa phiên bản gói.
- Metrics từ JSON gốc: ROC-AUC `0.8883606734540411`, Accuracy `0.8244705882352941`, Precision `0.6730434782608695`, Recall `0.6765734265734266`, F1 `0.6748038360941587`, PR-AUC `0.7251596039530802`.
- CSV tổng có 8.500 dòng và 8.500 ID duy nhất, snapshot đồng nhất `2026-07-01`, xác suất hữu hạn trong `[0,1]`; LOW `5.417`, MEDIUM `1.589`, HIGH `1.494`, tổng đúng 8.500. Biên: LOW ≤0,30; MEDIUM >0,30 đến 0,65; HIGH >0,65. CSV test có 2.125 dòng. Hai PNG hợp lệ, kích thước 2531×697 và 1424×617.
- Phân bố 8.500 là dự đoán minh họa trên cả train và test; sáu metrics đánh giá lấy từ tập test. Không nhập ID hoặc dự đoán synthetic vào Supabase vận hành.

## Tích hợp và mức độ

- **Level 1 — Code tích hợp, browser mock PASS; runtime Supabase thật NOT_TESTED.** Dashboard tải metrics, phân bố và hai ảnh qua Edge Function mới. Function kiểm tra Auth và profile Admin trước khi đọc file. Asset nằm ngoài `site/`. UI dùng layout Dashboard hiện hữu và có disclaimer rõ ràng.
- **Level 2 — BLOCKED.** Thử `joblib.load` trong tiến trình `python -I` với gói local scikit-learn 1.6.1, NumPy 1.26.4, joblib 1.4.0 thất bại: `ValueError: <class 'numpy.random._pcg64.PCG64'> is not a known BitGenerator module.` Không gọi `predict_proba`, `fit` hoặc `partial_fit`; chưa biết chính xác phiên bản môi trường đã xuất artifact.
- **Level 3 — NOT_STARTED.** Chưa có định nghĩa chuẩn cho tám features từ giao dịch thật, kiểm tra chất lượng cohort hoặc backend inference Python phù hợp. Không gắn risk cho khách thật.

## Kiểm thử và giới hạn

- PASS: ZIP/JSON/CSV/PNG, tổng phân bố, cú pháp JS, mock Edge Function (Guest/Customer/Staff bị 403 trước khi đọc asset; Admin nhận JSON và PNG), Chrome mock 1440×900, 768×1024, 390×844, 360×800: đủ metrics/ảnh, không lỗi JS và không tràn trang. Bộ lọc Dashboard mock và ẩn trang khi logout PASS. Customer/Staff/Guest không mở nội dung Dashboard hoặc gọi Churn trong browser mock. CSS chart mobile cuộn ngang có kiểm tra 390/360.
- NOT_TESTED: quyền với tài khoản Supabase thật, Edge Function chạy trên Supabase LOCAL/Cloud, network lỗi trong browser thật, so sánh screenshot Wix vì không có ảnh Dashboard tham chiếu, suy luận model, feature thiếu/sai, chất lượng trên khách thật. Supabase CLI hiện bị chặn khi ghi telemetry vào thư mục ngoài workspace; endpoint LOCAL hiện trả 404 vì function mới chưa được serve. Không ghi database, không deploy.
- Verdict: **CHURN PHASE B PARTIAL**. Bước tiếp theo: lấy môi trường/versions Python đã xuất artifact hoặc môi trường tương thích được nhóm xác nhận; chạy inference kiểm thử trên input có công thức feature đã được xác nhận. Sau đó serve function LOCAL và kiểm thử Admin/Customer/Staff/Guest với session thật trước khi tuyên bố Level 1 runtime hay bảo mật Admin PASS.

**Cập nhật tiếp nối 10/11/2026:** lỗi NumPy đã được giải quyết trong venv cô lập, Level 2 đạt PASS. Edge Function đã serve trên LOCAL nhưng kiểm thử Admin bằng session thật chưa hoàn tất. Xem `research/docs/ML_CONTINUATION_REPORT.md` để biết trạng thái hiện hành; các dòng trên giữ lại kết quả lịch sử của lượt Phase B.
