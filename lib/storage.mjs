import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_DIR = path.join(ROOT,'data','uploads');
await fs.mkdir(LOCAL_DIR,{recursive:true});

const r2Enabled = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL);
let s3Promise = null;

export function storageMode(){ return r2Enabled ? 'r2' : 'local'; }

function safeExt(mime){
  return mime.includes('png')?'.png':mime.includes('jpeg')||mime.includes('jpg')?'.jpg':mime.includes('webp')?'.webp':mime.includes('mp4')?'.mp4':mime.includes('webm')?'.webm':mime.includes('mpeg')?'.mp3':mime.includes('audio/mp4')?'.m4a':'.bin';
}

async function getS3(){
  if(!r2Enabled) return null;
  if(!s3Promise){
    s3Promise = Promise.all([import('@aws-sdk/client-s3')]).then(([m])=>({
      client:new m.S3Client({
        region:'auto',
        endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}
      }),
      PutObjectCommand:m.PutObjectCommand,
      DeleteObjectCommand:m.DeleteObjectCommand
    }));
  }
  return s3Promise;
}

export async function putMedia({projectId,mime,data,name}){
  const ext=safeExt(mime);
  const key=`projects/${projectId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  if(r2Enabled){
    const {client,PutObjectCommand}=await getS3();
    await client.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:data,ContentType:mime,CacheControl:'public, max-age=31536000, immutable',Metadata:{original:String(name||'upload').slice(0,120)}}));
    const base=process.env.R2_PUBLIC_BASE_URL.replace(/\/$/,'');
    return {key,url:`${base}/${key}`,backend:'r2'};
  }
  const filename=path.basename(key);
  await fs.writeFile(path.join(LOCAL_DIR,filename),data);
  return {key:filename,url:`/uploads/${filename}`,backend:'local'};
}

export async function deleteMedia(item){
  if(!item?.storageKey) return;
  if(item.storageBackend==='r2' && r2Enabled){
    const {client,DeleteObjectCommand}=await getS3();
    await client.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:item.storageKey}));
    return;
  }
  await fs.unlink(path.join(LOCAL_DIR,path.basename(item.storageKey))).catch(()=>{});
}

export function localUploadPath(urlPath){
  if(!String(urlPath).startsWith('/uploads/')) return null;
  return path.join(LOCAL_DIR,path.basename(urlPath));
}
