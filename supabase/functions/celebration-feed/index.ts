import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'content-type','Access-Control-Expose-Headers':'X-Slideshow-Duration-Seconds, X-Slideshow-Slide-Count','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export function escapeXml(text:string){return text.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))}
export function buildRss(items:{id:string;caption:string;updated_at:string;slide_bytes:number}[],imageUrl:(id:string)=>string){
 return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Team Powers Celebrations</title><description>Approved team celebrations. Each slide plays for 10 seconds.</description><link>https://celebrations.powerspizza.com</link><ttl>1</ttl>${items.map(i=>`<item><title>${escapeXml(i.caption)}</title><guid isPermaLink="false">${escapeXml(i.id+':'+i.updated_at)}</guid><link>${escapeXml(imageUrl(i.id))}</link><media:content url="${escapeXml(imageUrl(i.id))}" medium="image" type="image/png" fileSize="${i.slide_bytes}" duration="10"/></item>`).join('')}</channel></rss>`;
}
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:cors});
 const url=new URL(request.url),token=url.searchParams.get('token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Playback key required',{status:401,headers:cors});
 try{
  const project=Deno.env.get('SUPABASE_URL')!,db=createClient(project,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:key,error:keyError}=await db.from('celebration_playback_keys').select('id').eq('token_hash',await tokenHash(token)).eq('active',true).maybeSingle();
  if(keyError)throw keyError;if(!key)return new Response('Playback link revoked or invalid',{status:403,headers:cors});
  const id=url.searchParams.get('image');
  if(id){
   if(!/^[0-9a-f-]{36}$/.test(id))return new Response('Not found',{status:404,headers:cors});
   const {data:slide,error}=await db.from('celebrations').select('slide_path,slide_bytes').eq('id',id).eq('status','approved').gt('expires_at',new Date().toISOString()).maybeSingle();
   if(error)throw error;if(!slide)return new Response('Not found',{status:404,headers:cors});
   const headers={...cors,'Content-Type':'image/png','Content-Length':String(slide.slide_bytes)};
   if(request.method==='HEAD')return new Response(null,{headers});
   const {data:blob,error:downloadError}=await db.storage.from('celebrations').download(slide.slide_path);
   if(downloadError||!blob)throw downloadError||Error('Photo missing');
   return new Response(blob,{headers});
  }
  const {data:items,error}=await db.from('celebrations').select('id,caption,updated_at,expires_at,slide_bytes').eq('status','approved').gt('expires_at',new Date().toISOString()).order('approved_at',{ascending:false}).order('id');
  if(error)throw error;
  const slides=items||[],headers={...cors,'X-Slideshow-Duration-Seconds':String(slides.length*10),'X-Slideshow-Slide-Count':String(slides.length)};
  const imageUrl=(id:string)=>{const u=new URL(project+'/functions/v1/celebration-feed');u.searchParams.set('token',token);u.searchParams.set('image',id);const slide=slides.find(i=>i.id===id);if(slide)u.searchParams.set('v',slide.updated_at);return u.toString()};
  const json=url.searchParams.get('format')==='json';
  const content=json?JSON.stringify({slide_count:slides.length,slide_duration_seconds:10,duration_seconds:slides.length*10,items:slides.map(i=>({id:i.id,caption:i.caption,expires_at:i.expires_at,url:imageUrl(i.id)}))}):buildRss(slides,imageUrl);
  return new Response(request.method==='HEAD'?null:content,{headers:{...headers,'Content-Type':json?'application/json; charset=utf-8':'application/rss+xml; charset=utf-8'}});
 }catch{return new Response('Celebration feed temporarily unavailable',{status:503,headers:cors})}
});
