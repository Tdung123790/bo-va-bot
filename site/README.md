> **Bàn giao migration:** Các ghi chú phase bên dưới là lịch sử triển khai. Hướng dẫn chạy và phạm vi hiện tại nằm trong `../README.md` của gói bàn giao. Chạy từ thư mục gốc bằng `node scripts/serve-site.cjs`, sau đó mở `http://127.0.0.1:4173/`.

# Bơ & Bột — Phase 1 foundation

This package implements only the user-defined Phase 1 (CSS foundation, shared header/footer, core JS, sanitized static JSON adapter). Phase ownership and sequencing remain with the user.

## Run
Use any static HTTP server (not `file://`). Example using Python installed on your development machine: `python -m http.server 8000` from `bobot/`, open `http://localhost:8000/` after later phases supply `index.html`.

## Data/privacy
Public `data/` contains products, promotions, variants and reviews (without customer identity), and synthetic users; historical customer profiles, addresses, phone numbers, payment and orders are deliberately NOT published as static assets. Import those later into a protected Supabase database after anonymization. Product images use HTTPS URLs, converted from wix:image:// when possible; remote availability is not guaranteed.

## Fonts
The entire original `@font-face` stylesheet has been copied with URL paths changed from `/public/fonts/` to `../../assets/fonts/`, but the archive did not include binary font files. Supply those assets at the matching paths from your original project. No font binaries generated or redistributed.

## Authentication
Header and guard have temporary `bobotAuthUser`/store integration for Phase 1. Do not treat browser state as authentication or authorization; Supabase Auth and RLS are deferred until the user assigns that phase.

## Limitations
The original CakeCustomizerPage.tsx is missing; font/color options are flagged `_sample:true`. The original checkout component is absent; shipping >10 km is not decided. The CSV 'User' and historical orders are intentionally excluded from publicly deployed JSON.

## Phase 4: Demo authentication ONLY — NOT SAFE FOR PRODUCTION
This phase intentionally uses SHA-256 through Web Crypto and stores password hashes, users and sessions in localStorage. **SHA-256 without a password-specific KDF/salt is NOT safe for real passwords.** All browser storage and role checks are user-modifiable, so this provides no actual authentication, privacy or admin authorization. Never use real credentials, real customer information, or production payments. For a public deployment replace demo auth with Supabase Auth, database RLS, and server-side transactional order updates. Use HTTPS or localhost for Web Crypto. Do NOT publish sensitive Wix CSV exports.

To make a local admin demo account, register a dedicated throwaway email then manually change its `role` to `admin` in `bobot:v1:users` via browser developer tools on that test browser; this is not a secure authorization mechanism.


## PHASE 5: trang nội dung / host

Các đường dẫn là đường dẫn tương đối, chạy với Live Server, GitHub Pages (bao gồm site trong subpath repo) hoặc Netlify. Trang 404.html dùng làm trang lỗi trên GitHub Pages / Netlify; Live Server có thể trả về 404 tùy cấu hình extension nên không bảo đảm hiển thị file 404.html nếu không cấu hình. Không chuyển hướng tất cả URL lỗi về index.html.

Contact và customCake vẫn lưu vào localStorage, không có backend; biểu mẫu liên hệ không gửi email. Xác thực giả lập SHA-256 vẫn không an toàn cho môi trường thật; không deploy với dữ liệu nhạy cảm thật. Supabase kiến trúc dài hạn vẫn chưa tích hợp.
