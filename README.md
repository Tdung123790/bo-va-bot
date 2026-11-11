# Bơ & Bột — Website kinh doanh tiệm bánh đa kênh

**Đồ án Phát triển Web Kinh doanh** · Bản bàn giao mã nguồn ngày **11/11/2026**

**Website demo:** https://bo-va-bot.pages.dev

Bơ & Bột là hệ thống hỗ trợ kinh doanh bánh tại cửa hàng và trực tuyến. Dự án có giao diện mua hàng cho khách, màn hình xử lý đơn/POS cho nhân viên và khu vực quản trị dành cho người quản lý. Mã nguồn bao gồm frontend, cơ sở dữ liệu, các hàm backend, phần nghiên cứu ML và bộ kiểm thử.

> **Phân biệt trạng thái triển khai:** Website frontend đã được đưa lên Cloudflare Pages và cấu hình kết nối Supabase Cloud. Tuy nhiên, việc website truy cập công khai **không đồng nghĩa toàn bộ chức năng đã nghiệm thu production**. Theo bộ mã nguồn/bằng chứng ngày 11/11/2026, các migration hủy đơn và hoàn tiền mới đã kiểm thử trên **Supabase Local**; trạng thái áp dụng trên Cloud chưa được xác nhận. Các khoản thanh toán demo và VNPAY Sandbox **không phải thanh toán thương mại thật**.

## 1. Công nghệ và kiến trúc

| Tầng | Công nghệ | Vai trò |
| --- | --- | --- |
| Frontend | HTML5, CSS3, JavaScript ES Modules thuần | Giao diện đa trang, responsive và các luồng tương tác |
| Dữ liệu và xác thực | Supabase PostgreSQL, Supabase Auth | Lưu dữ liệu giao dịch, tài khoản, vai trò và lịch sử |
| Xử lý nghiệp vụ | PostgreSQL RPC, trigger, RLS | Báo giá, đặt hàng, tồn kho, khuyến mãi, điểm thưởng, phân quyền |
| Tích hợp backend | Supabase Edge Functions | VNPAY, xác minh giao hàng, tìm kiếm và gợi ý sản phẩm, nghiên cứu churn |
| Triển khai frontend | Cloudflare Pages | Phục vụ website tĩnh qua HTTPS |
| Kiểm thử | Node.js, PostgreSQL SQL tests, Playwright | Kiểm thử cấu trúc, nghiệp vụ, bảo mật và giao diện |
| Nghiên cứu ML | Các script trong `research/` | Xây dựng và đánh giá các mô hình phục vụ tính năng ML |

Frontend không cần React, TypeScript hay bước biên dịch framework. Các quy tắc tài chính và phân quyền quan trọng được kiểm tra ở backend, không dựa riêng vào dữ liệu do trình duyệt gửi lên.

## 2. Các chức năng trong mã nguồn

| Nhóm | Chức năng |
| --- | --- |
| Khách truy cập | Trang chủ, thực đơn, lọc/tìm sản phẩm, chi tiết bánh, giỏ hàng, khuyến mãi, đánh giá |
| Khách hàng | Đăng ký/đăng nhập, wishlist, đặt bánh, tùy chỉnh bánh, theo dõi đơn, lịch sử và số dư Loyalty |
| Nhân viên | POS tại quầy, quản lý đơn, xác nhận nghiệp vụ thanh toán demo, xử lý yêu cầu hủy và đề nghị hoàn tiền |
| Quản trị viên | Quản lý sản phẩm/khuyến mãi/đánh giá, xử lý phê duyệt, dashboard doanh thu Online/Offline và thông tin vận hành |
| Đơn hàng | Báo giá từ backend, kiểm tra tồn kho, trạng thái đơn, lịch sử, cơ chế chống xử lý trùng |
| Loyalty | Tích/đổi/hoàn điểm, thu hồi điểm khi refund, ghi nhận và cấn trừ `point_debt` |
| AI/ML | Tìm kiếm xếp hạng theo truy vấn, sản phẩm liên quan; kết quả nghiên cứu churn chỉ dành cho Admin |
| Thanh toán | Luồng mô phỏng COD/chuyển khoản/tiền mặt theo phạm vi hỗ trợ và tích hợp VNPAY Sandbox |

