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
  style.textContent = ':host{all:initial}*{box-sizing:border-box}.dock{font:13px/1.4 Arial,Helvetica,sans-serif;color:#173149;background:#fff;border:1px solid #d3deeb;border-radius:10px;box-shadow:0 6px 30px #17314925;max-width:calc(100vw - 32px)}.row{display:flex;align-items:center;gap:10px;padding:10px 12px;flex-wrap:nowrap}.title{flex:0 1 auto;min-width:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}a{color:#245ce8;text-underline-offset:3px}.home{flex:none;font-weight:700;text-decoration:none;border-right:1px solid #dce4ee;padding-right:10px;display:inline-flex;align-items:center;gap:7px}.home img{display:block;width:18px;height:18px}select{flex:0 1 auto;min-width:0;font:inherit;border:1px solid #dce4ee;background:#f6f8fc;color:#173149;border-radius:5px;padding:6px;max-width:230px;text-overflow:ellipsis}button{font:inherit;border:0;background:#edf2fb;color:#245ce8;border-radius:5px;padding:6px 8px;cursor:pointer;white-space:nowrap}.copy-main{flex:none}a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #f3c96c;outline-offset:3px}.update{padding:9px 12px;background:#eaf0ff;border-bottom:1px solid #d3deeb;border-radius:10px 10px 0 0;font-size:12px}.update a{font-weight:600;margin-left:10px}.update button{float:right;padding:2px 5px;background:none}.status{color:#607a91;font-size:11px;padding:0 12px 8px;max-width:500px;overflow-wrap:anywhere}.status:empty{display:none}details{position:relative;flex:none}summary{cursor:pointer;list-style:none;padding:3px 6px;font-size:18px}summary::-webkit-details-marker{display:none}.menu{position:absolute;right:0;bottom:30px;min-width:190px;max-width:calc(100vw - 32px);padding:6px;background:#fff;border:1px solid #d3deeb;border-radius:7px;box-shadow:0 5px 20px #17314920}.menu a,.menu button{display:block;text-align:left;width:100%;font-size:12px;background:none;text-decoration:none;padding:8px;border-radius:4px}.menu a:hover,.menu button:hover{background:#edf2fb}.dock.collapsed .row,.dock.collapsed .status{display:none}.expand{display:none;padding:9px 12px;background:#fff;border-radius:10px;font-weight:600}.collapsed .expand{display:block}.collapsed .update{max-width:330px}.collapsed .update button{float:none}.version-label{font-size:11px;color:#607a91} [hidden]{display:none!important}@media(max-width:600px){.title{max-width:120px}.row{gap:7px}select{max-width:190px}.copy-main{display:none}.dock{max-width:calc(100vw - 32px)}}@media(max-width:420px){.title{display:none}.home{border-right:0;padding-right:0}}@media print{:host{display:none!important}}';
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
  async function clipboard(value){try{if(navigator.clipboard&&isSecureContext)await navigator.clipboard.writeText(value);else{const input=node('textarea');input.value=value;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error();}status.textContent='Link copied.';}catch{status.textContent=value;}menu.open=false;}
  copy.onclick=copySnapshot.onclick=()=>clipboard(location.href);copyLatest.onclick=()=>clipboard(new URL(openLatest.href,location.href).href);
  actions.append(copyLatest,copySnapshot,download,collapse);menu.append(summary,actions);row.append(home,title,select,copy,menu);dock.append(update,row,expand,status);root.append(style,dock);(document.body||document.documentElement).append(host);
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
  document.addEventListener('visibilitychange',check);window.addEventListener('pageshow',check);check();
})();`;
