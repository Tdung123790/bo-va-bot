# CONTRACT — PHASE 1 — BƠ & BỘT

## A. Files created

All generated source files are present in the `bobot/` directory. See `PHASE1_AUDIT.json` for the full per-file list. This phase creates CSS base, header/footer partials and styles, JS core and JSON service adapters, sanitized public data, README and contract.

## B. Exported JavaScript API

- `js/core/config.js`: `getConfig(): Promise<object>`; `clearConfigCache(): void`.
- `js/core/dom.js`: `$(selector, root=document): Element|null`; `$$(selector,root=document): Element[]`; `el(tag,attrs={},children=[]): Element`; `escapeHtml(value=''): string`; `delegate(root,eventName,selector,handler): ()=>void`.
- `js/core/format.js`: `formatVND(amount): string`; `formatDate(value,options?): string`; `formatOrderItem(item): string` hiển thị snapshot tùy chọn bánh trong chi tiết đơn.
- `js/core/storage.js`: `getJSON(key,fallback=null): any`; `setJSON(key,value): boolean`; `removeKey(key): boolean`; aliases `get`, `set`.
- `js/core/store.js`: `createStore(initial={}): {get,set,subscribe}`; singleton `store`.
- `js/core/toast.js`: `toast({title,description,variant,duration}): {dismiss,id}`; `variant` nhận `default`, `success`, `destructive`; alias `showToast`.
- `js/core/partials.js`: `includePartials(root=document): Promise<void>`.
- `js/core/guard.js`: `getCurrentUser(): object|null`; `requireLogin({message,redirect}={}): object|null`; `requireAdmin(): object|null`. These are *temporary browser UI guards*, not secure authorization.
- `js/core/analytics.js`: `trackEvent(eventName,params={}): void`; `setGaUser(contactId): void`; `toGaItem(product,quantity=1): object`; `initAnalytics(): Promise<void>`.
- `js/core/scroll.js`: `scrollToTop(): void`; `initScroll(): void`.
- `js/core/bootstrap.js`: `bootstrap(): Promise<void>`; initializes after DOM ready.
- `js/components/header.js`: `initHeader(): ()=>void`.
- `js/services/jsonService.js`: `loadCollection(filename,options={}): Promise<any>`; `clearCollectionCache(filename?): void`; `paginate(items,pagination={}): PaginatedResult`; `list(filename,includeRefs=[],pagination={}): Promise<PaginatedResult>`; `findById(filename,id): Promise<object|null>`; `queryCollection(filename,filters={},pagination={}): Promise<PaginatedResult>`.
- `js/services/productService.js`, `promotionService.js`, `reviewService.js`: each exports `getAll(includeRefs=[],pagination={})`, `getById(id,includeRefs=[])`, `query(filters={},pagination={})`, plus the corresponding named service object. Read-only JSON adapter, no create/update/delete in Phase 1.

## C. JSON data contract

- `products.json`: `{id, legacyId, name, description, price, image, imageOriginal, categoryId, category, cakeGroup, stockQuantity, status, isBestSeller, isFeatured, isCustomizable, _sample}[]`.
- `categories.json`: `{id, name, slug, description, image, displayOrder, isActive, _sample}[]`.
- `product-variants.json`: `{id, legacyId, productId, name, priceModifier, stockQuantity, status, _sample}[]`.
- `promotions.json`: `{id,title,description,bannerImage,bannerImageOriginal,discountDetails,code,discountPercent,discountValue,minOrderValue,maxDiscount,usageLimit,usagePerCustomer,targetType,startDate,endDate,status,_sample}[]`.
- `reviews.json`: `{id,customerId,productId,orderItemId,rating,text,image,reviewDate,status,_sample}[]`.
- `images.json`: product image metadata and original URL mapping.
- `hcm-locations.json`: `{bakery,districts,shippingTiers,over10KmFeeFromSource,distanceMethod,earthRadiusKm}`.
- `cake-options.json`: `{customProductId,sizes,flavors,creams,fonts,textColors,_note}`; fonts/colors have `_sample:true`.
- `site-config.json`: site locale, currency, time zone, placeholder GA4 ID, empty admin allowlist and public contact links.
- `users.seed.json`: one non-sensitive example user, `_sample:true`.
- `orders.seed.json`, `wishlist-items.json`: empty; private Wix historical orders and customer data were not released as public JSON.
- `loyalty-rewards.json`: imported reward metadata.

All monetary values on product and variant records are stored in VND (including signed variant modifiers). `formatVND` never multiplies by 1000. Image references are remote HTTPS URLs where known. Raw Wix-media references are retained for traceability.

## D. localStorage keys

- `bobot:v1:guestCart`: anonymous cart items in an array.
- `bobot:v1:preferences`: non-sensitive preferences, reserved.
- `bobot:v1:customCakeDraft`: in-progress cake configuration, reserved.
- Do not store passwords, admin roles or payment secrets in localStorage.

## E. Incomplete or blocked

1. The original font binaries are not included in `p1.xml`: `fonts.css` URLs now target `assets/fonts/`, but font binaries need to come from the original project. No proprietary font files were generated.
2. `CakeCustomizerPage.tsx` not supplied: three font names and four text colors are sample configurations, not verified originals.
3. Shipping >10 km has source return value 0; checkout policy remains unresolved pending the original `CheckoutForm.tsx`.
4. No Supabase schema/connection/Auth/RLS implemented: explicitly outside the assigned Phase 1.
5. Full working HTML pages, login page and cart drawer belong to user-controlled later phase definitions.
6. Wix historical users, orders, payments and addresses are not published as static JSON for privacy/security. Import into a protected database requires a controlled and anonymized migration.
7. External image HTTP availability is not guaranteed; verify before deployment.

## F. Compatibility and source notes

- The user controls phase definitions and sequence. No further phase assumptions.
- The package is served by HTTP static hosting, not `file://`.
- Original typography tokens and font-face definitions were extracted from supplied `p1.xml`.
- JSON adapters mimic the Wix paginated `getAll` result and simple `getById` semantics; includes/multi-references do not hydrate relations in Phase 1.
- Only the source header/footer text currently available was converted; visual fidelity will require browser comparison and bundled font assets.

---

# CONTRACT — PHASE 2 — BƠ & BỘT

