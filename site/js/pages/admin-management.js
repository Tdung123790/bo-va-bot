import {requireAdmin} from '../core/guard.js';
import {isSupabaseMode} from '../core/backend.js';
import {getCurrentMember} from '../services/authService.js';
import {loadManagementData,updateProduct,createPromotion,activateFinalPromotion,updatePromotion,assignRole,updateReview} from '../services/adminManagementService.js';

const root=document.querySelector('#management-content');
const notice=document.querySelector('#management-notice');
const productForm=document.querySelector('#product-form');
const promoForm=document.querySelector('#promotion-form');
const roleForm=document.querySelector('#profile-form');
const productList=document.querySelector('#product-select');
const promoList=document.querySelector('#promotion-select');
const profileList=document.querySelector('#profile-select');
let catalog={products:[],categories:[],promotions:[],profiles:[],reviews:[]};
let creatingPromotion=false;

const field=(form,name)=>form.elements.namedItem(name);
const value=(form,name)=>field(form,name).value;
const numberOrNull=(form,name)=>value(form,name)===''?null:Number(value(form,name));
const selected=(list,items)=>items.find(item=>item.id===list.value);
const option=(value,label)=>new Option(label,value);
const setOptions=(list,items,label)=>list.replaceChildren(...items.map(item=>option(item.id,label(item))));
const hcmValue=iso=>iso?new Date(new Date(iso).getTime()+7*3600000).toISOString().slice(0,19):'';
const isoValue=input=>input?new Date(`${input}${input.length===16?':00':''}+07:00`).toISOString():null;
const message=text=>{notice.textContent=text;};

function fillProduct(){
  const row=selected(productList,catalog.products);
  productForm.hidden=!row;
  if(!row)return;
  for(const [key,item] of Object.entries({name:row.name,description:row.description||'',imageUrl:row.image_url||'',price:row.base_price??'',stock:row.stock_quantity,status:row.status}))field(productForm,key).value=item;
  field(productForm,'price').required=!row.is_customizable;
  field(productForm,'price').title=row.is_customizable?'Để trống nếu giá được tính từ tùy chọn bánh.':'';
  field(productForm,'featured').checked=Boolean(row.is_featured);
  field(productForm,'bestSeller').checked=Boolean(row.is_best_seller);
}

function filterProducts(){
  const keyword=document.querySelector('#product-search').value.trim().toLocaleLowerCase('vi');
  const old=productList.value;
  const filtered=catalog.products.filter(item=>item.name.toLocaleLowerCase('vi').includes(keyword)).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  setOptions(productList,filtered,item=>`${item.name} — ${item.stock_quantity} bánh`);
  productList.value=filtered.some(item=>item.id===old)?old:filtered[0]?.id||'';
  fillProduct();
}

function fillPromotion(){
  const row=creatingPromotion?null:selected(promoList,catalog.promotions);
  promoForm.reset();
  field(promoForm,'name').disabled=Boolean(row);
  field(promoForm,'description').disabled=Boolean(row);
  const fields={
    name:row?.name||'',description:row?.description||'',discountType:row?.discount_type||'PERCENT',
    discountValue:row?.discount_value??'',targetType:row?.target_type||'ALL',
    targetProduct:row?.target_product_id||'',targetCategory:row?.target_category_id||'',
    minOrder:row?.min_order_value??0,maxDiscount:row?.max_discount??'',
    startsAt:hcmValue(row?.starts_at),endsAt:hcmValue(row?.ends_at),
    usageLimit:row?.usage_limit??'',usagePerCustomer:row?.usage_per_customer??'',
    status:row?.status||'inactive'
  };
  for(const [name,input] of Object.entries(fields))field(promoForm,name).value=input;
  document.querySelector('#promotion-usage').textContent=row?`Đã sử dụng: ${row.used_count||0} lượt. Tên và mô tả của chương trình hiện có được giữ nguyên.`:'Đang tạo chương trình mới.';
  const target=field(promoForm,'targetType').value;
  field(promoForm,'targetProduct').disabled=target!=='PRODUCT';
  field(promoForm,'targetCategory').disabled=target!=='CATEGORY';
}

