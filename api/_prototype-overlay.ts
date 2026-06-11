// Branded loading overlay injected into the start of <body> of every
// prototype HTML response. Source of truth for both the production
// edge function (`api/prototype-proxy.ts`) and the local Vite dev
// proxy (`designer/vite.config.ts`) so dev parity is automatic.
//
// Stays visible for a 3-second minimum so the brand moment registers
// even on instant-loading prototypes, then fades out (or stays until
// window.load fires, whichever is later). Skips itself when the page
// is embedded in an iframe (the catalogue thumbnails iframe these
// same URLs and don't need a loading screen).

export const LOADING_OVERLAY = `<div id="__agentux_loading" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0f0f10;color:#e4e4e7;z-index:2147483647;opacity:0;animation:__au_fadein 220ms ease-out 60ms forwards;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><svg width="88" height="88" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="animation:__au_pulse 1.6s ease-in-out infinite"><path d="M56.2012 63.4693L67.2698 39.2667C69.5757 37.4388 74.1876 37.8959 76.0324 40.6367L98.6308 92.2384C99.5532 95.8901 97.7805 99.0171 92.1741 99.0882H77.416C72.8815 98.0212 71.1248 96.4457 69.1145 92.2384L56.2012 63.4693Z" fill="#6C77F1"/><path d="M79.2608 39.7238C76.7144 33.807 76.2624 30.923 77.8773 26.9375L102.782 82.1924C103.4 85.1582 103.126 86.5073 100.937 88.1289L79.2608 39.7238Z" fill="#6C77F1"/><ellipse cx="109.238" cy="94.0634" rx="5.99549" ry="5.93648" fill="#38ED60"/><path d="M10.5436 99.0885H29.4524C35.0321 98.6787 36.9754 97.0733 39.1374 92.6953L68.1925 29.2207C71.4206 24.6533 76.9549 24.1966 79.7223 32.4172L102.321 87.2155C104.929 84.3029 104.628 83.1098 103.71 79.4756L103.704 79.4524L82.0282 30.5906C79.0151 23.887 76.3635 21.8316 70.0372 21.0009H45.1329C39.1508 20.9667 36.3447 21.8639 33.6031 27.3941L5.00926 90.8687C4.88246 96.034 6.02365 97.8633 10.5436 99.0885Z" fill="#F8EFE3"/></svg><div style="display:flex;gap:7px"><span style="width:7px;height:7px;border-radius:50%;background:#6C77F1;animation:__au_dot 1.2s ease-in-out infinite"></span><span style="width:7px;height:7px;border-radius:50%;background:#6C77F1;animation:__au_dot 1.2s ease-in-out infinite .18s"></span><span style="width:7px;height:7px;border-radius:50%;background:#6C77F1;animation:__au_dot 1.2s ease-in-out infinite .36s"></span></div><div style="font-size:13px;color:#9b9ba2;letter-spacing:.02em;margin-top:6px">Powered and Built by Yamparala Rahul</div></div><style>@keyframes __au_fadein{from{opacity:0}to{opacity:1}}@keyframes __au_fadeout{from{opacity:1}to{opacity:0}}@keyframes __au_pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}@keyframes __au_dot{0%,80%,100%{opacity:.3;transform:scale(.75)}40%{opacity:1;transform:scale(1.1)}}</style><script>(function(){var el=document.getElementById('__agentux_loading');if(!el)return;try{if(window.self!==window.top){el.style.display='none';return;}}catch(e){el.style.display='none';return;}var MIN_MS=3000;var startedAt=Date.now();function dismiss(){var elapsed=Date.now()-startedAt;var wait=Math.max(0,MIN_MS-elapsed);setTimeout(function(){el.style.animation='__au_fadeout 260ms ease-out forwards';setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},290);},wait);}if(document.readyState==='complete'){dismiss();}else{window.addEventListener('load',dismiss,{once:true});}setTimeout(function(){if(el.parentNode)dismiss();},10000);})();</script>`;

export function injectOverlay(html: string): string {
  // Inject right after the first <body ...> opening tag (case-insensitive)
  // so the overlay stacks above whatever the prototype renders. If
  // there's no <body> (malformed HTML), prepend — the browser will
  // hoist the overlay into a synthesized body element.
  const bodyOpen = html.match(/<body\b[^>]*>/i);
  if (bodyOpen) {
    return html.replace(bodyOpen[0], bodyOpen[0] + LOADING_OVERLAY);
  }
  return LOADING_OVERLAY + html;
}
