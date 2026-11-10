import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openZip,readCsv} from './data-utils.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=path.join(root,'research/input');
const zip=await openZip(path.join(input,'Bo_Bot_data.zip'));
const mapping=JSON.parse(await fs.readFile(path.join(input,'ML_CATALOG_MAPPING_VERIFIED.json'),'utf8'));
const holdout=JSON.parse(await fs.readFile(path.join(input,'CHURN_HOLDOUT_SYNTHETIC.json'),'utf8'));
const siteProducts=JSON.parse(await fs.readFile(path.join(root,'site/data/products.json'),'utf8'));
const siteVariants=JSON.parse(await fs.readFile(path.join(root,'site/data/product-variants.json'),'utf8'));
const cakeOptions=JSON.parse(await fs.readFile(path.join(root,'site/data/cake-options.json'),'utf8'));
const pk={auth_users:['id'],user_profile:['user_id'],role:['role_id'],user_role:['user_id','role_id'],category:['category_id'],product:['product_id'],product_variant:['variant_id'],customization_category:['customization_category_id'],customization_option:['option_id'],product_customization_category:['product_id','customization_category_id'],cart:['cart_id'],cart_item:['cart_item_id'],wishlist_item:['customer_id','product_id'],orders:['order_id'],order_item:['order_item_id'],order_status_history:['history_id'],payment:['payment_id'],order_cancellation_request:['request_id'],refund:['refund_id'],promotion:['promotion_id'],promotion_product:['promotion_id','product_id'],promotion_category:['promotion_id','category_id'],loyalty_account:['customer_id'],loyalty_transaction:['transaction_id'],review:['review_id'],daily_analytics:['analytics_id'],customer_ml_feature:['feature_id'],churn_prediction:['prediction_id'],recommendation_log:['recommendation_id'],admin_audit_log:['log_id'],ml_churn_training_asof_2026_07_01:['customer_id'],recommendation_holdout_2026_07_01:['customer_id'],staff_fixed_5_accounts:['user_id']};
const basename=name=>path.basename(name,'.csv');
const csvNames=[...zip.entries.keys()].filter(name=>name.endsWith('.csv'));
const ids=new Map(),counts={},pkErrors=[];
const orders=new Map(),products=new Map(),variants=new Map();
let syntheticReviews=0,pointRatioOld=0,posPickup=0,refundCompleted=0,refundMissingPaid=0;
const refunds=[];
for(const name of csvNames){
 const table=basename(name),columns=pk[table];
 const keys=new Set();
 const result=readCsv(zip,name,row=>{
  if(columns){
   const values=columns.map(column=>row[column]);
   if(values.some(value=>value===undefined||value===''))pkErrors.push(`${name}:empty_pk`);
   const key=JSON.stringify(values);
   if(keys.has(key))pkErrors.push(`${name}:duplicate_pk`);
   keys.add(key);
  }
  if(table==='orders'){
   orders.set(row.order_id,{customerId:row.customer_id,status:row.order_status,paymentStatus:row.payment_status});
   if(Number(row.points_used)>0&&Number(row.points_discount)/Number(row.points_used)===1000)pointRatioOld++;
   if(row.sales_channel==='POS'&&row.fulfillment_method==='PICKUP')posPickup++;
  }
  if(table==='product')products.set(row.product_id,row);
  if(table==='product_variant')variants.set(row.variant_id,row);
  if(table==='review'&&row.content==='Danh gia mo phong')syntheticReviews++;
  if(table==='refund')refunds.push(row);
 });
 counts[table]=result.count;
 ids.set(table,keys);
}
assert.equal(zip.entries.size,38,'ZIP_ENTRY_COUNT_CHANGED');
assert.equal(pkErrors.length,0,`PK_ERRORS: ${pkErrors.slice(0,5).join(',')}`);
const fk={user_profile:[['user_id','auth_users']],user_role:[['user_id','auth_users'],['role_id','role']],product:[['category_id','category']],product_variant:[['product_id','product']],customization_option:[['customization_category_id','customization_category']],product_customization_category:[['product_id','product'],['customization_category_id','customization_category']],cart:[['customer_id','auth_users']],cart_item:[['cart_id','cart'],['product_id','product'],['variant_id','product_variant']],wishlist_item:[['customer_id','auth_users'],['product_id','product']],orders:[['customer_id','auth_users'],['created_by','auth_users']],order_item:[['order_id','orders'],['product_id','product'],['variant_id','product_variant']],order_status_history:[['order_id','orders'],['changed_by','auth_users']],payment:[['order_id','orders'],['verified_by','auth_users']],order_cancellation_request:[['order_id','orders'],['requested_by','auth_users'],['reviewed_by','auth_users']],refund:[['order_id','orders'],['transferred_by','auth_users']],promotion_product:[['promotion_id','promotion'],['product_id','product']],promotion_category:[['promotion_id','promotion'],['category_id','category']],loyalty_account:[['customer_id','auth_users']],loyalty_transaction:[['customer_id','auth_users'],['order_id','orders']],review:[['customer_id','auth_users'],['product_id','product'],['order_item_id','order_item']],customer_ml_feature:[['customer_id','auth_users']],churn_prediction:[['customer_id','auth_users']],recommendation_log:[['customer_id','auth_users'],['product_id','product']],admin_audit_log:[['actor_id','auth_users']],staff_fixed_5_accounts:[['user_id','auth_users']]};
const fkIssues={};
for(const name of csvNames){
 const table=basename(name),relations=fk[table];
 if(!relations)continue;
 readCsv(zip,name,row=>{
  for(const [column,target] of relations){
   const value=row[column];
   if(value&&!(ids.get(target)?.has(JSON.stringify([value])))){
    const key=`${table}.${column}->${target}`;
    fkIssues[key]=(fkIssues[key]||0)+1;
   }
  }
 });
}
assert.deepEqual(fkIssues,{},'FK_ORPHANS_FOUND');
const mappedProducts=new Map(mapping.products.map(item=>[String(item.synthetic_product_id),item]));
const mappedVariants=new Map(mapping.variants.map(item=>[String(item.synthetic_variant_id),item]));
const siteProductById=new Map(siteProducts.map(item=>[item.id,item]));
const siteVariantById=new Map(siteVariants.map(item=>[String(item.id),item]));
let productMatches=0,variantMatches=0;
for(const [id,row] of products){
 const item=mappedProducts.get(id),site=siteProductById.get(item?.site_product_id);
 if(item&&site&&row.name===item.name&&row.name===site.name&&Number(row.base_price)*1000===item.price_vnd&&item.price_vnd===site.price)productMatches++;
}
for(const [id,row] of variants){
 const item=mappedVariants.get(id),site=siteVariantById.get(String(item?.site_variant_id));
 if(item&&site&&String(row.product_id)===String(item.synthetic_product_id)&&row.name===site.name&&row.name===item.name&&Number(row.price_modifier)*1000===item.price_modifier_vnd&&item.price_modifier_vnd===site.priceModifier&&site.legacyId===item.site_variant_legacy_id)variantMatches++;
}
assert.equal(productMatches,62,'PRODUCT_CROSSWALK_MISMATCH');
assert.equal(variantMatches,186,'VARIANT_CROSSWALK_MISMATCH');
assert.equal(mapping.verification.is_verified_against_live_supabase,false);
assert.equal(holdout.predictions.length,2125);
for(const refund of refunds){
 if(refund.status==='COMPLETED'){
  refundCompleted++;
  const order=orders.get(refund.order_id);
  if(order?.status==='CANCELLED'&&order.paymentStatus==='PENDING')refundMissingPaid++;
 }
}
const summary=JSON.parse(zip.read('DATASET_SUMMARY.json').toString('utf8'));
const summaryMismatch=Object.entries(summary).filter(([name,value])=>name in counts&&value!==counts[name]).map(([name,value])=>({table:name,summary:value,actual:counts[name]}));
const optionCount=Object.values(cakeOptions).filter(Array.isArray).reduce((sum,items)=>sum+items.length,0);
let holdoutInvalidProduct=0;
readCsv(zip,'recommendation_holdout_2026_07_01.csv',row=>{
 for(const column of ['history_product_ids','future_product_ids'])for(const id of row[column].split('|').filter(Boolean))if(!products.has(id))holdoutInvalidProduct++;
});
const report={classification:'SYNTHETIC_RESEARCH_ONLY',source:'research/input/Bo_Bot_data.zip',mapping:'research/input/ML_CATALOG_MAPPING_VERIFIED.json',mappingExpectedNameMissing:!(await fs.stat(path.join(input,'BoBot_ML_CATALOG_MAPPING_VERIFIED.json')).then(()=>true).catch(()=>false)),zipEntries:zip.entries.size,csvCounts:counts,pkErrors:pkErrors.length,fkIssues,productMatches,variantMatches,siteProductCount:siteProducts.length,siteUnmappedCount:siteProducts.length-productMatches,customOptionsCsv:counts.customization_option,customOptionsSite:optionCount,refundCompleted,refundMissingPaid,oldPointRatioOrders:pointRatioOld,posPickup,syntheticReviews,holdoutInvalidProduct,summaryMismatch,liveDatabaseChecked:false};
assert.equal(report.customOptionsCsv,13);
assert.equal(report.customOptionsSite,16);
assert.equal(report.refundMissingPaid,567);
assert.equal(report.oldPointRatioOrders,12360);
assert.equal(report.syntheticReviews,25303);
assert.equal(report.holdoutInvalidProduct,0);
await fs.mkdir(path.join(root,'research/output'),{recursive:true});
await fs.writeFile(path.join(root,'research/output/dataset-audit.synthetic.json'),JSON.stringify(report,null,2)+'\n');
const markdown=`# Bơ & Bột — kiểm chứng dataset synthetic\n\nNgày chạy: ${new Date().toISOString()}\n\nNguồn: \`research/input/Bo_Bot_data.zip\`. Chỉ nghiên cứu, không import vào Supabase hoặc website công khai. Không kiểm PostgreSQL LOCAL.\n\n- ZIP ${report.zipEntries} mục; ${csvNames.length} CSV. PK trùng/rỗng: ${report.pkErrors}; FK mồ côi trong các quan hệ kiểm tra: ${Object.values(report.fkIssues).reduce((a,b)=>a+b,0)}.\n- Catalog: ${report.productMatches}/62 product và ${report.variantMatches}/186 variant khớp mapping, tên và giá sau quy đổi ×1.000 VND. Site có ${report.siteProductCount} hàng, ${report.siteUnmappedCount} hàng ngoài crosswalk (gồm bánh tùy chỉnh và hai hàng thiếu thông tin). Mapping chưa xác minh với Supabase LIVE.\n- Custom options: CSV ${report.customOptionsCsv}, frontend ${report.customOptionsSite}; không thay customizer.\n- Refund COMPLETED ${report.refundCompleted}; ${report.refundMissingPaid} gắn đơn CANCELLED/PENDING, thiếu paid source. Không dùng làm chứng từ.\n- ${report.oldPointRatioOrders} đơn có tỷ lệ cũ 1.000 VND/điểm, sai FINAL 10 VND/điểm; không import/sửa lịch sử.\n- ${report.syntheticReviews} review cùng nội dung mô phỏng; holdout có ${report.holdoutInvalidProduct} product ID ngoài catalog. ${report.posPickup} đơn POS mang pickup cũ.\n- DATASET_SUMMARY.json có ${report.summaryMismatch.length} tổng lệch CSV bản điều chỉnh: ${report.summaryMismatch.map(item=>`${item.table} ${item.summary}→${item.actual}`).join('; ')}.\n- File tên chính xác \`BoBot_ML_CATALOG_MAPPING_VERIFIED.json\`: ${report.mappingExpectedNameMissing?'không có':'có'}. Đã dùng \`ML_CATALOG_MAPPING_VERIFIED.json\` do nội dung nêu cùng ZIP, snapshot và có 62/186 mapping đối chiếu được.\n\nChi tiết số dòng không chứa PII nằm ở \`research/output/dataset-audit.synthetic.json\`.\n`;
await fs.writeFile(path.join(root,'research/docs/DATASET_VALIDATION_REPORT.md'),markdown);
console.log(`PASS synthetic dataset audit: ${zip.entries.size} entries, ${productMatches} products, ${variantMatches} variants, ${refundMissingPaid} invalid refund sources, ${pointRatioOld} old point-ratio orders`);
