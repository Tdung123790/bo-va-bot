import {getJSON,setJSON,removeKey} from '../core/storage.js';
export const USERS_KEY='bobot:v1:users',SESSION_KEY='bobot:v1:session';
const ADMIN_EMAILS=[]; // Chỉ cấp admin thủ công trong dữ liệu demo cục bộ, không mở tự đăng ký admin.
const listeners=new Set();
const normalize=email=>String(email||'').trim().toLowerCase();
const users=()=>{const value=getJSON(USERS_KEY,[]);return Array.isArray(value)?value:[];};
const publicUser=user=>user?{id:user.id,contactId:user.contactId,email:user.email,displayName:user.displayName,role:user.role||'customer',createdAt:user.createdAt}:null;
async function sha256(password){if(!globalThis.crypto?.subtle)throw Error('Trình duyệt yêu cầu HTTPS hoặc localhost để sử dụng Web Crypto.');const bytes=new TextEncoder().encode(String(password));const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function emit(){const user=getCurrentMember();window.dispatchEvent(new CustomEvent('bobot:auth-change',{detail:{user}}));for(const fn of listeners)try{fn(user);}catch(e){console.error(e);}}
export function getCurrentMember(){const session=getJSON(SESSION_KEY,null);if(!session?.contactId)return null;const user=users().find(x=>x.contactId===session.contactId&&x.status!=='blocked');return publicUser(user);}
export function isAdmin(member=getCurrentMember()){return Boolean(member?.contactId&&member.role==='admin');}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export async function register({email,password,displayName,fullName}={}){const normalized=normalize(email);const name=String(displayName||fullName||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error('Email không hợp lệ');if(String(password||'').length<8)throw Error('Mật khẩu phải có ít nhất 8 ký tự');if(!name)throw Error('Vui lòng nhập họ tên');const list=users();if(list.some(x=>x.email===normalized))throw Error('Email đã được đăng ký');const id=crypto.randomUUID(),entry={id,contactId:id,email:normalized,displayName:name,passwordHash:await sha256(password),role:'customer',status:'active',createdAt:new Date().toISOString()};list.push(entry);if(!setJSON(USERS_KEY,list))throw Error('Không thể lưu tài khoản demo');if(!setJSON(SESSION_KEY,{contactId:id,issuedAt:new Date().toISOString()}))throw Error('Không thể lưu phiên đăng nhập');emit();return {success:true,member:publicUser(entry)};}
export async function login({email,password}={}){const normalized=normalize(email);const hash=await sha256(password);const entry=users().find(x=>x.email===normalized&&x.passwordHash===hash&&x.status!=='blocked');if(!entry)throw Error('Email hoặc mật khẩu không đúng');if(!setJSON(SESSION_KEY,{contactId:entry.contactId,issuedAt:new Date().toISOString()}))throw Error('Không thể lưu phiên đăng nhập');emit();return {success:true,member:publicUser(entry)};}
export function logout(){removeKey(SESSION_KEY);emit();return {success:true};}
export function seedDemoAdmin({email,password,displayName='Quản trị viên'}={}){throw Error('Không hỗ trợ cấp quyền admin qua giao diện công khai. Chỉ thiết lập role thủ công trong dữ liệu demo trên máy thử nghiệm.');}
export const authService={register,login,logout,getCurrentMember,isAdmin,subscribe};
