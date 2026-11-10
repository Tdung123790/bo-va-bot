import {getJSON,setJSON} from '../core/storage.js';
import {getCurrentMember} from './authService.js';
import {isSupabaseMode,getSupabaseClient,backendError} from '../core/backend.js';
import {earnedPoints} from './loyaltyMath.js';
export const LOYALTY_KEY='bobot:v1:loyalty',TRANSACTIONS_KEY='bobot:v1:loyaltyTransactions';
function customer(id){const key=id||getCurrentMember()?.contactId;if(!key)throw Error('UNAUTHORIZED');return key;}
function demoGetBalance(id){const key=customer(id),all=getJSON(LOYALTY_KEY,{})||{};return all[key]||{customer_id:key,points:0,total_earned:0,total_redeemed:0,tier:'BRONZE'};}
function demoGetTransactions(id){const key=customer(id);const rows=getJSON(TRANSACTIONS_KEY,[]);return (Array.isArray(rows)?rows:[]).filter(x=>x.customer_id===key);}
function demoEarnForCompletedOrder(order){const key=order.customer_id;if(!key||order.order_status!=='completed'||String(order.payment_status||'').toLowerCase()!=='paid')return {earned:0};const rows=getJSON(TRANSACTIONS_KEY,[])||[];if(rows.some(x=>x.order_id===order._id&&x.transaction_type==='EARN'))return {earned:0,duplicate:true};const points=earnedPoints(order.subtotal,order.discount_amount,order.points_discount);if(points<=0)return {earned:0};const all=getJSON(LOYALTY_KEY,{})||{},balance=all[key]||demoGetBalance(key);all[key]={...balance,points:balance.points+points,total_earned:balance.total_earned+points,updated_at:new Date().toISOString()};const entry={id:crypto.randomUUID(),customer_id:key,order_id:order._id,points,transaction_type:'EARN',description:'Tích điểm đơn '+order.order_code,created_at:new Date().toISOString()};if(!setJSON(TRANSACTIONS_KEY,[...rows,entry]))throw Error('Không lưu được giao dịch điểm');if(!setJSON(LOYALTY_KEY,all)){setJSON(TRANSACTIONS_KEY,rows);throw Error('Không lưu được số dư điểm');}return {earned:points,balance:all[key]};}
function demoRedeem(points,description='Đổi quà'){const key=customer(),amount=Number(points);if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Số điểm không hợp lệ');const all=getJSON(LOYALTY_KEY,{})||{},bal=demoGetBalance(key);if(bal.points<amount)throw Error('Không đủ điểm');const rows=getJSON(TRANSACTIONS_KEY,[])||[];all[key]={...bal,points:bal.points-amount,total_redeemed:bal.total_redeemed+amount};const entry={id:crypto.randomUUID(),customer_id:key,order_id:null,points:-amount,transaction_type:'REDEEM',description,created_at:new Date().toISOString()};if(!setJSON(TRANSACTIONS_KEY,[...rows,entry]))throw Error('Không lưu được giao dịch');if(!setJSON(LOYALTY_KEY,all)){setJSON(TRANSACTIONS_KEY,rows);throw Error('Không lưu được điểm');}return all[key];}
export const loyaltyService={getBalance,getTransactions,earnForCompletedOrder,redeem};
export function getBalance(id){
 if(!isSupabaseMode())return demoGetBalance(id);
 return getBackendBalance(id);
}
async function getBackendBalance(id){
 const key=customer(id),client=await getSupabaseClient();
 const {data,error}=await client.from('loyalty_accounts').select('*').eq('customer_id',key).single();
 if(error)throw backendError(error);return data;
}
export function getTransactions(id){
 if(!isSupabaseMode())return demoGetTransactions(id);
 return getBackendTransactions(id);
}
async function getBackendTransactions(id){
 const key=customer(id),client=await getSupabaseClient();
 const {data,error}=await client.from('loyalty_transactions').select('*').eq('customer_id',key).order('created_at',{ascending:false}).limit(50);
 if(error)throw backendError(error);return data;
}
export function earnForCompletedOrder(order){if(isSupabaseMode())throw Error('Điểm chỉ được ghi bởi backend.');return demoEarnForCompletedOrder(order);}
export function redeem(points,description){if(isSupabaseMode())throw Error('Điểm chỉ được đổi qua backend.');return demoRedeem(points,description);}