## A. Files added

- `index.html`, `menu.html`, `product.html` — standalone static documents with data-page `trang-chu`, `thuc-don`, `chi-tiet-banh`.
- `css/pages/home.css`, `css/pages/menu.css`, `css/pages/product.css` — responsive page styling.
- `js/pages/home.js`, `js/pages/menu.js`, `js/pages/product.js` — page initializers.
- `css/components/product-card.css`, `js/components/product-card.js` — reusable product cards.
- `js/services/cartService.js` — complete *Phase-2 guest-cart adapter* backed by localStorage.
- `css/main.css` — appended imports for four Phase-2 stylesheets.
- Existing Phase-1 files/data not replaced, except `css/main.css` and `CONTRACT.md`.

## B. New exports and signatures

- `js/components/product-card.js`:
  - `isCustomCake(product): boolean` — detect custom cakes by explicit flag/name.
  - `productHref(product): string` — `customize.html` or `product.html?id=...`.
  - `renderProductCard(product, {home=false,menu=false}={}): HTMLElement` — accessible card and action handlers; `menu` applies only the Wix MenuPage card variant.
  - `renderProductCards(container, products, options={}): void` — populate grid.
- `js/services/cartService.js`:
  - `getCart(): CartRow[]` — reads browser guest cart.
  - `addToCart({collectionId='bakeryproducts',itemId,quantity=1,variantId=null,customizationData=null}): Promise<CartRow[]>` — validates product/quantity/availability, adds to local cart and notifies header/store.
  - `removeFromCart(key): CartRow[]` — deletes a guest-cart line.
  - `clearCart(): void` — resets guest cart.
  - `cartService` — object grouping these functions.
- `js/pages/home.js`: `initHome(): Promise<void>` — load best sellers/promotions, initialize reveal/parallax/newsletter demo.
- `js/pages/menu.js`: `initMenu(): Promise<void>` — load up to 100 products, then filter/search/sort and render every match without pagination.
- `js/pages/product.js`: `initProduct(): Promise<void>` — resolve detail id, quantity, add-to-cart, and related products.

## C. State/data contract

- Consumes Phase-1 `products.json` fields `id,name,description,price,image,category,cakeGroup,stockQuantity,isBestSeller,isCustomizable,status` and promotions `id,title,description,bannerImage,discountDetails`.
- Does **not** change monetary normalization: all prices are integer VND; `formatVND` never multiplies by 1000.
- Query parameters: menu `category`, `q`, `sort`; detail `id`. Menu accepts existing footer category codes `Pastries`, `Cakes`, `Cookies`, `Breads` as aliases for matching local category values. Products without category/categoryId follow Wix's `Pastries` fallback in the menu filter without changing JSON. Legacy menu `cakeGroup` and `page` are ignored on load and removed on the next filter/search/sort action; other query parameters and the hash are preserved. Uses URLSearchParams, no React router.
- `bobot:v1:guestCart`: array of `{key,productId,variantId,quantity,unitPrice,productNameSnapshot,customizationData}`. `unitPrice` is a client-side display snapshot, *never* authoritative for eventual server checkout.
- Cart writes call Phase-1 `setJSON`; notify `store.set({cart,cartCount})` and dispatch `bobot:cart-updated`.
- GA4 events: `view_item_list`, `search`, `add_to_cart`, `view_item`. All `add_to_cart` events use `toGaItem`.

## D. Functional boundaries and honest limitations

1. Supabase cart/auth/orders have not been built in the user-defined phases. Guest cart works in localStorage, no cross-device sync. **Not a stub** for local guest cart.
2. The Product Detail `Mua Ngay` button adds the product to the guest cart and displays a notice that checkout is not yet available; it does **not** claim to complete a purchase or navigate to a nonexistent checkout.
3. Wishlist controls are visible, authentication-gated by temporary Phase-1 `getCurrentUser()`, and explicitly identify that persistence/sync is not implemented in Phase 2; no fake successful wishlist changes.
4. Newsletter is a demo form and does not save or send email; success is not falsely claimed.
5. Product Detail source contains no related-products or reviews section: related products were added only because Phase 2 requested them when applicable, but not misrepresented as original; reviews remain with a later user phase.
6. Source HomePage has six major sections: hero, visual breather, bestseller collection, philosophy narrative, seasonal promotions, newsletter. All six are present. No distinct carousel appears in supplied HomePage.tsx, so none was invented.
7. Images remain remote URLs and may fail; product images have HTTPS placeholder fallback. Original fonts still require binary assets.
8. Frontend alone is not secure for production commerce: all pricing and inventory must be revalidated by the eventual database backend.

## E. Checks completed

- `node --check` passed for all seven new JS files.
- Phase-1 products JSON parses, 65 products / 15 best sellers / 1 custom cake.
- Static HTML and CSS written; end-to-end browser visual comparison and remote image verification not yet performed.

**User controls phase timing and later-phase definitions; no further phases started.**


---
# CONTRACT — PHASE 3 — BƠ & BỘT

## A. File được thêm/sửa
- Thêm: `partials/cart-drawer.html`, `css/components/cart-drawer.css`, `css/pages/checkout.css`, `js/components/cart-drawer.js`, `js/components/checkout-form.js`, `js/components/address-autocomplete.js`, `js/components/delivery-map.js`, `js/services/shippingService.js`, `js/services/orderService.js`.
- Ghi đè/mở rộng: `js/services/cartService.js`, `js/services/promotionService.js`, `js/core/bootstrap.js`, `css/main.css`, `CONTRACT.md`.

## B. Exports
- `cartService`: `getCart()`, `getCount()`, `getTotal()`, `subscribe(fn)`, `addToCart({collectionId,itemId,quantity,variantId,customCakeId,customizationData})`, `updateQuantity(keyOrItem,quantity)`, `removeFromCart(keyOrItem)`, `clearCart()`, `openCart()`, `closeCart()`, `toggleCart()`, `CART_KEY`, `cartService`.
- `shippingService`: `getLocations()`, `calculateDistance(lat1,lng1,lat2,lng2)`, `calculateShippingFee(distanceKm)`, `quoteShipping(lat,lng)`.
- `promotionService`: `getAll`, `getById`, `query`, `validateCoupon(code,subtotal,{today}={})`, `promotionService`.
- `orderService`: `normalizePhone(value)`, `estimatedTimeForDate(value,now)`, `getOrders()`, `getOrderItems()`, `getOrderByCode(code)`, `calculateOrder(input)`, `createOrder(body)`, `orderService`, `ORDER_KEY`, `ORDER_ITEMS_KEY`.
- UI: `initCartDrawer()`, `initCheckoutForm()`, `initAddressAutocomplete(input,options)`, `initDeliveryMap(container,options)`.

