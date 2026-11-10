import {getOptions,calculatePrice,createCake} from '../services/customCakeService.js';
import {addToCart,openCart} from '../services/cartService.js';
import {formatVND} from '../core/format.js';
import {toast} from '../core/toast.js';
import {trackEvent} from '../core/analytics.js';
import {el} from '../core/dom.js';

const $=selector=>document.querySelector(selector);
const fontFamily={'font-paragraph':'Trirong, serif','font-caveat':'Caveat, cursive','font-pinyon-script':'Pinyon Script, cursive'};
const sizeDetails={'15':'3-4 người','20':'6-8 người','25':'10-12 người'};
const flavorNames={vanilla:'Vani Truyền Thống',chocolate:'Chocolate Bỉ',matcha:'Trà Xanh Matcha'};
const creamNames={whipping:'Kem Whipping Tươi',butter:'Kem Bơ Pháp',mascarpone:'Kem Phô Mai Mascarpone'};
let options;
let config;

function displayName(item,kind){
  if(kind==='sizeId')return `${item.name} (${sizeDetails[item.id]||''})`;
  if(kind==='flavorId')return flavorNames[item.id]||item.name;
  if(kind==='creamId')return creamNames[item.id]||item.name;
  return item.name;
}

function choices(selector,items,key){
  const box=$(selector);
  box.replaceChildren();
  for(const [index,item] of items.entries()){
    const label=el('label',{className:'custom-choice'});
    const input=el('input',{type:'radio',name:key,value:item.id,checked:index===0});
    input.addEventListener('change',()=>{config[key]=item.id;update();});
    const price=key==='sizeId'?formatVND(item.price):Number(item.priceModifier)>0?'+ '+formatVND(item.priceModifier):'Không phụ thu';
    label.append(input,el('strong',{text:displayName(item,key)}),el('small',{text:price}));
    box.append(label);
  }
}

async function update(){
  const price=await calculatePrice(config);
  $('#cake-total').textContent=formatVND(price);
  const size=options.sizes.find(item=>item.id===config.sizeId);
  const flavor=options.flavors.find(item=>item.id===config.flavorId);
  const cream=options.creams.find(item=>item.id===config.creamId);
  const color=options.textColors.find(item=>item.id===config.colorId);
  const preview=$('#cake-preview-text');
  preview.textContent=config.text||'Bơ & Bột';
  preview.style.color=color.value;
  preview.style.fontFamily=fontFamily[config.fontId]||'serif';
  preview.style.fontSize=config.fontId==='font-pinyon-script'?'3rem':'';
  $('#cake-flavor-label').textContent=displayName(flavor,'flavorId');
  $('#cake-breakdown').replaceChildren(
    el('dt',{text:`Kích thước (${displayName(size,'sizeId')})`}),el('dd',{text:formatVND(size.price)}),
    el('dt',{text:`Cốt bánh (${displayName(flavor,'flavorId')})`}),el('dd',{text:'+ '+formatVND(flavor.priceModifier||0)}),
    el('dt',{text:`Kem phủ (${displayName(cream,'creamId')})`}),el('dd',{text:'+ '+formatVND(cream.priceModifier||0)})
  );
}

async function init(){
  const image=$('#cake-image');
  image.addEventListener('error',()=>{image.hidden=true;});
  if(image.complete&&!image.naturalWidth)image.hidden=true;
  try{
    options=await getOptions();
    config={sizeId:options.sizes[0].id,flavorId:options.flavors[0].id,creamId:options.creams[0].id,fontId:options.fonts[1]?.id||options.fonts[0].id,colorId:options.textColors[1]?.id||options.textColors[0].id,text:''};
    choices('#cake-sizes',options.sizes,'sizeId');
    choices('#cake-flavors',options.flavors,'flavorId');
    choices('#cake-creams',options.creams,'creamId');
    $('#cake-font').replaceChildren(...options.fonts.map(item=>el('option',{value:item.id,text:item.name})));
    $('#cake-font').value=config.fontId;
    $('#cake-font').addEventListener('change',event=>{config.fontId=event.target.value;update();});
    const colors=$('#cake-colors');
    colors.replaceChildren();
    for(const color of options.textColors){
      const label=el('label',{className:'custom-color',title:color.name});
      const input=el('input',{type:'radio',name:'color',value:color.id,checked:color.id===config.colorId,'aria-label':color.name});
      const swatch=el('span',{text:color.name});
      swatch.style.backgroundColor=color.value;
      input.addEventListener('change',()=>{config.colorId=color.id;update();});
      label.append(input,swatch);
      colors.append(label);
    }
    $('#cake-text').addEventListener('input',event=>{
      config.text=event.target.value;
      $('#cake-counter').textContent=config.text.length+'/30 ký tự';
      update();
    });
    $('#cake-add').addEventListener('click',async()=>{
      const button=$('#cake-add');
      if(button.disabled)return;
      button.disabled=true;
      button.textContent='Đang tạo bánh...';
      $('#cake-feedback').textContent='';
      try{
        if(!options.customProductId)throw Error('Chưa có sản phẩm khuôn Bánh Tùy Chỉnh');
        const cake=await createCake(config);
        await addToCart({collectionId:'bakeryproducts',itemId:options.customProductId,quantity:1,customCakeId:cake.id});
        trackEvent('add_to_cart',{currency:'VND',value:cake.estimatedPrice,item_name:'Bánh Tùy Chỉnh'});
        toast({title:'Đã thêm bánh thiết kế',description:'Thiết kế đã được lưu trong giỏ hàng.',variant:'success'});
        openCart();
      }catch(error){
        console.error(error);
        $('#cake-feedback').textContent=error.message;
        toast({title:'Không thể thêm bánh',description:error.message,variant:'destructive'});
      }finally{button.disabled=false;button.textContent='Hoàn Tất & Thêm Vào Giỏ';}
    });
    await update();
    trackEvent('view_item',{item_name:'Cake Customizer'});
  }catch(error){
    console.error(error);
    $('#cake-feedback').textContent='Không tải được cấu hình bánh. Vui lòng thử lại.';
    $('#cake-add').disabled=true;
  }
}
init();
