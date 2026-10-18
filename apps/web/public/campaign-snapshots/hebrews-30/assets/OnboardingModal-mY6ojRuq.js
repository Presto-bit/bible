import{n as e}from"./rolldown-runtime-Bh1tDfsg.js";import{t}from"./react-CES6V0Ih.js";import{n}from"./plan-DvR08CXv.js";import{G as r,I as i,L as a,P as o,W as s,Y as c}from"./index-BJ7pDi2F.js";var l=e(t(),1),u=c(),d=`g50-onboarding-seen`,f=[{icon:(0,u.jsx)(r,{size:28}),title:`每天，从这里开始`,body:`打开 H5，默认就是今天的内容。
`+(n.hasHandbook?`经文 · 牧养书信 · 默想教材，三个 Tab 慢慢读。

`:`经文 · 牧养书信，两个 Tab 慢慢读。

`)+`忙的话，读一段也行。
重要的不是读完，是今天又来到神面前。`,color:`#5c6b4c`},{icon:(0,u.jsx)(a,{size:28}),title:`读完，写下今天的一句`,body:`点底部的「我已读 · 打卡」，写下今天最打动你的一句话，
或者一个想留给自己的小行动。

诚实比完整更重要--
几个词、甚至「我今天很累」都可以。`,color:`#c9a96a`},{icon:(0,u.jsx)(o,{size:28}),title:`看看同伴，一起走`,body:`在「同伴」里，能看到同聚点弟兄姊妹今天写了什么。
读到打动你的，点亮它 ✨。

我们相隔遥远，但在同一段话里，仍然在一起。`,color:`#7d9471`},{icon:(0,u.jsx)(i,{size:28}),title:`还有一些，慢慢会遇见`,body:`读到扎心的话，可以「高亮」留下来。
走过每一段，会有小小的印记陪你记念。
开始前写下「三件事」，`+n.totalDays+` 天后回头看。

这些不着急，走到那里，自然就明白了。

需要时，顶栏「⋯ 更多」→「新手指南」随时回来看。`,color:`#b08f54`}];function p({onClose:e}){let[t,r]=(0,l.useState)(0),i=f[t],a=t===f.length-1,o=()=>{localStorage.setItem(d,`1`),e()};return(0,u.jsxs)(`div`,{className:`fixed inset-0 z-[350] flex items-center justify-center p-5`,style:{background:`rgba(30,26,22,0.72)`,backdropFilter:`blur(6px)`},onClick:o,children:[(0,u.jsxs)(`div`,{className:`bg-cream-50 rounded-2xl max-w-app w-full overflow-hidden shadow-2xl`,onClick:e=>e.stopPropagation(),style:{animation:`onbIn 0.3s ease-out`},children:[(0,u.jsxs)(`div`,{className:`px-6 py-8 text-center text-cream-50`,style:{background:`linear-gradient(135deg, ${i.color} 0%, #3d4a30 100%)`},children:[(0,u.jsx)(`div`,{className:`flex justify-center mb-3`,style:{animation:`onbIcon 0.5s ease-out`},children:(0,u.jsx)(`div`,{className:`w-16 h-16 rounded-full bg-white/15 flex items-center justify-center`,style:{backdropFilter:`blur(4px)`},children:i.icon})}),(0,u.jsx)(`div`,{className:`text-[11px] tracking-[4px] opacity-75 mb-1`,children:n.banner}),(0,u.jsx)(`div`,{className:`text-lg font-semibold`,children:i.title})]}),(0,u.jsxs)(`div`,{className:`px-6 py-7`,children:[(0,u.jsx)(`p`,{className:`text-[14px] text-ink-700 leading-[1.85] whitespace-pre-line text-center`,children:i.body}),(0,u.jsx)(`div`,{className:`flex justify-center gap-1.5 my-6`,children:f.map((e,n)=>(0,u.jsx)(`div`,{className:`h-1 rounded-full transition-all duration-300 ${n===t?`w-6 bg-olive-400`:`w-1.5 bg-lineSoft`}`},n))}),(0,u.jsxs)(`div`,{className:`flex gap-2`,children:[(0,u.jsx)(`button`,{onClick:o,className:`px-4 py-2.5 bg-cream-100 text-ink-500 rounded-full text-sm cursor-pointer hover:bg-cream-200`,children:`跳过`}),(0,u.jsxs)(`button`,{onClick:()=>{a?o():r(e=>e+1)},className:`flex-1 py-2.5 bg-olive-400 text-cream-50 rounded-full text-sm font-medium cursor-pointer hover:bg-olive-600 transition flex items-center justify-center gap-1`,children:[a?`开始这 ${n.totalDays} 天`:`继续`,!a&&(0,u.jsx)(s,{size:15})]})]})]})]}),(0,u.jsx)(`style`,{children:`
        @keyframes onbIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes onbIcon {
          from { opacity: 0; transform: scale(0.6); }
          to { opacity: 1; transform: scale(1); }
        }
      `})]})}export{p as default};