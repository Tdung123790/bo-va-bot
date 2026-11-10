# Bơ & Bột — Product Context

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Guest:** Xem thông tin thương hiệu, menu và sản phẩm công khai.
- **Customer:** Đăng ký, đặt bánh, quản lý đơn và quyền lợi thành viên.
- **Staff:** Bán hàng tại quầy, xử lý đơn và giao nhận.
- **Manager/Admin:** Quản lý vận hành, dữ liệu kinh doanh và dashboard.


## Product Purpose

Bơ & Bột là **đồ án môn Phát triển Web Kinh doanh**, mô phỏng **Bakery Omnichannel Business Management & E-commerce System**: kinh doanh offline tại cửa hàng và online qua website. Bản frontend hiện tại là quá trình chuyển giao diện Wix sang HTML5, CSS3 và JavaScript thuần với độ trung thực cao, không redesign.

## Capabilities

1. **Customer & Brand:** giới thiệu thương hiệu, menu, tìm kiếm, chi tiết sản phẩm, cake customizer, wishlist, giỏ hàng, checkout, thanh toán mô phỏng, theo dõi đơn, đánh giá, khuyến mãi và tích điểm.
2. **Store Operations:** mô phỏng POS tại quầy, quản lý đơn offline/online, trạng thái thanh toán, sản phẩm và tồn kho cơ bản.
3. **Management:** Manager Dashboard quản lý sản phẩm, danh mục, đơn hàng, khách hàng, promotion, review và loyalty; xem doanh thu, đơn hàng, sản phẩm bán chạy, hiệu quả từng kênh, CRM cơ bản và analytics.

**Data & ML:** Customer Churn Prediction và Product Recommendation là hai hướng chính; Sales Forecasting là phần mở rộng. Phương pháp, chỉ số đánh giá, dữ liệu huấn luyện và phạm vi triển khai: **Chưa xác nhận**.

Manager Dashboard và Analytics thuộc phạm vi quản trị đã được đề cập trong tài liệu. POS offline và việc phân biệt doanh thu online/offline là yêu cầu bổ sung trực tiếp. Chưa được phép tự triển khai hoặc thay đổi schema khi chưa có chỉ định. Mức độ hoàn thiện của từng nhóm chức năng cần được đối chiếu với code và phase tương ứng; danh sách trên mô tả phạm vi sản phẩm, không khẳng định mọi chức năng đã hoạt động.

## Source Priority

- **Nghiệp vụ và CSDL:** tài liệu **Bơ Bột CSDL** là nguồn cao nhất. Vị trí tài liệu trong workspace: `reference/docs/BơbộtCSDL.docx`.
- **Báo cáo HK7:** tài liệu tham khảo bổ sung; không mặc định mọi đề xuất trong báo cáo đều bắt buộc. Vị trí tài liệu: `reference/docs/[HK7]BơBột.docx` .
- **Giao diện:** source Wix gốc và screenshot desktop là chuẩn. Giữ bố cục, nội dung, hình ảnh, typography, responsive rules và tương tác gốc; mobile suy từ source khi không có screenshot.
- **Triển khai hiện tại:** contract và code trong site là bằng chứng về API, dữ liệu và trạng thái đã làm, nhưng không thay thế các nguồn nghiệp vụ hoặc giao diện ưu tiên ở trên.

## Stack and Operating Context

- Frontend đích: HTML5, CSS3, vanilla JavaScript ES Modules; nội dung cho người dùng bằng tiếng Việt. Supabase là **backend mục tiêu**. LocalStorage trong bản hiện tại chỉ phục vụ demo, không phải nơi lưu trữ kinh doanh hay xác thực an toàn.
- Các luồng offline và online cần cùng ngữ cảnh quản lý đơn, thanh toán, sản phẩm và tồn kho. Cách đồng bộ, phân quyền và schema Supabase cụ thể: **Chưa xác nhận**; phải theo tài liệu CSDL và yêu cầu được giao.
- Giá hiển thị bằng VND; website hiện dùng locale vi-VN và múi giờ Asia/Ho_Chi_Minh.

## Brand Commitments and Constraints

- Giữ nhận diện và giao diện Wix gốc; không sáng tạo design mới. Nội dung hiện có trong source là bằng chứng để chuyển giao diện, không tự động xác thực các tuyên bố kinh doanh ngoài đời.
- Không tự ý thêm bảng CSDL, đổi kiến trúc, thay lịch phase, triển khai thêm tính năng hoặc deploy khi chưa được yêu cầu/phê duyệt theo quy định dự án.
- Không giả lập số liệu kinh doanh rồi trình bày như dữ liệu thật. Thanh toán và các luồng demo phải được ghi rõ là mô phỏng.
- Nếu thiếu thông tin, ghi **“Chưa xác nhận”**. Không công khai dữ liệu nhạy cảm của khách hàng.

## Evidence on Hand

Source giao diện nằm trong `reference/wix-source/repomix-output.xml`, ảnh tham chiếu trong `reference/wix-screenshots/`, contract trong `reference/contracts/CONTRACT.md`, bản chuyển đổi trong `site/`. Source Wix có thông tin năm thành lập mâu thuẫn (2024 và 2020); năm chính thức: 2020. Font nhị phân gốc chưa có trong bản chuyển đổi.

## Product Principles

1. Tách bạch **phạm vi mục tiêu**, **tính năng đã triển khai** và **mô phỏng demo**.
2. Theo tài liệu Bơ Bột CSDL cho nghiệp vụ/dữ liệu; theo Wix cho giao diện.
3. Chỉ triển khai phần được yêu cầu, giữ contract và kiểm tra giao diện cùng hành vi ở các kích thước dự án quy định.
4. Dashboard phải có các KPI dựa trên dữ liệu đơn hàng/thanh toán hợp lệ, tránh tính trùng doanh thu giữa online và offline. Khi sử dụng dữ liệu demo, phải ghi nhãn rõ ràng. Dữ liệu tổng hợp ưu tiên lấy từ daily_analytics theo tài liệu CSDL.