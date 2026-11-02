# CONTRACT — PHASE 1 — BƠ & BỘT

## A. Files created

All generated source files are present in the `bobot/` directory. See `PHASE1_AUDIT.json` for the full per-file list. This phase creates CSS base, header/footer partials and styles, JS core and JSON service adapters, sanitized public data, README and contract.

## B. Exported JavaScript API

- `js/core/config.js`: `getConfig(): Promise<object>`; `clearConfigCache(): void`.
- `js/core/dom.js`: `$(selector, root=document): Element|null`; `$$(selector,root=document): Element[]`; `el(tag,attrs={},children=[]): Element`; `escapeHtml(value=''): string`; `delegate(root,eventName,selector,handler): ()=>void`.
- `js/core/format.js`: `formatVND(amount): string`; `formatDate(value,options?): string`.
- `js/core/storage.js`: `getJSON(key,fallback=null): any`; `setJSON(key,value): boolean`; `removeKey(key): boolean`; aliases `get`, `set`.
- `js/core/store.js`: `createStore(initial={}): {get,set,subscribe}`; singleton `store`.
- `js/core/toast.js`: `toast({title,description,variant,duration}): {dismiss,id}`; alias `showToast`.
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
  - `renderProductCard(product, {home=false}={}): HTMLElement` — accessible card and action handlers.
  - `renderProductCards(container, products, options={}): void` — populate grid.
- `js/services/cartService.js`:
  - `getCart(): CartRow[]` — reads browser guest cart.
  - `addToCart({collectionId='bakeryproducts',itemId,quantity=1,variantId=null,customizationData=null}): Promise<CartRow[]>` — validates product/quantity/availability, adds to local cart and notifies header/store.
  - `removeFromCart(key): CartRow[]` — deletes a guest-cart line.
  - `clearCart(): void` — resets guest cart.
  - `cartService` — object grouping these functions.
- `js/pages/home.js`: `initHome(): Promise<void>` — load best sellers/promotions, initialize reveal/parallax/newsletter demo.
- `js/pages/menu.js`: `initMenu(): Promise<void>` — load/normalize filters/search/sort/pagination and URL query.
- `js/pages/product.js`: `initProduct(): Promise<void>` — resolve detail id, quantity, add-to-cart, and related products.

## C. State/data contract

- Consumes Phase-1 `products.json` fields `id,name,description,price,image,category,cakeGroup,stockQuantity,isBestSeller,isCustomizable,status` and promotions `id,title,description,bannerImage,discountDetails`.
- Does **not** change monetary normalization: all prices are integer VND; `formatVND` never multiplies by 1000.
- Query parameters: menu `category`, `cakeGroup`, `q`, `sort`, `page`; detail `id`. Uses URLSearchParams, no React router.
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
- loyaltyService exports getBalance(contactId?), getTransactions(contactId?), earnForCompletedOrder(order), redeem(points,description?). First EARN for completed order only, floor(total_amount/10000); avoids duplicate EARN.
- orderStatusService exports ORDER_STATUS, ORDER_STATUS_LABEL, normalizeOrderStatus(raw), getNextStatus(status, fulfillment='delivery'), getFlow(fulfillment).
- adminOrderService exports getAdminOrders() -> {success,orders}, updateOrderStatus({orderId,status}) -> {success,order,loyalty}, getMyOrders()->{success,orders}, getHistory(orderId). Admin-only access is simulated with role in user localStorage.
- localStorage keys: bobot:v1:users (array), bobot:v1:session ({contactId,issuedAt}), bobot:v1:wishlist ({[contactId]:productId[]}), bobot:v1:loyalty ({[contactId]:balance}), bobot:v1:loyaltyTransactions (array), bobot:v1:orderStatusHistory (array), existing bobot:v1:orders/orderItems/guestCart.
- Order service stamps current logged-in contactId at creation; guest order customer_id=null and is not shown in personal profile.
- Security: simulated localStorage only, no actual server security; SHA-256 is *not* safe password storage; no Supabase integration yet, no cross-browser sync. Some Wix historic order data intentionally excluded due to privacy. localStorage does NOT provide atomic cross-key transactions.
- API replacement: /api/my-orders -> getMyOrders(); /api/wishlist GET -> list() and POST -> toggle(productId); /api/admin/orders -> getAdminOrders(); /api/admin/update-order-status -> updateOrderStatus({orderId,status}).
- Previous phases retained. No work on any future phase.


---
## CONTRACT PHASE 5 — 2026-11-02

**File mới:** `about.html`, `promotions.html`, `promotion-detail.html`, `reviews.html`, `contact.html`, `customize.html`, `404.html`; tương ứng `css/pages/{about,promotions,promotion-detail,reviews,contact,customize,404}.css` và `js/pages/{about,promotions,promotion-detail,reviews,contact,customize,404}.js`; bổ sung `js/pages/promotions-utils.js`, `js/services/customCakeService.js`; sửa `css/main.css`, `data/cake-options.json`, `README.md`.

**API mới:** `promotions-utils.formatDateRange(start,end)`, `promoImage(p)`; `customCakeService.getOptions()`, `getById(id)`, `calculatePrice(config)`, `createCake(config)`; `contact.initContact()`, hằng `CONTACT_KEY`.

**Lưu trữ:** `bobot:v1:contactMessages` là danh sách `{id,name,email,phone,message,createdAt,_sample}`; `bobot:v1:customCakes` danh sách `{id,sizeId,flavorId,creamId,fontId,colorId,text,estimatedPrice,createdAt}`. Giỏ hàng tiếp tục dùng `bobot:v1:guestCart` và có `customCakeId`.

**Data:** `cake-options.json` đồng bộ sizes, flavors, creams, fonts, colors với `CakeCustomizerPage.tsx`; giá VND 250000/350000/450000 cộng tùy chọn; `customProductId` giữ từ Phase 1. Promotions/Reviews đọc JSON từ Phase 1.

**Giới hạn:** Contact lưu máy khách, không gửi email; không xác thực thật; trạng thái mã khuyến mãi được hiển thị theo dữ liệu, không tự thay đổi từ ngày hiện tại; preview bánh dạng overlay HTML/CSS, không tạo ảnh thật; hosting chưa chốt, hỗ trợ đường dẫn tương đối. `404.html` là trang thông báo tự điều hướng về index.html bằng nút bấm; server cần có cơ chế phục vụ 404.html.

**Còn lại:** Chỉ ghi nhận các phần đang chờ theo CONTRACT Phase 1–4; chưa tự đánh giá tổng thể dự án hoặc triển khai ngoài phase.