**Loyalty:** Tích **1 điểm/1.000 VND** tiền hàng hợp lệ, đổi **1 điểm = 10 VND**. Không tích trên phí vận chuyển; điểm chỉ được cộng khi đơn đã `completed` **và** `paid`, sau khi trừ khuyến mãi và phần giảm do đổi điểm. Khi hoàn tiền, nếu số điểm khả dụng không đủ để thu hồi, phần thiếu được ghi vào `point_debt`; các lượt tích sau cấn nợ trước khi tăng điểm khả dụng.

**Lưu ý phạm vi ML:** Tìm kiếm dựa trên mô hình xếp hạng truy vấn/sản phẩm, không phụ thuộc vào lịch sử mua của khách. Churn Dashboard hiển thị nghiên cứu trên **8.500 bản ghi khách hàng tổng hợp (synthetic)**, không phải dự đoán đã được kiểm chứng trên dữ liệu khách hàng vận hành thật. Khả năng hoạt động end-to-end của ML Search trên website công khai vẫn cần kiểm tra/sửa CORS theo test case hiện có.

## 3. Cấu trúc thư mục

```text
bo-va-bot/
├── site/                         # Website HTML/CSS/JS và tài nguyên public
│   ├── assets/
│   ├── css/
│   ├── data/
│   ├── js/
│   │   ├── components/
│   │   ├── core/
│   │   ├── pages/
│   │   └── services/
│   ├── partials/
│   ├── backend-config.json
│   └── index.html
├── supabase/
│   ├── migrations/             # Schema, RLS, RPC và cập nhật nghiệp vụ
│   ├── functions/              # Edge Functions và asset runtime
│   ├── sql-tests/              # Kiểm thử PostgreSQL
│   └── config.toml
├── scripts/                     # Công cụ cấu hình, kiểm tra và E2E
├── research/
│   ├── docs/
│   └── scripts/
├── reference/                   # Thiết kế, contract và manifest phê duyệt
├── artifacts/refund-e2e/        # Ma trận và bằng chứng kiểm thử refund/Loyalty
├── staging/                     # Tài nguyên cho môi trường staging
├── package.json
└── README.md
```

Các thư mục dữ liệu đầu vào và mô hình huấn luyện được loại khỏi Git theo `.gitignore` có thể **không nằm trong gói mã nguồn**. Các artifact runtime cần thiết cho Edge Functions đã được đặt trong `supabase/functions/`.

## 4. Xem demo và quyền truy cập

- **Website công khai:** https://bo-va-bot.pages.dev
- **Frontend tại máy:** `http://127.0.0.1:4173/` sau khi chạy web server.
- **Một số trang chính:** `/menu.html`, `/customize.html`, `/profile.html`, `/staff-orders.html`, `/pos.html`, `/admin-orders.html`, `/dashboard.html`.
- Những trang Customer/Staff/Admin yêu cầu đăng nhập và role tương ứng. Nếu giảng viên cần kiểm tra, cung cấp **tài khoản demo qua kênh riêng**, không ghi thông tin đăng nhập trong repository hoặc báo cáo công khai.

### Chạy toàn bộ hệ thống trên máy Windows

**Yêu cầu:** Node.js/npm, Docker Desktop và môi trường hỗ trợ Supabase CLI. Chạy các lệnh sau bằng PowerShell tại thư mục gốc của repo:

```powershell
cd D:\ML\bo-va-bot
npm.cmd install
npx.cmd supabase start
npm.cmd run db:configure:local
node scripts/serve-site.cjs
```

Mở `http://127.0.0.1:4173/`. Trên **máy mới**, thay đường dẫn `D:\ML\bo-va-bot` bằng đường dẫn thực tế sau khi giải nén/clone project. Nếu repository có `package-lock.json` hợp lệ, có thể dùng `npm.cmd ci` thay cho `npm.cmd install` để cài đúng phiên bản khóa.

Lệnh `db:configure:local` tạo `site/backend-config.local.json` cho API Supabase Local (`http://127.0.0.1:54321`). File này được Git ignore. PostgreSQL Local dùng cổng `54322`, Supabase Studio mặc định dùng `54323` theo `supabase/config.toml`.

