# Research synthetic — Bơ & Bột

`research/input/` chỉ chứa dữ liệu do chủ dự án bàn giao; `research/output/` và `research/models/` chứa artifact nghiên cứu. Ba thư mục này bị Git ignore. Không chép dữ liệu synthetic sang `site/` hoặc Supabase vận hành.

Chạy với Node.js 20+ từ thư mục gốc:

```text
node research/scripts/audit-dataset.mjs
node research/scripts/train-churn.mjs
```

Đầu vào dự kiến: `research/input/Bo_Bot_data.zip`, `research/input/ML_CATALOG_MAPPING_VERIFIED.json`, `research/input/CHURN_HOLDOUT_SYNTHETIC.json`. Tên `BoBot_ML_CATALOG_MAPPING_VERIFIED.json` trong task không có tại thời điểm kiểm tra; script kiểm tra nội dung alias đang có. Kết quả tổng hợp không chứa ID khách trong `research/output/`; báo cáo tái chạy nằm ở `research/docs/DATASET_VALIDATION_REPORT.md`.

Mô hình Churn trong script là logistic regression baseline cố định seed 42, khác bản HistGradientBoostingClassifier trong holdout do nhóm bàn giao. Cả hai chỉ đo trên synthetic; không gán dự đoán cho Customer thật. Thiết kế search nằm ở `research/docs/ML_SEARCH_DESIGN.md`.