function fillProfile(){
  const row=selected(profileList,catalog.profiles);
  roleForm.hidden=!row;
  if(!row)return;
  document.querySelector('#profile-identity').textContent=`${row.full_name||'Chưa đặt tên'} — ${row.id}`;
  field(roleForm,'role').value=row.role;
  field(roleForm,'status').value=row.status;
}

function moderation(){
  const filter=document.querySelector('#review-filter').value;
  const items=catalog.reviews.filter(row=>filter==='all'||row.status===filter);
  const container=document.querySelector('#moderation-list');
  container.replaceChildren();
  if(!items.length){container.append(document.createTextNode('Không có đánh giá trong nhóm này.'));return;}
  for(const review of items){
    const card=document.createElement('article');
    card.className='moderation-item';
    const product=catalog.products.find(p=>p.id===review.product_id);
    const title=document.createElement('strong');
    title.textContent=`${product?.name||'Sản phẩm'} — ${review.rating}/5 sao — ${review.status}`;
    const paragraph=document.createElement('p');
    paragraph.textContent=review.content;
    const actions=document.createElement('div');
    actions.className='moderation-actions';
    for(const [status,label] of [['published','Duyệt công khai'],['hidden','Ẩn vì vi phạm']]){
      if(review.status===status)continue;
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      button.addEventListener('click',async()=>{
        const reason=status==='hidden'?prompt('Chỉ ẩn nội dung vi phạm. Không ẩn chỉ vì ít sao hoặc nhận xét tiêu cực. Nhập lý do:'):null;
        if(status==='hidden'&&!reason?.trim()){
          if(reason!==null)message('Cần nhập lý do ẩn đánh giá.');
          return;
        }
        button.disabled=true;
        try{
          await updateReview(review.id,status,reason);
          message('Đã cập nhật trạng thái đánh giá.');
          await reload();
        }catch(error){message('Không cập nhật được đánh giá: '+error.message);button.disabled=false;}
      });
      actions.append(button);
    }
    card.append(title,paragraph,actions);
    container.append(card);
  }
}

async function reload(selections={}){
  catalog=await loadManagementData();
  filterProducts();
  if(selections.product)productList.value=selections.product;
  fillProduct();
  setOptions(promoList,catalog.promotions,item=>`${item.name} — ${item.status}`);
  const final=catalog.promotions.find(item=>item.source_id==='FINAL_2026_11_12_15_PERCENT');
  document.querySelector('#promotion-activate-final').textContent=final?'Kiểm tra ưu đãi 12/11 đã duyệt':'Kích hoạt ưu đãi 12/11 đã duyệt';
  promoList.value=selections.promotion||catalog.promotions[0]?.id||'';
  creatingPromotion=!catalog.promotions.length;
  setOptions(field(promoForm,'targetProduct'),[{id:'',name:'Không chọn'},...catalog.products],item=>item.name);
  setOptions(field(promoForm,'targetCategory'),[{id:'',name:'Không chọn'},...catalog.categories],item=>item.name);
  fillPromotion();
  setOptions(profileList,catalog.profiles,item=>`${item.full_name||item.id.slice(0,8)} — ${item.role}`);
  profileList.value=selections.profile||catalog.profiles[0]?.id||'';
  fillProfile();
  moderation();
  root.hidden=false;
}

productList.addEventListener('change',fillProduct);
document.querySelector('#product-search').addEventListener('input',filterProducts);
promoList.addEventListener('change',()=>{creatingPromotion=false;fillPromotion();});
document.querySelector('#promotion-new').addEventListener('click',()=>{creatingPromotion=true;promoList.selectedIndex=-1;fillPromotion();field(promoForm,'name').focus();});
document.querySelector('#promotion-activate-final').addEventListener('click',async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{
    const result=await activateFinalPromotion();
    await reload({promotion:result.promotion_id});
    message(result.replayed?'Ưu đãi 12/11 đã đúng phê duyệt và không tạo bản ghi trùng.':'Đã kích hoạt ưu đãi 12/11 qua quyền Admin và ghi audit.');
  }catch(error){message('Không thể kích hoạt ưu đãi 12/11: '+error.message);}
  finally{button.disabled=false;}
});
field(promoForm,'targetType').addEventListener('change',fillPromotionTarget);
function fillPromotionTarget(){
  const target=value(promoForm,'targetType');
  field(promoForm,'targetProduct').disabled=target!=='PRODUCT';
  field(promoForm,'targetCategory').disabled=target!=='CATEGORY';
}
profileList.addEventListener('change',fillProfile);
document.querySelector('#review-filter').addEventListener('change',moderation);

productForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const row=selected(productList,catalog.products);
  if(!row)return;
  const button=productForm.querySelector('[type="submit"]');
  button.disabled=true;
  try{
    await updateProduct({
      p_id:row.id,p_name:value(productForm,'name').trim(),
      p_description:value(productForm,'description'),p_image_url:value(productForm,'imageUrl').trim()||null,
      p_price:value(productForm,'price')===''?null:Number(value(productForm,'price')),
      p_stock:Number(value(productForm,'stock')),
      p_expected_stock:row.stock_quantity,
      p_status:value(productForm,'status'),p_featured:field(productForm,'featured').checked,
      p_best_seller:field(productForm,'bestSeller').checked
    });
    await reload({product:row.id});
    message('Đã lưu sản phẩm vào Supabase và ghi audit.');
  }catch(error){message(error.message?.includes('STOCK_CHANGED_RELOAD_REQUIRED')?'Tồn kho đã thay đổi. Hãy tải lại dữ liệu trước khi lưu.':'Lỗi lưu sản phẩm: '+error.message);}
  finally{button.disabled=false;}
});

promoForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const row=creatingPromotion?null:selected(promoList,catalog.promotions);
  const button=promoForm.querySelector('[type="submit"]');
  button.disabled=true;
  try{
    const target=value(promoForm,'targetType');
    const payload={
      p_discount_type:value(promoForm,'discountType'),p_discount_value:Number(value(promoForm,'discountValue')),
      p_target_type:target,p_target_product:target==='PRODUCT'?value(promoForm,'targetProduct')||null:null,
      p_target_category:target==='CATEGORY'?value(promoForm,'targetCategory')||null:null,
      p_min_order:Number(value(promoForm,'minOrder')),p_max_discount:numberOrNull(promoForm,'maxDiscount'),
      p_starts:isoValue(value(promoForm,'startsAt')),p_ends:isoValue(value(promoForm,'endsAt')),
      p_usage_limit:numberOrNull(promoForm,'usageLimit'),p_usage_per_customer:numberOrNull(promoForm,'usagePerCustomer'),
      p_status:value(promoForm,'status')
    };
    if(!payload.p_starts||!payload.p_ends||payload.p_ends<=payload.p_starts)throw Error('Ngày kết thúc phải sau ngày bắt đầu.');
    if(!row){
      const result=await createPromotion({...payload,p_name:value(promoForm,'name').trim(),p_description:value(promoForm,'description')});
      await reload({promotion:result.promotion_id});
      message('Đã tạo khuyến mãi mới.');
    }else{
      await updatePromotion({...payload,p_id:row.id});
      await reload({promotion:row.id});
      message('Đã cập nhật khuyến mãi.');
    }
  }catch(error){message('Lỗi lưu khuyến mãi: '+error.message);}
  finally{button.disabled=false;}
});

roleForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const row=selected(profileList,catalog.profiles);
  if(!row)return;
  const role=value(roleForm,'role'),status=value(roleForm,'status');
  if(row.id===getCurrentMember()?.id&&(role!=='admin'||status!=='active')){
    message('Không thể tự bỏ quyền Admin hoặc khóa tài khoản của mình.');
    return;
  }
  if(!confirm(`Xác nhận cập nhật quyền ${row.full_name||row.id} thành ${role}, ${status}?`))return;
  const button=roleForm.querySelector('[type="submit"]');
  button.disabled=true;
  try{
    await assignRole({p_profile:row.id,p_role:role,p_status:status});
    await reload({profile:row.id});
    message('Đã cập nhật quyền và ghi audit.');
  }catch(error){message('Lỗi phân quyền: '+error.message);}
  finally{button.disabled=false;}
});

if(isSupabaseMode()&&requireAdmin()){
  reload().then(()=>message('Đã tải dữ liệu quản trị.')).catch(error=>message('Không thể tải quản trị: '+error.message));
}else message('Trang này chỉ dành cho Admin trong Supabase.');