## C. Lưu trữ, giá và lịch
- `bobot:v1:guestCart`: `{key,productId,itemId,collectionId,variantId,customCakeId,quantity,unitPrice,productNameSnapshot,image,customizationData}[]`.
- `bobot:v1:orders`: order records with embedded authoritative items; `bobot:v1:orderItems`: derived line rows, not transaction-authoritative.
- `bobot:v1:customCakes`: required for creating orders with customized product, to be populated in user-selected subsequent phase.
- Prices are already integer VND in `products.json`. No runtime multiplier. Coupon validated by code/date/minimum/maximum; imported coupon rates take priority over marketing prose.
- Calendar: today through today+30 days. Today estimated fulfillment at now+3h (max of 3h advance and 2h bake+30m transit), not allowed if hour>=20. Future date estimated 14:00.
- Distance Haversine; <=3km 20k, <=5km 30k, <=10km 50k, >10km blocked at checkout (source UI requires positive shipping fee).

## D. API compatibility and limits
- `createOrder` returns `{success,orderId,orderCode,totalAmount,order,items}` and stores full order + line rows locally. Does NOT call `/api/create-order`.
- This Phase 3 is deliberately localStorage/JSON per user's instructions, despite Supabase architecture selected earlier; **not** a server-secure checkout. Never pretend localStorage orders synchronize across visitors, clients or admin accounts.
- Map uses Leaflet 1.9.4 CDN, Nominatim uses 800ms debounce. Public Nominatim rate limits may require a proxy for higher traffic.
- `Cart` is initialized via bootstrap on each Phase 1/2 page; checkout uses modal; no standalone checkout.html introduced.
- Not implemented: authenticated Supabase transactions, stock update concurrency, real payment, custom cake configuration capture, later phase features controlled by user.

- Phase 3 integration: `js/components/header.js` also updated to dispatch the cart open/close events expected by the new drawer.


# PHASE 4 — AUTH DEMO / WISHLIST / PROFILE / ADMIN (USER-DEFINED)
- New HTML: login.html, wishlist.html, profile.html, admin-orders.html (data-page=dang-nhap, danh-sach-yeu-thich, tai-khoan, quan-ly-don-hang).
- New CSS: css/pages/account.css. New page JS: js/pages/login.js, wishlist.js, profile.js, admin-orders.js.
- New services: authService.js, wishlistService.js, loyaltyService.js, adminOrderService.js, orderStatusService.js.
- Modified: js/core/guard.js, js/components/header.js, js/components/product-card.js, js/services/orderService.js, css/main.css, README.md.
- authService exports register({email,password,displayName}), login({email,password}), logout(), getCurrentMember(), isAdmin(member?), subscribe(fn). Account has id/contactId/email/displayName/passwordHash/role/status/createdAt; session {contactId,issuedAt}.
- guard exports getCurrentUser(), requireLogin(options?), requireAdmin(options?), loginUrl(message,next?), safeNext(raw). Redirect via login.html?next=...&msg=...; next restricted to same-origin local page.
- wishlistService exports toggle(productId), list() -> {success,items,ids}, ids(). Stored keyed by contactId.
- loyaltyService exports getBalance(contactId?), getTransactions(contactId?), earnForCompletedOrder(order), redeem(points,description?). New EARN applies only after completed and paid: floor((subtotal − promotion discount − points discount)/1,000), excluding shipping; avoids duplicate EARN. Historical ledger entries are not recalculated.
- orderStatusService exports ORDER_STATUS, ORDER_STATUS_LABEL, normalizeOrderStatus(raw), getNextStatus(status, fulfillment='delivery'), getFlow(fulfillment).
- adminOrderService exports getAdminOrders() -> {success,orders}, updateOrderStatus({orderId,status}) -> {success,order,loyalty}, getMyOrders()->{success,orders}, getHistory(orderId). Admin-only access is simulated with role in user localStorage.
- localStorage keys: bobot:v1:users (array), bobot:v1:session ({contactId,issuedAt}), bobot:v1:wishlist ({[contactId]:productId[]}), bobot:v1:loyalty ({[contactId]:balance}), bobot:v1:loyaltyTransactions (array), bobot:v1:orderStatusHistory (array), existing bobot:v1:orders/orderItems/guestCart.
- Order service stamps current logged-in contactId at creation; guest order customer_id=null and is not shown in personal profile.
- Security: simulated localStorage only, no actual server security; SHA-256 is *not* safe password storage; no Supabase integration yet, no cross-browser sync. Some Wix historic order data intentionally excluded due to privacy. localStorage does NOT provide atomic cross-key transactions.
- API replacement: /api/my-orders -> getMyOrders(); /api/wishlist GET -> list() and POST -> toggle(productId); /api/admin/orders -> getAdminOrders(); /api/admin/update-order-status -> updateOrderStatus({orderId,status}).
- Previous phases retained. No work on any future phase.

### Migration note — made-to-order cake cart (2026-11-04)

`addToCart` keeps its existing input and stored cart shape. When the product is customizable and the supplied `customCakeId` resolves to a saved design, cart `unitPrice` is calculated from the existing cake options; the stock check is skipped for that made-to-order cake because the CMS base product has `stockQuantity: 0`. `calculateOrder` independently recalculates that price and applies the same stock exception. The quantity limit of 99 and stock checks for ordinary products remain. Product IDs, source price fields, and storage keys do not change.


---
## CONTRACT PHASE 5 — 2026-11-02

**File mới:** `about.html`, `promotions.html`, `promotion-detail.html`, `reviews.html`, `contact.html`, `customize.html`, `404.html`; tương ứng `css/pages/{about,promotions,promotion-detail,reviews,contact,customize,404}.css` và `js/pages/{about,promotions,promotion-detail,reviews,contact,customize,404}.js`; bổ sung `js/pages/promotions-utils.js`, `js/services/customCakeService.js`; sửa `css/main.css`, `data/cake-options.json`, `README.md`.

