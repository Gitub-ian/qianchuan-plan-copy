// pick-all.mjs —— 「添加视频」弹窗里把每个抖音号的主页视频全勾上，然后点确定
// 用法: node pick-all.mjs [adId]
//   adId 省略时从最近一个 out/*.json 读抖音号名称
// 前提: 已进入某计划的 素材 tab，且「添加视频」弹窗已打开
// 逻辑: 切号用 JS click（按名称，坐标点不动）；素材卡片必须 CDP 真实点击；已添加的卡片点了没反应，所以每张都点一遍
import fs from 'node:fs'
import path from 'node:path'

const PORT = 9222, BASE = 'http://127.0.0.1:' + PORT
const OUT_DIR = 'F:/AI办公/qc/out'
const CARD = '.main-vmok-plugin-create-material-list-card-item'
const NAV = '.main-vmok-plugin-tabs__nav-list'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function namesFor(adId) {
  if (adId) { const f = path.join(OUT_DIR, adId + '.json'); if (fs.existsSync(f)) { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d.douyinNames || [] } }
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(OUT_DIR, f))
  if (!files.length) return []
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return JSON.parse(fs.readFileSync(files[0], 'utf8')).douyinNames || []
}

async function j(p) { const r = await fetch(BASE + p); if (!r.ok) throw new Error('http ' + r.status); return r.json() }
async function connect(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')) })
  const c = { ws, seq: 0, p: new Map() }
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data) } catch { return } if (m.id && c.p.has(m.id)) { const q = c.p.get(m.id); c.p.delete(m.id); m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result) } }
  return c
}
function send(c, method, params = {}) { const id = ++c.seq; return new Promise((res, rej) => { c.p.set(id, { res, rej }); c.ws.send(JSON.stringify({ id, method, params })) }) }
async function ev(c, expr) { const r = await send(c, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value }
async function click(c, x, y) {
  await send(c, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send(c, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send(c, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
const getSel = `(()=>{const t=document.body.innerText.replace(/[ \\t]+/g,' ');const m=t.match(/已选择\\s*(\\d+)\\/200/);return m?Number(m[1]):-1})()`
const clickTab = (name) => `(()=>{const ls=[...document.querySelectorAll('${NAV}')];for(const list of ls){const t=[...list.children].find(c=>c.innerText&&c.innerText.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(name)}));if(t){t.click();return 'OK'}}return 'NOTAB'})()`
const listCards = `(()=>[...document.querySelectorAll('${CARD}')].map(c=>{const w=c.querySelector('[itemid]')||c;return w.getAttribute('itemid')}).filter(Boolean))()`
const cardPos = (id) => `(()=>{const c=[...document.querySelectorAll('${CARD}')].find(x=>{const w=x.querySelector('[itemid]')||x;return w.getAttribute('itemid')===${JSON.stringify(id)}});if(!c)return null;c.scrollIntoView({block:'center',inline:'nearest'});const r=c.getBoundingClientRect();if(r.width<10)return null;return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`

const arg = process.argv[2]
const names = arg && arg.includes(',') ? arg.split(',').map((s) => s.trim()).filter(Boolean) : namesFor(arg)
if (!names.length) { console.log(JSON.stringify({ error: '没有抖音号名单：先跑 dump-plan.mjs，或直接 socket 里看' })); process.exit(1) }
const pages = (await j('/json/list')).filter((t) => t.type === 'page')
const page = pages.find((p) => p.url.includes('qianchuan')) || pages[0]
const c = await connect(page)

const modalOpen = await ev(c, `(()=>/已选择\\s*\\d+\\/200/.test(document.body.innerText))()`)
if (!modalOpen) { console.log(JSON.stringify({ error: '「添加视频」弹窗没开，先手动打开或点「添加视频」' })); process.exit(1) }

const log = []
for (const name of names) {
  const r = await ev(c, clickTab(name))
  if (r !== 'OK') { log.push({ name, err: r }); continue }
  await sleep(2600)                       // 卡片异步渲染，等不够会读到 0 张
  const ids = await ev(c, listCards)
  const before = await ev(c, getSel)
  for (const id of ids) {
    const p = await ev(c, cardPos(id))
    if (!p) continue
    await sleep(140)
    await click(c, p.x, p.y)
    await sleep(300)
  }
  const after = await ev(c, getSel)
  log.push({ name, cards: ids.length, before, after, delta: after - before })
}
// 点确定
const okb = await ev(c, `(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='确定'&&b.getBoundingClientRect().width>0);if(!bs.length)return 'NOOK';const r=bs[bs.length-1].getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]})()`)
let submitted = false
if (Array.isArray(okb)) { await click(c, okb[0], okb[1]); await sleep(5000); submitted = true }
const total = await ev(c, `(()=>{const m=document.body.innerText.match(/共\\d+个视频/);return m?m[0]:null})()`)
console.log(JSON.stringify({ ok: true, submitted, totalVideos: total, log }, null, 1))
process.exit(0)
