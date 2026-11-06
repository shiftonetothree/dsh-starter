# dsh-starter

一个一次性的 DSH 入门向导插件：把模板变成 **agent preset**，并为它安装所需的插件。不往工作目录写任何文件。

它是插件，不是 DSH 的补丁：只通过 bundle + `ctx` 服务扩展，不改 DSH 代码。

## 状态

v0.3.5。模板已合并进 preset：starter 挂载时创建所有 preset，但不安装任何依赖插件；用户在某个 preset 的会话里发出第一句话后，preset 内的 session 行会给 LLM 注入一次提示，先检查插件、再询问用户、最后安装。

已实现：

- `starter` 服务：`list()` / `plan(id)` / `check(id)` / `diagnose()` / `run(id, opts)` / `uninstall(id, opts)` / `setPlugins(id, enabled, opts)`
- 七个工具：`starter_list`、`starter_plan`、`starter_check`、`starter_diagnose`、`starter_apply`、`starter_remove`、`starter_set_plugins`
- **先挂工具、后注册 preset**：preset 注册在后台执行（等 standard 最长 30 秒），失败只记录在 `starter_diagnose` 里，不会把整个插件带下去
- **五个场景模板**：`legal-office`（法律与办公）、`life`（生活帮手）、`study`（学习帮手）、`dev`（技术开发）、`media`（媒体创作）
- 每个模板对应一个 preset：`legal-office`、`life-helper`、`study-helper`、`tech-dev`、`media-studio`
- **继承 `standard`**：preset 由 standard 的插件行克隆而来，只替换 persona；工具、skill、plan mode、compaction、delegation 全部来自 standard，starter 不重复定义
- **preset 先全建，插件后装**：挂载时只注册 preset，不联网、不安装
- **首轮提示**：每个模板都带成员插件，preset 里多挂一行 `starter-session`，在会话第一个 turn 的第一步注入一次提示，要求模型先调 `starter_check`、再问用户、得到同意后才安装
- **不写工作目录**：没有 `AGENTS.md`、没有项目目录、没有位置选择
- `starter_apply` 可显式 `installMembers: true`，通过 `ctx.pluginManager.installBundle` 逐个安装成员（默认关闭；失败即停并报告）
- 卸载模板：**插件保留还是卸载必须由用户选择**（`membersAction: keep | remove`）；preset 在 starter 安装期间一直可用
- 批量启停模板插件：`setBundleEnabled` 逐个启用/禁用成员 bundle；**starter 自己永远跳过，无法禁用自己**

未实现（下一步）：

- 客户端 UI（当前只有工具，靠对话驱动）
- 远程模板目录
- 一键把某个模板设为新会话默认 preset（目前需在 Settings → Agent presets 里选）

## 场景与插件对照

场景按「谁在用、解决哪类现实问题」划分，一个场景一个 preset。成员插件的含义是「这个场景需要时装上哪些能力」，不是「这个插件归谁所有」。

| 场景 | 模板 / preset | 成员插件 | 用来做什么 |
| --- | --- | --- | --- |
| 法律与办公 | `legal-office` / `legal-office` | `dsh-univer-office`、`@liustack/modlens`、`dsh-free-search`、`@linxin666/dsh-client-ui-task-board` | 审合同、找法条与案例、写文书、列办事流程；文档表格汇报纪要 |
| 生活帮手 | `life` / `life-helper` | `dsh-free-search`、`dsh-tabbit`、`dsh-computer-use-win`、`@xmanrui/dsh-im`、`dsh-pocket`、`dsh-univer-office` | 查信息、比价、跑腿代办、记账、出行与家务 |
| 学习帮手 | `study` / `study-helper` | `@yunmiao/studymate`、`dsh-ai4scholar`、`dsh-math-calculator`、`@liustack/modlens`、`@commonworks/historical-rag-lab`、`dsh-free-search` | 先摸底再定计划；课程、做题、论文阅读、历史人文 |
| 技术开发 | `dev` / `tech-dev` | `superpowers-dsh`、`dsh-ops`、`dsh-deja` | 读代码再改、小步验证、Windows 工具链、历史会话记忆 |
| 媒体创作 | `media` / `media-studio` | `dsh-comfyui`、`dsh-remotion`、`dsh-blender`、`dsh-free-search`、`@liustack/modlens` | 短视频、图文、封面、3D 资产 |

**同一个插件可以出现在多个 preset。** 现在 `dsh-free-search` 在 4 个场景、`@liustack/modlens` 在 3 个、`dsh-univer-office` 在 2 个：它们本来就是跨场景的通用能力，按场景重复声明只是让每个 preset 自带完整依赖，不表示归属。副作用只有一个：卸载某个模板时，`starter_remove` 会先告出 `sharedWithTemplates`，别把别的场景还在用的插件删掉。

**常驻，不进任何场景**（每个会话都用得上，随启动器一并安装）：