**API mới:** `promotions-utils.formatDateRange(start,end)`, `promoImage(p)`; `customCakeService.getOptions()`, `getById(id)`, `calculatePrice(config)`, `createCake(config)`; `contact.initContact()`, hằng `CONTACT_KEY`.

**Lưu trữ:** `bobot:v1:contactMessages` là danh sách `{id,name,email,phone,message,createdAt,_sample}`; `bobot:v1:customCakes` danh sách `{id,sizeId,flavorId,creamId,fontId,colorId,text,estimatedPrice,createdAt}`. Giỏ hàng tiếp tục dùng `bobot:v1:guestCart` và có `customCakeId`.

**Data:** `cake-options.json` đồng bộ sizes, flavors, creams, fonts, colors với `CakeCustomizerPage.tsx`; giá VND 250000/350000/450000 cộng tùy chọn; `customProductId` giữ từ Phase 1. Promotions/Reviews đọc JSON từ Phase 1.

**Giới hạn:** Contact lưu máy khách, không gửi email; không xác thực thật; trạng thái mã khuyến mãi được hiển thị theo dữ liệu, không tự thay đổi từ ngày hiện tại; preview bánh dạng overlay HTML/CSS, không tạo ảnh thật; hosting chưa chốt, hỗ trợ đường dẫn tương đối. `404.html` là trang thông báo tự điều hướng về index.html bằng nút bấm; server cần có cơ chế phục vụ 404.html.

**Còn lại:** Chỉ ghi nhận các phần đang chờ theo CONTRACT Phase 1–4; chưa tự đánh giá tổng thể dự án hoặc triển khai ngoài phase.

## Business Sprint 1 — checkout online demo (2026-11-04)

Phần này **thay thế các quy tắc checkout demo cũ ở Phase 3–4 khi mâu thuẫn**. Nguồn nghiệp vụ là `reference/contracts/BoBot_FUNCTIONAL_REQUIREMENTS_FINAL_APPROVED_2026-11-04.md`; không thay schema Supabase.

- `orderService`: `calculateOrder(input)` là nguồn báo giá chung cho Cart, Checkout và snapshot đơn; `validateRequestedAt(date,time,{hasCustomCake,now})` kiểm tra thời điểm thực tế theo `Asia/Ho_Chi_Minh`. `estimatedTimeForDate` giữ export tương thích nhưng không tự gán giờ. `createOrder(body)` chỉ tạo đơn online cho Customer đã đăng nhập; yêu cầu `paymentMethod` là `cod` hoặc `bank_transfer_demo`, ngày và giờ nhận, nhận `requestId` để chống gửi lặp trong bản demo. Đơn luôn có `customer_id`, `client_request_id`, `requested_at`, `payment_method`, `payment_status`, `promotion_id`, giá hàng/giảm giá/phí giao và snapshot `items` gồm `customization_data` đầy đủ.
- `promotionService`: thêm `selectAutomaticPromotion(lines,promotions,{today})`, `getAutomaticPromotion(lines,options)`; xét đúng một chương trình đang hiệu lực, giảm VND lớn nhất, hòa ID tăng dần, không vượt subtotal đủ điều kiện. Phạm vi `ALL` phải được khai báo rõ; phạm vi `PRODUCT`/`CATEGORY` cần danh sách ID rõ ràng. `validateCoupon` giữ export lịch sử nhưng luôn từ chối; không còn ô nhập voucher khi checkout.
- Trang chi tiết khuyến mãi không còn nút sao chép mã voucher cũ; nội dung hướng dẫn nhập mã cũ được thay khi hiển thị, không sửa bản ghi CMS.
- `shippingService`: thêm `quoteShipping(lat,lng)` đọc bậc phí trong `data/hcm-locations.json`. Không báo phí giao nếu chưa xác định vị trí hoặc ngoài vùng cấu hình.
- `paymentService` mới: `confirmDemoPayment({orderId})`, `getPaymentHistory(orderId)`, `PAYMENT_HISTORY_KEY`, `paymentService`. Chỉ role Staff/Admin trong dữ liệu demo được xác nhận thanh toán, chuyển `unpaid/pending` sang `paid` một lần, lưu người/thời gian và lịch sử tại `bobot:v1:paymentHistory`. Không đổi order status khi xác nhận tiền. Admin Orders cung cấp nút xác nhận mô phỏng.
- `loyaltyService.earnForCompletedOrder` chỉ ghi điểm khi order status `completed` **và** payment status `paid`; cơ sở tính là tiền hàng sau giảm, không gồm phí giao. Điều này thay quy tắc Phase 4 cũ.
- Cart guest giữ nguyên `bobot:v1:guestCart` qua Login và mở lại checkout sau login. Bánh tùy chỉnh dùng giá từ `data/cake-options.json`, không trừ stock thành phẩm, yêu cầu nhận trước ít nhất 24 giờ, snapshot cấu hình gắn vào đơn sau khi giỏ bị xóa.
- Đây là localStorage demo: role, tài khoản, idempotency, thanh toán và lịch sử không có xác thực hay giao dịch an toàn phía server. Supabase Auth/RLS, tính giá và kiểm tra thời gian phía server, stock transaction và payment confirmation đáng tin cậy thuộc giai đoạn backend sau. Không có cấu hình giờ mở cửa đáng tin cậy để áp dụng thêm giới hạn giờ nhận.

### Sprint 1.1 — hardening demo

