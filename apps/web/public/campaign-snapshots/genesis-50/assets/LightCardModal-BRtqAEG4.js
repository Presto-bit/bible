import{n as e}from"./rolldown-runtime-Bh1tDfsg.js";import{t}from"./react-CES6V0Ih.js";import{t as n}from"./preload-helper-Czpn1I53.js";import{t as r}from"./x-BV59RxY9.js";import{M as i,Y as a,n as o}from"./index-B-Sta27-.js";var s=e(t(),1),c=a();function l(e){let t=[`零`,`一`,`二`,`三`,`四`,`五`,`六`,`七`,`八`,`九`];if(e===10)return`十`;if(e<10)return t[e];if(e<20)return`十`+t[e-10];let n=Math.floor(e/10),r=e%10;return t[n]+`十`+(r===0?``:t[r])}function u(e){return e<=20?{size:`280×280`,cls:`size-short`}:e<=40?{size:`280×360`,cls:`size-medium`}:e<=80?{size:`300×420`,cls:`size-mid`}:e<=120?{size:`300×500`,cls:`size-long`}:e<=150?{size:`340×540`,cls:`size-xmid`}:{size:`340×580`,cls:`size-xlong`}}var d=(0,s.forwardRef)(({verse:e,refText:t,day:n,author:r},i)=>{let a=u(e.length),o=l(n);return(0,c.jsxs)(`div`,{ref:i,className:`starry-card ${a.cls}`,style:{fontFamily:`"Noto Serif SC", "Songti SC", serif`},children:[(0,c.jsx)(`div`,{className:`stars`}),(0,c.jsx)(`div`,{className:`frame`}),(0,c.jsx)(`div`,{className:`ornament`,children:`✦ ✧ ✦`}),(0,c.jsxs)(`div`,{className:`day-label`,children:[`第`,(0,c.jsx)(`span`,{className:`num`,children:o}),`天`]}),(0,c.jsx)(`div`,{className:`verse`,children:e}),(0,c.jsx)(`div`,{className:`ref`,children:t}),(0,c.jsxs)(`div`,{className:`footer`,children:[r,(0,c.jsxs)(`span`,{className:`small`,children:[`同行 第`,o,`天`]})]}),(0,c.jsx)(`style`,{children:`
          .starry-card {
            position: relative;
            overflow: hidden;
            color: #f5e6c8;
            background:
              radial-gradient(ellipse 280px 200px at 50% -10%, rgba(255, 220, 130, 0.28) 0%, transparent 65%),
              radial-gradient(ellipse 200px 140px at 20% 100%, rgba(212, 165, 90, 0.14) 0%, transparent 70%),
              radial-gradient(ellipse 220px 160px at 80% 90%, rgba(232, 180, 100, 0.12) 0%, transparent 70%),
              linear-gradient(180deg, #2a2418 0%, #14110a 100%);
            box-shadow:
              0 30px 60px -20px rgba(0, 0, 0, 0.9),
              0 0 0 1px rgba(232, 213, 160, 0.18);
            display: flex;
            flex-direction: column;
          }
          .starry-card .stars {
            position: absolute;
            inset: 0;
            background-image:
              radial-gradient(1px 1px at 20px 30px, #f0d68c, transparent),
              radial-gradient(1px 1px at 60px 70px, #d4a55a, transparent),
              radial-gradient(1px 1px at 90px 40px, #e8d5a0, transparent),
              radial-gradient(1.5px 1.5px at 130px 80px, #f5e6c8, transparent),
              radial-gradient(1px 1px at 160px 120px, #d4a55a, transparent),
              radial-gradient(1px 1px at 200px 150px, rgba(255, 220, 150, 0.7), transparent),
              radial-gradient(1px 1px at 240px 90px, rgba(232, 213, 160, 0.5), transparent),
              radial-gradient(1.5px 1.5px at 280px 250px, rgba(212, 165, 90, 0.8), transparent),
              radial-gradient(1px 1px at 50px 260px, rgba(245, 230, 200, 0.6), transparent),
              radial-gradient(1px 1px at 110px 280px, rgba(212, 165, 90, 0.5), transparent);
            opacity: 0.7;
            pointer-events: none;
          }
          .starry-card .frame {
            position: absolute;
            inset: 16px;
            border: 1px solid rgba(212, 165, 90, 0.18);
            pointer-events: none;
          }
          .starry-card .frame::before, .starry-card .frame::after {
            content: '';
            position: absolute;
            width: 12px;
            height: 12px;
            border: 1px solid #d4a55a;
          }
          .starry-card .frame::before {
            top: -1px; left: -1px;
            border-right: none; border-bottom: none;
          }
          .starry-card .frame::after {
            bottom: -1px; right: -1px;
            border-left: none; border-top: none;
          }
          .starry-card .ornament {
            text-align: center;
            font-size: 14px;
            color: #d4a55a;
            letter-spacing: 12px;
            opacity: 0.85;
            margin-bottom: 8px;
            position: relative;
            z-index: 2;
            padding-top: 6px;
          }
          .starry-card .day-label {
            text-align: center;
            font-size: 13px;
            color: #d4a55a;
            letter-spacing: 4px;
            font-weight: 600;
            position: relative;
            z-index: 2;
            margin-bottom: 6px;
          }
          .starry-card .day-label .num {
            color: #f5e6c8;
            font-size: 14px;
            margin: 0 4px;
            font-weight: 600;
          }
          .starry-card .verse {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-weight: 300;
            position: relative;
            z-index: 2;
            padding: 0 16px;
          }
          .starry-card .ref {
            text-align: center;
            font-size: 12px;
            color: #d4a55a;
            letter-spacing: 3px;
            margin-top: 10px;
            position: relative;
            z-index: 2;
          }
          .starry-card .ref::before {
            content: '—— ';
            color: #6b5d42;
          }
          .starry-card .ref::after {
            content: ' ——';
            color: #6b5d42;
          }
          .starry-card .footer {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid rgba(212, 165, 90, 0.15);
            text-align: center;
            font-family: "Ma Shan Zheng", "Noto Serif SC", cursive;
            font-size: 14px;
            color: #d4a55a;
            letter-spacing: 6px;
            position: relative;
            z-index: 2;
          }
          .starry-card .footer .small {
            display: block;
            font-family: "Noto Serif SC", serif;
            font-size: 10px;
            color: #6b5d42;
            letter-spacing: 3px;
            margin-top: 6px;
            font-weight: 300;
          }

          /* 尺寸变体 */
          .size-short {
            width: 280px;
            height: 280px;
            padding: 28px 24px 24px;
          }
          .size-short .verse {
            font-size: 18px;
            line-height: 2.1;
            letter-spacing: 2px;
          }
          .size-medium {
            width: 280px;
            height: 360px;
            padding: 32px 28px 28px;
          }
          .size-medium .verse {
            font-size: 16px;
            line-height: 2.05;
            letter-spacing: 1.2px;
          }
          .size-long {
            width: 300px;
            height: 500px;
            padding: 32px 26px 26px;
          }
          .size-long .verse {
            font-size: 15.5px;
            line-height: 1.95;
            letter-spacing: 0.8px;
            text-align: justify;
          }
          .size-mid {
            width: 300px;
            height: 460px;
            padding: 30px 26px 26px;
          }
          .size-mid .verse {
            font-size: 15.8px;
            line-height: 2;
            letter-spacing: 1px;
            text-align: justify;
          }
          .size-xmid {
            width: 340px;
            height: 540px;
            padding: 32px 26px 26px;
          }
          .size-xmid .verse {
            font-size: 15px;
            line-height: 1.95;
            letter-spacing: 0.6px;
            text-align: justify;
          }
          .size-xmid .ornament {
            font-size: 13px;
            letter-spacing: 10px;
          }
          .size-xlong {
            width: 340px;
            height: 580px;
            padding: 30px 26px 26px;
          }
          .size-xlong .verse {
            font-size: 14px;
            line-height: 1.9;
            letter-spacing: 0.5px;
            text-align: justify;
          }
          .size-xlong .ornament {
            font-size: 12px;
            letter-spacing: 10px;
          }
        `})]})});d.displayName=`LightCard`;function f(){let{data:e,close:t}=o(),a=i(e=>e.profile),l=(0,s.useRef)(null),[u,f]=(0,s.useState)(`rendering`),[p,m]=(0,s.useState)(null);return(0,s.useEffect)(()=>{if(!e){m(null),f(`rendering`);return}let t=!1;f(`rendering`),m(null);let r=setTimeout(async()=>{if(!(!l.current||t))try{let{toPng:e}=await n(async()=>{let{toPng:e}=await import(`./es-BOAyukm3.js`);return{toPng:e}},[]),r=await e(l.current,{pixelRatio:2,cacheBust:!0});if(t)return;m(r),f(`done`)}catch(e){console.error(`[LightCard] 生成图片失败:`,e),t||f(`error`)}},100);return()=>{t=!0,clearTimeout(r)}},[e]),e?(0,c.jsxs)(`div`,{className:`fixed inset-0 z-[300] flex flex-col items-center justify-center p-4`,style:{background:`rgba(10, 8, 7, 0.92)`,backdropFilter:`blur(6px)`},onClick:t,children:[(0,c.jsx)(`button`,{onClick:t,className:`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition`,style:{background:`rgba(255, 255, 255, 0.1)`,color:`#e8d5a0`},"aria-label":`关闭`,children:(0,c.jsx)(r,{size:16})}),(0,c.jsxs)(`div`,{className:`text-center mb-5`,onClick:e=>e.stopPropagation(),children:[(0,c.jsx)(`div`,{className:`text-base font-medium`,style:{color:`#d4a55a`,letterSpacing:`4px`},children:`✦ 亮 光 卡 ✦`}),(0,c.jsxs)(`div`,{className:`text-xs mt-2`,style:{color:`#8a7651`,letterSpacing:`2px`},children:[u===`rendering`&&`正在生成图片...`,u===`done`&&`长按图片保存，或点下方按钮下载`,u===`error`&&`生成失败，请关闭重试`]})]}),(0,c.jsx)(`div`,{onClick:e=>e.stopPropagation(),className:`max-h-[60vh] overflow-y-auto`,children:u===`done`&&p?(0,c.jsx)(`img`,{src:p,alt:`亮光卡`,className:`max-w-full max-h-[60vh] rounded-lg shadow-2xl`,style:{animation:`fadeIn 0.4s ease-out`}}):(0,c.jsx)(`div`,{style:{filter:u===`rendering`?`brightness(0.5)`:`none`,transition:`filter 0.3s`},children:(0,c.jsx)(d,{ref:l,verse:e.verse,refText:e.ref,day:e.day,author:a?.nickname||`匿名`})})}),u===`done`&&p&&(0,c.jsx)(`div`,{className:`mt-6`,onClick:e=>e.stopPropagation(),children:(0,c.jsx)(`button`,{onClick:()=>{if(!p)return;let t=document.createElement(`a`);t.href=p,t.download=`genesis-day-${e.day}.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)},className:`px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer transition`,style:{background:`linear-gradient(135deg, #d4a55a 0%, #a67c3a 100%)`,color:`#0a0807`,letterSpacing:`2px`,animation:`fadeIn 0.4s ease-out`},children:`保存到相册`})}),(0,c.jsx)(`style`,{children:`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `})]}):null}export{f as default};