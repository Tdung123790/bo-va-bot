let configPromise;
export async function getConfig(){
  if(!configPromise) configPromise=fetch('data/site-config.json').then(r=>{if(!r.ok)throw new Error(`Không tải được cấu hình: ${r.status}`);return r.json();}).catch(e=>{configPromise=null;throw e;});
  return configPromise;
}
export function clearConfigCache(){configPromise=null;}
