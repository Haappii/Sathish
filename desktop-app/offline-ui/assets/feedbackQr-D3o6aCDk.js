const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/browser-Djer75Jr.js","assets/react-vendor-ChXBAexk.js"])))=>i.map(i=>d[i]);
import{_ as d}from"./mui-vendor-AYNtJu0I.js";async function f({shopId:t,invoiceNo:e,enabled:i=!0}={}){if(!i||!t||!e||typeof window>"u")return"";try{const n=(await d(async()=>{const{default:a}=await import("./browser-Djer75Jr.js").then(r=>r.b);return{default:a}},__vite__mapDeps([0,1]))).default,o=`${window.location.origin}/feedback?shop_id=${encodeURIComponent(t)}&invoice_no=${encodeURIComponent(e)}`;return`
<div style="font-family:monospace;text-align:center;margin:4px 0 0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
  <div style="font-size:8px;letter-spacing:1px;margin-bottom:3px;">- - - - - - - - - - - - - - - - -</div>
  <div style="font-size:8px;font-weight:bold;margin-bottom:3px;">Rate Your Experience</div>
  <img src="${await n.toDataURL(o,{width:56,margin:1,color:{dark:"#000000",light:"#ffffff"}})}" width="56" height="56" alt="Feedback QR" style="display:block;margin:0 auto;"/>
  <div style="font-size:7px;margin-top:3px;color:#444;">Scan QR to share feedback</div>
</div>`}catch{return""}}export{f as g};
