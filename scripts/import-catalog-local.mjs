import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from 'pg';
import {localDbPassword} from './local-db-password.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const categories=JSON.parse(await fs.readFile(path.join(root,'site/data/categories.json'),'utf8'));
const products=JSON.parse(await fs.readFile(path.join(root,'site/data/products.json'),'utf8'));
const cake=JSON.parse(await fs.readFile(path.join(root,'site/data/cake-options.json'),'utf8'));
const roles={size:'sizes',flavor:'flavors',cream:'creams',font:'fonts',color:'textColors'};
const categoryIds=new Set(categories.map(row=>row.id));
const audit={categories:categories.length,products:products.length,customizationOptions:Object.values(roles).reduce((sum,bucket)=>sum+cake[bucket].length,0),
 missingName:products.filter(row=>!row.name?.trim()).map(row=>row.id),
 missingOrZeroPrice:products.filter(row=>!Number.isSafeInteger(row.price)||row.price<=0).map(row=>row.id),
 missingImage:products.filter(row=>!row.image?.trim()).map(row=>row.id),
 malformedImage:products.filter(row=>row.image&&!/^https?:\/\//.test(row.image)).map(row=>row.id),
 missingCategory:products.filter(row=>!categoryIds.has(row.categoryId)).map(row=>({id:row.id,categoryId:row.categoryId})),
 structurallyImportable:products.filter(row=>row.name?.trim()&&categoryIds.has(row.categoryId)).length,
 remoteImageReachability:'NOT VERIFIED',productionPriceApproval:'NOT VERIFIED'};
const unique=(rows,key)=>assert.equal(new Set(rows.map(row=>row[key])).size,rows.length,`Duplicate ${key}`);
unique(categories,'id');unique(products,'id');
for(const category of categories)assert.ok(category.id&&category.name?.trim());
for(const product of products)assert.ok(product.id);
console.log(JSON.stringify(audit,null,2));
const reportPath=value('--report');
if(reportPath)await fs.writeFile(path.resolve(root,reportPath),JSON.stringify(audit,null,2)+'\n');
const fixture=flag('--test-fixture');
const manifestPath=value('--manifest');
if(manifestPath&&flag('--apply'))throw Error('Legacy manifest importer không dùng cho production. Dùng import-approved-catalog-local.mjs với approval từng record và preview/reconciliation.');
if(!flag('--apply')&&!fixture&&!manifestPath)process.exit(0);
if(fixture===Boolean(manifestPath))throw Error('Chọn đúng một trong --test-fixture hoặc --manifest <file>.');
const selected={categories:[],products:[],options:[]};
if(fixture){
 selected.categories.push({id:'TEST-sprint35-category',name:'TEST Catalog',slug:'test-sprint35',description:'',image:'',displayOrder:1,isActive:true});
 selected.products.push({id:'TEST-sprint35-product',name:'TEST Regular Cake',description:'TEST only',image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/%3E',categoryId:'TEST-sprint35-category',price:100000,stock:10,status:'active',isCustomizable:false,isFeatured:false,isBestSeller:false});
 selected.products.push({id:'TEST-sprint35-custom',name:'TEST Custom Cake',description:'TEST only',image:null,categoryId:'TEST-sprint35-category',price:null,stock:0,status:'active',isCustomizable:true,isFeatured:false,isBestSeller:false});
 for(const [role,bucket] of Object.entries(roles))selected.options.push({role,sourceKey:role==='font'?'font-caveat':role==='color'?'#E57373':`TEST-${role}`,name:`TEST ${role}`,basePrice:role==='size'?300000:null,modifier:role==='flavor'?50000:role==='cream'?20000:0,status:'active'});
}else{
 const manifest=JSON.parse(await fs.readFile(path.resolve(root,manifestPath),'utf8'));
 if(!manifest.approvalReference||!manifest.approvedBy)throw Error('Manifest cần approvalReference và approvedBy.');
 const selectedCategoryIds=new Set(manifest.categories||[]);
 for(const id of selectedCategoryIds){const row=categories.find(item=>item.id===id);if(!row)throw Error('Category ID không có trong JSON gốc: '+id);selected.categories.push(row);}
 const seenProducts=new Set();
 for(const spec of manifest.products||[]){
  if(seenProducts.has(spec.sourceId))throw Error('Product trùng trong manifest: '+spec.sourceId);seenProducts.add(spec.sourceId);
  const row=products.find(item=>item.id===spec.sourceId);
  if(!row||!row.name?.trim())throw Error('Product thiếu nguồn hoặc tên: '+spec.sourceId);
  const categoryId=row.categoryId||spec.verifiedCategorySourceId;
  if(!row.categoryId&&(!spec.verifiedCategorySourceId||!spec.categoryEvidence))throw Error('Product thiếu category được xác nhận: '+spec.sourceId);
  if(row.categoryId&&spec.verifiedCategorySourceId&&spec.verifiedCategorySourceId!==row.categoryId)throw Error('Không tự đổi category gốc: '+spec.sourceId);
  if(!selectedCategoryIds.has(categoryId))throw Error('Category chưa được chọn trong manifest: '+spec.sourceId);
  const sale=spec.saleApproved===true;
  if(sale&&(!row.image?.trim()||!/^https?:\/\//.test(row.image)))throw Error('Ảnh chưa xác nhận cho sản phẩm được bán: '+spec.sourceId);
  if(sale&&!row.isCustomizable&&(!Number.isSafeInteger(spec.approvedPrice)||spec.approvedPrice!==row.price))throw Error('Giá bán không khớp nguồn: '+spec.sourceId);
  if(sale&&(!Number.isSafeInteger(spec.approvedStock)||spec.approvedStock<0))throw Error('Tồn đầu kỳ chưa được xác nhận: '+spec.sourceId);
  selected.products.push({...row,categoryId,price:sale&&!row.isCustomizable?spec.approvedPrice:null,stock:sale?spec.approvedStock:0,status:sale?'active':'inactive'});
 }
 const seenOptions=new Set();
 for(const spec of manifest.options||[]){
  const bucket=roles[spec.role],source=cake[bucket]?.find(row=>row.id===spec.sourceKey);
  if(!bucket||!source)throw Error('Tùy chọn không có trong cake-options.json: '+spec.role+'/'+spec.sourceKey);
  const key=spec.role+'/'+spec.sourceKey;if(seenOptions.has(key))throw Error('Option trùng: '+key);seenOptions.add(key);
  const base=spec.role==='size'?source.price:null,modifier=Number(source.priceModifier||0);
  if(spec.active===true&&(spec.approvedBasePrice!==base||spec.approvedModifier!==modifier))throw Error('Giá option chưa được xác nhận hoặc không khớp nguồn: '+key);
  selected.options.push({role:spec.role,sourceKey:source.id,name:source.name,basePrice:spec.active===true?base:null,modifier:spec.active===true?modifier:0,status:spec.active===true?'active':'inactive'});
 }
 if(selected.products.some(row=>row.isCustomizable&&row.status==='active')&&Object.keys(roles).some(role=>!selected.options.some(option=>option.role===role&&option.status==='active')))throw Error('Bánh tùy chỉnh chưa đủ năm nhóm option được duyệt.');
}
if(!flag('--apply')){
 console.log(`DRY RUN: ${selected.categories.length} categories, ${selected.products.length} products, ${selected.options.length} options; no database writes.`);
 process.exit(0);
}
const db=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:localDbPassword(),database:'postgres',connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query('begin');
 const categoryMap=new Map();
 for(const row of selected.categories){
  const result=await db.query(`insert into public.categories(source_id,name,slug,description,image_url,display_order,status)
    values($1,$2,$3,$4,$5,$6,$7) on conflict(source_id) do update set
    name=excluded.name,slug=excluded.slug,description=excluded.description,image_url=excluded.image_url,
    display_order=excluded.display_order,status=excluded.status,updated_at=now() returning id`,
   [row.id,row.name,row.slug||null,row.description||null,row.image||null,row.displayOrder||0,row.isActive===false?'inactive':'active']);
  categoryMap.set(row.id,result.rows[0].id);
 }
 for(const row of selected.products){
  await db.query(`insert into public.products(source_id,category_id,name,description,image_url,base_price,stock_quantity,status,is_featured,is_best_seller,is_customizable)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(source_id) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,image_url=excluded.image_url,
    base_price=excluded.base_price,stock_quantity=case when public.products.status='inactive' and excluded.status='active'
      then excluded.stock_quantity else public.products.stock_quantity end,status=excluded.status,
    is_featured=excluded.is_featured,is_best_seller=excluded.is_best_seller,is_customizable=excluded.is_customizable,updated_at=now()`,
   [row.id,categoryMap.get(row.categoryId),row.name,row.description||null,row.image||null,row.price,row.stock,row.status,Boolean(row.isFeatured),Boolean(row.isBestSeller),Boolean(row.isCustomizable)]);
 }
 const optionCategoryMap=new Map();
 for(const option of selected.options){
  if(!optionCategoryMap.has(option.role)){
   const result=await db.query(`insert into public.customization_categories(source_key,name,pricing_role)
     values($1,$2,$3) on conflict(source_key) do update set name=excluded.name,status='active',updated_at=now() returning id`,
    [option.role,option.role,option.role]);
   optionCategoryMap.set(option.role,result.rows[0].id);
  }
  await db.query(`insert into public.customization_options(category_id,source_key,name,base_price,price_modifier,status)
    values($1,$2,$3,$4,$5,$6) on conflict(category_id,source_key) do update set
    name=excluded.name,base_price=excluded.base_price,price_modifier=excluded.price_modifier,status=excluded.status,updated_at=now()`,
   [optionCategoryMap.get(option.role),option.sourceKey,option.name,option.basePrice,option.modifier,option.status]);
 }
 await db.query('commit');
 console.log(`IMPORTED LOCAL: ${selected.categories.length} categories, ${selected.products.length} products, ${selected.options.length} options; mode=${fixture?'TEST':'APPROVED_MANIFEST'}`);
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
