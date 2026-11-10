# Manifest production — hướng dẫn duyệt và preview

`site/data/products.json` và `categories.json` giữ inventory Wix 65 sản phẩm/7 danh mục. Bảng duyệt `catalog-approval.json` có 63 sản phẩm đích/8 danh mục; `excludedSourceProducts` giữ nguyên hai record thiếu tên để truy vết, không bán. Danh mục `FINAL_V2_CUSTOM_CAKE` là ID mới có namespace riêng cho “Bánh tùy chỉnh”, không thay ID Wix. `customization-approval.json` giữ 16 option. Các file hiện **chưa phải phê duyệt**. Script `node scripts/prepare-production-manifests.mjs` chỉ tạo file còn thiếu; `--reconcile-final-v2` xem trước và thêm `--apply` mới cập nhật manifest cũ sau kiểm tra, giữ nguyên các trường approval đã có.

| Cột trong bảng duyệt `catalog-approval.json` | Chủ dự án cần điền/xác nhận |
| --- | --- |
| `sourceId`, `name`, `categorySourceId` | ID Wix giữ nguyên; tên và danh mục FINAL, ghi bằng chứng nếu khác nguồn. |
| `sourcePriceVnd`, `approvedPriceVnd`, `approvedOpeningStock` | Giá nguồn chỉ tham khảo; giá và tồn production phải được duyệt riêng. |
| `imageUrl`, `imageReachability`, `imageRightsEvidence` | URL, kết quả kiểm tra ảnh và quyền dùng công khai. |
| `saleStatus`, `reviewState`, `reviewNotes`, `validation` | Trạng thái bán, trạng thái duyệt và vấn đề còn thiếu. |
| `approvalReference`, `approvedBy`, `approvedAt` | Bằng chứng, người duyệt và thời điểm duyệt từng record. |

1. Chủ dự án đối chiếu từng record với nguồn đáng tin cậy. `sourcePriceVnd` và tên/ảnh từ JSON Wix chỉ để tham khảo. Sửa `name`, `categorySourceId`, `imageUrl` khi có bằng chứng; ghi `verifiedNameEvidence`, `verifiedCategoryEvidence`, `verifiedImageEvidence` nếu thay nguồn. Không đổi `sourceId`.
2. Điền `approvedPriceVnd` và `approvedOpeningStock` bằng giá/tồn production được duyệt; với bánh custom, giá tính từ option và cần đủ 16 option được duyệt. `imageReachability: "OK"` chỉ sau kiểm tra URL; `imageRightsEvidence` phải ghi nguồn/quyền sử dụng. Kết quả HEAD trong `image-probe-results.json` là phép đo tại một thời điểm, không thay phê duyệt.
3. Trạng thái: `MISSING` thiếu nguồn, `INVALID` dữ liệu không hợp lệ, `PENDING_APPROVAL` đang chờ, `APPROVED` có chữ ký/bằng chứng, `ACTIVE` là kết quả đối soát DB sau import. Chỉ đặt `APPROVED` kèm `approvalReference`, `approvedBy`, `approvedAt` ở **record và manifest**, `saleStatus: "active"`. Không tự sửa trạng thái chỉ vì dữ liệu có sẵn. Với custom cake, `compatibilityPolicy: "ALL_COMBINATIONS_APPROVED"` chỉ khi chủ dự án xác nhận mọi tổ hợp size/flavor/cream/font/color đều hợp lệ; nếu không phải vậy, giữ custom product chưa bán và thiết kế rule backend riêng.
4. Kiểm tra không ghi DB: `node scripts/import-approved-catalog-local.mjs --validate` hoặc `--dry-run`, rồi `node scripts/validate-production-store.mjs`. Preview diff trên Supabase LOCAL: đặt `BOBOT_LOCAL_DB_PASSWORD` trong biến môi trường process rồi chạy `node scripts/import-approved-catalog-local.mjs`; lưu `previewHash` và xem giá/ảnh/category/stock trước–sau. Chỉ dùng `--apply --confirm-preview <hash> --operator <người thực hiện>` trên LOCAL khi manifest có approval thật và người có quyền đã kiểm tra; script ghi audit, transaction, đối soát và không ghi đè stock đã biến động. Hash cũ bị từ chối nếu DB/manifest thay đổi.
5. Đường `scripts/import-catalog-local.mjs --test-fixture --apply` chỉ cho fixture TEST. Đường `--manifest --apply` cũ đã khóa vì giả định giá Wix và approval quá rộng. `scripts/import-approved-catalog-local.mjs --test-fixture` chỉ nhận manifest `staging` trong kiểm thử tổng hợp, không nhận manifest `production`.
6. `node scripts/validate-production-release-local.mjs` là preflight read-only trên LOCAL. Trạng thái BLOCKED là đúng cho đến khi đủ dữ liệu, payment reconciliation, hai project/domain tách biệt và chủ dự án phê duyệt release. Các script này không kết nối Cloud.

Không paste password, service-role key, Auth token hoặc thông tin khách hàng vào manifest/repository. Dữ liệu người duyệt và bằng chứng cần phù hợp quy trình lưu tài liệu nội bộ của chủ dự án.
