import { DEFAULTS, preferences, fingerprint, blocksOf, picturesIn, capabilities, replaceNative, fileLink, previewNumbers } from './core';
import { resolveStyle } from './vendor/prismantis/theme';
import { PRESET_NAMES } from './vendor/prismantis/presets';
import { renderBlocks } from './vendor/prismantis/render';
import { drawDiagrams } from './vendor/prismantis/mermaid';
import { register as registerCompactTools, compactToolsCommand } from './compact-tools.mjs';

// Terminal theme families with a matching preset, as [name pattern, dark preset, light preset]; the first match wins, so specific names come first.
// Other themes are coloured from their own 16 ANSI colours.
const THEME_FAMILIES:[RegExp,string,string?][]=[[/gruvbox material dark hard/i,'gruvbox-material-dark-hard'],[/gruvbox dark hard/i,'gruvbox-dark-hard'],
  [/one dark modern pro/i,'one-dark-modern-pro'],[/sweet dracula monokai/i,'sweet-dracula-monokai'],[/horizon/i,'horizon'],[/noctis/i,'noctis'],[/gruvbox/i,'gruvbox-dark','gruvbox-light'],[/catppuccin/i,'catppuccin-mocha','catppuccin-latte'],
  [/rose ?pine/i,'rose-pine','rose-pine-dawn'],[/github/i,'github-dark','github-light'],[/solarized/i,'solarized-dark','solarized-light'],
  [/everforest/i,'everforest'],[/dracula/i,'dracula'],[/tokyo ?night/i,'tokyo-night'],[/nord/i,'nord'],[/one ?half|atom one|one ?dark/i,'one-dark'],[/oldest ?house/i,'oldest-house']];
