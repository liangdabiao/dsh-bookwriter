# dsh-bookwriter · 双风格长文写作

刘润风格（商业洞察/方法论/案例拆解）+ 罗振宇风格（认知/启发/演讲）两个长文写作技能，外加一个「书稿工作台」：
先立章节骨架，再逐章写正文，每章的进度与改动都有记录。MIT（liangdabiao）。

## 装了什么

| 能力 | 说明 |
|---|---|
| skill `liurun-bookwriter` | 刘润 28 年写作心法：3 种结构、SCQA 逻辑势能、5 商派 SCA++、8 大心法、12 项质量检查 |
| skill `luozhenyu-bookwriter` | 罗振宇 14 年内容心法：3 种结构、TQA/CAA/PEI、12 大心法、7 种 callout、12 项质量检查 |
| `bookwriter_project` | 书稿骨架与进度：`init` 建书 / `status` 更新章节 / `list` 当前书 / `books` 全部书稿 / `current` 切换 / `history` 生成历史 / `stats` 汇总 / `clear` 清空 |
| 侧栏工作台 | `/bookwriter/`：概览 · 我的书稿 · 书稿详情 · 生成历史 · 新建书稿 · 两种风格 |

## 用法

对话里：

- **「用刘润风格写一本《定价的常识》小册子，8 章」**
- **「用罗振宇风格写一份 20 节的商业思维专栏大纲」**

模型 `init` 章节骨架 → 按风格方法论逐章写正文 → 每章完成 `status` 记一笔，侧栏工作台实时可见。

## 侧栏工作台

| 页面 | 内容 |
|---|---|
| 概览 | 书稿 / 章节 / 完成数 / 完成度 / 历史事件；当前书的进度条与「继续写第 N 章」 |
| 我的书稿 | 每本书的卡片（风格、章数、完成度、当前/归档），可搜索 |
| 书稿详情 | 章节表（序号 / 标题 / 状态 / 摘要 / 更新时间）、进度条、这本书的历史；设为当前书 / 继续写 / 复制章节清单 / 删除 |
| 生成历史 | 建书 / 重建 / 章节 / 清空 / 切换 / 删除事件流，可按类型筛、搜关键词，点开看当次详情 |
| 新建书稿 | 填书名、风格、每章字数、章节清单 → 打开新对话并带上「init 骨架 → 逐章写 → 记进度」指令；也可先只要大纲 |
| 两种风格 | 两种方法论对照、三步流程、常见问题、随包技能说明 |

**重建不会丢书**：`init` 覆盖同名书时旧书转为归档（工作台可切回）；`clear` 同理。每次变化都进生成历史。

## 数据目录

`$DSH_HOME/bookwriter/`（默认 `C:\Users\<你>\.dsh\bookwriter\`）

- `books.json`：`{ currentId, books: [...] }`，每本书含章节（status/摘要/更新时间）与归档时间
- `history.json`：建书 / 重建 / 章节 / 清空 / 切换 / 删除事件（最多 300 条）
- 旧版本的单本 `book.json` 会自动迁移成第一本书

## 自检

```bash
npm install
npm test                      # data.js + host.js + skills + api 鉴权语义
npm run selftest              # 双技能正文 + 面板 API 健康
node scripts/api-test.mjs     # 起本地 http 打一遍工作台接口（不碰真实数据）
npm run build                 # client.js → dist/client.js（宿主加载的是这个产物）
```

`npm test` / `api-test` 都会把 `DSH_HOME` 指到 `.tmp/`，不会写你的真实书稿。

## 安装

```bash
dsh plugin --profile web add dsh-bookwriter
```

本地开发（link 安装）时宿主只认 profile 的 `dsh.profile.bundles`；改了 `lib/`、`src/` 需要重启一次 DeepSeek Harness，
改了 `client.js` 要先 `npm run build` 再刷新页面。

## 许可

MIT（liangdabiao）
