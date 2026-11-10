export function initAddressAutocomplete(input,{onSelect=()=>{},debounceMs=650,search=null}={}){
 const BOBOT_ADDRESS_AUTOCOMPLETE_V1=true;
 const popup=document.createElement('div');
 popup.className='address-suggestions';
 popup.id='address-suggestions-'+Math.random().toString(36).slice(2);
 input.after(popup);
 input.setAttribute('role','combobox');
 input.setAttribute('aria-autocomplete','list');
 input.setAttribute('aria-controls',popup.id);
 popup.setAttribute('role','listbox');
 let entries=[],selected=-1,timer,controller;

 function close(){
  entries=[];selected=-1;
  popup.replaceChildren();
  input.setAttribute('aria-expanded','false');
 }

 function draw(){
  popup.replaceChildren();
  input.setAttribute('aria-expanded',String(entries.length>0));
  entries.forEach((s,i)=>{
   const b=document.createElement('button');
   b.type='button';
   b.setAttribute('role','option');
   b.id=popup.id+'-'+i;
   b.textContent=s.display_name;
   b.setAttribute('aria-selected',String(i===selected));
   b.addEventListener('click',()=>choose(i));
   popup.append(b);
  });
  input.setAttribute('aria-activedescendant',selected<0?'':popup.id+'-'+selected);
 }

 function choose(i){
  const entry=entries[i];
  if(!entry)return;
  input.value=entry.display_name;
  close();
  onSelect(entry);
 }

 async function lookup(q){
  controller?.abort();
  controller=new AbortController();
  const current=controller;
  try{
   const results=search?await search(q,current.signal):[];
   if(current!==controller||current.signal.aborted)return;
   entries=results.filter(x=>
    typeof x.display_name==='string'&&
    Number.isFinite(Number(x.lat))&&
    Number.isFinite(Number(x.lon))
   );
   selected=-1;
   draw();
  }catch(e){
   if(e.name!=='AbortError'&&current===controller)close();
  }
 }

 input.addEventListener('input',()=>{
  clearTimeout(timer);
  controller?.abort();
  close();
  const q=input.value.trim();
  if(q.length>=4)timer=setTimeout(()=>lookup(q),debounceMs);
 });

 input.addEventListener('keydown',e=>{
  if(!entries.length)return;
  if(e.key==='ArrowDown'){
   e.preventDefault();
   selected=Math.min(entries.length-1,selected+1);
   draw();
  }else if(e.key==='ArrowUp'){
   e.preventDefault();
   selected=Math.max(0,selected-1);
   draw();
  }else if(e.key==='Enter'&&selected>=0){
   e.preventDefault();
   choose(selected);
  }else if(e.key==='Escape'){
   e.preventDefault();
   close();
  }
 });

 document.addEventListener('pointerdown',e=>{
  if(e.target!==input&&!popup.contains(e.target))close();
 });

 return {
  destroy(){
   clearTimeout(timer);
   controller?.abort();
   popup.remove();
  },
  close
 };
}
