# dsh-starter

一个一次性的 DSH 入门向导插件：把模板变成 **agent preset**，并为它安装所需的插件。不往工作目录写任何文件。

它是插件，不是 DSH 的补丁：只通过 bundle + `ctx` 服务扩展，不改 DSH 代码。

## 状态

v0.7.3。模板已合并进 preset：starter 挂载时创建所有 preset，但不安装任何依赖插件；用户在某个 preset 的会话里发出第一句话后，preset 内的 session 行会给 LLM 注入一次提示，先检查插件、再询问用户、最后安装。

已实现：

- `starter` 服务：`list()` / `plan(id)` / `check(id)` / `diagnose()` / `run(id, opts)` / `installNext(id, opts)` / `uninstall(id, opts)` / `setPlugins(id, enabled, opts)`
- 八个工具：`starter_list`、`starter_plan`、`starter_check`、`starter_diagnose`、`starter_apply`、`starter_install`、`starter_remove`、`starter_set_plugins`
- **先挂工具、后注册 preset**：preset 注册在后台执行（等 standard 最长 30 秒），失败只记录在 `starter_diagnose` 里，不会把整个插件带下去
- **六个场景模板**：`legal-finance`（法律与财务）、`office`（办公帮手）、`life`（生活帮手）、`study`（学习帮手）、`dev`（技术开发）、`media`（媒体创作）
- 每个模板对应一个 preset：`legal-finance`、`office-helper`、`life-helper`、`study-helper`、`tech-dev`、`media-studio`
- **继承 `standard`**：preset 由 standard 的插件行克隆而来，只替换 persona；工具、skill、plan mode、compaction、delegation 全部来自 standard，starter 不重复定义
- **preset 先全建，插件后装**：挂载时只注册 preset，不联网、不安装
- **首轮提示**：每个 preset 都多挂一行 `starter-session`，在会话第一个 turn 的第一步注入一次提示：先调 `starter_check`，把「通用插件」和「本场景插件」分两组列给用户，得到同意后才安装
- **不写工作目录**：没有 `AGENTS.md`、没有项目目录、没有位置选择
- `starter_apply` 只负责"准备好 preset"，**不再批量装插件**；插件由 `starter_install` 一次装一个，模型每装一个就汇报进度——**批量安装会卡住 DSH 的其它任务**，所以刻意拆开
- 卸载模板：**插件保留还是卸载必须由用户选择**（`membersAction: keep | remove`）；preset 在 starter 安装期间一直可用
- 批量启停模板插件：`setBundleEnabled` 逐个启用/禁用成员 bundle；**starter 自己永远跳过，无法禁用自己**

未实现（下一步）：

- 客户端 UI（当前只有工具，靠对话驱动）
- 远程模板目录
- 一键把某个模板设为新会话默认 preset（目前需在 Settings → Agent presets 里选）

## 场景与插件对照

场景按「谁在用、解决哪类现实问题」划分，一个场景一个 preset。成员插件的含义是「这个场景需要时装上哪些能力」，不是「这个插件归谁所有」。

**每个场景都会额外推荐同一批通用插件**（下面的表只列场景专属成员；通用成员由 `src/common.js` 统一提供，`starter_plan` / `starter_check` / `starter_apply` 都会把它们算进去）。

| 场景 | 模板 / preset | 场景成员插件 | 用来做什么 |
| --- | --- | --- | --- |
| 法律与财务 | `legal-finance` / `legal-finance` | `dsh-free-search`、`dsh-date-calc` | 审合同、找法条、写文书、走流程；记账（xlsx 台账）、票据、报表、税务、算期限与天数 |
| 办公帮手 | `office` / `office-helper` | `@linxin666/dsh-client-ui-task-board`、`dsh-ppt`、`dsh-mermaid`、`dsh-genui` | 文档、表格、汇报、演示、图表、邮件、会议纪要（docx/xlsx/pptx 走内置办公能力） |
| 生活帮手 | `life` / `life-helper` | `dsh-free-search`、`dsh-map-tools`、`dsh-tabbit`、`dsh-builtin-browser`、`dsh-computer-use-win`、`@commonworks/dsh-rearview`、`dsh-pocket`、`@xmanrui/dsh-im` | 查信息、比价、跑腿代办、出行路线；网页与桌面代办，结果推到手机 / IM；回看刷视频花的时间 |
| 学习帮手 | `study` / `study-helper` | `@yunmiao/studymate`、`dsh-ai4scholar`、`@ggboy123/dsh-paper-reader`、`@commonworks/dsh-video-str`、`@commonworks/historical-rag-lab`、`@commonworks/dsh-circuit` | 课程、做题（用内置 Python 核对算式）、论文精读、网课与讲座、历史人文、电路实验 |
| 技术开发 | `dev` / `tech-dev` | `superpowers-dsh`、`cc-safety-net`、`@linxin666/dsh-client-ui-git-graph`、`dsh-deja`、`@vectorize-io/hindsight-coding-agents` | 读代码再改、危险操作拦截、Git 图谱、跨 agent 与项目记忆 |
| 媒体创作 | `media` / `media-studio` | `dsh-image-gen`、`@ninkch/dsh-infinite-canvas`、`dsh-ffmpeg`、`@commonworks/dsh-video-str`、`dsh-remotion`、`dsh-blender`、`@memef1f1y/dsh-plugin-tts` | 选题、分镜、生图、配音、剪辑到成片；3D 资产 |

