# 千川乘方「复制计划」技能包

> **资源位置**：本技能的资源基目录下有 `scripts/`（cdp.mjs、gen-batch11.mjs、pick-all.mjs、start-qc.cmd）与 `references/`（完整手册、界面结构、弹窗处理、浏览器会话）。下文出现的 `scripts/xxx.mjs` 都相对这个基目录；截图与记录可以写到任意工作目录，建议统一放一个 `qc/` 目录。
>
> **运行环境**：Windows + Microsoft Edge（`--remote-debugging-port=9222`）+ Node 18+，脚本零第三方依赖。

按本文件逐步执行，不需要重新探索界面。**所有坐标都是 CSS 像素**（截图坐标 ÷ devicePixelRatio）。

## 0. 先理解业务：为什么"复制"= 删除 + 重建

平台硬规则：**一条计划由「商品 × 抖音号」唯一确定，同一组合在全店只能存在一条乘方计划**。所以没有「复制」按钮，同组合也不能并存两条。

复制 = ①记录原计划全部参数 → ②删除原计划（释放组合）→ ③用同商品、同抖音号、同预算/ROI 新建 → ④把素材重新挂上（逐号全选抖音主页素材）→ ⑤核对。

**风险全在"删错"和"建错"**：删除不可恢复，所以删除前必须搜索唯一性自查 + 用户明确确认。

---

## 1. 前置检查（每次开工先做，30 秒）

### 1.1 浏览器连得上吗

```bash
curl -s http://127.0.0.1:9222/json/version
```

- 返回 `Browser: Edg/...` → 正常
- 连不上 → 启动 Edge（**必须提权/非沙箱，否则报 `mojo ... 拒绝访问 (0x5)`**）：

```bash
( nohup "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir="F:\AI办公\qc\edge-profile" \
  --no-first-run --no-default-browser-check --start-maximized \
  "https://qianchuan.jinritemai.com/login" >/tmp/edge.log 2>&1 & )
```

启动命令会挂住不返回，属正常；**绝对不要 job_kill 这个后台任务**——会杀掉整棵进程树的 Edge。
也可以让用户双击 `scripts/start-qc.cmd`。

### 1.2 登录态与账户

登录页若停在「选择账户」列表，用 JS click 点含「市场部短视频挂车」的叶子元素（搜索框 setter 无效）。
进入后 URL 应含 `aavid=1860422794525708`。

### 1.3 量一次坐标（屏幕/缩放变了就必须重做）

```js
({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })
```

历史值：`1528 × 732, dpr 1.25`（截图 1910×915）；也曾出现过 `dpr 2`（截图 3824×1896）。
**换算：CDP 坐标 = 截图坐标 ÷ dpr。** 小图标别肉眼估，用 `getBoundingClientRect()` 取中心。

### 1.4 执行器

所有操作通过 `scripts/cdp.mjs` 执行，命令写在 JSON 里：

```json
{ "match": "qianchuan", "actions": [
  { "cmd": "nav", "url": "https://..." },
  { "cmd": "wait", "ms": 9000 },
  { "cmd": "eval", "expr": "(()=>{...})()" },
  { "cmd": "shot", "path": "F:/AI办公/qc/x.png" }
] }
```

命令：`eval` / `shot` / `clickAt(x,y)` / `clickText(text,exact,index,scope)` / `findText` / `setInput(sel,text)` / `insertText(text)` / `key(key)` / `type` / `nav` / `reload` / `wait(ms)` / `scroll(y)` / `text` / `tabs` / `inputs`。

**铁律**：能 JS `.click()` 生效的就用 JS click（tab、checkbox、行内按钮）；只有**素材卡片**这类 React 合成事件不认的元素才用真实鼠标点击。

---

## 2. 六阶段流程

| 阶段 | 内容 | 耗时 | 要用户确认 |
|---|---|---|---|
| A | 进列表 → 搜索到唯一一条 | ~30s | 否 |
| B | 抓原计划全部参数 | ~2min | 否 |
| C | 删除原计划 | ~1min | **必须** |
| D | 按参数新建 | ~4min | 否 |
| E | 逐号全选素材 + 核对 | ~3min | 否 |