- `createOrder(body)` giữ `client_request_id` và khóa in-flight theo **cặp Customer `contactId` + `requestId`**. Hai lần gửi cùng cặp nhận cùng đơn; hai `requestId` khác nhau không dùng chung Promise/kết quả. UI checkout vẫn tạo một `requestId` cho lần gửi, đổi sau khi thành công. localStorage không bảo đảm idempotency đa tab/thiết bị; backend cần unique constraint + transaction.
- `confirmDemoPayment({orderId})` từ chối xác nhận mới nếu `order_status` hoặc trạng thái legacy `status` là `cancelled`, cho cả COD và `bank_transfer_demo`. Không ghi payment history hoặc đổi payment status trong trường hợp từ chối; Admin Orders cũng hiển thị trạng thái hủy nếu một trong hai trường báo hủy. Đơn đã paid rồi bị hủy không tự thành refunded (R19); refund là quy trình riêng.
- Quyền của service xác nhận thanh toán demo là **Staff/Admin** theo R19/R20; trang `admin-orders.html` và `adminOrderService` hiện vẫn **Admin-only** theo contract demo cũ. Staff không được cấp role Admin, và chưa có UI Staff riêng trong Sprint 1.1. Trên trang Admin, nút xác nhận không xuất hiện cho đơn đã hủy. Phân quyền localStorage chỉ là demo, không thay RLS phía server.
- Kế hoạch schema/RLS/RPC và các quyết định cần duyệt nằm tại `reference/architecture/SUPABASE_IMPLEMENTATION_PLAN.md`; tài liệu này không tạo hoặc xác nhận bảng Supabase thật.

### Sprint 3 — Supabase local frontend integration (2026-11-05)

- Các mô tả `localStorage demo` ở trên là contract lịch sử của chế độ demo. `site/backend-config.json` chọn chế độ `supabase`; `site/backend-config.local.json` chỉ được tạo từ publishable key của Supabase local bằng `npm run db:configure:local` và bị Git bỏ qua. Chế độ `demo` chỉ được chọn tường minh bằng cấu hình. API lỗi trong chế độ Supabase không chuyển sang tạo đơn hoặc cập nhật tài chính bằng localStorage.
- `js/core/backend.js` xuất `backendMode`, `isSupabaseMode()`, `getSupabaseClient()` và `backendError(error)`. Supabase client dùng bản browser của `@supabase/supabase-js` tại `js/vendor/supabase.js`, không dùng bundler frontend.
- `authService.register/login/logout` giữ chữ ký cũ nhưng dùng Supabase Auth trong chế độ Supabase; `logout` là async. `getCurrentMember()` vẫn đồng bộ sau khi module khởi tạo, trả hồ sơ `profiles` active từ RLS; role và status không đọc từ localStorage. Auth trigger tạo `profiles` và `loyalty_accounts`; dữ liệu password hash và session demo cũ không được import.
- `productService` và `promotionService` đọc catalog backend, ánh xạ `source_id` thành ID hiển thị và giữ UUID ở `backendId`. `customCakeService.getOptions()` đọc `customization_categories/options` backend; bản nháp `bobot:v1:customCakes` vẫn ở client theo S-02. Dữ liệu CMS cũ chỉ hiển thị trong chế độ demo, không tự seed vào backend.
- `cartService` giữ `bobot:v1:guestCart`. `orderService.calculateOrder()` dùng `quote_order`; `createOrder()` dùng `quote_order` rồi `create_online_order` với UUID sản phẩm/tùy chọn, `requestId`, thời điểm nhận và phương thức thanh toán. Giá từ giỏ không phải giá chính thức. Giỏ chỉ xóa sau RPC tạo đơn thành công. Delivery backend bị chặn vì tọa độ client chưa được xác minh.
- `wishlistService` đọc/ghi `wishlist_items` qua RLS trong chế độ Supabase; `ids()` vẫn đồng bộ từ cache, `list()`/`toggle()` làm mới cache từ backend. `loyaltyService.getBalance/getTransactions` trả giá trị đồng bộ ở demo, Promise ở Supabase và dùng RLS ở Supabase; `earnForCompletedOrder/redeem` không cho ghi điểm client trong chế độ Supabase.
- `adminOrderService.getMyOrders/getAdminOrders` đọc `orders` kèm `order_items`, `order_status_history`, `payments` qua RLS; ánh xạ `payment_method` từ charge payment cho UI. `updateOrderStatus()` gọi `transition_order`; `paymentService.confirmDemoPayment()` gọi `confirm_demo_payment`. Trang Admin Orders vẫn chỉ dành cho Admin; Staff có quyền RPC thanh toán theo backend nhưng không được nâng quyền mở trang Admin.

### Sprint 3.5 — Catalog và loyalty checkout trên Supabase local (2026-11-05)

- Trong Supabase mode, `calculateOrder({items,fulfillmentType,deliveryDate,deliveryTime,pointsUsed})` gửi `points_used` tới `quote_order`. Kết quả gồm `pointsDiscountAmount` từ backend. `createOrder({... ,pointsUsed,requestId})` gửi cùng số điểm tới `create_online_order`; RPC tính lại giá, điểm và tồn trong transaction. Retry dùng cùng `requestId` không bị chặn bởi một quote riêng trước RPC. Demo mode giữ localStorage riêng nhưng dùng tỷ lệ điểm FINAL cho EARN mới.
- Checkout Supabase hiển thị số điểm khả dụng từ `loyaltyService.getBalance()`, tối đa 20% tiền hàng sau khuyến mãi, quy đổi 1 điểm = 10 VND. Đây là giới hạn hiển thị; backend kiểm tra lại tại quote và create, nên thay đổi số dư giữa hai bước trả lỗi và giữ giỏ.
- `site/js/services/loyaltyMath.js` exports `VND_PER_EARN_POINT`, `VND_PER_REDEEM_POINT`, `earnedPoints(subtotal,discountAmount,pointsDiscountAmount)` và `maxRedeemPoints(eligibleMerchandise,availablePoints)`. Đây là phép tính hỗ trợ UI/demo; RPC vẫn quyết định số điểm và giá chính thức.
- `scripts/import-catalog-local.mjs` chỉ ghi PostgreSQL local `127.0.0.1:54322`; mặc định dry-run, `--test-fixture --apply` nhập dữ liệu tổng hợp TEST, còn `--manifest <file> --apply` yêu cầu bằng chứng duyệt giá/tồn/option. Script giữ `source_id` Wix và upsert idempotent, không tự import variants/reviews chưa map. `scripts/bootstrap-admin-local.mjs` cấp Admin đầu tiên cho UUID Auth đã xác minh qua DB trusted kèm audit. `scripts/configure-store-local.mjs` nhận giờ/cấu hình đã phê duyệt, kiểm tra SHA-256 trước apply và ghi audit; không đặt giờ mặc định. Các script này không chấp nhận database Cloud.

