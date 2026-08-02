import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
export const sha256=(v:string)=>createHash('sha256').update(v).digest('hex');
export const randomToken=()=>randomBytes(48).toString('base64url');
export function safeEqual(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export const hmac=(secret:string,raw:Buffer|string)=>createHmac('sha256',secret).update(raw).digest('hex');
