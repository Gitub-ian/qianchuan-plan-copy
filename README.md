# 千川计划复制（DSH 技能插件）

给 DSH 用的技能插件：装上之后，任何会话里说「复制这条计划 1881706483978410」，AI 就会加载 `qianchuan-plan-copy` 技能，按已验证的流程跑完 —— 搜索确认唯一 → 抓全部参数 → **用户确认** → 删除 → 按参数重建 → 逐抖音号全选主页素材 → 核对。

## 为什么是插件而不是文件拷贝

巨量千川「乘方-推商品-自选商品」的计划按「商品×抖音号」唯一，平台没有复制按钮。本插件把整套流程（技能正文 + 3 个 CDP 脚本 + 4 篇参考文档）**放在插件包里**，通过 `ctx.skills.registerProvider()` 注册成技能，所以：

- 不需要往 `~/.dsh/skills/` 抄任何文件
- 在 DSH 的 **Plugins** 页面能看到、能卸载
- 升级插件即可更新技能内容与脚本

## 安装

### 方式一：插件市场索引（推荐）

在 DSH 的 **Plugins → Discover** 里添加索引地址：

```
https://<你的 GitHub 用户>.github.io/qianchuan-plan-copy/index.json
```

搜索「千川」或「qianchuan」，点安装。

### 方式二：直接安装本仓库

```
plugin_manager(action="install_bundle", target="github:<user>/qianchuan-plan-copy")
```

或把仓库克隆到本地目录后，在 **Plugins → Add plugin** 里选择该目录。

安装后新建一个会话，技能列表里应出现 `qianchuan-plan-copy`。

## 前置条件

| 项 | 要求 |
|---|---|
| 系统 | Windows |
| 浏览器 | Microsoft Edge 157+，可用 `--remote-debugging-port=9222` |
| 运行时 | Node 18+（脚本零第三方依赖） |
| 登录 | 在该机器的 Edge 里扫码登录一次千川账户 |

启动浏览器（沙箱内启动会报 `mojo ... 拒绝访问`，需提权；或双击 `assets/scripts/start-qc.cmd`）：

```bash
( nohup "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir="F:\AI办公\qc\edge-profile" \
  --no-first-run --no-default-browser-check --start-maximized \
  "https://qianchuan.jinritemai.com/login" >/tmp/edge.log 2>&1 & )
```

**起 Edge 的后台任务永远不要 job_kill**（会杀掉整棵进程树）。

## 换成你自己的账户

技能正文里出现的 `aavid=1860422794525708` 是默认账户，改成你的千川账户 ID 即可；不同账户建议用不同的 `--user-data-dir`。

## 内容

```
lib/index.js              skill provider（注册技能）
assets/SKILL.md           技能正文：六阶段流程 + 21 条铁律 + 故障速查
assets/scripts/
  cdp.mjs                 通用 CDP 执行器
  gen-batch11.mjs         抖音号抽屉按 ID 批量勾选
  pick-all.mjs            添加视频弹窗逐号全选素材
  start-qc.cmd            双击启动 Edge
assets/references/        完整操作手册、界面结构、弹窗处理、浏览器会话
docs/DETAIL.md            插件详情页文档
```

## 三条最容易踩的坑

1. 列表页的「全店托管重磅升级」弹窗会**拦截键盘** —— 它开着时搜索框能写值但 Enter 无效，先关弹窗再搜。
2. 确认删除的截图必须是「搜索后只剩一条计划」的列表页（能看清计划名/ID/预算/ROI/状态），不是删除确认弹窗。
3. 抖音号加不进去（提示「商品与该抖音号已存在商品投放计划」）说明组合被别的计划占用，记录后上报，不要硬试。

## License

MIT
