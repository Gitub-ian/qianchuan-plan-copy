import fs from 'node:fs'
const PORT = process.env.CDP_PORT || 9222
const BASE = 'http://127.0.0.1:' + PORT

async function j(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error('http ' + r.status + ' ' + path)
  return r.json()
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })
  const conn = { ws, seq: 0, pending: new Map() }
  ws.onmessage = (ev) => {
    let m
    try { m = JSON.parse(ev.data) } catch { return }
    if (m.id && conn.pending.has(m.id)) {
      const p = conn.pending.get(m.id); conn.pending.delete(m.id)
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result)
    }
  }
  ws.onclose = () => { for (const p of conn.pending.values()) p.rej(new Error('ws closed')); conn.pending.clear() }
  return conn
}

function send(conn, method, params = {}) {
  const id = ++conn.seq
  return new Promise((res, rej) => { conn.pending.set(id, { res, rej }); conn.ws.send(JSON.stringify({ id, method, params })) })
}

async function evalExpr(conn, expr, awaitPromise = true) {
  const r = await send(conn, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true })
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') }
  return { value: r.result?.value }
}

const MOUSE = (x, y) => [
  { type: 'mouseMoved', x, y },
  { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
  { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 },
]

async function realClick(conn, x, y) {
  for (const e of MOUSE(x, y)) await send(conn, 'Input.dispatchMouseEvent', e)
  return { clickedAt: [Math.round(x), Math.round(y)] }
}

function findAllExpr(text, scope, exact) {
  const sc = JSON.stringify(scope)
  const tx = JSON.stringify(text)
  return '(()=>{' +
    'const root=document.querySelector(' + sc + ')||document.body;' +
    'const want=' + tx + ';const exact=' + (exact ? 'true' : 'false') + ';' +
    'const all=[...root.querySelectorAll("a,button,span,div,li,td,label,p,i")];' +
    'const hits=[];' +
    'for(const e of all){ if(!e.offsetParent) continue; const t=(e.innerText||"").trim(); if(!t) continue;' +
    'const ok = exact ? (t===want) : (t===want || t.includes(want));' +
    'if(!ok) continue; const b=e.getBoundingClientRect(); if(b.width<2||b.height<2) continue;' +
    'hits.push({tag:e.tagName,x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2),w:Math.round(b.width),h:Math.round(b.height),len:t.length,cls:String(e.className).slice(0,40)});}' +
    'hits.sort((a,b)=>a.len-b.len);return hits.slice(0,12)})()'
}

async function main() {
  let raw = ''
  if (process.argv[2]) raw = fs.readFileSync(process.argv[2], 'utf8')
  else raw = fs.readFileSync(0, 'utf8')
  const req = JSON.parse(raw)
  const out = { ok: true, results: [] }
  let targets = await j('/json/list')
  let pages = targets.filter(t => t.type === 'page')
  if (req.actions?.[0]?.cmd === 'tabs') {
    out.tabs = pages.map(p => ({ id: p.id, url: p.url.slice(0, 120), title: p.title }))
    console.log(JSON.stringify(out)); return
  }
  if (req.newTab) {
    await fetch(BASE + '/json/new?' + encodeURIComponent(req.newTab.url), { method: 'PUT' }).catch(() => {})
    await new Promise(r => setTimeout(r, 900))
    targets = await j('/json/list'); pages = targets.filter(t => t.type === 'page')
    if (req.newTab.url) { /* navigate handled */ }
  }
  let page = pages[0]
  if (req.match) page = pages.find(p => p.url.includes(req.match)) || page
  if (req.tabId) page = pages.find(p => p.id === req.tabId) || page
  if (!page) { console.log(JSON.stringify({ ok: false, error: 'no page target' })); return }
  const conn = await connect(page)
  try {
    await send(conn, 'Runtime.enable').catch(() => {})
    await send(conn, 'Page.enable').catch(() => {})
    for (const a of (req.actions || [])) {
      const step = { cmd: a.cmd }
      try {
        if (a.cmd === 'eval') { const r = await evalExpr(conn, a.expr, a.await !== false); step.result = r.error ? { error: r.error } : r.value }
        else if (a.cmd === 'shot') {
          await send(conn, 'Page.bringToFront').catch(() => {})
          const opts = { format: 'png', fromSurface: false, captureBeyondViewport: false }
          if (a.clip) opts.clip = Object.assign({ scale: 1 }, a.clip)
          const r = await send(conn, 'Page.captureScreenshot', opts)
          fs.writeFileSync(a.path, Buffer.from(r.data, 'base64'))
          step.saved = a.path
        }
        else if (a.cmd === 'clickAt') step.result = await realClick(conn, a.x, a.y)
        else if (a.cmd === 'findText') { const r = await evalExpr(conn, findAllExpr(a.text, a.scope || 'body', a.exact)); step.result = r.error ? r : r.value }
        else if (a.cmd === 'clickAt') {
          const x = a.x, y = a.y
          await send(conn, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
          await send(conn, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
          await send(conn, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
          step.result = { clickedAt: [x, y] }
        }
        else if (a.cmd === 'clickText') {
          const r = await evalExpr(conn, findAllExpr(a.text, a.scope || 'body', a.exact))
          const hits = r.value
          if (!hits || !hits.length) step.result = { error: 'text not found: ' + a.text }
          else { const v = hits[a.index || 0]; step.result = Object.assign(await realClick(conn, v.x, v.y), { text: a.text, tag: v.tag }) }
        }
        else if (a.cmd === 'click') {
          const r = await evalExpr(conn, '(()=>{const el=document.querySelector(' + JSON.stringify(a.sel) + ');if(!el)return null;el.scrollIntoView({block:"center"});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()')
          if (!r.value) step.result = { error: 'selector not found' }
          else step.result = await realClick(conn, r.value.x, r.value.y)
        }
        else if (a.cmd === 'setInput') {
          const expr = '(function(){var el=document.querySelector(' + JSON.stringify(a.sel) + ');if(!el)return "notfound";' +
            'var d=Object.getOwnPropertyDescriptor(el.constructor.prototype,"value");if(d&&d.set){d.set.call(el,' + JSON.stringify(a.text) + ')}else{el.value=' + JSON.stringify(a.text) + '}' +
            'el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return el.value})()'
          const r = await evalExpr(conn, expr); step.result = r.error ? r : r.value
        }
        else if (a.cmd === 'type') {
          for (const ch of a.text) { await send(conn, 'Input.insertText', { text: ch }) }
          step.typed = a.text.length
        }
        else if (a.cmd === 'insertText') { await send(conn, 'Input.insertText', { text: a.text }); step.inserted = a.text.length }
        else if (a.cmd === 'key') {
          await send(conn, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: a.vk || 13, code: a.code || 'Enter', key: a.key || 'Enter' })
          await send(conn, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: a.vk || 13, code: a.code || 'Enter', key: a.key || 'Enter' })
          step.key = a.key || 'Enter'
        }
        else if (a.cmd === 'nav') { await send(conn, 'Page.navigate', { url: a.url }); step.nav = a.url; await new Promise(r => setTimeout(r, a.wait || 3000)) }
        else if (a.cmd === 'wait') { await new Promise(r => setTimeout(r, a.ms || 1000)); step.waited = a.ms || 1000 }
        else if (a.cmd === 'scroll') { await evalExpr(conn, 'window.scrollBy(0,' + (a.y || 600) + ')'); step.scrolled = a.y || 600 }
        else if (a.cmd === 'reload') { await send(conn, 'Page.reload', {}); step.reloaded = true; await new Promise(r => setTimeout(r, a.wait || 3000)) }
        else if (a.cmd === 'text') {
          const r = await evalExpr(conn, '(document.body.innerText||"").slice(' + (a.from || 0) + ',' + (a.to || 3000) + ')')
          step.text = r.value
        }
        else if (a.cmd === 'frames') {
          const r = await evalExpr(conn, '[...document.querySelectorAll("iframe")].map((f,i)=>({i,src:(f.src||"").slice(0,120),w:f.offsetWidth,h:f.offsetHeight}))')
          step.frames = r.value
        }
        else if (a.cmd === 'inputs') {
          const r = await evalExpr(conn, '(()=>{const out=[];document.querySelectorAll("input,textarea").forEach((e,i)=>{if(!e.offsetParent)return;const b=e.getBoundingClientRect();out.push({i,type:e.type,ph:e.placeholder||"",val:String(e.value||"").slice(0,40),x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width)})});return out.slice(0,60)})()')
          step.inputs = r.value
        }
        else step.error = 'unknown cmd ' + a.cmd
      } catch (e) { step.error = String(e.message || e) }
      out.results.push(step)
    }
  } finally { try { conn.ws.close() } catch {} }
  console.log(JSON.stringify(out))
}
main().catch(e => { console.log(JSON.stringify({ ok: false, error: String(e.message || e) })) })