**Cực kỳ quan trọng:** `site/backend-config.json` trong snapshot nộp hiện trỏ đến **Supabase Cloud**. Khi mở website bằng localhost mà **chưa** tạo `backend-config.local.json`, frontend có thể kết nối vào Cloud. Luôn chạy `npm.cmd run db:configure:local` và xác minh endpoint trước khi tạo đơn, sửa dữ liệu hoặc chạy test. Không chạy `supabase db reset`, `db push`, import hoặc cleanup trên Cloud chỉ để chấm demo.

Nếu cần chạy **Edge Functions trên Local**, mở một terminal khác và cấu hình biến môi trường riêng (không commit file bí mật):

```powershell
npx.cmd supabase functions serve --env-file supabase/.env.local
```

File `supabase/.env.local` không nằm trong bản bàn giao. Các tính năng phụ thuộc vào provider bên ngoài (VNPAY, dịch vụ xác minh địa chỉ, AI) có thể cần credentials môi trường test được cấp riêng; thiếu cấu hình thì không được coi là lỗi của HTML/CSS/JS thuần. Không đưa service-role key hoặc secret của provider vào `site/`.

## 5. Kiểm thử và bằng chứng

Các lệnh kiểm tra **tĩnh** có thể chạy sau khi cài dependency:

```powershell
npm.cmd run db:check
node scripts/test-cancellation-refund-contract.mjs
```

Để chạy kiểm thử **PostgreSQL/RPC thật** cho hủy đơn, hoàn tiền và nợ điểm, cần Supabase Local đã có migration phù hợp, mật khẩu database LOCAL trong biến môi trường `BOBOT_LOCAL_DB_PASSWORD` và môi trường test được phép tạo fixture:

```powershell
node scripts/test-cancellation-refund-e2e.mjs
```

Hai SQL test trong runner là `010_cancellation_flow.sql` và `009_refund_point_debt.sql`, có giao dịch `BEGIN`/`ROLLBACK`. Tránh dùng database Local chứa dữ liệu quan trọng nếu chưa kiểm tra toàn bộ tác động test. Bộ hồi quy SQL mặc định vẫn có các bài legacy chưa tương thích với RPC đã bị hardening; không dùng kết quả chạy mặc định làm bằng chứng mọi test đều PASS.

**Kết quả được ghi nhận ngày 11/11/2026 (Supabase Local):**

| Nhóm | Bằng chứng / trạng thái |
| --- | --- |
| Hủy đơn, refund, Loyalty, point debt | **43/48** trường hợp nghiệp vụ PASS; **5 BLOCKED**, 0 FAIL theo ma trận tại thời điểm lập báo cáo |
| SQL integration mới | Hai bài `009_refund_point_debt.sql` và `010_cancellation_flow.sql` PASS trên PostgreSQL/RPC thật, rollback sau test |
| Regression SQL chạy chọn lọc | Các bài `003`, `004`, `005`, `006`, `008` PASS |
| UI hủy/refund mới | Đã kiểm tra code và hợp đồng RPC; **chưa có bằng chứng browser E2E hoàn chỉnh** trong báo cáo này |
| Cloud | Trạng thái migration hủy/refund mới và nghiệm thu end-to-end trên Cloud **chưa được xác nhận** |

Trong fixture kiểm thử Loyalty, số dư đã được đối chiếu theo chuỗi: **350/0 → 50/0 → 0/300 → 0/180 → 70/0** (lần lượt là điểm khả dụng/nợ điểm). `daily_analytics.net_product_revenue` của đơn test giảm từ **350.000 VND xuống 0 VND** sau full refund hợp lệ. Đây là **dữ liệu test Local**, không phải doanh thu trên website công khai.

Xem tài liệu và bằng chứng chi tiết trong:

- [`artifacts/refund-e2e/EXECUTION_REPORT.md`](artifacts/refund-e2e/EXECUTION_REPORT.md)
- [`artifacts/refund-e2e/TEST_MATRIX.md`](artifacts/refund-e2e/TEST_MATRIX.md)
- [`artifacts/refund-e2e/BEFORE_AFTER_LOYALTY.md`](artifacts/refund-e2e/BEFORE_AFTER_LOYALTY.md)
- [`artifacts/refund-e2e/TC052_TC053_TC054_TC055_TC066_TC067_TC068_TC079.md`](artifacts/refund-e2e/TC052_TC053_TC054_TC055_TC066_TC067_TC068_TC079.md)

## 6. Thanh toán, triển khai và giới hạn