### Sprint 4 — POS, Staff Orders và Dashboard trên Supabase local (2026-11-05)

- Route mới: `pos.html` cho Staff/Admin, `staff-orders.html` cho Staff/Admin, `dashboard.html` cho Admin. Chỉ hoạt động trong Supabase mode. Liên kết từ Profile hiện với đúng role; trang `admin-orders.html` cũ vẫn Admin-only.
- `posService.getPosCatalog()` đọc sản phẩm active, giá/tồn backend; `quotePosSale(items)` gọi `quote_order` với `counter`; `recordPosSale({items,request_id})` gọi `record_pos_sale` với `cash_demo` và đọc lại order/payment. Giỏ POS chỉ là trạng thái trang, không tạo order localStorage. Khi kết quả RPC chưa chắc chắn, UI giữ payload và requestId để retry cùng yêu cầu. POS counter hiện chỉ cho khách vãng lai; backend từ chối `customer_id` cho tới khi có bước xác minh liên kết tài khoản được duyệt.
- `operationsService.getOperationalOrders()` đọc tối đa 200 đơn mới nhất với items/history/payments qua RLS. `transitionOperationalOrder`, `cancelOperationalOrder`, `confirmOperationalPayment` gọi RPC tương ứng; Staff/Admin không ghi trực tiếp bảng tài chính. Đơn POS được RPC tạo `completed + paid` trong giao dịch tiền mặt demo; không chuyển trạng thái hoặc hủy đơn completed bằng UI.
- `dashboardService.getDashboardData(from,to,channel)` gọi `admin_dashboard` và đọc tồn kho/đơn chờ qua RLS. RPC mới trong migration `20261105000100_admin_dashboard.sql` chỉ Admin active được thực thi, lấy daily KPI từ `daily_analytics`, đếm khách duy nhất theo lần mua completed+paid đầu tiên toàn kênh và phân bổ doanh thu ròng cho `order_items`. `top_products` tối đa 10, tồn/đơn chờ tối đa 20, khoảng ngày tối đa 366 ngày; không có ngưỡng sắp hết hàng mặc định. Không tạo bảng ứng dụng thứ 19.

### Sprint 6 — production preparation trên LOCAL (2026-11-06)

- `record_pos_sale` tiếp tục là POS guest. RPC từ chối mọi `customer_id`, `pos_link_code` hoặc `verification_code` do Staff gửi với `POS_CUSTOMER_LINK_REQUIRES_VERIFICATION`; không tự gắn Customer hoặc earn loyalty. Không có route/export frontend hay storage key mới.
- Trước migration `20261109000200_delivery_verified.sql`, `quote_order`/`create_online_order` từ chối delivery với `DELIVERY_LOCATION_NOT_VERIFIED`. Payment COD/bank/cash vẫn là demo; không coi `paid` demo là tiền thật.

### Checkout + Delivery phương án B — quyết định 09/11/2026

- `backend.js` xuất thêm `getBackendUrl()` và `getBackendPublishableKey()` cho Edge Function call; đây chỉ là URL/key công khai. `deliveryVerificationService.js` xuất `verifyDeliveryAddress({address,lat,lng,requestId})`. Không có storage key mới; proof chỉ giữ trong phiên checkout đang mở.
- Endpoint `POST /functions/v1/delivery-verify` nhận bearer Customer, địa chỉ, ghim và requestId. Edge gọi geocoder backend được cấu hình, chỉ chấp nhận địa chỉ khớp, độ chính xác rooftop, confidence ≥0,95, mã quốc gia VN và ghim cách điểm geocode ≤100 m. Endpoint trả `proof_id`/`expires_at`, không trả API secret. Nếu thiếu provider, lỗi hoặc vị trí không khớp, không tạo proof.
- Migration `20261109000200_delivery_verified.sql` giữ 18 bảng public, thêm bảng chứng cứ ngắn hạn `private.delivery_proofs` để ràng buộc Customer, hash địa chỉ, requestId, tọa độ backend, hết hạn và trạng thái sử dụng một lần. `public.issue_delivery_proof` chỉ EXECUTE cho service_role; Customer/Staff không đọc/ghi chứng cứ. `quote_order`/`create_online_order` bỏ qua tọa độ/phí client, yêu cầu proof hợp lệ và lấy tọa độ server. Retry cùng requestId/payload trả đơn cũ; proof mới hoặc payload khác không được tái sử dụng như một đơn khác.
- `orderService.calculateOrder()` và `createOrder()` gửi `delivery_proof_id`, `ship_address`, `request_id` khi delivery; pickup/counter giữ dạng request cũ. Frontend không xóa giỏ khi xác minh, quote hoặc create lỗi. Giá/stock/promotion/loyalty/payment được tính lại trong RPC như trước.
- Backend dùng tọa độ cửa hàng ở `store_settings` chỉ khi `delivery_origin_approved_at` và `delivery_origin_approval_source` đã có. Đổi tọa độ xóa trạng thái duyệt. Haversine ≤3 km: 20.000 VND; >3–5 km: 30.000 VND; >5–10 km: 50.000 VND; >10 km từ chối. Giờ theo Asia/Ho_Chi_Minh: pickup [10:00,20:00), delivery [10:00,19:00), đơn giao cùng ngày phải gửi trước 17:00; bánh thường ≥2 giờ, custom ≥24 giờ. Không tự đặt tọa độ hoặc nguồn geocoder thật.
- Manifest approval ở `reference/production/` nằm ngoài dữ liệu storefront. `scripts/import-catalog-local.mjs --manifest --apply` bị khóa; đường production mới `scripts/import-approved-catalog-local.mjs` chỉ chạy PostgreSQL LOCAL, đòi approval từng record, preview hash, audit và reconciliation, không ghi đè stock vận hành. Không có schema/table mới.

### Sprint 7 — VNPAY sandbox trên Supabase LOCAL (2026-11-06)

