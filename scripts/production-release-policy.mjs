export function validateEnvironmentSeparation(config){
 const staging=config?.staging,production=config?.production;
 if(!staging||!production||staging.allowsTestFixtures!==true||staging.acceptsRealOrders!==false||production.allowsTestFixtures!==false||production.acceptsRealOrders!==true)throw Error('STAGING_PRODUCTION_POLICY_INVALID');
 if(!staging.supabaseProjectUrl||!production.supabaseProjectUrl||!staging.siteOrigin||!production.siteOrigin)throw Error('STAGING_PRODUCTION_ENDPOINTS_NOT_CONFIGURED');
 const endpoints=[staging.supabaseProjectUrl,production.supabaseProjectUrl,staging.siteOrigin,production.siteOrigin].map(value=>new URL(value));
 if(endpoints.some(url=>url.protocol!=='https:'||url.hostname==='localhost'||url.hostname==='127.0.0.1'))throw Error('CLOUD_ENDPOINT_HTTPS_REQUIRED');
 if(endpoints[0].origin===endpoints[1].origin||endpoints[2].origin===endpoints[3].origin)throw Error('STAGING_PRODUCTION_NOT_ISOLATED');
 return true;
}

export function validateProductionPromotions(activePromotions,manifest){
 if(manifest?.environment!=='production'||!Array.isArray(manifest.approvedPromotions))throw Error('PRODUCTION_PROMOTION_MANIFEST_INVALID');
 const approved=new Map();
 for(const row of manifest.approvedPromotions){
  if(!row.id||!row.sourceId||!row.approvalReference||!row.approvedBy||!Number.isFinite(Date.parse(row.approvedAt))||/\b(TEST|DEMO)\b/i.test(`${row.approvalReference} ${row.approvedBy} ${row.name||''}`)||approved.has(row.id))throw Error('PROMOTION_APPROVAL_INVALID');
  approved.set(row.id,row);
 }
 for(const row of activePromotions){
  if(/\b(TEST|DEMO)\b/i.test(`${row.name||''} ${row.source_id||''}`)||!approved.has(row.id))throw Error('UNAPPROVED_OR_DEMO_PROMOTION_ACTIVE');
  const approval=approved.get(row.id);
  if(row.source_id!==approval.sourceId||row.name!==approval.name||row.description!==approval.description||row.discount_type!==approval.discountType||Number(row.discount_value)!==approval.discountValue||Number(row.min_order_value)!==approval.minOrderValue||Number(row.max_discount)!==approval.maxDiscount||row.target_type!==approval.targetType||row.target_product_id!==null||row.target_category_id!==null||row.voucher_code!==approval.voucherCode||row.usage_limit!==approval.usageLimit||row.usage_per_customer!==approval.usagePerCustomer||Date.parse(row.starts_at)!==Date.parse(approval.startsAt)||Date.parse(row.ends_at)!==Date.parse(approval.endsAt))throw Error('APPROVED_PROMOTION_TERMS_MISMATCH');
 }
 return {active:activePromotions.length,approved:approved.size};
}
