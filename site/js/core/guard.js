import {toast} from './toast.js';
import {getCurrentMember,isAdmin} from '../services/authService.js';
export function getCurrentUser(){return getCurrentMember();}
export function loginUrl(message='Bạn vui lòng đăng nhập để tiếp tục nhé!',next=location.pathname.split('/').pop()+location.search){const params=new URLSearchParams({next,message,msg:message});return 'login.html?'+params.toString();}
export function requireLogin({message='Bạn vui lòng đăng nhập để tiếp tục nhé!',redirect=true}={}){const user=getCurrentMember();if(user)return user;toast({title:'Yêu cầu đăng nhập',description:message,variant:'destructive'});if(redirect)location.assign(loginUrl(message));return null;}
export function requireAdmin({redirect=true}={}){const user=requireLogin({message:'Vui lòng đăng nhập để vào trang quản trị.',redirect});if(!user)return null;if(!isAdmin(user)){toast({title:'Truy cập bị từ chối',description:'Bạn không có quyền quản trị.',variant:'destructive'});return null;}return user;}
export function safeNext(raw){if(!raw)return 'index.html';try{const u=new URL(raw,location.href);if(u.origin!==location.origin||/\/\/|\\/.test(raw)||u.pathname.endsWith('/login.html'))return 'index.html';return u.pathname.split('/').pop()+u.search+u.hash;}catch{return 'index.html';}}
