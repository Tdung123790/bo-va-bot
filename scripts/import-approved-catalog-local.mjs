import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { localDbPassword } from './local-db-password.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const arg=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const fixtureMode=flag('--test-fixture');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const sourceProducts=await read(path.join(root,'site/data/products.json'));
const sourceCategories=await read(path.join(root,'site/data/categories.json'));
const sourceCake=await read(path.join(root,'site/data/cake-options.json'));
const catalog=await read(path.resolve(arg('--catalog')||path.join(root,'reference/production/catalog-approval.json')));
const customization=await read(path.resolve(arg('--options')||path.join(root,'reference/production/customization-approval.json')));
const customCategorySourceId='FINAL_V2_CUSTOM_CAKE';
const sourceProductMap=new Map(sourceProducts.map(row=>[row.id,row]));
const sourceCategoryMap=new Map(sourceCategories.map(row=>[row.id,row]));
const catalogCategoryMap=new Map(catalog.categories.map(row=>[row.sourceId,row]));
const roles={size:'sizes',flavor:'flavors',cream:'creams',font:'fonts',color:'textColors'};
const sourceOptions=new Map(Object.entries(roles).flatMap(([role,bucket])=>sourceCake[bucket].map(row=>[`${role}/${row.id}`,row])));
const cleanText=value=>typeof value==='string'&&value.trim().length>0&&!/\b(TEST|DEMO)\b/i.test(value);
const evidence=value=>fixtureMode?typeof value==='string'&&value.trim().length>0:cleanText(value);
const approval=row=>evidence(row.approvalReference)&&evidence(row.approvedBy)&&Number.isFinite(Date.parse(row.approvedAt));
const money=value=>Number.isSafeInteger(value)&&value>=0;
const unique=(rows,key)=>assert.equal(new Set(rows.map(key)).size,rows.length,'Duplicate identity in approval manifest');
const expectedEnvironment=fixtureMode?'staging':'production';
if(catalog.environment!==expectedEnvironment||customization.environment!==expectedEnvironment)throw Error('Môi trường manifest không khớp chế độ import; không trộn TEST/staging với production.');
if(sourceProducts.length!==65||sourceCategories.length!==7||sourceProductMap.size!==65||sourceCategoryMap.size!==7||catalog.sourceInventory?.productCount!==65||catalog.sourceInventory?.categoryCount!==7||catalog.products?.length!==63||catalog.categories?.length!==8||catalog.excludedSourceProducts?.length!==2||customization.options?.length!==16)throw Error('Source inventory 65/7 hoặc catalog FINAL 63/8/16 không khớp.');
unique(catalog.products,row=>row.sourceId);unique(customization.options,row=>`${row.categorySourceKey}/${row.sourceKey}`);
unique(catalog.categories,row=>row.sourceId);
unique(catalog.excludedSourceProducts,row=>row.sourceId);
if(catalog.categories.some(row=>row.sourceId===customCategorySourceId?row.name!=='Bánh tùy chỉnh'||row.slug!=='banh-tuy-chinh'||row.origin!=='FINAL_V2':!sourceCategoryMap.has(row.sourceId)||row.name!==sourceCategoryMap.get(row.sourceId).name)||!catalogCategoryMap.has(customCategorySourceId))throw Error('Danh mục FINAL không khớp 7 nguồn và bánh tùy chỉnh.');
const allManifestProducts=[...catalog.products,...catalog.excludedSourceProducts];
if(new Set(allManifestProducts.map(row=>row.sourceId)).size!==65||allManifestProducts.some(row=>!sourceProductMap.has(row.sourceId))||customization.options.some(row=>!sourceOptions.has(`${row.categorySourceKey}/${row.sourceKey}`)))throw Error('Manifest làm mất hoặc trùng source ID.');
const customManifest=catalog.products.find(row=>row.sourceId===sourceCake.customProductId);
if(!customManifest||!customManifest.customizable||customManifest.categorySourceId!==customCategorySourceId||catalog.products.some(row=>row.sourceId!==sourceCake.customProductId&&row.categorySourceId===customCategorySourceId))throw Error('Mapping danh mục bánh tùy chỉnh không hợp lệ.');
const namelessSource=sourceProducts.filter(row=>!row.name?.trim());
if(namelessSource.length!==2||catalog.excludedSourceProducts.some(row=>!namelessSource.some(source=>source.id===row.sourceId)||row.saleStatus!=='inactive'||['APPROVED','ACTIVE'].includes(row.reviewState)||approval(row))||catalog.products.some(row=>!row.name?.trim()||namelessSource.some(source=>source.id===row.sourceId)))throw Error('Hai records thiếu tên phải ở ngoài catalog bán và không có approval.');
const states={MISSING:0,INVALID:0,PENDING_APPROVAL:0,APPROVED:0,ACTIVE:0};
for(const row of catalog.products){if(!(row.reviewState in states))throw Error('Product reviewState không hợp lệ: '+row.sourceId);states[row.reviewState]++;}
const selectedProducts=[];
for(const row of catalog.products){
 if(row.reviewState!=='APPROVED')continue;
 const source=sourceProductMap.get(row.sourceId);
 if(!approval(row)||!approval(catalog))throw Error('Thiếu bằng chứng duyệt product: '+row.sourceId);
 if(!row.name?.trim()||(row.name!==source.name&&!evidence(row.verifiedNameEvidence)))throw Error('Tên product chưa xác minh: '+row.sourceId);
 const customFinalCategory=row.sourceId===sourceCake.customProductId&&source.isCustomizable&&row.categorySourceId===customCategorySourceId;
 if(!catalogCategoryMap.has(row.categorySourceId)||(!sourceCategoryMap.has(source.categoryId)&&!customFinalCategory&&!evidence(row.verifiedCategoryEvidence))||(sourceCategoryMap.has(source.categoryId)&&row.categorySourceId!==source.categoryId&&!evidence(row.verifiedCategoryEvidence)))throw Error('Category product chưa xác minh: '+row.sourceId);
 if(!row.imageUrl||!/^https:\/\//i.test(row.imageUrl)||row.imageReachability!=='OK'||!evidence(row.imageRightsEvidence)||row.imageUrl!==source.image&&!evidence(row.verifiedImageEvidence))throw Error('Ảnh product chưa xác minh đầy đủ: '+row.sourceId);
 if(row.customizable!==Boolean(source.isCustomizable))throw Error('Loại sản phẩm không khớp nguồn: '+row.sourceId);
 if(!row.customizable&&(!money(row.approvedPriceVnd)||row.approvedPriceVnd<=0))throw Error('Thiếu giá production được duyệt: '+row.sourceId);
 if(!money(row.approvedOpeningStock))throw Error('Thiếu tồn đầu kỳ được duyệt: '+row.sourceId);
 if(row.saleStatus!=='active')throw Error('Product APPROVED cần xác nhận saleStatus active: '+row.sourceId);
 selectedProducts.push(row);
}
const selectedOptions=[];
for(const row of customization.options){
 if(row.reviewState!=='APPROVED')continue;
 const key=`${row.categorySourceKey}/${row.sourceKey}`,source=sourceOptions.get(key);
 if(!approval(row)||!approval(customization)||!evidence(row.validCombinationEvidence)||row.name!==source.name)throw Error('Option chưa xác minh: '+key);
 if(row.categorySourceKey==='size'?(!money(row.approvedBasePriceVnd)||row.approvedBasePriceVnd<=0):row.approvedBasePriceVnd!==null)throw Error('Giá nền option chưa hợp lệ: '+key);
 if(!money(row.approvedModifierVnd)||row.saleStatus!=='active')throw Error('Phụ thu/trạng thái option chưa hợp lệ: '+key);
 selectedOptions.push(row);
}
if(selectedProducts.some(row=>row.customizable)&&(selectedOptions.length!==16||customization.compatibilityPolicy!=='ALL_COMBINATIONS_APPROVED'))throw Error('Bánh tùy chỉnh cần đủ 16 options và chính sách mọi tổ hợp được duyệt; tổ hợp giới hạn cần rule backend riêng.');
const counts={sourceProducts:65,sourceCategories:7,targetProducts:63,targetCategories:8,excludedSourceProducts:2,sourceOptions:16,states,approvedProducts:selectedProducts.length,approvedOptions:selectedOptions.length,notApprovedTargetProducts:63-selectedProducts.length};
if(flag('--validate')||flag('--dry-run')){console.log(JSON.stringify({status:'VALIDATED_NO_DB_WRITE',...counts}));process.exit(0);}
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query('begin');
 await db.query('select pg_advisory_xact_lock($1::bigint)',[4000066001]);
 const existing=(await db.query('select id,source_id,name,category_id,image_url,base_price,stock_quantity,status,is_customizable from public.products order by source_id for update')).rows;
 const existingCategories=(await db.query('select id,source_id,name from public.categories order by source_id for update')).rows;
 const existingOptions=(await db.query('select o.id,c.source_key as role,o.source_key,o.name,o.base_price,o.price_modifier,o.status from public.customization_options o join public.customization_categories c on c.id=o.category_id order by c.source_key,o.source_key for update of o')).rows;
 const approvedIds=new Set(selectedProducts.map(row=>row.sourceId));
 const approvedOptionIds=new Set(selectedOptions.map(row=>`${row.categorySourceKey}/${row.sourceKey}`));
 if(existing.some(row=>row.status==='active'&&!approvedIds.has(row.source_id)))throw Error('Có product active ngoài manifest APPROVED; cần reconciliation trước khi import.');
 if(existingOptions.some(row=>row.status==='active'&&!approvedOptionIds.has(`${row.role}/${row.source_key}`)))throw Error('Có option active ngoài manifest APPROVED; cần reconciliation trước khi import.');
 const productMap=new Map(existing.map(row=>[row.source_id,row]));
 const categoryMap=new Map(existingCategories.map(row=>[row.source_id,row]));
 const optionMap=new Map(existingOptions.map(row=>[`${row.role}/${row.source_key}`,row]));
 const diff=[];
 for(const row of selectedProducts){
  const old=productMap.get(row.sourceId),category=categoryMap.get(row.categorySourceId);
  if(old&&old.status!=='active'&&old.stock_quantity!==row.approvedOpeningStock)throw Error('Tồn hiện tại khác tồn được duyệt; không tự ghi đè: '+row.sourceId);
  const unchanged=old&&old.name===row.name&&old.image_url===row.imageUrl&&old.category_id===category?.id&&Number(old.base_price??0)===Number(row.customizable?0:row.approvedPriceVnd)&&old.status==='active'&&old.is_customizable===row.customizable;
  const change={sourceId:row.sourceId,action:old?(unchanged?'NO_CHANGE':'UPDATE_PRESERVE_STOCK'):'INSERT',previousStock:old?.stock_quantity??null,approvedOpeningStock:row.approvedOpeningStock,
   priceFrom:old?.base_price??null,priceTo:row.customizable?null:row.approvedPriceVnd,
   nameChanged:old?old.name!==row.name:false,imageChanged:old?old.image_url!==row.imageUrl:false,
   categoryChanged:old?old.category_id!==category?.id:false};
  diff.push(change);
 }
 for(const row of selectedOptions){const old=optionMap.get(`${row.categorySourceKey}/${row.sourceKey}`),same=old&&old.name===row.name&&Number(old.base_price??0)===Number(row.approvedBasePriceVnd??0)&&Number(old.price_modifier)===row.approvedModifierVnd&&old.status==='active';diff.push({option:`${row.categorySourceKey}/${row.sourceKey}`,action:old?(same?'NO_CHANGE':'UPDATE'):'INSERT',basePriceFrom:old?.base_price??null,basePriceTo:row.approvedBasePriceVnd,modifierFrom:old?.price_modifier??null,modifierTo:row.approvedModifierVnd});}
 const previewHash=createHash('sha256').update(JSON.stringify({catalog,customization,existing,existingCategories,existingOptions})).digest('hex');
 console.log(JSON.stringify({status:flag('--apply')?'APPLYING_LOCAL':'PREVIEW_NO_WRITE',...counts,previewHash,diff},null,2));
 if(!flag('--apply')){await db.query('rollback');process.exit(0);}
 if(!selectedProducts.length)throw Error('Không có product APPROVED để import.');
 if(arg('--confirm-preview')!==previewHash)throw Error('Preview hash đã thay đổi hoặc chưa được xác nhận.');
 const operator=arg('--operator');
 if(!evidence(operator))throw Error('Cần --operator để ghi audit catalog.');
 const neededCategories=[...new Set(selectedProducts.map(row=>row.categorySourceId))];
 for(const sourceId of neededCategories){
  const source=catalogCategoryMap.get(sourceId);
  const old=categoryMap.get(sourceId);
  if(old){if(old.name!==source.name)throw Error('Category name drift cần đối chiếu: '+sourceId);continue;}
  const result=await db.query('insert into public.categories(source_id,name,slug,status) values($1,$2,$3,$4) returning id',[sourceId,source.name,source.slug||sourceCategoryMap.get(sourceId)?.slug||null,'active']);
  categoryMap.set(sourceId,{id:result.rows[0].id,name:source.name});
 }
 const audit=async(entityType,entityId,sourceId,oldValue,newValue,approvalRow)=>db.query('insert into public.audit_log(actor_type,action,entity_type,entity_id,old_value,new_value) values($1,$2,$3,$4,$5,$6)',['system','catalog_approved_local',entityType,entityId,oldValue,{sourceId,operator,approvalReference:approvalRow.approvalReference,approvedBy:approvalRow.approvedBy,approvedAt:approvalRow.approvedAt,...newValue}]);
 for(const row of selectedProducts){
  const source=sourceProductMap.get(row.sourceId),old=productMap.get(row.sourceId);
  const desired={category_id:categoryMap.get(row.categorySourceId).id,name:row.name,image_url:row.imageUrl,base_price:row.customizable?null:row.approvedPriceVnd,status:'active'};
  if(old){
   if(old.name===desired.name&&old.category_id===desired.category_id&&old.image_url===desired.image_url&&Number(old.base_price??0)===Number(desired.base_price??0)&&old.status==='active')continue;
   await db.query('update public.products set category_id=$2,name=$3,description=$4,image_url=$5,base_price=$6,status=$7,updated_at=now() where id=$1',[old.id,desired.category_id,row.name,source.description||null,row.imageUrl,desired.base_price,'active']);
   await audit('product',old.id,row.sourceId,{name:old.name,category_id:old.category_id,image_url:old.image_url,base_price:old.base_price,stock_quantity:old.stock_quantity,status:old.status},{...desired,stockPreserved:true},row);
  }else{
   const inserted=await db.query('insert into public.products(source_id,category_id,name,description,image_url,base_price,stock_quantity,status,is_customizable) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',[row.sourceId,desired.category_id,row.name,source.description||null,row.imageUrl,desired.base_price,row.approvedOpeningStock,'active',row.customizable]);
   await audit('product',inserted.rows[0].id,row.sourceId,null,{...desired,openingStock:row.approvedOpeningStock},row);
  }
 }
 for(const row of selectedOptions){
  const category=await db.query('insert into public.customization_categories(source_key,name,pricing_role,status) values($1,$2,$3,$4) on conflict(source_key) do update set status=excluded.status returning id',[row.categorySourceKey,row.categorySourceKey,row.categorySourceKey,'active']);
  const old=optionMap.get(`${row.categorySourceKey}/${row.sourceKey}`);
  if(old&&old.name===row.name&&Number(old.base_price??0)===Number(row.approvedBasePriceVnd??0)&&Number(old.price_modifier)===row.approvedModifierVnd&&old.status==='active')continue;
  const result=await db.query('insert into public.customization_options(category_id,source_key,name,base_price,price_modifier,status) values($1,$2,$3,$4,$5,$6) on conflict(category_id,source_key) do update set name=excluded.name,base_price=excluded.base_price,price_modifier=excluded.price_modifier,status=excluded.status,updated_at=now() returning id',[category.rows[0].id,row.sourceKey,row.name,row.approvedBasePriceVnd,row.approvedModifierVnd,'active']);
  await audit('customization_option',result.rows[0].id,`${row.categorySourceKey}/${row.sourceKey}`,old||null,{name:row.name,basePriceVnd:row.approvedBasePriceVnd,modifierVnd:row.approvedModifierVnd,status:'active'},row);
 }
 const actual=(await db.query('select source_id,base_price,stock_quantity,status from public.products where source_id=any($1::text[]) order by source_id',[selectedProducts.map(row=>row.sourceId)])).rows;
 assert.equal(actual.length,selectedProducts.length,'Reconciliation product count mismatch');
 for(const row of selectedProducts){const found=actual.find(item=>item.source_id===row.sourceId),old=productMap.get(row.sourceId);assert.equal(found.status,'active');assert.equal(Number(found.stock_quantity),old?Number(old.stock_quantity):row.approvedOpeningStock);assert.equal(found.base_price===null?null:Number(found.base_price),row.customizable?null:row.approvedPriceVnd);}
 const actualOptions=(await db.query('select c.source_key as role,o.source_key,o.base_price,o.price_modifier,o.status from public.customization_options o join public.customization_categories c on c.id=o.category_id where o.status=$1',['active'])).rows;
 for(const row of selectedOptions){const found=actualOptions.find(item=>item.role===row.categorySourceKey&&item.source_key===row.sourceKey);assert.ok(found,'Option reconciliation missing');assert.equal(Number(found.base_price??0),Number(row.approvedBasePriceVnd??0));assert.equal(Number(found.price_modifier),row.approvedModifierVnd);}
 await db.query('commit');
 console.log(JSON.stringify({status:fixtureMode?'APPLIED_LOCAL_TEST_RECONCILED':'APPLIED_LOCAL_RECONCILED',products:actual.length,options:selectedOptions.length,stockPreservedForExisting:actual.filter(row=>productMap.has(row.source_id)).length}));
}catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{await db.end();}
