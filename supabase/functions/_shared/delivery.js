export function normalizeAddress(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').replace(/đ/gu,'d').replace(/Đ/gu,'D').toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim().replace(/\s+/gu,' ');
}

export function distanceKm(aLat,aLng,bLat,bLng){
 const radians=value=>value*Math.PI/180;
 const deltaLat=radians(bLat-aLat),deltaLng=radians(bLng-aLng);
 const value=Math.sin(deltaLat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(deltaLng/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,value)));
}

export function validateProviderMatch(address,pin,result){
 if(normalizeAddress(address).length<12||normalizeAddress(address).length>500)throw Error('ADDRESS_REQUIRED');
 const lat=Number(result?.lat),lng=Number(result?.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180)throw Error('GEOCODER_INVALID_LOCATION');
 const submitted=normalizeAddress(address),street=normalizeAddress(result?.road),house=normalizeAddress(result?.house_number),city=normalizeAddress(result?.city);
 const streetParts=street.split(' ').filter(part=>part.length>=3&&!['duong','street','road','quan','phuong'].includes(part));
 const cityParts=city.split(' ').filter(part=>part.length>=3&&!['thanh','pho','city','tinh','province'].includes(part));
 const submittedHouse=normalizeAddress(String(address).match(/(?:^|\s)\d+(?:\/\d+)*[a-z]?(?=\s|,|$)/iu)?.[0]);
 if(result?.country_code!=='VN'||!house||!street||!submittedHouse||submittedHouse!==house
   ||!streetParts.length||!streetParts.every(part=>submitted.split(' ').includes(part))
   ||!cityParts.length||!cityParts.every(part=>submitted.split(' ').includes(part))
   ||typeof result?.provider_ref!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(result.provider_ref)){
  throw Error('ADDRESS_MANUAL_REVIEW_REQUIRED');
 }
 if(!Number.isFinite(Number(pin?.lat))||!Number.isFinite(Number(pin?.lng))
   ||distanceKm(Number(pin.lat),Number(pin.lng),lat,lng)>0.1)throw Error('PIN_ADDRESS_MISMATCH');
 return {lat,lng,providerRef:result.provider_ref};
}

export function shippingFee(distance){
 if(!Number.isFinite(distance)||distance<0||distance>10)throw Error('OUTSIDE_DELIVERY_AREA');
 return distance<=3?20000:distance<=5?30000:50000;
}