「法律与财务」为什么放一起：这两个领域的规矩最硬——都有主管部门、都要引用依据（法条 / 会计准则与税法）、错了都有实际后果，所以共用同一条流程：先摘事实 → 找依据 → 给结论 → 标清不确定的地方。办公不同，它管的是格式和交付，所以单独一个场景。

**同一个插件可以出现在多个 preset。** 现在 `dsh-free-search`（法律财务 + 生活）和 `@commonworks/dsh-video-str`（学习看网课 + 媒体看参考片）各在 2 个场景：它们本来就是跨场景的通用能力，按场景重复声明只是让每个 preset 自带完整依赖，不表示归属。副作用只有一个：卸载某个模板时，`starter_remove` 会先告出 `sharedWithTemplates`，别把别的场景还在用的插件删掉。

**算数不用插件。** 原来两个场景挂的 `dsh-math-calculator`（BigNumber / 符号微积分 / 统计）因报错已移除。现在一律用 DSH 自带 Python（`load_workspace_dependencies` 返回的解释器带 numpy / pandas）核对算式；期限与天数用 `dsh-date-calc`；需要符号运算时用通用插件 `dsh-python-env` 装 sympy（自动走国内镜像）。

**通用插件，任何场景都推荐**（来源 `src/common.js`，首轮提示会把它们和场景成员分开列给用户）：

| 插件 | 作用 |
| --- | --- |
| `billion-context` | 长会话上下文压缩，省 token |
| `dsh-context` | 上下文洞察：看 Context 组成、压缩与注入事件 |
| `dshmarket` | 应用内浏览、安装、更新插件 |
| `@michengai/dsh-skills-manager` | 统一加载与管理本机技能 |
| `dsh-python-env` | Python 虚拟环境管理，装包自动切国内镜像（TUNA / 阿里 / USTC） |
| `dsh-think-translate` | 思考链 / 任务卡显示层翻译 |
| `@y1x1n/dsh-prompt-optimizer` | 发送栏旁一键分析并改写提示词（复用当前会话模型） |
| `dsh-codex-subscription` | 用 ChatGPT / Codex 订阅额度跑模型 |

**外观类常驻，随启动器安装，不在首轮推荐里**（推荐它们只会变成噪音）：`dsh-dream-skin`（主题皮肤）、`@linxin666/dsh-pet`（桌面宠物）、`dsh-whale-widget`（API 余额挂件）。

**不纳入场景**（能力重复、宿主不兼容或需要额外条件；要用手动开）：

| 插件 | 为什么不做成场景成员 |
| --- | --- |
| `dsh-legal-clause` | 注册的工具名带点号（`legal.clause_tree` 等 8 个），违反 DSH 的 `^[a-zA-Z0-9_-]+$`，安装时直接报 `Invalid 'tools[N].name'`，只能弃用 |
| `dsh-univer-office` | 体积大、与内置办公能力重复；docx/xlsx/pptx 已由 DSH 自带的 office 技能 + 内置 Python 覆盖 |
| `dsh-bookkeeping` | 实测安装后会把 DSH 弄坏，只能弃用；记账改用 xlsx 台账 + 内置 Python |
| `dsh-browser`、`dsh-browser-cdp` | 同为 CDP 共享浏览器，留 `dsh-builtin-browser` 一个 |
| `dsh-windows-mcp` | 与 `dsh-computer-use-win` 同为桌面自动化，但必须另起 `uvx windows-mcp` 子进程 |
| `dsh-comfyui` | 与 `dsh-image-gen` 同为生图，且要求本机 ComfyUI 服务器 |
| `@tt-a1i/archify-dsh` | README 只测过 host `0.1.2-rc.1`，与当前 0.2.x 不匹配 |
| `dsh-video-storyboard` | 只支持 `web` 类 profile，Desktop 的 `desktop` profile 被拒 |
| `@linxin666/dsh-remote-web-ui` | 作者已标记 deprecated（替代品 `dsh-remote-bridge` 是给 Android 客户端的协议桥，不是同一功能） |
| `dsh-wechat`、`dsh-lark-channel` | 与 `@xmanrui/dsh-im` 重复，IM 通道由它统一覆盖 |
| `dsh-plugin` | 与 `dshmarket` 是两个独立市场，默认只留一个 |
| `@linxin666/dsh-web-all` | 与已单列的 task-board、pet 重复 |
| `dsh-our-free-model` | 与启动器的模型配置同步重叠，按需手动打开 |

