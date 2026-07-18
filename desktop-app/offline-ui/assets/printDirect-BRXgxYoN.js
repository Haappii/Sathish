const w=o=>String(o||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"),p=async(o,c=2e3)=>{const a=o?.document;if(!a)return;const s=async()=>{try{a.fonts?.ready&&await a.fonts.ready.catch(()=>{})}catch{}const r=Array.from(a.images||[]);if(!r.length){await new Promise(e=>setTimeout(e,120));return}await Promise.all(r.map(e=>new Promise(m=>{let i=!1;const l=()=>{i||(i=!0,m())};if(e.complete){typeof e.decode=="function"?e.decode().catch(()=>{}).finally(l):l();return}e.addEventListener("load",l,{once:!0}),e.addEventListener("error",l,{once:!0})}))),await new Promise(e=>setTimeout(e,120))};await Promise.race([s(),new Promise(r=>setTimeout(r,c))])};async function g(o,{fontSize:c=9,port:a="COM7",paperSize:s="58mm",extraHtml:r="",headerHtml:e=""}={}){const m=String(r||"").trim().length>0||String(e||"").trim().length>0,i=String(s||"58mm")==="80mm"?"80mm":"58mm",l=typeof localStorage<"u"&&localStorage.getItem("thermalPrinterName")||void 0,d=i==="80mm"?48:32,h=((parseFloat(i)-1)/d/.6).toFixed(2);if(window?.electronAPI?.rawPrintText||window?.electronAPI?.silentPrintText){if(!(Number(c)<=8||m)&&window.electronAPI.rawPrintText)try{return await window.electronAPI.rawPrintText({text:o,port:a,fontSize:Number(c)||12,feedLines:4,paperSize:s}),!0}catch(n){console.warn("Raw print failed, falling back to browser print",n)}if(window.electronAPI.silentPrintText)try{if(await window.electronAPI.silentPrintText(o,{fontSize:c,paperSize:s,extraHtml:r,headerHtml:e,printerName:l}))return!0}catch(n){console.warn("Silent browser print failed",n)}}window.dispatchEvent(new CustomEvent("haappii:browser-print",{detail:{paperSize:i}}));try{const t=document.createElement("iframe");t.style.position="fixed",t.style.right="0",t.style.bottom="0",t.style.width="0",t.style.height="0",t.style.border="0",t.style.visibility="hidden",document.body.appendChild(t);const n=t.contentWindow?.document;if(!n)throw new Error("print window missing");return n.open(),n.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          <style>
            @page { size: ${i} auto; margin: 0; }
            html, body {
              margin: 0;
              padding: 0;
              width: ${i};
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              font-family: monospace;
            }
            .receipt {
              width: ${i};
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            pre {
              margin: 0;
              box-sizing: border-box;
              padding: 0 0.5mm;
              font-family: Consolas, "Courier New", monospace;
              font-size: ${h}mm;
              line-height: 1.2;
              width: ${i};
              letter-spacing: 0;
              white-space: pre;
              overflow: hidden;
            }
            .header-html {
              box-sizing: border-box;
              width: ${i};
              margin: 0;
              padding: 1.5mm 1.5mm 0;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .header-html img {
              display: block;
              margin: 0 auto;
              max-width: calc(${i} - 8mm);
              max-height: 20mm;
              height: auto;
              object-fit: contain;
            }
            .extra-html {
              box-sizing: border-box;
              width: ${i};
              margin: 0;
              padding: 2mm 1.5mm 0;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .extra-html img {
              display: block;
              margin: 0 auto;
              max-width: calc(${i} - 8mm);
              height: auto;
            }
            .header-html * {
              text-align: center !important;
            }
            .extra-html * {
              text-align: center !important;
            }
            .header-html img,
            .header-html svg,
            .header-html canvas,
            .extra-html img,
            .extra-html svg,
            .extra-html canvas {
              margin-left: auto !important;
              margin-right: auto !important;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${e?`<div class="header-html">${e}</div>`:""}
            <pre>${w(o)}</pre>
            <div class="extra-html">${r||""}</div>
          </div>
        </body>
      </html>`),n.close(),await p(t.contentWindow),t.contentWindow?.focus(),t.contentWindow?.print(),setTimeout(()=>t.remove(),1200),!0}catch(t){return console.error("Fallback print failed",t),!1}}export{g as p};