### A. 进列表并搜索到唯一一条

```bash
# A1 导航（uniVideoTab=1 商品自选 / =2 全店托管）
https://qianchuan.jinritemai.com/overall-prom?aavid=1860422794525708&campaignType=1&uniTab=ad&marGoal=1&uniVideoTab=1&overallPromViewTab=plan
```

```js
// A2 关掉挡住整页的弹窗（它开着会拦键盘，Enter 完全无效）
(()=>{const t=document.body.innerText;if(!/全店托管重磅升级/.test(t))return 'NOPOP';
 const d=[...document.querySelectorAll('div')].filter(e=>e.innerText.includes('全店托管重磅升级')
   &&e.getBoundingClientRect().width>300&&e.getBoundingClientRect().width<1200);
 if(!d.length)return 'NOBOX';const r=d[0].getBoundingClientRect();
 return {x:Math.round(r.right-30),y:Math.round(r.top+25)}})()   // 拿到的坐标用 clickAt 点
```

```js
// A3 必须点「商品自选」radio（URL 会被重写成全店托管）
(()=>{const r=[...document.querySelectorAll('.aurora-qc-radio-button-label')]
  .find(e=>e.innerText.trim()==='商品自选');if(!r)return 'NORADIO';r.click();return 'OK'})()
// 若返回 NORADIO，先点「计划视图」tab：
// [...document.querySelectorAll('.aurora-qc-tabs-tab')].find(e=>e.innerText.trim()==='计划视图').click()
```

```js
// A4 搜索（强制步骤）：用 placeholder 含「回车搜索」的那个框
(()=>{window.scrollTo(0,0);const i=document.querySelector('input[placeholder*="回车搜索"]');
 if(!i)return 'NOSEARCH';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
 s.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();
 return document.activeElement===i?'READY':'NOFOCUS'})()
```
→ `{"cmd":"insertText","text":"<计划ID>"}` → `{"cmd":"key","key":"Enter"}` → 等 9 秒

```js
// A5 判定：必须 count === "1"
(()=>{const t=document.body.innerText.replace(/\s+/g,' ');
 return {count:(t.match(/共(\d+)条计划/)||[])[1],
   rows:[...document.querySelectorAll('tr')].filter(r=>/ID：/.test(r.innerText)).map(r=>r.innerText.replace(/\s+/g,' ').slice(0,90))}})()
```

**count 必须是 1。** 不是 1 就停下排查：常见是弹窗没关、框不在视口（`window.scrollTo(0,0)`）、或输入值被拼接成脏值（先 setter 清空再 insertText）。
按 ID 搜不到时，改用**计划名**搜（搜索框对个别 ID 不敏感）。

### B. 抓参数

```js
// B1 打开详情：先滚到行，再点计划名 span 中心（不要改 URL 加 adId，会整页卡死）
(()=>{const tr=[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('<计划ID>'));
 tr.scrollIntoView({block:'center'});return 'OK'})()
(()=>{const sp=[...document.querySelectorAll('span')].find(e=>e.innerText.trim()==='<计划名>');
 if(!sp)return 'NOSPAN';sp.scrollIntoView({block:'center'});const r=sp.getBoundingClientRect();
 return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()
```

成功判据：URL 出现 `adId=<ID>`，页面出现 tab「数据」。
**抽屉卡「加载中」**：nav 回列表 → 重新搜索 → 再点计划名，一次就好，不要干等。

切 tab 一律 JS click（clickAt 会打穿把抽屉关掉）：

```js
(()=>{const t=[...document.querySelectorAll('[class*=tabs-tab]')]
 .filter(e=>{const r=e.getBoundingClientRect();return r.y>60&&r.y<140&&r.x>240&&e.innerText.trim()==='<tab名>'});
 if(!t.length)return 'NOTAB';t[t.length-1].click();return 'OK'})()
```

