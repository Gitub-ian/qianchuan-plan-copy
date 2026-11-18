import fs from 'node:fs'

const ids = process.argv[2].split(',')
const out = process.argv[3] || 'batch11.json'

const actions = []
for (const id of ids) {
  actions.push({
    cmd: 'eval',
    expr: `(()=>{const i=[...document.querySelectorAll('input')].find(e=>/抖音号名称或ID/.test(e.placeholder||''));if(!i)return 'NF';i.focus();const d=Object.getOwnPropertyDescriptor(i.constructor.prototype,'value');d.set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();return 'cleared'})()`,
  })
  actions.push({ cmd: 'wait', ms: 400 })
  actions.push({ cmd: 'insertText', text: id })
  actions.push({ cmd: 'wait', ms: 800 })
  actions.push({
    cmd: 'eval',
    expr: `(()=>{const i=[...document.querySelectorAll('input')].find(e=>/抖音号名称或ID/.test(e.placeholder||''));i.focus();return {val:i.value,active:document.activeElement===i}})()`,
  })
  actions.push({ cmd: 'wait', ms: 300 })
  actions.push({ cmd: 'key', value: 'Enter' })
  for (let k = 0; k < 8; k++) {
    actions.push({ cmd: 'wait', ms: 2500 })
    actions.push({
      cmd: 'eval',
      expr: `(()=>{const tr=[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('${id}'));if(!tr)return 'WAIT:${id}';const cb=tr.querySelector('input[type=checkbox]');if(!cb)return 'NOCB:${id}';if(cb.checked)return 'ALREADY:${id}';cb.click();return 'OK:${id}'})()`,
    })
  }
  actions.push({ cmd: 'eval', expr: `(document.body.innerText.match(/当前商品已选[:：]\\s*(\\d+)\\/30/)||[])[1]||'?'` })
}
fs.writeFileSync(out, JSON.stringify({ actions }))
console.log('wrote', out, 'ids', ids.length)
