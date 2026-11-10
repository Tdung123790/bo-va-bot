import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,'site','data',name),'utf8'));
const categories=await read('categories.json');
const products=await read('products.json');
const cake=await read('cake-options.json');
const categoryIds=new Set(categories.map(row=>row.id));
const customCategorySourceId='FINAL_V2_CUSTOM_CAKE';
const missingName=products.filter(row=>!row.name?.trim());
if(products.length!==65||categories.length!==7||missingName.length!==2||products.filter(row=>row.isCustomizable).length!==1||products.find(row=>row.id===cake.customProductId)?.name!=='Bánh Tùy Chỉnh'||categoryIds.has(customCategorySourceId))throw Error('Source inventory không khớp quyết định FINAL v2.');
const roles={size:'sizes',flavor:'flavors',cream:'creams',font:'fonts',color:'textColors'};
const productRow=row=>{
  const validation=[];
  if(!row.name?.trim())validation.push('MISSING_NAME');
  if(!categoryIds.has(row.categoryId)&&!(row.id===cake.customProductId&&row.isCustomizable))validation.push('MISSING_CATEGORY');
  if(!row.image?.trim())validation.push('MISSING_IMAGE');
  else if(!/^https:\/\//i.test(row.image))validation.push('INVALID_IMAGE_URL');
  return {sourceId:row.id,name:row.name?.trim()||null,verifiedNameEvidence:null,
   categorySourceId:row.id===cake.customProductId?customCategorySourceId:categoryIds.has(row.categoryId)?row.categoryId:null,
   imageUrl:row.image||null,sourcePriceVnd:Number.isSafeInteger(row.price)?row.price:null,
   approvedPriceVnd:null,approvedOpeningStock:null,imageReachability:'NOT_CHECKED',imageRightsEvidence:null,verifiedImageEvidence:null,
   verifiedCategoryEvidence:null,customizable:Boolean(row.isCustomizable),saleStatus:'inactive',
   reviewState:validation.includes('INVALID_IMAGE_URL')?'INVALID':validation.length?'MISSING':'PENDING_APPROVAL',validation,
   reviewNotes:null,approvalReference:null,approvedBy:null,approvedAt:null};
};
const catalog={schemaVersion:1,environment:'production',approvalReference:null,approvedBy:null,approvedAt:null,
 sourceInventory:{productCount:products.length,categoryCount:categories.length},
 categories:[...categories.map(row=>({sourceId:row.id,name:row.name})),{sourceId:customCategorySourceId,name:'Bánh tùy chỉnh',slug:'banh-tuy-chinh',origin:'FINAL_V2'}],
 products:products.filter(row=>row.name?.trim()).map(productRow),
 excludedSourceProducts:missingName.map(productRow)};
const options={schemaVersion:1,environment:'production',compatibilityPolicy:null,approvalReference:null,approvedBy:null,approvedAt:null,
 options:Object.entries(roles).flatMap(([role,bucket])=>cake[bucket].map(row=>({categorySourceKey:role,sourceKey:row.id,name:row.name||null,
  sourceBasePriceVnd:role==='size'?(Number.isSafeInteger(row.price)?row.price:null):null,
  sourceModifierVnd:Number.isSafeInteger(row.priceModifier)?row.priceModifier:0,
  approvedBasePriceVnd:null,approvedModifierVnd:null,validCombinationEvidence:null,
  saleStatus:'inactive',reviewState:row.name?'PENDING_APPROVAL':'MISSING',approvalReference:null,approvedBy:null,approvedAt:null})))};
const store={schemaVersion:1,environment:'production',timezone:'Asia/Ho_Chi_Minh',reviewState:'PENDING_APPROVAL',
 storeName:null,address:null,bakeryLat:null,bakeryLng:null,pickupHours:null,deliveryHours:null,
 serviceArea:null,shippingTiers:null,customCakeLeadHours:24,addressVerificationPolicy:null,
 approvalReference:null,approvedBy:null,approvedAt:null};
const dir=path.join(root,'reference','production');
await fs.mkdir(dir,{recursive:true});
for(const [name,data] of [['catalog-approval.json',catalog],['customization-approval.json',options],['store-approval.json',store]]){
 try{await fs.writeFile(path.join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});console.log(`CREATED ${name}`);}
 catch(error){if(error.code==='EEXIST')console.log(`PRESERVED ${name}`);else throw error;}
}
if(process.argv.includes('--reconcile-final-v2')){
 const file=path.join(dir,'catalog-approval.json');
 const originalText=await fs.readFile(file,'utf8');
 const current=JSON.parse(originalText);
 if(current.environment!=='production')throw Error('Chỉ đối chiếu manifest production.');
 const all=[...(current.products||[]),...(current.excludedSourceProducts||[])];
 const sourceIds=new Set(products.map(row=>row.id));
 if(all.length!==65||new Set(all.map(row=>row.sourceId)).size!==65||all.some(row=>!sourceIds.has(row.sourceId)))throw Error('Manifest không bảo toàn đủ 65 source IDs.');
 const excluded=all.filter(row=>missingName.some(source=>source.id===row.sourceId));
 if(excluded.length!==2||excluded.some(row=>row.saleStatus!=='inactive'||['APPROVED','ACTIVE'].includes(row.reviewState)||row.approvalReference||row.approvedBy||row.approvedAt))throw Error('Record thiếu tên đã có approval hoặc trạng thái bán; cần chủ dự án xử lý.');
 const originalCategories=current.categories.filter(row=>categoryIds.has(row.sourceId));
 const synthetic=current.categories.find(row=>row.sourceId===customCategorySourceId);
 if(originalCategories.length!==7||new Set(originalCategories.map(row=>row.sourceId)).size!==7||current.categories.length!==(synthetic?8:7)||synthetic&&synthetic.name!=='Bánh tùy chỉnh')throw Error('Danh mục hiện tại không khớp nguồn hoặc FINAL.');
 const target=all.filter(row=>!excluded.some(item=>item.sourceId===row.sourceId)).map(row=>{
  if(row.sourceId!==cake.customProductId)return {...row,reviewNotes:row.reviewNotes??null};
  if(row.categorySourceId!==customCategorySourceId&&(row.approvalReference||row.approvedBy||row.approvedAt))throw Error('Mapping bánh tùy chỉnh đã có approval; cần đối chiếu thủ công.');
  const validation=(row.validation||[]).filter(issue=>issue!=='MISSING_CATEGORY');
  return {...row,categorySourceId:customCategorySourceId,validation,
   reviewState:row.reviewState==='MISSING'&&!validation.length?'PENDING_APPROVAL':row.reviewState,
   reviewNotes:row.reviewNotes??null};
 });
 if(target.length!==63||target.filter(row=>row.customizable).length!==1)throw Error('Catalog đích không khớp 63 sản phẩm.');
 const updated={...current,sourceInventory:{productCount:65,categoryCount:7},
  categories:synthetic?current.categories.map(row=>row.sourceId===customCategorySourceId?{...row,slug:'banh-tuy-chinh'}:row):[...current.categories,{sourceId:customCategorySourceId,name:'Bánh tùy chỉnh',slug:'banh-tuy-chinh',origin:'FINAL_V2'}],
  products:target,excludedSourceProducts:excluded};
 console.log(JSON.stringify({status:process.argv.includes('--apply')?'RECONCILING':'PREVIEW_NO_WRITE',sourceProducts:all.length,targetProducts:target.length,targetCategories:updated.categories.length,excludedSourceIds:excluded.map(row=>row.sourceId)}));
 const updatedText=JSON.stringify(updated,null,2)+'\n';
 if(process.argv.includes('--apply')&&updatedText!==originalText)await fs.writeFile(file,updatedText);
}
const actualCatalog=JSON.parse(await fs.readFile(path.join(dir,'catalog-approval.json'),'utf8'));
const actualOptions=JSON.parse(await fs.readFile(path.join(dir,'customization-approval.json'),'utf8'));
console.log(JSON.stringify({sourceProducts:products.length,sourceCategories:categories.length,targetProducts:actualCatalog.products.length,targetCategories:actualCatalog.categories.length,excludedSourceProducts:actualCatalog.excludedSourceProducts?.length||0,options:actualOptions.options.length,approved:actualCatalog.products.filter(row=>row.reviewState==='APPROVED').length,active:actualCatalog.products.filter(row=>row.saleStatus==='active').length}));