- Supabase online checkout nhận thêm `paymentMethod='vnpay'`; COD, `bank_transfer_demo` và POS `cash_demo` giữ riêng. Demo mode không nhận VNPAY. UI kiểm tra `getVnpayAvailability()` và vô hiệu hóa lựa chọn khi gateway sandbox chưa cấu hình. `createOrder(body)` với VNPAY giữ giỏ sau khi tạo order; checkout gọi `startVnpayPayment(orderId)` rồi mới xóa giỏ và chuyển đến URL sandbox. RequestId giữ nguyên khi API thất bại để retry cùng order.
- Route mới `vnpay-result.html` chỉ đọc payment status qua `getVnpayStatus({txnRef})` và RLS. Query trên Return URL không có quyền ghi `paid`. `vnpayService.js` xuất `getVnpayAvailability`, `startVnpayPayment`, `getVnpayStatus`, `reconcileVnpayPayment`, `requestVnpayFullRefund`; chỉ gọi Edge Function, không giữ HashSecret ở browser.
- Migration `20261106000100_vnpay_gateway.sql` mở `payments.payment_method='vnpay'`, thêm dấu vết gateway vào bảng hiện hữu và các RPC `vnpay_begin_payment`, `vnpay_apply_result`, `vnpay_request_full_refund`, `vnpay_apply_refund_result`. RPC ghi trạng thái gateway chỉ cấp `EXECUTE` cho `service_role`; Customer/Staff/Admin vẫn chịu Auth/RLS/role. `payments` tiếp tục là nguồn chuẩn, `orders.payment_status` là projection. Không có bảng ứng dụng thứ 19 hay storage key mới.
- Edge Function `vnpay-gateway` có action `start`, `status`, `reconcile`, `refund` và GET `ipn`. Function không xác minh JWT ở cổng vì IPN là server callback; từng action khác tự xác minh Auth, role, ownership qua backend. Credentials chỉ lấy từ environment. Chưa có sandbox credentials thật, IPN HTTPS public hay phê duyệt Cloud.

### Delivery demo và vận hành đơn bổ sung (2026-11-09)

- `delivery-verify` chỉ gọi Nominatim Search sau khi Customer bấm xác minh, yêu cầu `BOBOT_NOMINATIM_CONTACT_URL` ở Edge, không trả proof khi geocoder lỗi hoặc thiếu số nhà/đường, và chỉ dùng Nominatim công cộng ở chế độ thử cô lập. `site/vendor/leaflet/` là Leaflet 1.9.4 local; vị trí phường từ JSON chỉ là gợi ý, không phải proof. `scripts/configure-delivery-origin-disposable.mjs` chỉ nhận Supabase loopback disposable, dùng tọa độ `site/data/hcm-locations.json` với nhãn TEST, không phải tọa độ production đã khảo sát.
- Migration `20261109000300_operations.sql` giữ sáu `orders.order_status`. `record_pos_sale` tạo đơn counter `pending`/`unpaid`; `complete_pos_sale(p_order,p_cash_collected,p_handover)` chỉ Staff/Admin và yêu cầu cả hai xác nhận để hoàn tất. `confirm_demo_payment(p_order,p_money_received)` yêu cầu Staff/Admin xác nhận đã nhận tiền; chữ ký một tham số bị thu hồi quyền. `cancel_order` tiếp tục kiểm tra Customer sở hữu đơn và trạng thái hợp lệ; Profile gọi RPC này.
- `record_delivery_failure(p_order,p_reason)` ghi lịch sử/audit, giữ trạng thái `shipping`; Staff Orders hiển thị cảnh báo trễ từ `requested_at`. Hoàn tiền demo dùng `request_demo_refund` (Staff), `approve_demo_refund` (Admin), `execute_demo_refund` (Staff); `refund_demo_payment` cũ bị thu hồi quyền. Refund pending không làm đổi payment projection; chỉ khi Staff xác nhận thực hiện thì status thành `refunded`, Loyalty/KPI được cập nhật. VNPAY refund tách riêng và vẫn tạm dừng.
- `reserve_nominatim_request()` chỉ service-role dùng được; RPC khóa hàng `store_settings` và dành tối đa một lượt Nominatim cho mỗi 1,1 giây trên cùng database trước khi Edge gọi provider. Chưa có provider/cấu hình production được duyệt và Nominatim công cộng bị khóa ngoài chế độ thử cô lập.

### Sprint 3.5 — VNPAY Sandbox Return và QUERYDR (09/11/2026)

- `vnpay-gateway` cho Customer active đối soát QUERYDR đối với chính đơn online thuộc họ; Staff/Admin active vẫn được đối soát. Backend khóa 30 giây theo payment qua `vnpay_reserve_query`, migration cộng thêm `20261109000400_vnpay_customer_querydr.sql`. Chỉ phản hồi QUERYDR có chữ ký, merchant, amount, transaction type và txnRef khớp mới gọi RPC service-role cập nhật payment. `vnpay-result.js` tự thử đối soát khi Return còn pending rồi đọc lại trạng thái từ backend; query string Return không trực tiếp ghi paid.
- `availability` trả `available=true` chỉ khi mode/merchant/Return URL hợp lệ và cột của migration mới có trên backend. `start` kiểm cấu hình Return/merchant trước khi tạo payment session. Refund VNPAY trực tiếp bị chặn ở Edge và thu hồi EXECUTE của RPC yêu cầu refund cũ; muốn hoàn tiền VNPAY phải có triển khai riêng đi qua Staff yêu cầu → Admin duyệt → Staff thực hiện, chưa mở trong sprint này.
- `supabase/.env.local` được ignore; Edge runtime chỉ nhận file này khi chạy `supabase functions serve vnpay-gateway --env-file supabase/.env.local`. IPN HTTPS công khai chưa có; QUERYDR sau Return là đường xác minh server-side dự phòng cho demo local, không phải bằng chứng đã nghiệm thu VNPAY Sandbox thật.

### Churn Phase B — nghiên cứu Churn trong Dashboard (10/11/2026)