function familyPreset(name:string|undefined,dark:boolean) {
  const family=THEME_FAMILIES.find(([pattern])=>pattern.test(name||''));
  return dark?family?.[1]:family?.[2];
}
const isDark=(hex:string)=>{const n=parseInt(hex.slice(1),16);return 0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255)<128;};
/** A preset's colour roles taken from the terminal palette, as resolveStyle's `<role>Color` options. */
function paletteColors(palette:string[]|undefined,fg:string|undefined,dark:boolean) {
  if(palette?.filter(Boolean).length!==16||!fg)return null;
  // Bright variants read better on dark backgrounds, normal ones on light.
  const ansi=(n:number)=>palette[dark?n+8:n];
  const [red,green,yellow,blue,magenta,cyan]=[1,2,3,4,5,6].map(ansi),grey=palette[8];
  const roles={accent:magenta,heading:blue,tableHeader:dark?yellow:magenta,strong:fg,emphasis:magenta,inlineCode:cyan,codeText:fg,
    codeCommand:blue,codeFlag:red,codeString:green,codeComment:grey,link:blue,path:cyan,number:magenta,quote:grey,rule:grey,tableRule:grey,
    bullet:red,diagram:blue,diagramText:fg,diffAdded:green,diffRemoved:red};
  return Object.fromEntries(Object.entries(roles).map(([role,color])=>[`${role}Color`,color]));
}
// Nerd Font glyphs: copy, code file, eye, open-in-new.
const ICON={copy:'\uF0C5',source:'\uF1C9',rendered:'\uF06E',open:'\u{F03CC}'};
const PANE={id:'aberrant-settings',title:'Aberrant',columns:58,rows:22};
const HELP='Usage: /render [on|off|mode native|text|theme NAME|images on|off|mermaid on|off|preview on|off|boxes on|off|tools inherit|cards|copy|doctor|demo]';
const DEMO='# Aberrant\n\nReadable **Markdown**, source copying, and $E=mc^2$.\n\n| Feature | State |\n| --- | --- |\n| Images | Ready |\n| Diagrams | Ready |\n\n> [!NOTE]\n> One renderer, one theme.\n\n```mermaid\nflowchart LR\n  Prompt --> Parse\n  Parse --> Render\n  Render --> Read\n```\n\n```rust\nlet price = 42;\nprintln!("{price}");\n```';

  async function init(s:any,$:any) {
    s.loaded ??= (async()=>{
      s.prefs=preferences(await $.store.get('preferences'));
      const env:Record<string,string|undefined>={
        TERM:await $.env.get('TERM'),
        TERM_PROGRAM:await $.env.get('TERM_PROGRAM'),
        KITTY_WINDOW_ID:await $.env.get('KITTY_WINDOW_ID'),
        TMUX:await $.env.get('TMUX'),
        STY:await $.env.get('STY'),
        CLAUDE_CODE_FORCE_TERMINAL_IMAGES:await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
        HOME:await $.env.get('HOME'),
        CLAUDE_CODE_TMPDIR:await $.env.get('CLAUDE_CODE_TMPDIR'),
        NO_COLOR:await $.env.get('NO_COLOR'),
        CMUX_WORKSPACE_ID:await $.env.get('CMUX_WORKSPACE_ID'),
      };
      s.env={...capabilities(env),...env};
      s.session=await $.session.id();
      const terminal=env.TERM_PROGRAM==='ghostty'||env.TERM_PROGRAM==='cmux'?'ghostty':env.KITTY_WINDOW_ID?'kitty':env.TERM==='xterm-kitty'?'kitty':null;
      s.terminal=terminal;
      await probe(s,$);
      if(env.CMUX_WORKSPACE_ID) s.themeStamp=await themeStamp(s,$);
      watchTheme(s,$);
    })();
    await s.loaded;
  }
  async function probe(s:any,$:any) {
    s.probe={cell:{},colors:{}};s.probeFailed=false;
    if(s.terminal) try {
      const r=await $.process.run(['bun',`${$.plugin.root}/bin/worker.mjs`],{stdin:JSON.stringify({kind:'probe',terminal:s.terminal,cmux:!!s.env.CMUX_WORKSPACE_ID}),timeoutMs:10000});
      s.probe=JSON.parse(r.stdout);
    } catch(error) {s.lastError=`Renderer probe: ${String(error)}`;s.probeFailed=true;}
  }
  /** cmux rewrites this file when its theme changes. */
  async function themeStamp(s:any,$:any) {
    try {return String((await $.fs.stat(`${s.env.HOME}/Library/Application Support/com.cmuxterm.app/config.ghostty`)).mtimeMs);} catch {return '';}
  }
  // Restarted on render like the draft poll, since a session end cancels it.
  function watchTheme(s:any,$:any) {if((s.env?.CMUX_WORKSPACE_ID||s.probeFailed)&&!s.themeWatch)s.themeWatch=$.clock.every(2000,()=>followTheme(s,$));}
  async function followTheme(s:any,$:any) {
    if(!s.env?.CMUX_WORKSPACE_ID) {
      // Outside cmux the theme never changes, so the watch only retries a failed probe.
      await probe(s,$);
      if(!s.probeFailed) {s.themeWatch?.cancel();s.themeWatch=null;$.ui.invalidate('ui.render');}
      return;
    }
    const stamp=await themeStamp(s,$);
    // A failed probe (the host can abort one at startup) is retried on the next tick.
    if(stamp===s.themeStamp&&!s.probeFailed)return;
    s.themeStamp=stamp;
    await probe(s,$);
    $.ui.invalidate('ui.render');
  }
  function look(s:any,) {
    const p=s.prefs,probe=s.probe||{},cell=probe.cell||{},colors=probe.colors||{};
    const terminal=p.theme==='terminal',dark=colors.background?isDark(colors.background):true;
    const family=terminal?familyPreset(colors.theme,dark):undefined;
    const own=terminal&&!family?paletteColors(colors.palette,colors.foreground,dark):null;
    const theme=terminal?family||(dark?'github-dark':'github-light'):p.theme;
    const resolved=resolveStyle({theme,...own,headingStyle:'bold',tableStyle:'rules',copyButtons:false,mermaid:p.mermaid});
    const bg=p.theme==='terminal'&&colors.background?colors.background:resolved.background||'#ffffff';
    const fg=p.theme==='terminal'&&colors.foreground?colors.foreground:resolved.theme.codeText||'#24292f';
    const style={...resolved,copyButtons:false,images:false,httpLinks:true,fileLinks:null,cwd:'',home:s.env?.HOME||'',mermaid:p.mermaid};
    return {style,preset:own?'terminal palette':theme,bg,fg,accent:resolved.theme.accent||'#0969da',font:cell.family||'Menlo',size:100,cellRatio:cell.cell_aspect||2,dark:isDark(bg)};
  }
  function remember(s:any,key:string,value:any) {
    s.cache.delete(key);s.cache.set(key,value);
    while(s.cache.size>64 || [...s.cache.entries()].reduce((n,[k,v])=>n+k.length+JSON.stringify(v).length,0)>32000000) s.cache.delete(s.cache.keys().next().value);
  }
  function reset(s:any,) {
    s.generation++;s.queue.clear();s.wanted.clear();s.cache.clear();s.inflight.clear();s.last="";s.paths.clear();s.grouped.clear();s.draft=[];s.imageDir=null;s.expanded.clear();
    s.scheduled?.cancel();s.scheduled=null;s.poll?.cancel();s.poll=null;s.themeWatch?.cancel();s.themeWatch=null;s.stopped=true;
  }
  function request(s:any,$:any,slot:string,req:any) {
    // The full serialized request is the map key, avoiding content-hash collisions.
    const key=JSON.stringify(req);s.wanted.set(slot,key);
    if(s.wanted.size>300)s.wanted.delete(s.wanted.keys().next().value);
    const hit=s.cache.get(key);if(hit) return hit;
    if(s.inflight.get(key)===s.generation)return null;
    s.queue.set(slot,{slot,key,req,generation:s.generation});
    if(s.queue.size>120) s.queue.delete(s.queue.keys().next().value);
    if(!s.scheduled) s.scheduled=$.clock.after(180,()=>{s.scheduled=null;return drain(s,$);});
    return null;
  }
  async function drain(s:any,$:any) {
    while(s.active<2&&s.queue.size) {
      const [slot,job]=s.queue.entries().next().value;s.queue.delete(slot);
      if(job.generation!==s.generation||s.wanted.get(slot)!==job.key) continue;
      // A second render site may request the same content while it is in flight.
      if(s.cache.has(job.key)||s.inflight.get(job.key)===job.generation) continue;
      s.inflight.set(job.key,job.generation);
      s.active++;
      void (async()=>{
        let answer:any;
        try {
          const r=await $.process.run(['bun',`${$.plugin.root}/bin/worker.mjs`],{stdin:JSON.stringify(job.req),timeoutMs:20000});
          if(r.isStdoutTruncated) throw new Error('Renderer response was truncated');
          answer=JSON.parse(r.stdout);
          if(answer.error) throw new Error(answer.error);
          if(answer.pages) for(const page of answer.pages) {
            page.png=(await $.fs.read(page.file,{as:'bytes'})).base64;
            if(page.png.length>2700000) throw new Error('Image too large for terminal');
          }
        } catch(error) {answer={error:String(error).slice(0,300)};}
        if(job.generation===s.generation) {
          remember(s,job.key,answer);if(answer.error)s.lastError=answer.error;
          $.ui.invalidate('ui.render');
        }
        if(s.inflight.get(job.key)===job.generation)s.inflight.delete(job.key);
        s.active--;await drain(s,$);
      })();
    }
  }
  /** A Button drawn as link text: link colour, underlined under the pointer. */
  function link(ui:any,bg:string,key:string,icon:string,label:string,onPress:()=>unknown) {
    // The host inverts a Button under the pointer; pre-swapping the colours makes it read as plain link text.
    const unInvert={color:bg,backgroundColor:'suggestion'};
    const children=[ui.Text({color:'suggestion',hover:unInvert,children:`${icon} `}),ui.Text({color:'suggestion',hover:{...unInvert,underline:true},children:label})];
    return ui.Box({key:`link:${key}`,children:[ui.Button({key,plain:true,children,onPress})]});
  }
  function copyButton($:any,ui:any,bg:string,key:string,text:string) {
    return link(ui,bg,key,ICON.copy,'Copy',()=>$.ui.copy({text,surface:'terminal'}));
  }
  function sourceButton(ui:any,bg:string,key:string,showSource:boolean,onPress:()=>unknown) {
    return link(ui,bg,key,showSource?ICON.rendered:ICON.source,showSource?'Rendered':'Source',onPress);
  }
  function pages(s:any,ui:any,result:any,key:string,alt:string) {
    return (result?.pages||[]).map((page:any,i:number)=>ui.Image({key:`${key}-${i}`,source:{png:page.png},columns:page.columns,rows:page.rows,alt}));
  }
  function openButton(s:any,$:any,ui:any,key:string,req:any) {
    return link(ui,req.bg,`open:${key}`,ICON.open,'Open',async()=>{
      let html=s.pageFiles.get(key);
      if(!html||!(await $.fs.exists(html))) {
        const r=await $.process.run(['bun',`${$.plugin.root}/bin/worker.mjs`],{stdin:JSON.stringify({...req,kind:'mermaid-page'}),timeoutMs:20000});
        html=JSON.parse(r.stdout).html;if(!html)return;
        s.pageFiles.set(key,html);
      }
      // Inside cmux, open in its own browser pane like other terminal links.
      await $.process.run(s.env?.CMUX_WORKSPACE_ID?['cmux','browser','open',`file://${html}`]:['open',html]);
    });
  }
  // From Readable Layout before 0.2.2: a rounded box with its title over the top border.
  // `color` is a Claude Code theme key, so each theme picks the box colour; the border is that colour dimmed.
  // `actions` sit over the top border on the right; spaces rather than a gap, so the border line stops around them.
  function framed(ui:any,title:string,color:string,body:any,actions:any[]=[]) {
    const spaced=actions.flatMap((action,i)=>[ui.Text({children:i?'  ':' '}),action]);
    return ui.Box({flexDirection:'column',marginTop:1,children:[
      ui.Box({flexDirection:'column',borderStyle:'round',borderColor:color,borderDimColor:true,paddingX:1,children:[body]}),
      ui.Box({position:'absolute',top:0,left:2,children:[ui.Text({color,bold:true,children:` ${title} `})]}),
      ...(actions.length?[ui.Box({position:'absolute',top:0,right:2,flexDirection:'row',children:[...spaced,ui.Text({children:' '})]})]:[])]});
  }
  /** With message boxes on, shifts transcript content right to line up with the text inside the boxes. */
  function indented(s:any,ui:any,node:any) {
    return s.prefs.enabled&&s.prefs.boxes?ui.Box({flexDirection:'column',paddingLeft:2,children:[node]}):node;
  }
  function textBlock(s:any,ui:any,style:any,block:any,columns:number) {
    const blocks=[block];
    const diagrams=s.prefs.mermaid&&!block.isOpen?drawDiagrams(ui,style,blocks,columns):new Map();
    return renderBlocks(ui,style,blocks,columns,diagrams);
  }
  /** Copy and source toggle for a whole reply. */
  function replyActions(s:any,$:any,ui:any,text:string,scope:string) {
    const bg=look(s,).bg,allKey=`${scope}:all`,allSource=s.expanded.get(allKey)===fingerprint(text);
    return [copyButton($,ui,bg,`copy:${scope}:all`,text),sourceButton(ui,bg,`source:${scope}:all`,allSource,()=>{
      if(allSource)s.expanded.delete(allKey);else s.expanded.set(allKey,fingerprint(text));$.ui.invalidate('ui.render');})];
  }
  // Copy, Rendered and Open with their icons, gaps and padding.
  const BLOCK_ACTIONS_WIDTH=30;
  const toolbar=(ui:any,actions:any[])=>ui.Box({flexDirection:'row',gap:2,children:actions});
  /** The reply body, and its actions for the caller to place on the box border or under the body. */
  async function drawReply(s:any,$:any,e:any,text:string,scope:string) {
    const ui=$.ui.resolve(e),l=look(s,),columns=Math.max(1,Math.min(180,(e.viewport?.columns||80)-4));
    const allSource=s.expanded.get(`${scope}:all`)===fingerprint(text);
    if(allSource)return {body:ui.Text({children:text}),actions:replyActions(s,$,ui,text,scope)};
    const blocks=blocksOf(text),rows:any[]=[];
    // Extremely long blocks retain the host renderer rather than exceeding tree limits.
    if(text.length>90000||blocks.length>120||columns<18) return null;
    for(const [i,b] of blocks.entries()) {
      const id=`${scope}:${i}`,isCode=b.kind==='code',isDiagram=isCode&&b.lang.toLowerCase()==='mermaid';
      const sourceKey=fingerprint(b.raw),showSource=s.expanded.get(id)===sourceKey;
      let result:any=null,diagramReq:any=null;
      const graphical=s.env?.pictures&&!showSource;
      const image=b.kind==='paragraph'?/^!\[([^\]]*)\]\(([^\s]+)\)\s*$/.exec(b.raw):null;
      if(graphical&&image&&s.prefs.images&&image[2].startsWith('/')) {
        let stamp='';try {const stat=await $.fs.stat(image[2]);stamp=JSON.stringify([stat.size,stat.mtimeMs]);} catch {}
        result=request(s,$,id,{kind:'image',path:image[2],stamp,columns,...l,style:undefined});
      } else if(graphical&&isDiagram&&s.prefs.mermaid&&!b.isOpen) {
        diagramReq={kind:'mermaid',source:b.lines.join('\n'),columns,...l,style:undefined};
        result=request(s,$,id,diagramReq);
      }
      const content=result?.pages?pages(s,ui,result,id,b.raw):textBlock(s,ui,l.style,b,columns);
      const actions:any[]=[];
      if(isCode||b.kind==='table') actions.push(copyButton($,ui,l.bg,`copy:${id}`,b.raw));
      if((result?.pages&&(isCode||b.kind==='table'))||showSource) actions.push(sourceButton(ui,l.bg,`source:${id}`,showSource,()=>{
        if(showSource)s.expanded.delete(id);else s.expanded.set(id,sourceKey);$.ui.invalidate('ui.render');
      }));
      if(result?.pages&&diagramReq) actions.push(openButton(s,$,ui,id,diagramReq));
      // Shown over the block's first row while the pointer is on the block (the keyed Box), so they take no row of their own.
      const onHover=ui.Box({position:'absolute',top:0,right:0,display:'none',hover:{display:'flex'},flexDirection:'row',gap:2,paddingX:1,backgroundColor:l.bg,children:actions});
      // A block with actions shrinks to its content, so they sit at its own right edge rather than the reply's; never narrower than them.
      rows.push(ui.Box({key:id,flexDirection:'column',...(actions.length?{alignSelf:'flex-start',minWidth:BLOCK_ACTIONS_WIDTH}:{}),children:[...content,...(actions.length?[onHover]:[])]}));
    }
    return {body:ui.Box({flexDirection:'column',gap:1,children:rows}),actions:replyActions(s,$,ui,text,scope)};
  }
  async function nativeAdditions(s:any,$:any,e:any,original:any) {
    // The native reply remains opaque and untouched, including other mods' additions.
    if(!s.env?.pictures||e.props.text.length>90000)return original;
    const ui=$.ui.resolve(e),l=look(s,),columns=Math.max(1,Math.min(180,(e.viewport?.columns||80)-4)),extra=[];
    for(const [i,b] of blocksOf(e.props.text).entries()) {
      if(i>=120)break;
      if(b.kind!=='code'||b.lang.toLowerCase()!=='mermaid'||b.isOpen||!s.prefs.mermaid)continue;
      const id=`${e.requestId}:native-diagram:${i}`;
      const req={kind:'mermaid',source:b.lines.join('\n'),columns,...l,style:undefined};
      const result=request(s,$,id,req);
      if(result?.pages)extra.push(...pages(s,ui,result,id,b.raw),openButton(s,$,ui,id,req));
    }
    return extra.length?ui.Box({flexDirection:'column',children:[original,...extra]}):original;
  }
  async function media(s:any,$:any,e:any,output:any,input:any,scope:string) {
    if(!s.prefs.images||!s.env?.pictures) return [];
    const ui=$.ui.resolve(e),l=look(s,),columns=Math.max(1,Math.min(60,(e.viewport?.columns||80)-4));
    const children=[];
    for(const [i,p] of picturesIn(output,input).entries()) {
      let stamp='';if(p.path&&!p.base64) try {const stat=await $.fs.stat(p.path);stamp=JSON.stringify([stat.size,stat.mtimeMs]);} catch {continue;}
      const result=request(s,$,`${scope}:image:${i}`,{kind:'image',...p,stamp,columns,...l,style:undefined});
      if(result?.pages) children.push(ui.Box({key:`image:${scope}:${i}`,flexDirection:'column',children:[
        ...pages(s,ui,result,`${scope}:${i}`,p.label),...(p.path?[ui.Link({href:fileLink(p.path),label:p.label})]:[])]}));
    }
    return children;
  }
  async function pollDraft(s:any,$:any) {
    if(s.polling||!s.prefs.enabled||!s.prefs.preview||!s.env?.pictures) return;
    s.polling=true;const generation=s.generation;
    try {
      const session=await $.session.id();
      if(session!==s.session) {s.session=session;s.imageDir=null;s.draft=[];}
      const numbers=previewNumbers((await $.prompt.read()).text);
      if(!numbers.length) {if(s.draft.length){s.draft=[];$.ui.invalidate('ui.render');}return;}
      if(!s.imageDir) {
        const uid=(await $.process.run(['id','-u'])).stdout.trim();
        const tmp=`${s.env.CLAUDE_CODE_TMPDIR||'/tmp'}/claude-${uid}`;
        for(const entry of await $.fs.list(tmp).catch(()=>[])) if(entry.kind==='dir') {
          const candidate=`${tmp}/${entry.name}/${session}/images`;
          if(await $.fs.exists(candidate)){s.imageDir=candidate;break;}
        }
      }
      const list=[];
      if(s.imageDir) {
        const files=await $.fs.list(s.imageDir);
        for(const n of numbers) {
          const file=files.find((f:any)=>f.kind==='file'&&new RegExp(`^${n}\\.(png|jpe?g|webp)$`,'i').test(f.name));
          if(file) {const path=`${s.imageDir}/${file.name}`;const stat=await $.fs.stat(path);list.push({n,path,stamp:JSON.stringify([stat.size,stat.mtimeMs])});}
        }
      }
      if(generation===s.generation&&JSON.stringify(list)!==JSON.stringify(s.draft)) {s.draft=list;$.ui.invalidate('ui.render');}
    } catch {} finally {s.polling=false;}
  }
  function startPoll(s:any,$:any) {if(!s.poll) {s.stopped=false;s.poll=$.clock.every(600,()=>pollDraft(s,$));}}
  async function save(s:any,$:any,patch:any) {
    const p=preferences({...s.prefs,...patch});await $.store.set('preferences',p);s.prefs=p;
    s.generation++;s.queue.clear();s.wanted.clear();s.cache.clear();s.expanded.clear();
    if(!p.enabled||!p.preview) s.draft=[];
    $.ui.invalidate('ui.render');
  }

