import{Y as e,q as t}from"./index-B-Sta27-.js";var n=e();function r({entries:e,onClose:r}){if(e.length===0)return null;let i=()=>{t(),r()},a=e.length>1,o=e[0],s=e.length;return(0,n.jsxs)(`div`,{className:`fixed inset-0 z-[300] flex items-center justify-center p-6`,style:{background:`rgba(60, 50, 30, 0.55)`,backdropFilter:`blur(4px)`},onClick:i,children:[(0,n.jsxs)(`div`,{className:`bg-cream-50 rounded-2xl max-w-app w-full overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)] animate-[fadeInUp_0.4s_ease-out] flex flex-col max-h-[85vh]`,onClick:e=>e.stopPropagation(),children:[(0,n.jsxs)(`div`,{className:`px-6 py-7 text-center text-cream-50 relative shrink-0`,style:{background:`linear-gradient(135deg, #5c6b4c 0%, #3d4a30 100%)`},children:[(0,n.jsx)(`div`,{className:`text-5xl mb-2`,children:o.emoji}),(0,n.jsx)(`div`,{className:`text-xs tracking-[3px] opacity-80`,children:a?`为你整理了 ${s} 条新内容`:`有新内容啦 · ${o.date}`})]}),(0,n.jsx)(`div`,{className:`overflow-y-auto flex-1`,children:e.map((e,t)=>{let r=e.body.split(`

`).filter(Boolean);return(0,n.jsxs)(`div`,{className:t===0?`px-6 pt-6 pb-5`:`px-6 pt-5 pb-5 border-t border-lineSoft`,children:[a&&(0,n.jsxs)(`div`,{className:`flex items-center gap-2 mb-2`,children:[(0,n.jsx)(`span`,{className:`text-lg`,children:e.emoji}),(0,n.jsx)(`span`,{className:`text-[10px] tracking-[2px] text-ink-400 font-medium`,children:e.date})]}),(0,n.jsx)(`h2`,{className:`text-[17px] font-semibold text-ink-900 mb-3 ${a?`text-left`:`text-center text-xl`}`,children:e.title}),(0,n.jsx)(`div`,{className:`space-y-2.5`,children:r.map((e,t)=>(0,n.jsx)(`p`,{className:`text-[14px] leading-[1.8] text-ink-700 ${t===r.length-1?`text-olive-600 italic`:``}`,children:e},t))})]},e.id)})}),(0,n.jsxs)(`div`,{className:`mt-auto px-6 py-4 border-t border-lineSoft bg-cream-50 shrink-0 flex items-center justify-between`,children:[(0,n.jsx)(`div`,{className:`text-[11px] text-ink-400 italic`,children:`—— 与你同行的产品团队`}),(0,n.jsx)(`button`,{onClick:i,className:`px-5 py-2 bg-olive-400 text-cream-50 rounded-full text-sm cursor-pointer hover:bg-olive-600 transition font-medium`,children:a?`全部知道啦 (${s})`:`知道啦`})]})]}),(0,n.jsx)(`style`,{children:`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `})]})}export{r as default};