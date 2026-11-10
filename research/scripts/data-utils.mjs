import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const crcTable=Array.from({length:256},(_,index)=>{
 let value=index;
 for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
 return value>>>0;
});
function crc32(bytes){
 let value=0xffffffff;
 for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);
 return (value^0xffffffff)>>>0;
}
export async function openZip(file){
 const bytes=await fs.readFile(file);
 let end=-1;
 for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--){
  if(bytes.readUInt32LE(offset)===0x06054b50){end=offset;break;}
 }
 assert.ok(end>=0,'ZIP_END_NOT_FOUND');
 assert.equal(bytes.readUInt16LE(end+4),0,'ZIP_MULTIDISK_FORBIDDEN');
 const total=bytes.readUInt16LE(end+10),directoryOffset=bytes.readUInt32LE(end+16);
 const entries=new Map();
 let offset=directoryOffset,totalSize=0;
 for(let index=0;index<total;index++){
  assert.equal(bytes.readUInt32LE(offset),0x02014b50,'ZIP_CENTRAL_DIRECTORY_INVALID');
  const method=bytes.readUInt16LE(offset+10),crc=bytes.readUInt32LE(offset+16);
  const compressed=bytes.readUInt32LE(offset+20),size=bytes.readUInt32LE(offset+24);
  const filenameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32);
  const name=bytes.toString('utf8',offset+46,offset+46+filenameLength);
  assert.ok(name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&!/^[A-Za-z]:/.test(name),'ZIP_UNSAFE_PATH');
  assert.ok(!entries.has(name),'ZIP_DUPLICATE_ENTRY');
  assert.ok(method===0||method===8,'ZIP_UNSUPPORTED_COMPRESSION');
  assert.ok(size<=30000000,'ZIP_ENTRY_TOO_LARGE');
  totalSize+=size;
  assert.ok(totalSize<=100000000,'ZIP_TOTAL_TOO_LARGE');
  entries.set(name,{name,size,compressed,crc,method,localOffset:bytes.readUInt32LE(offset+42)});
  offset+=46+filenameLength+extraLength+commentLength;
 }
 function read(name){
  const entry=entries.get(name);
  assert.ok(entry,`ZIP_ENTRY_MISSING: ${name}`);
  const local=entry.localOffset;
  assert.equal(bytes.readUInt32LE(local),0x04034b50,'ZIP_LOCAL_HEADER_INVALID');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  const packed=bytes.subarray(start,start+entry.compressed);
  const data=entry.method===0?packed:zlib.inflateRawSync(packed);
  assert.equal(data.length,entry.size,`ZIP_SIZE_MISMATCH: ${name}`);
  assert.equal(crc32(data),entry.crc,`ZIP_CRC_MISMATCH: ${name}`);
  return data;
 }
 return {entries,read};
}

export function* csvRows(bytes){
 const source=bytes.toString('utf8').replace(/^\uFEFF/,'');
 let field='',row=[],quoted=false;
 for(let index=0;index<source.length;index++){
  const char=source[index];
  if(quoted){
   if(char==='"'&&source[index+1]==='"'){field+='"';index++;}
   else if(char==='"')quoted=false;
   else field+=char;
  }else if(char==='"')quoted=true;
  else if(char===','){row.push(field);field='';}
  else if(char==='\n'){
   row.push(field.replace(/\r$/,''));
   if(row.some(value=>value!==''))yield row;
   row=[];field='';
  }else field+=char;
 }
 assert.ok(!quoted,'CSV_UNCLOSED_QUOTE');
 if(field!==''||row.length){row.push(field.replace(/\r$/,''));yield row;}
}

export function readCsv(zip,name,onRow){
 const iterator=csvRows(zip.read(name));
 const head=iterator.next();
 assert.ok(!head.done,`CSV_EMPTY: ${name}`);
 const columns=head.value;
 assert.equal(new Set(columns).size,columns.length,`CSV_DUPLICATE_COLUMNS: ${name}`);
 let count=0;
 for(const values of iterator){
  assert.equal(values.length,columns.length,`CSV_COLUMN_COUNT: ${name}:${count+2}`);
  const row=Object.fromEntries(columns.map((column,index)=>[column,values[index]]));
  count++;
  onRow?.(row,count);
 }
 return {count,columns};
}