| tab | 读什么 | 等待 |
|---|---|---|
| 商品 | `matchAll(/ID[：:]\s*([A-Za-z0-9_]+)/g)` | 3s |
| 抖音号 | `innerText.indexOf('在投商品信息')` 起 2000 字；每页 10 条要翻页 | **9s** |
| 素材 | `match(/共\s*(\d+)\s*个视频/)` | 3s |
| **详情** | `innerText.indexOf('当前选择的抖音号')` 起 1400 字 = 参数全集 | 3s |

**关闭抽屉**：`{"cmd":"key","key":"Escape"}`（一次即可，比找 × 按钮可靠）。

### C. 删除（唯一必须用户确认的步骤）

1. 确认「共1条计划」后，把该行滚到可见，**截图**
2. 截图必须是**搜索后只剩单条计划的列表页**，能看清 计划名/ID/每日预算/ROI/投放状态 —— **不要发「确定要删除计划吗」弹窗截图**
3. 附参数表，等用户回「确认删除」
4. 在同一搜索结果页点行内「删除」（JS click 叶子节点）：

```js
(()=>{const tr=[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('<计划ID>'));
 const b=[...tr.querySelectorAll('*')].filter(e=>e.innerText&&e.innerText.trim()==='删除'&&e.children.length===0);
 if(!b.length)return 'NOBTN';b[b.length-1].click();return 'OK'})()
```

5. 弹窗「确定要删除计划吗？删除后不可恢复」→ 点确定（**按钮文案可能在伪元素里，按文本筛不到时用坐标 clickAt**）：

```js
(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='确定'&&b.getBoundingClientRect().width>0);
 if(!btns.length)return 'NOBTN';btns[btns.length-1].click();return 'OK'})()
```

6. **等待 ≥60 秒**（按钮会转圈很久），以 toast「删除成功」+「共0条计划」为准。

### D. 新建

```
https://qianchuan.jinritemai.com/create-ad/overall-product?aavid=1860422794525708
```
等 14 秒；若弹「联盟合作达人自动投功能上线啦」先关掉。

```js
// D1 添加商品（按钮可能是 div.oc-button-wrap 里的 button）
(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='添加商品');
 if(!b)return 'NOBTN';b.click();return 'OK'})()
```

```js
// D2 搜商品：**先取消「只看可投商品」勾选**，否则常搜出 0 条
(()=>{const c=[...document.querySelectorAll('label')].find(e=>/只看可投商品/.test(e.innerText));
 const cb=c&&c.querySelector('input[type=checkbox]');if(cb&&cb.checked)cb.click();
 const i=document.querySelector('input[placeholder*="商品名称"]');if(!i)return 'NOINPUT';
 const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
 s.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();return 'READY'})()
```
→ insertText 商品ID → key Enter → 等 8 秒 → 应显示「共1条记录」

```js
// D3 勾选商品（取 innerText 最短、含商品ID、含 checkbox 的祖先）
(()=>{const id='<商品ID>';const c=[...document.querySelectorAll('*')]
  .filter(e=>e.innerText&&e.innerText.includes(id)&&e.querySelector('input[type=checkbox]'));
 c.sort((a,b)=>a.innerText.length-b.innerText.length);
 if(!c.length)return 'NOCB';c[0].querySelector('input[type=checkbox]').click();return 'OK'})()
```
→ 底部「已选 1/30」→ `clickText "下一步" exact`（中心约 (1460,700)）→「已添加：1/30」

```bash
# D4 添加抖音号：点 clickText "添加抖音号" exact，抽屉打开后分批勾选（每批 4–5 个）
node scripts/gen-batch11.mjs "ID1,ID2,ID3,ID4" batch.json && node scripts/cdp.mjs batch.json
```
**进度只看底部「当前商品已选：N/30」**；勾到与列表行显示的「N 抖音号」一致即停。
→ `clickText "确定" exact` 关抽屉 → 商品行显示「N个抖音号」

