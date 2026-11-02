export function getJSON(key,fallback=null){try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch(error){console.warn('Không đọc được localStorage',key,error);return fallback;}}
export function setJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(error){console.warn('Không ghi được localStorage',key,error);return false;}}
export function removeKey(key){try{localStorage.removeItem(key);return true;}catch(error){console.warn('Không xóa được localStorage',key,error);return false;}}
export const get=getJSON;export const set=setJSON;
