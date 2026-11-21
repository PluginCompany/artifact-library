export const noticeScript = String.raw`(() => {
  const script = document.currentScript;
  if (!script || window.__artifactNotice) return;
  window.__artifactNotice = true;
  const slug = script.dataset.slug, version = Number(script.dataset.version), relative = script.dataset.path || '';
  let timer, failures = 0, running = false, dismissedVersion = 0, latestVersion = version;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;bottom:16px!important;right:16px!important;z-index:2147483647!important;display:block!important;max-width:calc(100vw - 32px)!important;';
  const root = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;--scheme:light;--ink:#173149;--panel:#fff;--line:#d3deeb;--line-soft:#dce4ee;--accent:#245ce8;--muted:#607a91;--field:#f6f8fc;--button:#edf2fb;--notice:#eaf0ff;--focus:#f3c96c;--send:#245ce8;--on-send:#fff;--shadow:#17314925;--shadow-menu:#17314920}:host([data-scheme=dark]){--scheme:dark;--ink:#e3e8ef;--panel:#1b1f26;--line:#343b47;--line-soft:#2b313b;--accent:#8fb0ff;--muted:#9aa7b6;--field:#232933;--button:#25304a;--notice:#1f2a44;--send:#5b86f2;--on-send:#0e1116;--shadow:#00000080;--shadow-menu:#00000066}*{box-sizing:border-box}.dock{color-scheme:var(--scheme);font:13px/1.4 Arial,Helvetica,sans-serif;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 30px var(--shadow);max-width:calc(100vw - 32px)}.row{display:flex;align-items:center;gap:10px;padding:10px 12px;flex-wrap:nowrap}.title{flex:0 1 auto;min-width:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}a{color:var(--accent);text-underline-offset:3px}.home{flex:none;font-weight:700;text-decoration:none;border-right:1px solid var(--line-soft);padding-right:10px;display:inline-flex;align-items:center;gap:7px}.home img{display:block;width:18px;height:18px}select{flex:0 1 auto;min-width:0;font:inherit;border:1px solid var(--line-soft);background:var(--field);color:var(--ink);border-radius:5px;padding:6px;max-width:230px;text-overflow:ellipsis}button{font:inherit;border:0;background:var(--button);color:var(--accent);border-radius:5px;padding:6px 8px;cursor:pointer;white-space:nowrap}.copy-main{flex:none}a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.update{padding:9px 12px;background:var(--notice);border-bottom:1px solid var(--line);border-radius:10px 10px 0 0;font-size:12px}.update a{font-weight:600;margin-left:10px}.update button{float:right;padding:2px 5px;background:none}.status{color:var(--muted);font-size:11px;padding:0 12px 8px;max-width:500px;overflow-wrap:anywhere}.status:empty{display:none}details{position:relative;flex:none}summary{cursor:pointer;list-style:none;padding:3px 6px;font-size:18px}summary::-webkit-details-marker{display:none}.menu{position:absolute;right:0;bottom:30px;min-width:190px;max-width:calc(100vw - 32px);padding:6px;background:var(--panel);border:1px solid var(--line);border-radius:7px;box-shadow:0 5px 20px var(--shadow-menu)}.menu a,.menu button{display:block;text-align:left;width:100%;font-size:12px;background:none;text-decoration:none;padding:8px;border-radius:4px}.menu a:hover,.menu button:hover{background:var(--button)}.dock.collapsed .row,.dock.collapsed .status{display:none}.expand{display:none;padding:9px 12px;background:var(--panel);border-radius:10px;font-weight:600}.collapsed .expand{display:block}.collapsed .update{max-width:330px}.collapsed .update button{float:none}.version-label{font-size:11px;color:var(--muted)}.sendbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 12px 10px;font-size:12px;color:var(--muted)}.sendbar+.status{margin-top:-2px}.collapsed .sendbar{padding-top:0}.send{background:var(--send);color:var(--on-send);font-weight:600}.send:disabled{opacity:.6;cursor:default}.menu .sync::before{content:"○";display:inline-block;width:16px}.menu .sync[aria-pressed=true]::before{content:"✓"}.menu .hint{margin:0;padding:0 8px 6px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--line-soft);margin-bottom:4px} [hidden]{display:none!important}@media(max-width:600px){.title{max-width:120px}.row{gap:7px}select{max-width:190px}.copy-main{display:none}.dock{max-width:calc(100vw - 32px)}}@media(max-width:420px){.title{display:none}.home{border-right:0;padding-right:0}}@media print{:host{display:none!important}}';
  const dock=document.createElement('section');dock.className='dock';dock.setAttribute('aria-label','Artifact toolbar');
  function node(tag,text){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;}
  const update=node('div');update.className='update';update.hidden=true;update.setAttribute('role','status');
  const updateText=node('span'),openLatest=node('a','Open latest');openLatest.href='/artifacts/'+slug+'/'+relative+location.search+location.hash;
  const dismiss=node('button','Dismiss');dismiss.onclick=()=>{dismissedVersion=latestVersion;update.hidden=true;};update.append(updateText,openLatest,dismiss);
  const row=node('div');row.className='row';const home=node('a');home.className='home';home.href='/';const homeIcon=node('img');homeIcon.src='/_artifact/icon.svg';homeIcon.alt='';homeIcon.width=18;homeIcon.height=18;home.append(homeIcon,document.createTextNode('Library'));const title=node('span',slug);title.className='title';
  const select=node('select');select.setAttribute('aria-label','Artifact version');const initial=node('option','Version '+version);initial.value=String(version);select.append(initial);
  select.onchange=()=>{location.href='/artifacts/'+slug+'/_versions/'+select.value+'/'+relative+location.search+location.hash;};
  const copy=node('button','Copy link');copy.className='copy-main';
  const menu=node('details'),summary=node('summary','⋯');summary.setAttribute('aria-label','More artifact actions');const actions=node('div');actions.className='menu';
  const copyLatest=node('button','Copy stable latest link'),copySnapshot=node('button','Copy snapshot link'),download=node('a','Download this version');download.href='/api/v1/artifacts/'+slug+'/versions/'+version+'/download';
  const collapse=node('button','Collapse toolbar'),expand=node('button','Artifact · v'+version);expand.className='expand';
  function setCollapsed(value){dock.classList.toggle('collapsed',value);try{localStorage.setItem('artifact-toolbar-collapsed',String(value));}catch{}}
  collapse.onclick=()=>{menu.open=false;setCollapsed(true);};expand.onclick=()=>setCollapsed(false);
  try{if(localStorage.getItem('artifact-toolbar-collapsed')==='true')dock.classList.add('collapsed');}catch{}
  const status=node('p');status.className='status';status.setAttribute('role','status');
  // Instant sync: whether a reader's saves reach a waiting agent at once, or wait for "Send to agent". One choice per
  // browser for every artifact on this server: a cookie the server reads on each save (artifact_sync=hold marks it held).
  const syncToggle=node('button','Instant sync to agent');syncToggle.className='sync';const syncHint=node('p','Applies to every artifact in this browser');syncHint.className='hint';
  const sendBar=node('div');sendBar.className='sendbar';sendBar.hidden=true;const sendInfo=node('span'),send=node('button','Send to agent');send.className='send';sendBar.append(sendInfo,send);
  let unsent=0,sendTimer,refreshing=false;
  const holding=()=>/(?:^|;\s*)artifact_sync=hold(?:;|$)/.test(document.cookie);
  function paintSync(){syncToggle.setAttribute('aria-pressed',String(!holding()));syncToggle.title=holding()?'Off: your changes wait until you press Send to agent':'On: the agent sees each change as you save it';sendBar.hidden=!holding()||!unsent;sendInfo.textContent=unsent===1?'1 change not sent':unsent+' changes not sent';}
  async function refreshUnsent(){
    if(!holding()){unsent=0;paintSync();return;}if(refreshing)return;refreshing=true;
    try{const response=await fetch('/api/v1/artifacts/'+slug+'/data?role=human&_toolbar=1',{cache:'no-store'});if(!response.ok)return;const documents=(await response.json()).documents;
      const sentAt=documents.filter(d=>d.key==='state.sent'||d.key==='state.submitted').reduce((latest,d)=>d.updatedAt>latest?d.updatedAt:latest,'');
      unsent=documents.filter(d=>d.held&&d.updatedAt>sentAt).length;}
    catch{}finally{refreshing=false;paintSync();}
  }
  async function sendHeld(){
    let author='';try{author=JSON.parse(localStorage.getItem('kit-author'))||'';}catch{}
    send.disabled=true;
    try{const count=unsent,response=await fetch('/api/v1/artifacts/'+slug+'/data/state.sent',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:{at:new Date().toISOString(),author:author||'Anonymous',changes:count},author:author||undefined})});
      if(!response.ok)throw new Error();unsent=0;status.textContent=count===1?'Sent 1 change to the agent.':'Sent '+count+' changes to the agent.';}
    catch{status.textContent='Could not send. Try again.';}finally{send.disabled=false;paintSync();}
  }
  send.onclick=sendHeld;
  syncToggle.onclick=async()=>{const hold=!holding();document.cookie='artifact_sync='+(hold?'hold':'instant')+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');menu.open=false;
    if(hold){status.textContent='Instant sync is off in this browser: your changes wait until you press Send to agent.';paintSync();return;}
    await refreshUnsent();if(unsent)await sendHeld();status.textContent='Instant sync is on: the agent sees each change as you save it.'+(status.textContent.startsWith('Sent')?' '+status.textContent:'');};
  // Notice the page's own saves at once; otherwise look again every 15 s while held changes are possible.
  if(window.PerformanceObserver)try{new PerformanceObserver(list=>{if(holding()&&list.getEntries().some(entry=>entry.name.includes('/api/v1/artifacts/'+slug+'/data')&&!entry.name.includes('_toolbar')&&!entry.name.includes('state.sent'))){clearTimeout(sendTimer);sendTimer=setTimeout(refreshUnsent,600);}}).observe({type:'resource',buffered:false});}catch{}
  setInterval(()=>{if(holding()&&!document.hidden)refreshUnsent();},15000);
  async function clipboard(value){try{if(navigator.clipboard&&isSecureContext)await navigator.clipboard.writeText(value);else{const input=node('textarea');input.value=value;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error();}status.textContent='Link copied.';}catch{status.textContent=value;}menu.open=false;}
  copy.onclick=copySnapshot.onclick=()=>clipboard(location.href);copyLatest.onclick=()=>clipboard(new URL(openLatest.href,location.href).href);
  // Share link: /share/<token>/ shows the latest version to anyone with the link. The menu reads its state when it opens.
  const shareMake=node('button','Create share link'),shareCopy=node('button','Copy share link'),shareStop=node('button','Stop sharing');shareCopy.hidden=shareStop.hidden=true;
  const shareApi='/api/v1/artifacts/'+slug+'/share';let shareUrl='';
  function paintShare(url){shareUrl=url||'';shareMake.hidden=Boolean(shareUrl);shareCopy.hidden=shareStop.hidden=!shareUrl;}
  async function shareRequest(method){const response=await fetch(shareApi,{method,cache:'no-store'});if(response.status===401||response.status===403)throw new Error('Sharing needs the write token on this server: run artifact share '+slug);if(!response.ok)throw new Error('Could not change sharing. Try again.');return response.json();}
  menu.addEventListener('toggle',async()=>{if(!menu.open)return;try{const state=await shareRequest('GET');paintShare(state.shared?state.url:'');}catch{}});
  shareMake.onclick=async()=>{menu.open=false;try{const state=await shareRequest('POST');paintShare(state.url);await clipboard(state.url);status.textContent='Share link copied. Anyone with it can view the latest version: '+state.url;}catch(error){status.textContent=error.message;}};
  shareCopy.onclick=async()=>{menu.open=false;await clipboard(shareUrl);status.textContent='Share link copied: '+shareUrl;};
  shareStop.onclick=async()=>{menu.open=false;if(!confirm('Stop sharing? The share link stops working for everyone who has it.'))return;try{await shareRequest('DELETE');paintShare('');status.textContent='Stopped sharing. The old link no longer works.';}catch(error){status.textContent=error.message;}};
  actions.append(syncToggle,syncHint,copyLatest,copySnapshot,shareMake,shareCopy,shareStop,download,collapse);menu.append(summary,actions);row.append(home,title,select,copy,menu);dock.append(update,row,expand,sendBar,status);root.append(style,dock);(document.body||document.documentElement).append(host);
  // Dark when the page is dark: the kit's data-theme on <html> (the reader's light/dark button), else the page's
  // color-scheme when it names just one, else the system setting.
  const systemDark=matchMedia('(prefers-color-scheme: dark)');
  function scheme(){const html=document.documentElement,theme=html.getAttribute('data-theme');if(theme==='dark'||theme==='light')return theme;
    const declared=getComputedStyle(html).colorScheme.split(' ').filter(word=>word==='light'||word==='dark');return declared.length===1?declared[0]:systemDark.matches?'dark':'light';}
  function paintScheme(){host.setAttribute('data-scheme',scheme());}
  new MutationObserver(paintScheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
  systemDark.addEventListener('change',paintScheme);document.addEventListener('kit:theme',paintScheme);paintScheme();
  // Pages can keep their own controls clear of the toolbar: --artifact-toolbar-space (px from the
  // viewport bottom to the toolbar's top) and --artifact-toolbar-width on <html>, an
  // 'artifact-toolbar' event on window, and window.artifactToolbar.hide(true|false) for full-screen views.
  let hiddenByPage=false;
  function footprint(){const rect=host.getBoundingClientRect(),shown=!hiddenByPage&&rect.height>0;return{space:shown?Math.ceil(innerHeight-rect.top):0,width:shown?Math.ceil(innerWidth-rect.left):0,collapsed:dock.classList.contains('collapsed'),hidden:hiddenByPage};}
  function publish(){const state=footprint(),html=document.documentElement;html.style.setProperty('--artifact-toolbar-space',state.space+'px');html.style.setProperty('--artifact-toolbar-width',state.width+'px');dispatchEvent(new CustomEvent('artifact-toolbar',{detail:state}));}
  window.artifactToolbar={get state(){return footprint();},hide(value=true){hiddenByPage=Boolean(value);host.style.setProperty('display',hiddenByPage?'none':'block','important');publish();}};
  if(window.ResizeObserver)new ResizeObserver(publish).observe(dock);addEventListener('resize',publish);publish();
  async function populate(artifact){
    const response=await fetch('/api/v1/artifacts/'+slug+'/versions',{cache:'no-store'});if(!response.ok)throw new Error('History unavailable');const history=await response.json();
    select.replaceChildren(...history.versions.slice().reverse().map(item=>{const date=new Date(item.createdAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});const option=node('option','Version '+item.version+(item.version===artifact.latestVersion?' — Latest':'')+' · '+date+(item.message?' · '+item.message.slice(0,70):''));option.value=String(item.version);option.title=item.message||'';return option;}));select.value=String(version);
    const snapshot=history.versions.find(item=>item.version===version);title.textContent=snapshot?.title||artifact.title;title.title=(snapshot?.description??artifact.description)||title.textContent;
  }
  async function check(){
    clearTimeout(timer);if(document.hidden||running)return;running=true;
    try{
      const response=await fetch('/api/v1/artifacts/'+slug,{cache:'no-store'});if(!response.ok)throw new Error('Metadata unavailable');const artifact=await response.json();
      if(select.options.length===1||latestVersion!==artifact.latestVersion)await populate(artifact);
      if(version===artifact.latestVersion){title.textContent=artifact.title;title.title=artifact.description||artifact.title;}
      latestVersion=artifact.latestVersion;failures=0;status.textContent='';
      if(latestVersion>version&&latestVersion>dismissedVersion){updateText.textContent='Version '+latestVersion+' available.';update.hidden=false;}
    }catch{failures++;if(select.options.length===1)status.textContent='Version history temporarily unavailable.';}
    finally{running=false;}
    if(!document.hidden)timer=setTimeout(check,Math.min(300000,25000*2**failures));
  }
  document.addEventListener('visibilitychange',check);window.addEventListener('pageshow',check);check();paintSync();refreshUnsent();
})();`;