```js
// D5 表单一次填完（ROI 取第 1 个 aurora-qc-input-number-input）
(()=>{const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
 const set=(el,v)=>{if(!el)return false;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();return true};
 const roi=document.querySelector('input.aurora-qc-input-number-input');
 const bud=document.querySelector('input[placeholder="请输入"]');
 const nm=document.querySelector('input[placeholder*="计划名称"]');
 return {a:set(roi,'<ROI>'),b:set(bud,'<预算>'),c:set(nm,'<计划名>'),
   roi:roi&&roi.value,bud:bud&&bud.value,name:nm&&nm.value,
   sw:[...document.querySelectorAll('[role=switch]')].map(e=>e.getAttribute('aria-checked'))}})()
```

**计划名规则：原计划名 + 日期后缀换成当天**（如 `…--1113` → `…--1118`），≤50 字符。

```js
// D6 发布：按钮在视口外时要先滚过去
(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='发布计划');
 if(!b)return 'NOBTN';b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();
 return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()
```
→ clickAt → 弹窗「为保证乘方投放的唯一性…」→ `clickText "确认发布" exact` → 跳到 overall-prom（URL 含 `sourceFrom=createSuccess`）

```js
// D7 读新计划 ID：点商品自选 → 用计划名搜 →「共1条」→ 行内 ID：xxx
```

### E. 素材（逐号全选抖音主页素材）

1. 点计划名开抽屉（URL 出现 adId）→ 素材 tab（JS click）→ `clickText "添加视频" exact`
2. 判定弹窗已开：页面文本匹配 `/已选择 \d+\/200/`
3. 读弹窗里的抖音号名单（**按弹窗实际顺序与文字**）：

```js
(()=>{const navs=[...document.querySelectorAll('.main-vmok-plugin-tabs__nav-list')]
  .map(l=>[...l.children].map(c=>c.innerText.trim()).filter(Boolean));
 return {modal:/已选择\s*\d+\/200/.test(document.body.innerText), navs}})()
```

4. 一次跑完（**必须逗号串；单号也要写成 `"名字,"`**；带 emoji/全角括号要加引号）：

```bash
node scripts/pick-all.mjs "抖音号名1,抖音号名2,...,抖音号名N"
```
输出 `{"ok":true,"submitted":true,"totalVideos":"共N个视频","log":[{name,cards,before,after,delta}]}`

5. 核对：`match(/共\s*(\d+)\s*个视频/)`，等于各号主页视频数之和即通过。

> 素材口径：**全选抖音主页视频，不剔除「已删除」**（投产差的由用户后续处理）。素材数比原计划多属正常 —— 原计划数字是「投放中」筛过的。

---

## 3. 铁律清单（改代码前先读）

**确认与安全**
1. 必须先在列表搜索、确认**只剩 1 条**才允许删除；禁止在多条可见时点删除。
2. 确认截图 = 单条计划列表页（不是删除弹窗），要能看清计划名/ID/预算/ROI/状态。
3. 用户确认后就在**同一搜索结果页**点删除，不再重新搜索。
4. 某抖音号加不进去（提示「商品与该抖音号已存在商品投放计划」）→ 记下号与提示上报，**不要反复硬试**。

**业务规则**

5. 计划名 = 原名 + 日期后缀改成当天。
6. 原计划中**已删除的抖音号不选**；最终计数与列表行显示的「N 抖音号」一致即可。
7. 「无抖音号（仅含商城流量）」是计划自带行，创编不选。
8. 含达人佣金出价由系统自动勾，核对 true 即可；智能优惠券默认启用、AIGC 默认关、投放日期默认长期，都不用动。
9. 用户若要改 ROI/预算，按他给的值填，其余照抄原计划。

**点击与技术**

10. 坐标 = 截图坐标 ÷ dpr；小图标用 `getBoundingClientRect()` 取中心。
11. tab、checkbox、行内按钮 → JS `.click()`；素材卡片 → 真实鼠标点击。
12. 输入框只用 `eval focus` + `insertText`，**不要 clickAt 输入框**（会打回 body，之后 Enter 全失效）。
13. 抖音号横向列表 `scrollIntoView` 无效 → 按名称 JS click 切号。
14. 抽屉打开时右侧全被覆盖，别在 x>300 区域点列表。
15. 手工改 URL 加 `&adId=` 会卡整页 → 只通过点计划名进详情。

**时序**