**成员里有几个需要自备外部条件**，装完不一定立刻能用（agent 调用时会报错并提示怎么补）：`dsh-ffmpeg` 要本机 FFmpeg/ffprobe、`dsh-blender` 要 Blender、`dsh-image-gen` 要订阅或 API key、`dsh-ai4scholar` 要付费 key、`dsh-tabbit` 要 Tabbit ≥1.9、`@commonworks/dsh-video-str` 看 B 站字幕要登录、`@commonworks/dsh-rearview` 看 B 站观看历史要扫码登录。

> 原先仓库根的 `dsh-plugin-index.json`（当时 32 个插件的安装清单）已删除：内容并入上面的对照表和每个模板的 `members`。之后新增的成员只活在这张表和模板里（现在场景成员 32 条 / 去重 30 个包，通用插件 8 个，每个 preset 合计推荐 10-16 个），不再有独立清单文件。要查历史版本用 `git show c5f9860:dsh-plugin-index.json`。启动器自己那份清单在 `ai-learning-assistant-launcher/external-resources/dsh/`，与本仓库无关。

## 安装（Desktop）

完全退出 Desktop，从 npm 装：

```powershell
$dsh = "C:\Users\aivm\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop add @commonworks/dsh-starter
```

改过源码、要装本地这份时用 `file:`（复制安装，改完要 `remove` + `add`）：

```powershell
& $dsh plugin --profile desktop remove @commonworks/dsh-starter
& $dsh plugin --profile desktop add "file:F:/code/dsh-starter"
```

重新打开 Desktop。插件会以 `@commonworks/dsh-starter` 出现在插件列表里，六个 preset 会出现在 Agent presets 里。

> **不要用 `link:` 安装到 Desktop**：Junction 让模块落在工作区，Desktop 解析不到 `@deepseek-ai/dsh-tools`，插件会在导入阶段失败。
>
> `file:` 是复制安装：改代码后要 `remove` + `add`。`file:` 的 `remove` 只删 profile 里的副本，不动源码；千万不要对 `link:` 安装执行 `remove`，pnpm 会删掉链接目标。

## 隔离测试（不动 Desktop）

```powershell
$dsh = "C:\Users\aivm\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
$env:DSH_HOME = "C:\Users\aivm\Desktop\dsh-test-workspace\.conflict-home3"
& $dsh --profile probe --from-default-profile web --dump-config
& $dsh plugin --profile probe add "file:F:/code/dsh-starter"
$env:DSH_STARTER_DEBUG = "1"
& $dsh --profile probe --no-open --port 0
```

看到下面这行说明插件挂载、preset 注册、工具注册都成功了：

```
starter: mounted; templates=dev, legal-finance, life, media, office, study; presets=tech-dev, legal-finance, life-helper, media-studio, office-helper, study-helper; tools=starter_list,starter_plan,starter_check,starter_diagnose,starter_apply,starter_remove,starter_set_plugins
```

（`--profile probe` 后面不要再写 `web`。）

## 使用流程

安装 starter、重启后：

1. 六个场景 preset 已经出现在 Agent presets 里，但**没有任何插件被安装**；
2. 新建会话，选择「法律与财务」之类的预设，发出第一句话；
3. 该 preset 内的 `starter-session` 行在第一个 turn 注入一次提示，模型会：
   - 调 `starter_check({ template: "legal-finance" })`，拿到每个成员的 `installed` / `enabled` / `missing`；
   - 如果 `missing` 非空，按「通用插件 / 本场景插件」两组列给用户，一次问清；
   - 用户同意后**逐个安装**：每次只调 `starter_install({ template: "legal-finance", confirm: true })` 装一个，汇报进度，再装下一个；
   - 如果 `missing` 为空，直接回答，不重复询问。
