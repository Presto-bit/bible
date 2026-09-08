/** 开屏计时：首次可见 + 2s，且等壳层 ready（客户端兜底与内联脚本逻辑对齐） */

import {
  BRAND_SPLASH_DONE_EVENT,
  BRAND_SPLASH_FADE_MS,
  BRAND_SPLASH_MAX_MS,
  BRAND_SPLASH_MIN_MS,
  BRAND_SPLASH_SESSION_KEY,
  BRAND_SPLASH_SHELL_READY_EVENT,
  markBrandSplashDone,
} from '@/lib/brand_splash';

export function armBrandSplashNode(node: HTMLElement): () => void {
  let visibleAt: number | null = null;
  let fading = false;
  let finished = false;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    markBrandSplashDone();
    document.documentElement.classList.remove('peiai-splash-pending', 'peiai-splash-lock');
    node.remove();
  };

  const beginFade = () => {
    if (fading || finished) return;
    fading = true;
    node.classList.add('is-fading');
    node.setAttribute('aria-hidden', 'true');
    fadeTimer = setTimeout(finish, BRAND_SPLASH_FADE_MS);
  };

  const tryDismiss = () => {
    if (fading || finished || visibleAt == null) return;
    const elapsed = Date.now() - visibleAt;
    if (elapsed < BRAND_SPLASH_MIN_MS) return;
    if (!window.__PEIAI_SHELL_READY__ && elapsed < BRAND_SPLASH_MAX_MS) return;
    beginFade();
  };

  const markVisible = () => {
    if (visibleAt != null) return;
    visibleAt = Date.now();
    pollTimer = setInterval(tryDismiss, 80);
    window.addEventListener(BRAND_SPLASH_SHELL_READY_EVENT, tryDismiss);
    tryDismiss();
  };

  const whenPainted = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(markVisible);
    });
  };

  node.setAttribute('aria-hidden', 'false');
  const img = node.querySelector('img');
  if (img && typeof img.decode === 'function') {
    void img.decode().then(whenPainted).catch(whenPainted);
  } else {
    whenPainted();
  }

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    window.removeEventListener(BRAND_SPLASH_SHELL_READY_EVENT, tryDismiss);
    if (fadeTimer) clearTimeout(fadeTimer);
  };
}

/** body 内联脚本（须自包含，不 import） */
export function brandSplashInlineArmScript(): string {
  const KEY = BRAND_SPLASH_SESSION_KEY;
  const EVT = BRAND_SPLASH_DONE_EVENT;
  const SHELL_EVT = BRAND_SPLASH_SHELL_READY_EVENT;
  const MIN = BRAND_SPLASH_MIN_MS;
  const FADE = BRAND_SPLASH_FADE_MS;
  const MAX = BRAND_SPLASH_MAX_MS;
  const ARM = '__PEIAI_SPLASH_ARMED__';

  return `(function(){try{
if(!document.documentElement.classList.contains('peiai-splash-pending'))return;
var node=document.getElementById('peiai-brand-splash-ssr');
if(!node||window.${ARM})return;
window.${ARM}=true;
node.setAttribute('aria-hidden','false');
var visibleAt=null,fading=false,finished=false,fadeTimer=null,pollTimer=null;
function finish(){if(finished)return;finished=true;window.__PEIAI_SPLASH_DONE__=true;try{sessionStorage.setItem('${KEY}','1');}catch(_){}
document.documentElement.classList.remove('peiai-splash-pending','peiai-splash-lock');
node.remove();window.dispatchEvent(new Event('${EVT}'));}
function beginFade(){if(fading||finished)return;fading=true;node.classList.add('is-fading');node.setAttribute('aria-hidden','true');fadeTimer=setTimeout(finish,${FADE});}
function tryDismiss(){if(fading||finished||visibleAt==null)return;var e=Date.now()-visibleAt;if(e<${MIN})return;if(!window.__PEIAI_SHELL_READY__&&e<${MAX})return;beginFade();}
function markVisible(){if(visibleAt!=null)return;visibleAt=Date.now();pollTimer=setInterval(tryDismiss,80);window.addEventListener('${SHELL_EVT}',tryDismiss);tryDismiss();}
function whenPainted(){requestAnimationFrame(function(){requestAnimationFrame(markVisible);});}
var img=node.querySelector('img');
if(img&&img.decode){img.decode().then(whenPainted).catch(whenPainted);}else{whenPainted();}
}catch(_){}})();`;
}

/** head 最早铺纸白 + pending */
export function brandSplashHeadBootstrapScript(): string {
  const bg = '#FFFCFA';
  return `(function(){try{
var BG='${bg}';
document.documentElement.style.backgroundColor=BG;
document.addEventListener('DOMContentLoaded',function(){try{document.body.style.backgroundColor=BG;}catch(_){}});
var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
var done=window.__PEIAI_SPLASH_DONE__===true;
var flutter=false;
try{flutter=sessionStorage.getItem('peiai_client_kind')==='android_h5_tab';if(!done&&sessionStorage.getItem('peiai_brand_splash_done_v1')==='1')done=true;}catch(_){}
if(s&&!done&&!flutter){window.__PEIAI_SPLASH_START__=Date.now();document.documentElement.classList.add('peiai-splash-pending','peiai-splash-lock');}
}catch(_){}})();`;
}

/** 开屏关键 CSS：进 head，不依赖外链 stylesheet 顺序 */
export function brandSplashInlineCriticalCss(bg: string): string {
  return `html,body{background:${bg}!important}
#peiai-brand-splash-ssr{display:none}
html.peiai-splash-pending #peiai-brand-splash-ssr{display:flex!important;visibility:visible!important;opacity:1;position:fixed;inset:0;z-index:10000;flex-direction:column;align-items:center;justify-content:center;background:${bg};pointer-events:auto}
html.peiai-splash-pending #peiai-brand-splash-ssr.is-fading{opacity:0;pointer-events:none;transition:opacity .25s ease}
html.peiai-splash-lock body{overflow:hidden}
html.peiai-splash-pending .app-body,html.peiai-splash-pending nav.tabbar,html.peiai-splash-pending .offline-bar,html.peiai-splash-pending .soft-nav-progress,html.peiai-splash-pending .soft-nav-transition-shell{opacity:0!important;pointer-events:none!important;visibility:visible!important}
html.peiai-splash-pending .tab-keep-pane.tab-keep-pane-active{animation:none!important}`;
}