16. 新建页白屏 → 等 14s；列表刚 nav 完「共0条计划」→ 等 9s 再点商品自选。
17. 抖音号抽屉搜索结果 5–10s 才刷新，刷新前显示的是上一次结果 → 轮询 8×2.5s。
18. 切抖音号后等 ≥2.5s 再读卡片。
19. 删除后按钮转圈久，**等 ≥60 秒**再看结果。

**环境**

20. 沙箱内启动 Edge 报 mojo 拒绝访问 → 必须提权启动；启动 Edge 的后台任务永不 job_kill。
21. 本机没有 `python` 命令（exit 9009）→ 处理 JSON 用 `node -e`。

---

## 4. 故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 列表「共0条计划」且无行 | 落在全店托管 / 未加载完 | 点「商品自选」radio，等 4s |
| 搜索回车无效、仍是全量 | 升级弹窗拦键盘 / 框不在视口 | 先关弹窗 + `window.scrollTo(0,0)` 再搜 |
| 搜索值变成脏串 | setter 设值后又 insertText 追加 | 先 setter 清空，再 insertText |
| 点计划名无反应 | 行不在视口 | 先 `scrollIntoView({block:'center'})` 再取坐标 |
| 抽屉空白/加载中 | 渲染失败 | nav 回列表重新搜索再点 |
| 发布按钮点了没反应 | 被抽屉挡住 / 在视口外 | 先关抽屉，再 scrollIntoView 后 clickAt |
| 抖音号勾不上、计数不增 | 已被别的计划占用 / 是已删除的号 | 记录上报，别硬试 |
| 素材卡片点了没选中 | 用了 JS click | 改真实鼠标点击（pick-all 已处理） |
| 全选后视频数偏少 | 某号切 tab 失败 | 看 log 里哪个号 cards=0，重跑该号 |
| 商品抽屉一直「共0条记录」 | 接口卡住 / 「只看可投商品」勾着 | 先取消该勾选；仍空就请用户手动刷新浏览器 |

**卡住超过 3 分钟没有进展 → 立刻截图 + 问用户，不要自己反复试。**

---

## 5. 交付物（每条计划完成）

1. 参数归档：`docs/NN-计划参数-<原计划ID>.md`
2. 复制记录：`docs/NN-复制记录-<原计划ID>.md`（新计划 ID、抖音号表、素材数、截图路径、差异说明）
3. 回复用户：原计划已删除 + 新计划 ID/名/状态/ROI/预算/抖音号数/素材数 + 差异说明
4. 截图：删除前单条计划截图、新计划素材页截图

---

## 6. 脚本

| 脚本 | 用途 |
|---|---|
| `scripts/cdp.mjs` | 通用 CDP 执行器（所有操作都用它） |
| `scripts/gen-batch11.mjs` | 抖音号抽屉批量按 ID 搜索 + 勾选（最稳版本） |
| `scripts/pick-all.mjs` | 添加视频弹窗按抖音号名称逐号全选并提交 |
| `scripts/start-qc.cmd` | 双击启动 Edge（9222 + 固定 profile） |

用法示例：

```bash
# 生成动作文件再执行
node scripts/gen-batch11.mjs "64390534277,51291549551,3387040" b1.json
node scripts/cdp.mjs b1.json

# 素材全选（逗号名单，单号也要带尾逗号）
node scripts/pick-all.mjs "盖盖,蓝莓多米,在下猫猫雨哎"
```

> 换账户时：把全文的 `aavid=1860422794525708` 换掉，profile 目录换成对应账户专用目录（不同账户建议分开 profile）。

## 7. 一句话流程

> 进列表 → 点商品自选 → 搜 ID 得「共1条」→ 点计划名抓参数 → 存档 → **单条截图 + 等确认** → 删 → nav 新建页 → 商品 → 抖音号 → ROI/预算/计划名 → 发布 → 点计划名 → 素材全选 → 核对数字 → 归档汇报。

更多细节见 `references/01-完整操作手册.md`（536 行完整版）、`references/02-新建界面结构.md`、`references/03-弹窗处理.md`、`references/04-浏览器会话.md`。
