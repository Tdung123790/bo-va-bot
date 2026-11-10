const baseUrl = new URL('../../backend-config.json', import.meta.url);
const localUrl = new URL('../../backend-config.local.json', import.meta.url);
async function readConfig(url, optional = false) {
  const response = await fetch(url);
  if (optional && response.status === 404) return null;
  if (!response.ok) throw Error('Không tải được cấu hình backend.');
  return response.json();
}
const baseConfig = await readConfig(baseUrl);
const localConfig = await readConfig(localUrl, true);
const backendConfig = localConfig || baseConfig;
export const backendMode = backendConfig.mode === 'demo' ? 'demo' : 'supabase';
export const isSupabaseMode = () => backendMode === 'supabase';
export const getBackendUrl = () => backendConfig.url || '';
export const getBackendPublishableKey = () => backendConfig.publishableKey || '';
let clientPromise;
export async function getSupabaseClient() {
  if (!isSupabaseMode()) throw Error('Website đang ở chế độ demo localStorage.');
  if (!backendConfig.url || !backendConfig.publishableKey) {
    throw Error('Chưa cấu hình Supabase local. Chạy npm run db:configure:local.');
  }
  if (!clientPromise) {
    clientPromise = new Promise((resolve, reject) => {
      if (globalThis.supabase?.createClient) {
        resolve(globalThis.supabase.createClient(backendConfig.url,
          backendConfig.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }));
        return;
      }
      const script = document.createElement('script');
      script.src = new URL('../vendor/supabase.js', import.meta.url).href;
      script.onload = () => globalThis.supabase?.createClient
        ? resolve(globalThis.supabase.createClient(backendConfig.url,
          backendConfig.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }))
        : reject(Error('Không khởi tạo được Supabase client.'));
      script.onerror = () => reject(Error('Không tải được thư viện Supabase.'));
      document.head.append(script);
    }).catch(error => { clientPromise = null; throw error; });
  }
  return clientPromise;
}
export function backendError(error) {
  const message = String(error?.message || error || '');
  if (message.includes('Failed to fetch') || message.includes('fetch failed')) {
    return Error('Không kết nối được Supabase local. Giỏ hàng vẫn được giữ nguyên.');
  }
  if (message.includes('DELIVERY_LOCATION_NOT_VERIFIED')) {
    return Error('Chưa thể xác minh vị trí giao hàng. Vui lòng chọn nhận tại cửa hàng.');
  }
  if (message.includes('DELIVERY_PROOF') || message.includes('UNTRUSTED_DELIVERY_COORDINATES')) {
    return Error('Địa chỉ giao hàng cần xác minh lại trước khi đặt. Giỏ hàng vẫn được giữ nguyên.');
  }
  if (message.includes('DELIVERY_ORIGIN_NOT_APPROVED')) {
    return Error('Cửa hàng chưa phê duyệt tọa độ giao hàng trên backend.');
  }
  if (message.includes('OUTSIDE_DELIVERY_AREA')) return Error('Địa chỉ nằm ngoài bán kính giao hàng 10 km.');
  if (message.includes('SAME_DAY_DELIVERY_CUTOFF')) return Error('Đã qua 17:00; không thể đặt giao trong hôm nay.');
  if (message.includes('OUTSIDE_DELIVERY_HOURS')) return Error('Giờ giao hàng hợp lệ là 10:00–19:00.');
  if (message.includes('OUTSIDE_STORE_HOURS')) return Error('Cửa hàng hoạt động từ 09:30 đến 20:30.');
  if (message.includes('OUTSIDE_PICKUP_HOURS')) return Error('Giờ nhận tại cửa hàng hợp lệ là 10:00–20:00.');
  if (message.includes('REGULAR_CAKE_REQUIRES_2_HOURS')) return Error('Bánh thường cần đặt trước ít nhất 2 giờ.');
  if (message.includes('STORE_NOT_CONFIGURED') || message.includes('STORE_HOURS_NOT_CONFIGURED')) {
    return Error('Cửa hàng chưa cấu hình giờ nhận bánh trên backend.');
  }
  if (message.includes('PRICE_NOT_CONFIRMED') || message.includes('CUSTOM_PRICE_NOT_CONFIGURED')) {
    return Error('Sản phẩm chưa có giá được xác nhận trên backend.');
  }
  if (message.includes('INSUFFICIENT_POINTS')) {
    return Error('Số điểm khả dụng đã thay đổi. Vui lòng xem lại báo giá và thử lại.');
  }
  if (message.includes('POINTS_CAP_EXCEEDED')) {
    return Error('Số điểm vượt mức tối đa 20% tiền hàng sau khuyến mãi.');
  }
  return error instanceof Error ? error : Error(message || 'Yêu cầu backend thất bại.');
}
