import {getCurrentMember} from './authService.js';
import {isSupabaseMode,getSupabaseClient,getBackendUrl,getBackendPublishableKey,backendError} from '../core/backend.js';

export async function getDashboardData(from,to,channel='all'){
 const member=getCurrentMember();
 if(!isSupabaseMode()||member?.role!=='admin'||member?.status==='blocked')throw Error('Chỉ Admin đang hoạt động được xem Dashboard.');
 const client=await getSupabaseClient();
 const [snapshot,stock,pending]=await Promise.all([
  client.rpc('admin_dashboard',{p_from:from,p_to:to,p_channel:channel}),
  client.from('products').select('id,source_id,name,stock_quantity,status').eq('status','active').order('stock_quantity',{ascending:true}).limit(20),
  client.from('orders').select('id,order_code,sales_channel,order_status,created_at,total_amount').in('order_status',['pending','confirmed','preparing','shipping']).order('created_at',{ascending:true}).limit(20)
 ]);
 for(const result of [snapshot,stock,pending])if(result.error)throw backendError(result.error);
 return {snapshot:snapshot.data,stock:stock.data||[],pending:pending.data||[]};
}

export async function getChurnResearch(){
 const member=getCurrentMember();
 if(!isSupabaseMode()||member?.role!=='admin'||member?.status!=='active')throw Error('Chỉ Admin đang hoạt động được xem nghiên cứu Churn.');
 const client=await getSupabaseClient();
 const request=async asset=>{
  const {data,error}=await client.functions.invoke('churn-research',{body:{asset}});
  if(error)throw backendError(error);
  return data;
 };
 const summary=await request('summary');
 const counts=summary?.risk_counts;
 if(summary?.sample_size!==8500||!summary.metrics||!counts||!['LOW','MEDIUM','HIGH'].every(key=>Number.isSafeInteger(counts[key])&&counts[key]>=0)||counts.LOW+counts.MEDIUM+counts.HIGH!==8500)throw Error('Kết quả nghiên cứu Churn không hợp lệ.');
 const {data:session,error:sessionError}=await client.auth.getSession();
 if(sessionError||!session.session?.access_token)throw backendError(sessionError||Error('Phiên đăng nhập đã hết hạn.'));
 const image=async asset=>{
  const response=await fetch(getBackendUrl()+'/functions/v1/churn-research',{
   method:'POST',headers:{apikey:getBackendPublishableKey(),Authorization:'Bearer '+session.session.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({asset}),cache:'no-store'
  });
  if(!response.ok)throw Error('Không tải được biểu đồ Churn theo quyền Admin.');
  return response.blob();
 };
 const [evaluation,importance]=await Promise.all([image('evaluation'),image('importance')]);
 if(!(evaluation instanceof Blob)||!(importance instanceof Blob)||evaluation.type!=='image/png'||importance.type!=='image/png')throw Error('Biểu đồ Churn không hợp lệ.');
 return {summary,evaluation,importance};
}
