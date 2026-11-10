import {getCurrentMember} from '../services/authService.js';
import {getDashboardData,getChurnResearch} from '../services/dashboardService.js';
import {formatVND,formatDate} from '../core/format.js';

const $=selector=>document.querySelector(selector);
const node=(tag,text,className)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(className)result.className=className;return result;};
let churnImageUrls=[];
const today=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${value.year}-${value.month}-${value.day}`;
};
const isoAdd=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const current=today();
$('#dashboard-to').value=current;
$('#dashboard-from').value=isoAdd(current,-13);
const member=getCurrentMember();
if(member?.role!=='admin'||member?.status!=='active')$('#dashboard-permission').textContent='Chỉ Admin đang hoạt động được xem Manager Dashboard.';
else{$('#dashboard-app').hidden=false;load();loadChurn();}

function metric(label,value){
 const box=node('div',undefined,'dashboard-kpi');box.append(node('span',label),node('strong',value));return box;
}
function table(headers,rows){
 const result=node('table',undefined,'dashboard-list'),thead=node('thead'),tr=node('tr');
 for(const label of headers)tr.append(node('th',label));thead.append(tr);result.append(thead);
 const body=node('tbody');
 for(const row of rows){const line=node('tr');for(const value of row)line.append(node('td',String(value)));body.append(line);}
 result.append(body);return result;
}
function riskChart(counts,total){
 const chart=node('div',undefined,'dashboard-churn-bars');
 chart.setAttribute('aria-hidden','true');
 for(const level of ['LOW','MEDIUM','HIGH']){
  const row=node('div',undefined,'dashboard-churn-bar-row');
  const track=node('div',undefined,'dashboard-churn-bar-track');
  const fill=node('div',undefined,'dashboard-churn-bar-fill');
  fill.style.width=`${(counts[level]/total*100).toFixed(2)}%`;
  track.append(fill);
  row.append(node('span',level),track,node('strong',Number(counts[level]).toLocaleString('vi-VN')));
  chart.append(row);
 }
 return chart;
}
function clearChurn(){
 for(const url of churnImageUrls)URL.revokeObjectURL(url);
 churnImageUrls=[];
 $('#dashboard-churn-evaluation').removeAttribute('src');
 $('#dashboard-churn-importance').removeAttribute('src');
 $('#dashboard-churn-content').hidden=true;
}
async function loadChurn(){
 const status=$('#dashboard-churn-status');
 status.textContent='Đang tải kết quả nghiên cứu...';
 clearChurn();
 try{
  const {summary,evaluation,importance}=await getChurnResearch();
  if(getCurrentMember()?.role!=='admin')return;
  const labels={ROC_AUC:'ROC-AUC',Accuracy:'Accuracy',Precision:'Precision',Recall:'Recall',F1:'F1',PR_AUC:'PR-AUC'};
  const metrics=Object.entries(labels).map(([key,label])=>{
   const value=Number(summary.metrics[key]);
   if(!Number.isFinite(value)||value<0||value>1)throw Error('Chỉ số Churn không hợp lệ.');
   return metric(label,`${(value*100).toLocaleString('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2})}%`);
  });
  $('#dashboard-churn-metrics').replaceChildren(...metrics);
  const risk=$('#dashboard-churn-risk');
  risk.replaceChildren(node('h3','Phân bố mức nguy cơ · 8.500 khách giả lập'),riskChart(summary.risk_counts,summary.sample_size),table(['Mức','Số khách'],[
   ['LOW · ≤ 0,30',Number(summary.risk_counts.LOW).toLocaleString('vi-VN')],
   ['MEDIUM · > 0,30 đến 0,65',Number(summary.risk_counts.MEDIUM).toLocaleString('vi-VN')],
   ['HIGH · > 0,65',Number(summary.risk_counts.HIGH).toLocaleString('vi-VN')]
  ]));
  churnImageUrls=[URL.createObjectURL(evaluation),URL.createObjectURL(importance)];
  $('#dashboard-churn-evaluation').src=churnImageUrls[0];
  $('#dashboard-churn-importance').src=churnImageUrls[1];
  $('#dashboard-churn-source').textContent=`Nguồn: kết quả nhóm nghiên cứu · HistGradientBoostingClassifier · snapshot ${summary.as_of_date} · thời hạn dự đoán ${summary.horizon_days} ngày. Chỉ số đánh giá từ tập test giả lập; phân bố 8.500 gồm cả tập huấn luyện. Chưa dùng cho khách hàng vận hành.`;
  $('#dashboard-churn-content').hidden=false;
  status.textContent='Đã tải kết quả nghiên cứu Churn.';
 }catch(error){clearChurn();status.textContent='Không tải được kết quả Churn theo quyền Admin: '+error.message;}
}
window.addEventListener('bobot:auth-change',event=>{
 if(event.detail?.user?.role==='admin'&&event.detail.user.status==='active')return;
 clearChurn();
 $('#dashboard-app').hidden=true;
 $('#dashboard-permission').textContent='Chỉ Admin đang hoạt động được xem Manager Dashboard.';
});
window.addEventListener('pagehide',clearChurn);
function render(data,from,to,channel){
 const summary=data.snapshot.summary;
 const revenue=Number(summary.product_revenue),online=Number(summary.online_revenue),offline=Number(summary.offline_revenue);
 if(online+offline!==revenue)throw Error('Số liệu kênh bán không khớp tổng doanh thu.');
 $('#dashboard-kpis').replaceChildren(
  metric('Doanh thu sản phẩm Online',formatVND(online)),
  metric('Doanh thu sản phẩm Offline',formatVND(offline)),
  metric('Tổng doanh thu sản phẩm',formatVND(revenue)),
  metric('Phí giao thu ròng',formatVND(Number(summary.shipping_collected)-Number(summary.shipping_refunded))),
  metric('Đơn tạo trong kỳ',String(summary.total_orders)),
  metric('Đơn hoàn tất / hủy',`${summary.completed_orders} / ${summary.cancelled_orders}`),
  metric('AOV sản phẩm · completed + paid',formatVND(summary.average_product_order_value)),
  metric('Khách mới / quay lại',`${summary.new_customers} / ${summary.returning_customers}`)
 );
 const daily=new Map();
 for(const row of data.snapshot.daily||[]){
  const entry=daily.get(row.day)||{online:0,offline:0};
  entry[row.sales_channel]=Number(row.net_product_revenue);daily.set(row.day,entry);
 }
 const keys=[];for(let date=from;date<=to;date=isoAdd(date,1))keys.push(date);
 const amountFor=date=>channel==='all'?(daily.get(date)?.online||0)+(daily.get(date)?.offline||0):daily.get(date)?.[channel]||0;
 const max=Math.max(1,...keys.map(amountFor));
 const chart=$('#dashboard-chart');chart.replaceChildren();
 if(!keys.some(date=>amountFor(date)>0)){chart.append(node('p','Chưa có doanh thu completed + paid trong khoảng đã chọn.'));}
 else for(const date of keys){
  const values=daily.get(date)||{online:0,offline:0};
  const day=node('div',undefined,'dashboard-day'),bars=node('div',undefined,'dashboard-day-bars');
  for(const item of ['online','offline']){
   if(channel!=='all'&&channel!==item)continue;
   const bar=node('div',undefined,'dashboard-day-bar'+(item==='offline'?' dashboard-day-bar--offline':''));
   bar.style.height=Math.round(144*values[item]/max)+'px';
   bar.title=`${date} · ${item==='online'?'Online':'Tại quầy'}: ${formatVND(values[item])}`;
   bars.append(bar);
  }
  day.append(bars,node('span',date.slice(5)));chart.append(day);
 }
 chart.setAttribute('aria-label',`Biểu đồ doanh thu sản phẩm từ ${from} đến ${to}, kênh ${channel}`);
 $('#dashboard-channels').replaceChildren(table(['Kênh','Doanh thu sản phẩm'],[['Online',formatVND(online)],['Tại quầy',formatVND(offline)],['Tổng',formatVND(revenue)]]));
 const top=data.snapshot.top_products||[];
 $('#dashboard-products').replaceChildren(top.length?table(['Bánh · số lượng','Doanh thu phân bổ'],top.map(row=>[`${row.name} · ${row.quantity}`,formatVND(row.product_revenue)])):node('p','Chưa có sản phẩm đã bán và thanh toán.'));
 $('#dashboard-stock').replaceChildren(data.stock.length?table(['Sản phẩm','Tồn hiện tại'],data.stock.map(row=>[row.name,String(row.stock_quantity)])):node('p','Chưa có catalog hoạt động.'));
 $('#dashboard-pending').replaceChildren(data.pending.length?table(['Đơn · kênh','Tổng'],data.pending.map(row=>[`${row.order_code} · ${row.sales_channel} · ${formatDate(row.created_at)}`,formatVND(row.total_amount)])):node('p','Không có đơn đang chờ.'));
}

async function load(){
 const from=$('#dashboard-from').value,to=$('#dashboard-to').value,channel=$('#dashboard-channel').value;
 $('#dashboard-error').textContent='';
 if(!from||!to||from>to||Date.parse(to)-Date.parse(from)>366*86400000){$('#dashboard-error').textContent='Chọn khoảng ngày hợp lệ, tối đa 366 ngày.';return;}
 const button=$('#dashboard-filter button');button.disabled=true;
 $('#dashboard-status').textContent='Đang tải số liệu từ Supabase...';
 try{const data=await getDashboardData(from,to,channel);render(data,from,to,channel);$('#dashboard-status').textContent='Đã cập nhật số liệu từ Supabase.';}
 catch(error){$('#dashboard-error').textContent='Không tải được Dashboard: '+error.message+' Bấm Cập nhật để thử lại.';$('#dashboard-status').textContent='Nếu đang có số liệu trên màn hình, đó là kết quả của lần tải trước.';}
 finally{button.disabled=false;}
}
$('#dashboard-filter').addEventListener('submit',event=>{event.preventDefault();load();});
