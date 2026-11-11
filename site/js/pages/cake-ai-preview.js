import {loginUrl} from '../core/guard.js';
import {getCurrentMember} from '../services/authService.js';

import {isSupabaseMode,getSupabaseClient,getBackendUrl,getBackendPublishableKey} from '../core/backend.js';

const preview = document.querySelector('.custom-preview__image');
const image = document.getElementById('cake-image');
const button = document.getElementById('cake-generate');
const status = document.getElementById('cake-ai-status');
const form = document.getElementById('custom-form');
let revision = 0;
let busy = false;

function invalidate() {
  revision += 1;
  image.hidden = true;
  image.removeAttribute('src');
  preview.classList.remove('ai-ready');
  status.textContent = 'Thiết kế đã thay đổi. Nhấn tạo ảnh để xem bản mới.';
}

function chosen(name) {
  const input = form.querySelector(`input[name="${name}"]:checked`);
  return input?.closest('label')?.querySelector('strong')?.textContent?.trim() || '';
}

function design() {
  const color = form.querySelector('input[name="color"]:checked');
  const font = document.getElementById('cake-font');

  return {
    size: chosen('sizeId'),
    flavor: chosen('flavorId'),
    cream: chosen('creamId'),
    color: color?.closest('label')?.title || '',
    font: font.selectedOptions[0]?.textContent?.trim() || '',
    text: document.getElementById('cake-text').value.trim()
  };
}

function refreshGenerateAccess() {
  const member = getCurrentMember();
  if (!button || !status) return;
  button.disabled = busy || Boolean(member && (member.role !== 'customer' || member.status !== 'active'));
  if (!busy) button.textContent = !member ? 'Đăng nhập để tạo ảnh bằng AI' : member.role === 'customer' && member.status === 'active' ? 'Tạo ảnh xem trước bằng AI' : 'Chỉ tài khoản khách hàng được tạo ảnh';
  if (!member) status.textContent = 'Đăng nhập tài khoản khách hàng để sử dụng Gemini AI.';
}

async function generate() {
  if (busy) return;
  const member = getCurrentMember();
  if (!member) {
    location.assign(loginUrl('Vui lòng đăng nhập để tạo ảnh xem trước bằng AI.', 'customize.html'));
    return;
  }
  if (member.role !== 'customer' || member.status !== 'active') {
    status.textContent = 'Chỉ tài khoản khách hàng đang hoạt động được sử dụng Gemini AI.';
    return;
  }


  busy = true;
  button.disabled = true;
  button.textContent = 'Đang tạo ảnh…';
  status.textContent = 'Gemini đang dựng hình chiếc bánh của bạn.';

  const currentRevision = revision;

  try {
    if (!isSupabaseMode()) {
      throw Error('Cần kết nối Supabase để sử dụng AI preview.');
    }

    const client = await getSupabaseClient();
    const {data,error} = await client.auth.getSession();

    if (error || !data.session?.access_token) {
      throw Error('Vui lòng đăng nhập để tạo ảnh.');
    }

    const response = await fetch(
      `${getBackendUrl().replace(/\/$/, '')}/functions/v1/cake-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: getBackendPublishableKey(),
          Authorization: `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify(design())
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (result.error === 'AUTH_REQUIRED') {
        throw Error('Phiên đăng nhập hết hạn.');
      }
      if (result.error === 'ACTIVE_CUSTOMER_REQUIRED') {
        throw Error('Chỉ tài khoản khách hàng đang hoạt động được tạo ảnh bằng AI.');
      }

      if (result.error === 'GEMINI_QUOTA_OR_BILLING') {
        throw Error('Gemini chưa cấp quyền tạo ảnh, hết quota hoặc cần bật billing.');
      }

      throw Error('Không thể tạo ảnh từ Gemini. Hãy kiểm tra API key và thử lại.');
    }

    if (revision !== currentRevision) {
      status.textContent = 'Bạn đã đổi tùy chọn trong lúc tạo ảnh. Hãy tạo lại preview.';
      return;
    }

    if (!/^image\/(png|jpeg|webp)$/.test(result.mimeType) || !result.image) {
      throw Error('Gemini không trả về dữ liệu ảnh hợp lệ.');
    }

    document.getElementById('cake-preview-text').textContent = '';
    image.src = `data:${result.mimeType};base64,${result.image}`;
    image.hidden = false;
    preview.classList.add('ai-ready');

    status.textContent = 'Ảnh AI minh họa. Thành phẩm thực tế có thể khác.';
  } catch (error) {
    status.textContent = error.message || 'Không thể tạo ảnh.';
  } finally {
    busy = false;
    refreshGenerateAccess();
  }
}

form?.addEventListener('input', invalidate);
form?.addEventListener('change', invalidate);
button?.addEventListener('click', generate);

window.addEventListener('bobot:auth-change', refreshGenerateAccess);
refreshGenerateAccess();