| 插件 | 作用 |
| --- | --- |
| `billion-context` | 长会话上下文压缩 |
| `dsh-think-translate` | 思考链 / 任务卡显示层翻译 |
| `dsh-codex-subscription` | 用 ChatGPT / Codex 订阅额度跑模型 |
| `dshmarket` | 应用内浏览、安装插件 |
| `@michengai/dsh-skills-manager` | 统一加载与管理本机技能 |
| `dsh-dream-skin` | 主题皮肤与壁纸 |
| `@linxin666/dsh-pet` | 桌面宠物挂件 |
| `dsh-whale-widget` | 右下角 API 余额挂件 |

**不纳入场景**（能力重复或需要额外条件，默认不装；要用手动开）：

| 插件 | 为什么不做成场景成员 |
| --- | --- |
| `dsh-browser` | 与 `dsh-tabbit` 功能重复，留一个就够 |
| `dsh-wechat`、`dsh-lark-channel` | 与 `@xmanrui/dsh-im` 重复，IM 通道由它统一覆盖 |
| `dsh-plugin` | 与 `dshmarket` 是两个独立市场，默认只留一个 |
| `@linxin666/dsh-web-all` | 与已单列的 task-board、pet 重复 |
| `dsh-our-free-model` | 与启动器的模型配置同步重叠，按需手动打开 |

> 原先仓库根的 `dsh-plugin-index.json`（32 个插件的安装清单）已删除：内容并入上面的对照表和每个模板的 `members`。要查历史版本用 `git show HEAD~1:dsh-plugin-index.json`。启动器自己那份清单在 `ai-learning-assistant-launcher/external-resources/dsh/`，与本仓库无关。

## 安装（Desktop）

完全退出 Desktop，用 `file:` 安装：

```powershell
$dsh = "C:\Users\aivm\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop remove dsh-starter
& $dsh plugin --profile desktop add "file:F:/code/dsh-starter"
```

重新打开 Desktop。插件会作为 `dsh-starter` 出现在插件列表里，五个 preset 会出现在 Agent presets 里。

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
starter: mounted; templates=dev, legal-office, life, media, study; presets=tech-dev, legal-office, life-helper, media-studio, study-helper; tools=starter_list,starter_plan,starter_check,starter_diagnose,starter_apply,starter_remove,starter_set_plugins
```

（`--profile probe` 后面不要再写 `web`。）

## 使用流程

安装 starter、重启后：

1. 五个场景 preset 已经出现在 Agent presets 里，但**没有任何插件被安装**；
2. 新建会话，选择「法律与办公」之类的预设，发出第一句话；
3. 该 preset 内的 `starter-session` 行在第一个 turn 注入一次提示，模型会：
   - 调 `starter_check({ template: "legal-office" })`，拿到每个成员的 `installed` / `enabled` / `missing`；
   - 如果 `missing` 非空，先问用户是否安装；
   - 用户同意后调用 `starter_apply({ template: "legal-office", confirm: true, installMembers: true })`；
   - 如果 `missing` 为空，直接回答，不重复询问。
4. 成员需要额外条件的（`dsh-blender` 要本机已装 Blender、`@xmanrui/dsh-im` 要各平台登录），用户可以不装，直接在该 preset 里聊天。

手动流程仍然可用：

```text
starter_list()
  → starter_plan({ template: "legal-office" })
  → starter_check({ template: "legal-office" })
  → starter_apply({ template: "legal-office", confirm: true, installMembers: true })
```

## 卸载模板

卸载只处理模板的插件，**preset 在 starter 安装期间仍然可用**（它由 starter 注册）。

1. 预览：

```text
starter_remove({ template: "legal-office" })
```

返回模板声明的插件、以及这些插件是否也被其他模板使用（`sharedWithTemplates`）。`legal-office` 的四个成员里，`dsh-univer-office` 也在生活帮手用，`@liustack/modlens` 也在学习帮手、媒体创作用，`dsh-free-search` 四个场景都在用——所以这里基本只能选 `keep`。

2. 用户明确选择后再执行：

```text
starter_remove({ template: "legal-office", confirm: true, membersAction: "keep" })
```

- `keep`：插件保留
- `remove`：通过 plugin manager 卸载成员包
- 不传 `membersAction` 时 `confirm: true` 会直接报错，要求先问用户——不会替用户做决定
- 某个成员卸载失败即停，报告每项结果

## 批量启停模板插件

不卸载、不删依赖，只切换成员 bundle 的启用状态：

```text
starter_set_plugins({ template: "legal-office", enabled: false })              // 预览
starter_set_plugins({ template: "legal-office", enabled: false, confirm: true }) // 执行
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
    "order": 22,
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

见 [DESIGN.md](DESIGN.md)。核心三条：

1. 插件是唯一扩展方式，不碰 DSH 代码；
2. 模板是数据，preset 是组合；模板不产生工作区文件；
3. 装完就交给原生插件页和 preset 选择器，不变成常驻管理器。