4. 成员需要额外条件的（`dsh-blender` 要本机已装 Blender、`@xmanrui/dsh-im` 要各平台登录），用户可以不装，直接在该 preset 里聊天。

手动流程仍然可用：

```text
starter_list()
  → starter_plan({ template: "legal-finance" })
  → starter_check({ template: "legal-finance" })
  → starter_apply({ template: "legal-finance", confirm: true })      // 只准备 preset
  → starter_install({ template: "legal-finance", confirm: true })    // 装第一个
  → starter_install({ template: "legal-finance", confirm: true })    // 再装下一个……直到 done
```

> 为什么不是一次装完：`installBundle` 在一次工具调用里跑完整个列表，期间 DSH 的其它任务都被挡住。拆成一个插件一次调用后，每次只占一个较短的窗口，中间用户和其它会话还能继续干活。

## 卸载模板

卸载只处理模板的插件，**preset 在 starter 安装期间仍然可用**（它由 starter 注册）。

1. 预览：

```text
starter_remove({ template: "legal-finance" })
```

返回模板声明的插件、以及这些插件是否也被其他模板使用（`sharedWithTemplates`）。`legal-finance` 的两个场景成员里，`dsh-free-search` 也被生活帮手用（2 个场景），`dsh-date-calc` 是它独占；再加上 8 个通用插件（每个 preset 都有），所以整串卸载基本只能选 `keep`。

2. 用户明确选择后再执行：

```text
starter_remove({ template: "legal-finance", confirm: true, membersAction: "keep" })
```

- `keep`：插件保留
- `remove`：通过 plugin manager 卸载成员包
- 不传 `membersAction` 时 `confirm: true` 会直接报错，要求先问用户——不会替用户做决定
- 某个成员卸载失败即停，报告每项结果

## 批量启停模板插件

不卸载、不删依赖，只切换成员 bundle 的启用状态：

```text
starter_set_plugins({ template: "legal-finance", enabled: false })              // 预览
starter_set_plugins({ template: "legal-finance", enabled: false, confirm: true }) // 执行
```

- `enabled: false`：成员 bundle 从 `dsh.profile.bundles` 取消选择，插件不再加载，但依赖保留
- `enabled: true`：重新选择成员 bundle（会追加到列表末尾，可能改变覆盖优先级）
- **starter 自己永远在保护名单里**：即使某个模板把 `dsh-starter` 写成成员，也会被跳过并出现在 `skippedProtected`
- 某个成员失败即停
- 只处理声明了 `dsh.bundle` 的成员；普通依赖包无法用这个接口启停
- 插件在多场景共用时，这里停的是整个 bundle：别的场景也不再加载它

## 模板格式

`templates/<id>.json`：

```json
{
  "id": "life",
  "title": "生活帮手",
  "description": "……",
  "preset": {
    "id": "life-helper",
    "name": "生活帮手",
    "order": 23,
    "persona": "你是生活帮手，负责……\n\n## 工作方式\n1. ……"
  },
  "members": [
    { "name": "@scope/some-plugin", "reason": "why" }
  ],
  "firstTask": "第一句可执行的任务"
}
```

约束：

- `preset.id` 全局唯一，且不能和内置 preset 重名；
- `preset.persona` 是该 preset 的 system prompt 前缀，流程/规则都写在这里；
- preset 继承 `standard`：starter 克隆 standard 的插件行并只替换 persona，模板不重复声明工具；
- `members` 只写**插件包**，不要写成员的行；成员的 patch 由它自己的 bundle 声明，避免重复挂载；
- `members` 不写 `version` 时安装最新版；要锁版本再写 `version`（如 `"0.2.1"`）；
- 同一个插件可以写进多个模板的 `members`；
- 安装/卸载都是显式动作：`confirm` 必须为 `true`。

## 开发

```powershell
$node = "C:\Users\aivm\AppData\Local\Programs\DeepSeek Harness\resources\runtime\bin\node.cmd"
$env:DSH_DESKTOP_NODE_EXECUTABLE = "C:\Users\aivm\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
& $node dsh-starter/test/templates.test.js
& $node dsh-starter/test/install.test.js
```

注意：`node --test <目录>` 会 spawn 子进程，在当前沙箱下报 `EPERM`；直接执行测试文件即可（node:test 会在进程内运行）。

## 设计约束

核心三条：

1. 插件是唯一扩展方式，不碰 DSH 代码；
2. 模板是数据，preset 是组合；模板不产生工作区文件；
3. 装完就交给原生插件页和 preset 选择器，不变成常驻管理器。
