/** 邀请码活动同站 embed：PWA iframe 内一等公民 storage，可抑制引导弹窗并稳定 session。 */

import { clientWithBasePath } from '@/lib/basePath';

export const CAMPAIGN_EMBED_SITES = {
  'hebrews-30': 'https://hebrews-30.pages.dev',
  'genesis-50': 'https://genesis-50.pages.dev',
} as const;

export type CampaignEmbedSite = keyof typeof CAMPAIGN_EMBED_SITES;

const EMBED_PREFIX = '/campaigns/embed';

export function isCampaignEmbedSite(site: string): site is CampaignEmbedSite {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_EMBED_SITES, site);
}

export function campaignEmbedSiteFromHref(href: string): CampaignEmbedSite | null {
  const t = (href || '').trim().toLowerCase();
  if (!t) return null;
  if (t.includes('hebrews-30') || t.includes('hebrews30') || t.includes('hebrews')) {
    return 'hebrews-30';
  }
  if (t.includes('genesis-50') || t.includes('genesis50')) {
    return 'genesis-50';
  }
  try {
    const host = new URL(t.startsWith('//') ? `https:${t}` : t).hostname.toLowerCase();
    if (host === 'hebrews-30.pages.dev' || host.endsWith('.hebrews-30.pages.dev')) {
      return 'hebrews-30';
    }
    if (host === 'genesis-50.pages.dev' || host.endsWith('.genesis-50.pages.dev')) {
      return 'genesis-50';
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 浏览器内路径前缀（含 basePath），供 pathname shim 使用 */
export function campaignEmbedPathPrefix(site: CampaignEmbedSite): string {
  const path = `${EMBED_PREFIX}/${site}`;
  if (typeof window !== 'undefined') {
    return clientWithBasePath(path).replace(/\/$/, '') || path;
  }
  return path;
}

/**
 * 把活动站绝对 URL 转成彼爱同站 embed URL（保留 path/query）。
 * 非白名单域名原样返回。
 */
export function toCampaignEmbedUrl(targetHref: string): string {
  const raw = (targetHref || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const site = campaignEmbedSiteFromHref(u.href);
    if (!site) return raw;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://2sc.prestoai.cn';
    const prefix = campaignEmbedPathPrefix(site);
    // 根路径不要尾斜杠，避免 Next/Nginx 308 丢掉体验
    const restPath = u.pathname.replace(/\/+$/, '') || '';
    const embedPath = restPath ? `${prefix}${restPath}` : prefix;
    const out = new URL(embedPath, origin);
    out.search = u.search;
    out.hash = '';
    return out.toString();
  } catch {
    return raw;
  }
}

export function isCampaignEmbedHref(href: string): boolean {
  try {
    const u = new URL(
      (href || '').trim().startsWith('//')
        ? `https:${(href || '').trim()}`
        : (href || '').trim(),
      typeof window !== 'undefined' ? window.location.origin : 'https://2sc.prestoai.cn',
    );
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const stripped = path.includes(EMBED_PREFIX)
      ? path.slice(path.indexOf(EMBED_PREFIX))
      : path;
    return stripped === EMBED_PREFIX || stripped.startsWith(`${EMBED_PREFIX}/`);
  } catch {
    return false;
  }
}

const INVITE_CODE_COOKIE = 'peiai_campaign_code';
const INVITE_ANON_KEY = 'sb_publishable_aH3DWsTgZ4X0A4W_zJmyzw_wd7yk7pm';

/** 活动页内的邀请码小卡片。App 顶栏已有入口时（peiai_shell=1）不再重复。 */
export function buildInviteDockScript(pathPrefix: string): string {
  const prefix = pathPrefix.replace(/\/$/, '') || pathPrefix;
  return `<style>
#peiai-invite-dock{margin:0;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:5px 10px;background:rgba(255,255,255,.1);color:rgba(255,248,240,.9);font:12px/1.2 system-ui,sans-serif;white-space:nowrap}
#peiai-invite-mask{position:fixed;z-index:500;width:min(260px,calc(100vw - 24px));padding:14px;border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:10px}
#peiai-invite-mask[hidden]{display:none}
#peiai-invite-mask input{width:100%;min-height:44px;box-sizing:border-box;border:1px solid rgba(34,34,34,.14);border-radius:12px;background:#fff;color:#222;font-size:18px;font-weight:600;letter-spacing:.12em;text-align:center;text-transform:uppercase}
#peiai-invite-mask .err{min-height:1.2em;margin:0;color:#b42318;font-size:13px}
#peiai-invite-mask .go{min-height:44px;border:0;border-radius:12px;background:#8C5A3C;color:#fff;font-size:16px;font-weight:600}
#peiai-invite-mask .go:disabled{opacity:.55}
body,.app-shell{padding-bottom:calc(env(safe-area-inset-bottom,0px) + 88px)}
.bottom-0{bottom:calc(env(safe-area-inset-bottom,0px) + 16px) !important}
button,a,[role="button"]{touch-action:manipulation}
</style>
<script>(function(){
var CK=${JSON.stringify(INVITE_CODE_COOKIE)};
var KEY=${JSON.stringify(INVITE_ANON_KEY)};
var API=${JSON.stringify(`${prefix}/api/auth/v1/token?grant_type=password`)};
function norm(v){return (v||"").replace(/\\s/g,"").toUpperCase();}
function fromCookie(){var m=document.cookie.match(new RegExp("(?:^|; )"+CK+"=([A-Za-z0-9]+)"));return m?m[1]:"";}
function read(){var c=fromCookie();if(c)return c;try{return localStorage.getItem(CK)||"";}catch(e){return "";}}
function write(code){document.cookie=CK+"="+code+"; Path=/; Max-Age=31536000; SameSite=Lax";try{localStorage.setItem(CK,code);}catch(e){}}
var fromUrl=norm(new URLSearchParams(location.search).get("code")||new URLSearchParams(location.search).get("invite")||"");
if(/^[A-Z0-9]{4,16}$/.test(fromUrl))write(fromUrl);
var ls="";try{ls=localStorage.getItem(CK)||"";}catch(e){}
if(ls&&!fromCookie()){write(ls);if(!sessionStorage.getItem("peiai-code-sync")){sessionStorage.setItem("peiai-code-sync","1");location.reload();return;}}
if(/(?:^|[?&])peiai_shell=1(?:&|$)/.test(location.search))return;
var btn=document.createElement("button");
btn.id="peiai-invite-dock";btn.type="button";btn.textContent="邀请码";
var mask=document.createElement("div");
mask.id="peiai-invite-mask";mask.hidden=true;
mask.innerHTML='<input maxlength="16" autocomplete="off" autocapitalize="characters" placeholder="8 位邀请码"><p class="err"></p><button type="button" class="go">进入活动</button>';
var input=mask.querySelector("input");
var err=mask.querySelector(".err");
var go=mask.querySelector(".go");
function open(){err.textContent="";input.value=read();go.disabled=!norm(input.value);go.textContent="进入活动";var r=btn.getBoundingClientRect();mask.style.top=(r.bottom+8)+"px";mask.style.right=Math.max(12,window.innerWidth-r.right)+"px";mask.hidden=false;input.focus();}
function close(){mask.hidden=true;}
function place(){
  var more=[].slice.call(document.querySelectorAll(".topbar button")).find(function(el){return el!==btn&&(el.textContent||"").indexOf("更多")>=0;});
  var actions=more&&more.parentElement;
  if(!actions)return;
  if(btn.parentElement!==actions)actions.appendChild(btn);
  if(!mask.parentElement)document.body.appendChild(mask);
}
btn.addEventListener("pointerup",function(e){e.preventDefault();e.stopPropagation();if(mask.hidden)open();else close();});
input.addEventListener("input",function(){go.disabled=!norm(input.value);});
document.addEventListener("pointerdown",function(e){if(mask.hidden)return;var t=e.target;if(t===btn||mask.contains(t))return;close();},true);
go.addEventListener("click",function(){
  var code=norm(input.value);
  if(!/^[A-Z0-9]{4,16}$/.test(code)){err.textContent="请输入邀请码";return;}
  go.disabled=true;go.textContent="进入中…";err.textContent="";
  fetch(API,{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:JSON.stringify({email:code.toLowerCase()+"@invite.local",password:"G50-"+code})})
    .then(function(r){if(!r.ok)throw new Error("bad");return r.json();})
    .then(function(data){if(!data||!data.access_token)throw new Error("bad");write(code);sessionStorage.removeItem("peiai-code-sync");location.reload();})
    .catch(function(){err.textContent="进入失败，请检查邀请码后重试";go.disabled=false;go.textContent="进入活动";});
});
var moreGuard=0;
var swallowBackdrop=0;
function isMore(el){
  if(!el||el===btn)return false;
  if((el.getAttribute("title")||"")==="更多")return true;
  var t=(el.textContent||"").replace(/\\s/g,"");
  return t==="更多";
}
function moreBox(){return document.querySelector(".fixed.inset-0");}
function armMore(){moreGuard=Date.now()+900;swallowBackdrop=1;}
function openMore(el){
  armMore();
  if(moreBox())return;
  el.click();
}
document.addEventListener("touchend",function(e){
  var raw=e.target;
  var el=raw&&raw.closest?raw.closest("button"):null;
  if(!isMore(el))return;
  e.preventDefault();
  openMore(el);
},{capture:true,passive:false});
document.addEventListener("click",function(e){
  var raw=e.target;
  var el=raw&&raw.closest?raw.closest("button"):null;
  if(isMore(el)){armMore();return;}
  if(!swallowBackdrop||Date.now()>moreGuard)return;
  var box=raw&&raw.closest?raw.closest(".fixed.inset-0"):null;
  if(box&&raw===box){swallowBackdrop=0;e.preventDefault();e.stopPropagation();}
},true);
function mount(){place();}
if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount);
new MutationObserver(place).observe(document.documentElement,{childList:true,subtree:true});
})();</script>`;
}

/** 注入：预写完整 session（含 JWT 解码出的 user，防 supabase-js Tl() Proxy 抛错）并清掉 URL token 参数。 */
export function buildCampaignEmbedBootScript(
  pathPrefix: string,
  fallbackSession?: Record<string, unknown> | null,
): string {
  const FB = fallbackSession ? JSON.stringify(fallbackSession) : 'null';
  return `<script>(function(){var FB=${FB};try{localStorage.setItem("g50-onboarding-seen","1");localStorage.setItem("g50-whatsnew-seen-count","99");var q=new URLSearchParams(location.search);var at=q.get("access_token")||(FB&&FB.access_token)||"",rt=q.get("refresh_token")||(FB&&FB.refresh_token)||"";if(at&&rt){var ei=Number(q.get("expires_in")||(FB&&FB.expires_in)||3600);var ea=Number(q.get("expires_at")||(FB&&FB.expires_at))||(Math.floor(Date.now()/1000)+ei);var u=(FB&&FB.user)||null;if(!u){try{var b64=at.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");while(b64.length%4)b64+="=";var pl=JSON.parse(decodeURIComponent(escape(atob(b64))));if(pl&&pl.sub){u={id:pl.sub,aud:pl.aud||"authenticated",role:pl.role||"authenticated",email:pl.email||"",phone:pl.phone||"",app_metadata:pl.app_metadata||{},user_metadata:pl.user_metadata||{},identities:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}}catch(e){}}var sObj={access_token:at,refresh_token:rt,expires_in:ei,expires_at:ea,token_type:q.get("token_type")||(FB&&FB.token_type)||"bearer"};if(u)sObj.user=u;var s=JSON.stringify(sObj);var ks=["sb-ytiwfmufekvxdgyaokae-auth-token","sb-hebrews-30-auth-token","sb-genesis-50-auth-token","sb-"+location.hostname.split(".")[0]+"-auth-token"];for(var i=0;i<ks.length;i++){localStorage.setItem(ks[i],s);if(u)localStorage.setItem(ks[i]+"-user",JSON.stringify({user:u}));}if(u){try{var g50=JSON.parse(localStorage.getItem("g50-auth")||"{}");if(!g50||!g50.state||!g50.state.supabaseUser){localStorage.setItem("g50-auth",JSON.stringify({state:{supabaseUser:u,profile:(g50&&g50.state&&g50.state.profile)||null},version:0}));}}catch(e){}}try{var dirty=false;["access_token","refresh_token","expires_in","expires_at","token_type","type","code","invite"].forEach(function(k){if(q.has(k)){q.delete(k);dirty=true;}});if(dirty){var qs=q.toString();history.replaceState(history.state,"",location.pathname+(qs?"?"+qs:"")+location.hash);}}catch(e){}}}catch(e){}})();</script>`;
}

export function rewriteCampaignEmbedHtml(
  html: string,
  pathPrefix: string,
  fallbackSession?: Record<string, unknown> | null,
): string {
  const prefix = pathPrefix.replace(/\/$/, '') || pathPrefix;
  let out = html;
  // 安卓 WebView 的 onPageFinished 会等 favicon（现拉 pages.dev 常超时）；无 icon 声明时又会去请求根 /favicon.ico（404）。
  out = out.replace(/<link\b[^>]*\brel=(["'])(?:shortcut )?icon\1[^>]*>\s*/gi, '');
  out = out.replace(/(src|href)=(["'])\/(?!\/)/g, `$1=$2${prefix}/`);
  // 小米等国行系统 WebView 加载 type=module / modulepreload 会一直空白，load 也不结束。
  // 改成一份已打包的普通脚本，浏览器打开的那条路不受影响。
  out = out.replace(/<link\b[^>]*\brel=(["'])modulepreload\1[^>]*>\s*/gi, '');
  out = out.replace(/<script\b[^>]*\btype=(["'])module\1[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/\s+crossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
  const classicName = prefix.includes('hebrews-30')
    ? 'embed-classic-hebrews30.js'
    : 'embed-classic-genesis50.js';
  const classic = `<script defer src="${prefix}/assets/${classicName}"></script>`;
  const boot = `<link rel="icon" href="data:,">${buildInviteDockScript(prefix)}${buildCampaignEmbedBootScript(prefix, fallbackSession)}${classic}`;
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${boot}`);
  } else if (out.includes('<body>')) {
    out = out.replace('<body>', `<body>${boot}`);
  } else {
    out = boot + out;
  }
  return out;
}