- Route `dashboard.html` giữ nguyên và chỉ mở cho Admin active từ Supabase profile. Phần Churn là nghiên cứu synthetic, tách khỏi KPI, Customer Management và dữ liệu khách vận hành.
- `dashboardService.getChurnResearch(): Promise<{summary,evaluation,importance}>` gọi Edge Function `churn-research` ba lần với body `{asset:'summary'|'evaluation'|'importance'}`. `summary` là JSON gồm `source,model,as_of_date,horizon_days,sample_size,metrics,risk_counts,risk_thresholds`; hai asset còn lại là PNG Blob. Không thêm storage key, route frontend, bảng hoặc RPC.
- Edge Function xác thực bearer bằng Supabase Auth `/auth/v1/user`, tra profile bằng service role và chỉ trả asset khi `role='admin'` và `status='active'`. Asset tổng hợp và hai PNG nằm trong `supabase/functions/churn-research/`, không thuộc public `site/`; file joblib và CSV từng khách vẫn ở `research/input/ml_handoff/` bị Git ignore.
- Code Edge Function mới chỉ chuẩn bị cho LOCAL; chưa deploy Cloud, chưa kiểm thử quyền với tài khoản Supabase thật. Dữ liệu và biểu đồ hiển thị khi Edge Function này được serve trong runtime phù hợp. Không có inference hoặc gắn risk cho khách thật.

### ML continuation — Churn inference và Related Products (10/11/2026)

- `churn-research` và `related-products` được serve trên Supabase LOCAL bằng CLI; `static_files` trong `supabase/config.toml` bundle JSON/PNG thuộc function. Churn Guest 403 thật; quyền Admin/Staff/Customer với session thật chưa được kiểm thử. Churn `.joblib` đã load và `predict_proba` trong venv nghiên cứu riêng; không có API vận hành hoặc dự đoán khách thật.
- `recommendationService.getRelatedProductIds(sourceId): Promise<string[]>` gọi Edge Function `related-products` với `{product_id: sourceId}`. Phản hồi `{source_id,method:'content_sim',product_ids:string[]}`; ID không thuộc catalog nghiên cứu trả `[]`, ID sai định dạng trả 400. Không thêm route frontend hoặc storage key.
- `research/scripts/export-related-products.py` đọc model owner bàn giao và mapping đã xác minh, xuất content-based ranking vào `supabase/functions/related-products/rankings.json`. JSON chỉ chứa source product IDs và metadata hash; không chứa `customer_history`, model joblib, giá, ảnh, stock hoặc collaborative score. Product Detail lọc kết quả qua `productService.getAll()` theo sản phẩm active còn hàng và dùng product object hiện hành để render card.
- `product.html` giữ route, đổi section gợi ý thành `Sản phẩm liên quan`; không dùng lọc cùng danh mục trước đây. Trạng thái đang tải, rỗng và lỗi được hiển thị tại section. Không có query-based ML Search vì artifact không chứa vectorizer.

### Promotion, Reviews và ML Search LOCAL (10/11/2026)

- `promotionService.getAll/getById/query` trả nội dung chương trình hợp lệ từ `data/promotions.json`, ghép theo `source_id` với promotion active trong Supabase khi có. Mỗi bản ghi hiển thị thêm `availability` (`active`, `ended`, `upcoming`, `unavailable`) và `source` (`archive`, `supabase`). `status='active'` chỉ khi backend có promotion active và ngày hiệu lực; Home chỉ hiển thị chương trình có `availability='active'`. Checkout vẫn dùng RPC backend để chọn ưu đãi; JSON không tạo quyền giảm giá.
- `reviewService.getAll/getById/query` trả review `published` từ Supabase cùng review legacy hợp lệ chỉ đọc từ `data/reviews.json`, loại trùng bằng `source_id`. Review legacy có `id='legacy:<source_id>'`, `source='legacy'`, `rating`, `content`, `created_at`, không có `product_id` UUID hay nhãn đã mua hàng. Review Supabase có `source='supabase'`. Product Detail chỉ hiển thị review Supabase gắn UUID sản phẩm thật.
- `reviewService.getMyReviews(): Promise<Array<{id,order_code,product_name,rating,content,status,created_at}>>` gọi RPC `public.my_reviews()`; RPC chỉ cho Customer active và tự lấy `auth.uid()` phía server. `pending`, `published`, `hidden` được hiển thị trong mục riêng sau reload. Migration `20261110000200_customer_my_reviews.sql` chỉ thêm RPC, không thêm bảng hoặc storage key.
- Menu dùng `searchService.searchProducts(query,{limit})` gọi Edge Function công khai `product-search` với `{query,limit}`. Response `{results:[{source_id,score}],model_version,corpus_fingerprint,mode:'model'}`. Frontend ghép source ID với `productService`, lọc trạng thái, stock và giá hiện hành, rồi giữ thứ hạng model. Khi endpoint lỗi, UI ghi rõ fallback sang lọc tên/mô tả. Không thêm localStorage key.
- `product-search` dùng artifact `model.json` TF-IDF word/character được huấn luyện từ 63 sản phẩm active có nguồn Supabase LOCAL; artifact chỉ chứa source IDs, vocabulary, IDF và vectors, không chứa giá, stock hay dữ liệu Customer. Endpoint đọc lại catalog active/còn tồn/có giá qua Data API trước khi trả kết quả. Khi catalog đổi, cần xuất lại artifact và nghiệm thu độ liên quan; chưa có nhãn độc lập để công bố metric chất lượng tìm kiếm.

### Promotion FINAL 12/11 và Churn Research (10/11/2026)

- `adminManagementService.activateFinalPromotion(): Promise<{promotion_id,source_id,created,activated,replayed}>` gọi `public.admin_activate_final_20261112()`; RPC chỉ cho profile Admin active, dùng UUID nội bộ cố định cho source ID `FINAL_2026_11_12_15_PERCENT`, kiểm tra toàn bộ điều khoản, khóa giao dịch và ghi audit đúng một lần. Chương trình bắt đầu 10/11/2026 00:00 và kết thúc 12/11/2026 23:59:59 theo Asia/Ho_Chi_Minh; hai hạn mức dùng `NULL` để biểu thị không giới hạn. Không thêm route hoặc storage key.
- Admin Management hiển thị giây trong hai trường `datetime-local` của promotion và giữ nguyên giây khi lưu. Mọi thay đổi vào chương trình được phê duyệt phải đối chiếu với `reference/production/promotion-approval.json` trước phát hành.
- Manager Dashboard hiển thị thêm ba thanh phân bố LOW/MEDIUM/HIGH từ `getChurnResearch().summary.risk_counts`, bên cạnh bảng số liệu. Thanh chỉ trực quan hóa dữ liệu nghiên cứu 8.500 khách giả lập; không ghi vào KPI, Customer hoặc database vận hành. Không thêm route, export hoặc storage key.