- **VNPAY Sandbox:** Hệ thống có Edge Function xử lý phiên thanh toán, Return/IPN và đối soát theo chữ ký. Nhóm đã ghi nhận một giao dịch **Sandbox `paid`** trong quá trình thử nghiệm; điều này **không chứng minh** thanh toán production hoạt động hoặc API refund VNPAY đã được nghiệm thu. Hoàn tiền demo Staff → Admin → Staff là nghiệp vụ mô phỏng, không tự chuyển tiền qua VNPAY.
- **Refund:** Các migration `20261111000200_cancellation_refund_approval.sql` và `20261111000300_refund_rejection.sql` bổ sung luồng hủy và từ chối refund; theo evidence hiện có đã áp dụng trên Local. Chỉ triển khai lên Cloud sau khi kiểm tra migration ledger, backup và quyền truy cập.
- **Refund một phần và đồng thời:** Chưa nghiệm thu đầy đủ, giữ trạng thái BLOCKED cho các trường hợp cần quy tắc nghiệp vụ hoặc test cạnh tranh nhiều kết nối.
- **AI Search:** Endpoint/model có trong source nhưng bài test tìm kiếm ML cho người dùng trên site công khai còn vấn đề CORS cần khắc phục và kiểm thử lại.
- **Dữ liệu nghiên cứu:** Churn sử dụng bộ dữ liệu synthetic; không trình bày thành dự đoán thực tế của khách hàng Bơ & Bột.
- **Kinh doanh thật:** Bản demo có một số luồng thanh toán/giờ nhận hàng/dữ liệu thử nghiệm. Chưa tuyên bố website đã sẵn sàng nhận đơn và thanh toán thương mại thực tế.

Quy trình triển khai mục tiêu: **GitHub private → Cloudflare Pages (publish thư mục `site/`)**, kết nối Supabase Cloud Auth/PostgreSQL/RPC/Edge Functions. Các khóa bí mật cần cấu hình tại môi trường backend; frontend chỉ được dùng publishable key công khai. Kiểm soát Auth redirect, CORS, RLS, backup, version migration và smoke test trước khi công bố từng chức năng.

## 7. Lưu ý khi nộp mã nguồn

Gói nộp nên giữ nguyên `site/`, `supabase/`, `scripts/`, `research/` phần có thể chia sẻ, `reference/` phần cần thiết, `artifacts/refund-e2e/`, `package.json` và README này. **Không chỉ nộp `site/` hoặc file Repomix XML**, vì như vậy giảng viên không thể xem logic dữ liệu và backend.

**Không nộp:** `.env`, `supabase/.env.local`, mật khẩu PostgreSQL, service-role key, VNPAY HashSecret, token đăng nhập, dữ liệu khách hàng thật, `node_modules/`, `.git/`, cache, bản dump database hoặc dữ liệu nghiên cứu riêng tư. Các dữ liệu nộp kèm phải được kiểm tra quyền sử dụng và ẩn danh khi cần. Các tài khoản để chấm bài nên cấp riêng, với quyền tối thiểu.

## 8. Tài liệu tham khảo trong repository

- [Yêu cầu sản phẩm](PRODUCT.md)
- [Các quyết định nghiệp vụ được phê duyệt](PRODUCTION_DECISIONS_APPROVED.md)
- [Tài liệu kiến trúc Supabase](reference/architecture/SUPABASE_SCHEMA_TARGET.md)
- [Hướng dẫn triển khai Cloud](CLOUD_DEPLOYMENT_RUNBOOK.md)
- [Báo cáo E2E chức năng](FUNCTIONAL_E2E_ACCEPTANCE_REPORT.md)
- [Báo cáo VNPAY](VNPAY_INTEGRATION_REPORT.md)
- [Báo cáo nghiên cứu ML](research/docs/ML_CONTINUATION_REPORT.md)
- [Báo cáo kiểm thử refund/Loyalty](artifacts/refund-e2e/EXECUTION_REPORT.md)

> **Ghi chú:** Một số tài liệu Sprint trong repository được viết trước khi website công khai xuất hiện; trạng thái triển khai cuối cùng phải được đối chiếu với phiên bản Cloud thực tế và bộ test mới nhất. README này mô tả mã nguồn trong snapshot ngày 11/11/2026, không thay thế biên bản nghiệm thu production.
