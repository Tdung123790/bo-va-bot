import {register,login,getCurrentMember} from '../services/authService.js';import {safeNext} from '../core/guard.js';import {toast} from '../core/toast.js';
import {isSupabaseMode} from '../core/backend.js';
import {CART_KEY,claimGuestCart,hasLegacyAccountCart,claimLegacyAccountCart,ensureCartReady} from '../services/cartService.js';
import {getJSON} from '../core/storage.js';
if(isSupabaseMode())document.querySelector('.account-warning').hidden=true;
const params=new URLSearchParams(location.search),next=safeNext(params.get('next')),msg=document.getElementById('login-message');msg.textContent=params.get('msg')||params.get('message')||'';let mode='login';const field=document.getElementById('name-field'),form=document.getElementById('account-form');
function setMode(value){mode=value;field.hidden=mode==='login';document.getElementById('tab-login').setAttribute('aria-pressed',String(mode==='login'));document.getElementById('tab-register').setAttribute('aria-pressed',String(mode==='register'));document.getElementById('auth-submit').textContent=mode==='login'?'Đăng nhập':'Tạo tài khoản';document.getElementById('member-password').autocomplete=mode==='login'?'current-password':'new-password';}
document.getElementById('tab-login').addEventListener('click',()=>setMode('login'));document.getElementById('tab-register').addEventListener('click',()=>setMode('register'));
form.addEventListener('submit',async(event)=>{event.preventDefault();const btn=document.getElementById('auth-submit');btn.disabled=true;try{const data={email:document.getElementById('member-email').value,password:document.getElementById('member-password').value,displayName:document.getElementById('member-name').value};const result=await(mode==='login'?login(data):register(data));if(result.confirmationRequired){msg.textContent='Vui lòng xác nhận email rồi đăng nhập. Giỏ hàng khách vẫn được giữ riêng.';return;}
if(result.member?.role==='customer'&&Array.isArray(getJSON(CART_KEY,[]))&&getJSON(CART_KEY,[]).length){
 if(window.confirm('Chuyển giỏ hàng khách trên trình duyệt này vào tài khoản vừa đăng nhập?'))await claimGuestCart();
}
if(result.member?.role==='customer'&&isSupabaseMode()){
 await ensureCartReady();
 if(hasLegacyAccountCart()&&window.confirm('Tài khoản này có giỏ hàng cũ chỉ lưu trên thiết bị này. Nhập vào giỏ đồng bộ Supabase?'))await claimLegacyAccountCart();
}
location.assign(next);}catch(error){msg.textContent=error.message;toast({title:'Không thể xác thực',description:error.message,variant:'destructive'});}finally{btn.disabled=false;}});
if(getCurrentMember())msg.textContent='Bạn đã đăng nhập. Có thể mở trang hồ sơ từ menu.';
