import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const cartCode=fs.readFileSync(new URL('../site/js/services/cartService.js',import.meta.url),'utf8');
const remote=new Map();
const deep=x=>JSON.parse(JSON.stringify(x));
function mockServer(owner,action,args){
 const items=deep(remote.get(owner)||[]);
 const key=args.p_key;
 if(action==='add'){
  const row=deep(args.p_item),found=items.find(v=>v.key===row.key);
  if(found)found.quantity+=row.quantity;else items.push(row);
 }else if(action==='set'){
  const found=items.find(v=>v.key===key);if(!found)throw Error('not found');found.quantity=args.p_quantity;
 }else if(action==='remove'){
  for(let i=items.length-1;i>=0;i--)if(items[i].key===key)items.splice(i,1);
 }else if(action==='clear')items.length=0;
 else if(action==='import')for(const row of args.p_items){const found=items.find(v=>v.key===row.key);if(found)found.quantity=Math.min(99,found.quantity+row.quantity);else items.push(deep(row));}
 remote.set(owner,deep(items));return {items};
}
async function device(name){
 let user=null,slowProduct=null;
 const storage=new Map(),cakes=new Map(),listeners=new Set();
 const window=new EventTarget(),document=new EventTarget();document.hidden=false;
 class CustomEvent extends Event{constructor(type,opts){super(type);this.detail=opts?.detail;}}
 const storeState=new Map();
 const client={
  from(table){assert.equal(table,'customer_carts');return {select(){return{eq(field,owner){return{async maybeSingle(){
   assert.equal(field,'customer_id');assert.equal(user?.id,owner,'own account RLS');
   return {data:remote.has(owner)?{items:deep(remote.get(owner))}:null,error:null};
  }}}}}}},
  async rpc(name,args){assert.equal(name,'customer_cart_mutate');assert.ok(user?.id);return {data:mockServer(user.id,args.p_action,args),error:null};},
  channel(){return {on(){return this;},subscribe(){return this;}};},
  async removeChannel(){}
 };
 const modules=new Map();
 const stubs={
  '../core/storage.js':{getJSON:(k,f)=>storage.has(k)?deep(storage.get(k)):f,setJSON:(k,v)=>{storage.set(k,deep(v));return true;},removeKey:k=>storage.delete(k)},
  '../core/store.js':{store:{set:(a,b)=>{if(typeof a==='string')storeState.set(a,b);else Object.entries(a).forEach(([k,v])=>storeState.set(k,v));},get:k=>storeState.get(k)}},
  './productService.js':{getById:async id=>{if(slowProduct)await slowProduct;return {id,name:id,price:100,stockQuantity:999,status:'active',isCustomizable:id==='CUSTOM',image:''};}},
  './customCakeService.js':{
   getById:id=>cakes.get(id)||null,
   calculatePrice:async()=>120000,
   copyGuestCakesToAccount:ids=>{const rows=storage.get('bobot:v1:customCakes')||[];for(const item of rows)if(ids.includes(item.id))cakes.set(item.id,item);},
   hydrateAccountCakes:(items,owner)=>{if(user?.id!==owner)return;for(const item of items)if(item.customCakeData)cakes.set(item.customCakeId,item.customCakeData);},
   CUSTOM_CAKES_KEY:'bobot:v1:customCakes'
  },
  '../core/backend.js':{isSupabaseMode:()=>true,getSupabaseClient:async()=>client,backendError:e=>e},
  './authService.js':{getCurrentMember:()=>user,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}}
 };
 const context=vm.createContext({window,document,CustomEvent,Event,EventTarget,Error,Map,Set,Array,Number,Boolean,String,Object,JSON,Promise,console,setInterval:()=>1});
 for(const [specifier,exports]of Object.entries(stubs))modules.set(specifier,new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context}));
 const mod=new vm.SourceTextModule(cartCode,{context,identifier:name});
 await mod.link(spec=>{if(!modules.has(spec))throw Error('unknown '+spec);return modules.get(spec);});
 await mod.evaluate();
 return {api:mod.namespace,setUser(next){user=next;for(const fn of listeners)fn(user);},get user(){return user;},storage,cakes,slow:(p)=>slowProduct=p};
}
const a=await device('desktop'),b=await device('phone');
const A={id:'aaaa',role:'customer'},B={id:'bbbb',role:'customer'};
await a.api.addToCart({itemId:'GUEST-1'});
assert.deepEqual(a.api.getCart().map(i=>i.productId),['GUEST-1']);
a.setUser(A);await a.api.ensureCartReady();assert.deepEqual(a.api.getCart(),[]);
await a.api.addToCart({itemId:'X'});
b.setUser(A);await b.api.ensureCartReady();assert.deepEqual(b.api.getCart().map(i=>i.productId),['X']);
await b.api.addToCart({itemId:'Y'});
await a.api.refreshCart();assert.deepEqual(a.api.getCart().map(i=>i.productId),['X','Y']);
await a.api.updateQuantity('X||',3);
await b.api.refreshCart();assert.equal(b.api.getCart().find(i=>i.key==='X||').quantity,3);
await b.api.removeFromCart('Y||');await a.api.refreshCart();assert.deepEqual(a.api.getCart().map(i=>i.productId),['X']);
b.setUser(B);await b.api.ensureCartReady();assert.deepEqual(b.api.getCart(),[]);
await b.api.addToCart({itemId:'B-ONLY'});
a.setUser(null);assert.deepEqual(a.api.getCart(),[],'guest cart cleared on logout');
a.setUser(B);await a.api.ensureCartReady();assert.deepEqual(a.api.getCart().map(i=>i.productId),['B-ONLY']);
a.setUser(A);await a.api.ensureCartReady();assert.deepEqual(a.api.getCart().map(i=>i.productId),['X']);
await a.api.clearCart();await b.api.refreshCart();
b.setUser(A);await b.api.ensureCartReady();assert.deepEqual(b.api.getCart(),[]);
a.cakes.set('cake-1',{id:'cake-1',sizeId:'s',flavorId:'f',creamId:'c',text:'Birthday'});
await a.api.addToCart({itemId:'CUSTOM',customCakeId:'cake-1'});
await b.api.refreshCart();
assert.equal(b.api.getCart()[0].customCakeData.text,'Birthday');
assert.equal(b.cakes.get('cake-1').text,'Birthday');
a.setUser(null);await a.api.addToCart({itemId:'GUEST-2'});
a.setUser(A);await a.api.ensureCartReady();
assert.deepEqual(a.api.getCart().map(x=>x.productId),['CUSTOM']);
await a.api.claimGuestCart();await b.api.refreshCart();
assert.deepEqual(b.api.getCart().map(x=>x.productId),['CUSTOM','GUEST-2']);
assert.deepEqual(a.storage.get('bobot:v1:guestCart'),[]);
console.log('PASS: guest isolation, two devices same user, cart refresh, update/remove/clear, customer A/B, custom cake sync, explicit guest import');
