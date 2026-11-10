export function localDbPassword(){
 const password=process.env.BOBOT_LOCAL_DB_PASSWORD;
 if(!password)throw Error('Cần đặt BOBOT_LOCAL_DB_PASSWORD cho PostgreSQL LOCAL trước khi chạy script.');
 return password;
}
