import {getJSON,setJSON,removeKey} from '../core/storage.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
export const USERS_KEY='bobot:v1:users',SESSION_KEY='bobot:v1:session';
const ADMIN_EMAILS=[]; // Chỉ cấp admin thủ công trong dữ liệu demo cục bộ, không mở tự đăng ký admin.
const listeners=new Set();
function clearGuestShoppingState(){removeKey('bobot:v1:guestCart');removeKey('bobot:v1:customCakes');}
const normalize=email=>String(email||'').trim().toLowerCase();
const users=()=>{const value=getJSON(USERS_KEY,[]);return Array.isArray(value)?value:[];};
const publicUser=user=>user?{id:user.id,contactId:user.contactId,email:user.email,displayName:user.displayName,role:user.role||'customer',createdAt:user.createdAt}:null;
async function sha256(password){if(!globalThis.crypto?.subtle)throw Error('Trình duyệt yêu cầu HTTPS hoặc localhost để sử dụng Web Crypto.');const bytes=new TextEncoder().encode(String(password));const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function emit(){const user=getCurrentMember();window.dispatchEvent(new CustomEvent('bobot:auth-change',{detail:{user}}));for(const fn of listeners)try{fn(user);}catch(e){console.error(e);}}
function demoGetCurrentMember(){const session=getJSON(SESSION_KEY,null);if(!session?.contactId)return null;const user=users().find(x=>x.contactId===session.contactId&&x.status!=='blocked');return publicUser(user);}
export function isAdmin(member=getCurrentMember()){return Boolean(member?.contactId&&member.role==='admin');}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
async function demoRegister({email,password,displayName,fullName}={}){const normalized=normalize(email);const name=String(displayName||fullName||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error('Email không hợp lệ');if(String(password||'').length<8)throw Error('Mật khẩu phải có ít nhất 8 ký tự');if(!name)throw Error('Vui lòng nhập họ tên');const list=users();if(list.some(x=>x.email===normalized))throw Error('Email đã được đăng ký');const id=crypto.randomUUID(),entry={id,contactId:id,email:normalized,displayName:name,passwordHash:await sha256(password),role:'customer',status:'active',createdAt:new Date().toISOString()};list.push(entry);if(!setJSON(USERS_KEY,list))throw Error('Không thể lưu tài khoản demo');if(!setJSON(SESSION_KEY,{contactId:id,issuedAt:new Date().toISOString()}))throw Error('Không thể lưu phiên đăng nhập');emit();return {success:true,member:publicUser(entry)};}
async function demoLogin({email,password}={}){const normalized=normalize(email);const hash=await sha256(password);const entry=users().find(x=>x.email===normalized&&x.passwordHash===hash&&x.status!=='blocked');if(!entry)throw Error('Email hoặc mật khẩu không đúng');if(!setJSON(SESSION_KEY,{contactId:entry.contactId,issuedAt:new Date().toISOString()}))throw Error('Không thể lưu phiên đăng nhập');emit();return {success:true,member:publicUser(entry)};}
function demoLogout(){removeKey(SESSION_KEY);clearGuestShoppingState();emit();return {success:true};}
export function seedDemoAdmin({email,password,displayName='Quản trị viên'}={}){throw Error('Không hỗ trợ cấp quyền admin qua giao diện công khai. Chỉ thiết lập role thủ công trong dữ liệu demo trên máy thử nghiệm.');}
let backendMember=null;
async function loadBackendMember(user){
 if(!user){backendMember=null;emit();return null;}
 const client=await getSupabaseClient();
 const {data,error}=await client.from('profiles').select('id,role,status,full_name,created_at').eq('id',user.id).single();
 if(error)throw backendError(error);
 backendMember=data.status==='active'?{id:data.id,contactId:data.id,email:user.email,displayName:data.full_name||user.email,role:data.role,status:data.status,createdAt:data.created_at}:null;
 emit();return backendMember;
}
if(isSupabaseMode()){
 const client=await getSupabaseClient();
 const {data,error}=await client.auth.getUser();
 if(error&&error.name!=='AuthSessionMissingError')console.error('Supabase Auth:',backendError(error));
 if(data?.user)await loadBackendMember(data.user).catch(error=>console.error('Auth profile:',error));
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')clearGuestShoppingState();queueMicrotask(()=>loadBackendMember(session?.user).catch(error=>console.error('Auth profile:',error)));});
}
export function getCurrentMember(){return isSupabaseMode()?backendMember:demoGetCurrentMember();}
export async function register({email,password,displayName,fullName}={}){
 if(!isSupabaseMode())return demoRegister({email,password,displayName,fullName});
 const name=String(displayName||fullName||'').trim();if(!name)throw Error('Vui lòng nhập họ tên');
 const client=await getSupabaseClient();
 const {data,error}=await client.auth.signUp({email:normalize(email),password,options:{data:{full_name:name}}});
 if(error)throw backendError(error);
 if(data.session)await loadBackendMember(data.user);
 return {success:true,member:backendMember,confirmationRequired:!data.session};
}
export async function login({email,password}={}){
 if(!isSupabaseMode())return demoLogin({email,password});
 const client=await getSupabaseClient();
 const {data,error}=await client.auth.signInWithPassword({email:normalize(email),password});
 if(error)throw backendError(error);
 const member=await loadBackendMember(data.user);
 if(!member){await client.auth.signOut();throw Error('Tài khoản đã bị khóa hoặc hồ sơ chưa sẵn sàng.');}
 return {success:true,member};
}
export async function logout(){
 if(!isSupabaseMode())return demoLogout();
 const client=await getSupabaseClient();const {error}=await client.auth.signOut();
 if(error)throw backendError(error);
 clearGuestShoppingState();
 backendMember=null;emit();return {success:true};
}
export const authService={register,login,logout,getCurrentMember,isAdmin,subscribe};