export function register(on:any) {
  const s:any={prefs:{...DEFAULTS},loaded:null,env:null,probe:null,generation:0,cache:new Map(),wanted:new Map(),queue:new Map(),inflight:new Map(),
    active:0,scheduled:null,poll:null,polling:false,session:'',draft:[],imageDir:null,last:'',shown:new Set(),grouped:new Map(),paths:new Map(),
    expanded:new Map(),pageFiles:new Map(),lastError:'',stopped:false,demo:false};

  on('session.start',async($:any,e:any,next:any)=>{
    const original=await next(e);await init(s,$);
    for(const name of ['render','aberrant']) await $.command.register({name,description:'Aberrant: diagrams, image previews and optional Markdown themes',argumentHint:'[on|off|mode|theme|images|mermaid|preview|boxes|tools|copy|doctor|demo]',immediate:true});
    await $.command.register(compactToolsCommand);
    if((await $.session.surfaces()).includes('terminal')) startPoll(s,$);
    return original;
  });
  on('session.end',($:any,e:any,next:any)=>{reset(s,);return next(e);});
  on('prompt.submit',($:any,e:any,next:any)=>{s.draft=[];$.ui.invalidate('ui.render');return next(e);});
  on('tool.call',{tool:'Read'},($:any,e:any,next:any)=>{s.paths.set(e.tool_use_id,e.file_path);if(s.paths.size>300)s.paths.delete(s.paths.keys().next().value);return next(e);});
  on('command.run',{command:['render','aberrant']},async($:any,e:any)=>{
    await init(s,$);const args=e.args.trim(),[cmd='',...rest]=args.split(/\s+/),value=rest.join(' ');
    if(!cmd||cmd==='demo') {s.demo=cmd==='demo';await $.ui.open(PANE);return {};}
    if(cmd==='doctor') {const l=look(s,);return {text:`Aberrant 0.2.0 · ${s.prefs.enabled?'on':'off'} · ${s.prefs.mode}\n${s.env.reason}\nTheme: ${s.prefs.theme}${s.prefs.theme==='terminal'?` · ${s.probe?.colors?.theme||'no terminal theme'} → ${l.preset} · background ${l.bg}`:''}\nBun: ${s.probe?.bun||'not probed'}\nQueue: ${s.queue.size} · active: ${s.active}${s.lastError?`\nLast fallback: ${s.lastError}`:''}`};}
    if(cmd==='copy') {if(!s.last)return {text:'No reply has been rendered yet.'};await $.ui.copy({text:s.last,surface:'terminal'});return {text:'Reply source copied.'};}
    if((cmd==='on'||cmd==='off')&&!value) {await save(s,$,{enabled:cmd==='on'});return {text:`Aberrant ${cmd}.`};}
    if(['images','mermaid','preview','boxes'].includes(cmd)&&['on','off'].includes(value)) {await save(s,$,{[cmd]:value==='on'});return {text:`${cmd}: ${value}`};}
    if(cmd==='mode'&&['native','text'].includes(value)||cmd==='tools'&&['inherit','cards'].includes(value)||cmd==='theme'&&['terminal',...PRESET_NAMES].includes(value)) {await save(s,$,{[cmd]:value});return {text:`${cmd}: ${value}`};}
    return {text:HELP};
  });
  on('ui.render',{component:'UserMessage'},async($:any,e:any,next:any)=>{
    if(e.surface!=='terminal')return next(e);
    if(e.props.origin.kind!=='composer'||!e.props.text.trim()) {const original=await next(e);await init(s,$);return indented(s,$.ui.resolve(e),original);}
    await init(s,$);if(!s.prefs.enabled||!s.prefs.boxes)return next(e);
    const ui=$.ui.resolve(e);
    return framed(ui,'You','briefLabelYou',ui.Text({children:e.props.text.trim()}));
  });
  on('ui.render',{component:'AssistantMessage'},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal'||e.props.isSummary||!e.props.text?.trim()) return original;
    await init(s,$);if(!s.prefs.enabled)return original;
    if(s.stopped) startPoll(s,$);
    watchTheme(s,$);
    s.last=e.props.text;
    const text=e.props.text.trim();
    // One-line notes between steps stay unboxed so the answer stands out.
    const boxed=s.prefs.boxes&&(text.includes('\n')||text.length>160);
    const box=(node:any,actions:any[]=[])=>!s.prefs.boxes?node:!boxed?indented(s,$.ui.resolve(e),node):framed($.ui.resolve(e),'Claude','briefLabelClaude',node,actions);
    if(s.prefs.mode==='native')return box(await nativeAdditions(s,$,e,original));
    const reply=await drawReply(s,$,e,e.props.text,e.requestId);if(!reply)return box(original);
    const ui=$.ui.resolve(e),body=boxed?reply.body:ui.Box({flexDirection:'column',gap:1,children:[reply.body,toolbar(ui,reply.actions)]});
    // Keep outer additions such as live-thinking; replace only native content.
    const replaced=replaceNative(original,body);
    return replaced.replaced?box(replaced.node,reply.actions):box(original);
  });
  on('ui.render',{component:'ToolGroup'},async($:any,e:any,next:any)=>{
    if(e.surface!=='terminal')return next(e);
    const calls=e.props.calls||[];s.grouped.set(e.requestId,e.props.isExpanded?[]:calls.map((c:any)=>c.tool_use_id));
    if(s.grouped.size>200)s.grouped.delete(s.grouped.keys().next().value);
    const original=await next(e);await init(s,$);if(!s.prefs.enabled)return original;
    // An expanded group ends in a blank row, which doubles the top margin of the message box below it.
    if(e.props.isExpanded)return s.prefs.boxes?$.ui.resolve(e).Box({flexDirection:"column",marginBottom:-1,children:[original]}):original;
    const images=[];for(const c of calls) if(!c.isRunning&&!c.isErrored&&!c.isInterrupted) images.push(...await media(s,$,e,c.output,c.input,`${e.requestId}:${c.tool_use_id}`));
    const ui=$.ui.resolve(e);
    return indented(s,ui,images.length?ui.Box({flexDirection:'column',children:[original,...images]}):original);
  });
  on('ui.render',{component:'ToolResult'},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal')return original;
    await init(s,$);const ui=$.ui.resolve(e);
    if(!s.prefs.enabled||e.props.isErrored||e.props.tool!=='SendUserFile')return indented(s,ui,original);
    const id=e.props.tool_use_id;
    if([...s.grouped.values()].some((ids:any)=>ids.includes(id)))return indented(s,ui,original);
    const images=await media(s,$,e,e.props.output,{file_path:s.paths.get(id)},id||e.requestId);
    return indented(s,ui,images.length?ui.Box({flexDirection:'column',children:[original,...images]}):original);
  });
  on('ui.render',{component:'ToolUse'},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal')return original;await init(s,$);
    if(!s.prefs.enabled)return original;
    const ui=$.ui.resolve(e),p=e.props,id=p.tool_use_id||e.requestId;
    const grouped=[...s.grouped.values()].some((ids:any)=>ids.includes(id));
    const images=!grouped&&!p.isRunning&&!p.isErrored&&!p.isInterrupted&&p.tool!=='SendUserFile'
      ?await media(s,$,e,p.output,p.input,id):[];
    const row=s.prefs.tools==='cards'?ui.Box({flexDirection:'column',borderStyle:'round',borderColor:look(s,).accent,paddingX:1,children:[original]}):original;
    return indented(s,ui,images.length?ui.Box({flexDirection:'column',children:[row,...images]}):row);
  });
  for(const component of ['CommandOutput','InfoNotice','TurnDuration','ToolProgress','Spinner']) on('ui.render',{component},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal')return original;
    await init(s,$);return indented(s,$.ui.resolve(e),original);
  });
  // After the ToolUse hook above, so that hook wraps the compact rows.
  registerCompactTools(on);
  on('ui.render',{component:'AbovePrompt'},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal'||e.props.hasSurvey)return original;await init(s,$);
    if(!s.prefs.enabled||!s.prefs.preview)return original;
    if((await $.state.get({plugin:'plugin-h',key:'hidden'})).value===true)return original;
    if(!s.poll)startPoll(s,$);
    const ui=$.ui.resolve(e),l=look(s,),tiles=[];
    const maxRows=Math.min(8,(e.props.maxRows||10)-2);
    if(maxRows<1)return original;
    const columns=Math.max(1,Math.min(24,Math.floor((e.props.bodyColumns||80)/Math.max(1,s.draft.length))-2));
    for(const item of s.draft) {
      const result=request(s,$,`draft:${s.session}:${item.n}`,{kind:'image',path:item.path,stamp:item.stamp,columns,maxRows,...l,style:undefined});
      if(result?.pages)tiles.push(ui.Box({flexDirection:'column',children:[...pages(s,ui,result,`draft:${item.n}`,`Image #${item.n}`),ui.Text({dimColor:true,children:`#${item.n}`})]}));
    }
    return tiles.length?ui.Box({flexDirection:'column',children:[original,ui.Box({flexDirection:'row',gap:1,children:tiles})]}):original;
  });
  on('ui.render',{component:'Pane',requestId:'sidebar-controls'},async($:any,e:any,next:any)=>{
    const original=await next(e);if(e.surface!=='terminal')return original;
    await init(s,$);const ui=$.ui.resolve(e);
    return ui.Box({flexDirection:'column',children:[original,ui.Button({
      key:'toggle-aberrant',label:`Aberrant: ${s.prefs.enabled?'ON':'OFF'}`,
      color:s.prefs.enabled?'green':'gray',
      onPress:()=>save(s,$,{enabled:!s.prefs.enabled}),
    })]});
  });
  on('ui.render',{component:'Pane',requestId:PANE.id},async($:any,e:any,next:any)=>{
    if(e.surface!=='terminal')return next(e);await init(s,$);const ui=$.ui.resolve(e),p=s.prefs,children=[];
    const button=(key:string,label:string,patch:any)=>ui.Button({key,label,onPress:()=>save(s,$,patch)});
    children.push(ui.Text({bold:true,children:'Aberrant'}),ui.Text({dimColor:true,children:`Theme: ${p.theme}`}));
    children.push(button('enabled',p.enabled?'Rendering: ON':'Rendering: OFF',{enabled:!p.enabled}));
    children.push(ui.Box({flexDirection:'row',gap:1,children:['native','text'].map(mode=>button(`mode:${mode}`,`${mode===p.mode?'● ':''}${mode}`,{mode}))}));
    for(const feature of ['images','mermaid','preview','boxes'])children.push(button(feature,`${feature}: ${p[feature]?'ON':'OFF'}`,{[feature]:!p[feature]}));
    children.push(ui.Select({key:'theme',value:p.theme,options:['terminal',...PRESET_NAMES].map(value=>({value,label:value})),onSelect:(value:string)=>save(s,$,{theme:value})}));
    children.push(button('tools',`Tool style: ${p.tools}`,{tools:p.tools==='inherit'?'cards':'inherit'}));
    children.push(ui.Text({dimColor:true,children:'Inspired by Intelligent UI, Prismantis, Mermaid Inline, Inline Images and Claude Image View. See README for credits.'}));
    children.push(ui.Text({dimColor:true,children:'/render doctor explains image support and fallbacks.'}));
    const preview=p.mode==='native'?null:await drawReply(s,$,{...e,viewport:{...e.viewport,columns:e.props.bodyColumns||54}},s.demo?DEMO:'## Preview\n\n**Readable replies**, images, diagrams, and source copying.',PANE.id);
    children.push(p.mode==='native'?ui.Text({children:'Native mode preserves Claude’s normal text. Images and diagram previews stay available. Optional text mode applies Markdown themes.'}):preview&&ui.Box({flexDirection:'column',gap:1,children:[preview.body,toolbar(ui,preview.actions)]}));
    return ui.Box({flexDirection:'column',gap:1,children});
  });
}
