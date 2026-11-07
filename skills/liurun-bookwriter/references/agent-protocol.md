# Agent 协作流程

多 Agent 协作的刘润风格商业长文创作规范。定义各 Agent 的职责、触发时机、协作方式与商业长文特有的素材流转。

---

## Agent 角色定义

| Agent | 职责 | 触发时机 | 并行限制 |
|-------|------|----------|----------|
| 主编 Agent | 长文结构判断、进度协调、质量把关、用户确认 | Phase 0/1/2/6/8 | 单独执行 |
| 调研 Agent | 商业案例、数据、金句、企业家故事 | Phase 3-4 | 最多 2 个并行 |
| 写作 Agent | 长文撰写（按结构分点/段/条） | Phase 5 | 最多 2 个并行 |
| 编辑 Agent | 12 项 QC、3 种结构 profile、SCQA 检查 | Phase 6 | 单独执行 |
| 排版 Agent | 长文格式规范化、目录索引、最终整合 | Phase 7 | 单独执行 |

---

## 完整流程

```
Phase 0: 启动（主编 Agent）
    ↓ 用户确认长文结构类型（3段式/10点式/32条/5商派）
Phase 1: 选题与角度确认
    ↓ 用户确认选题、角度、读者、篇幅
Phase 2: 大纲设计（主编 Agent）
    ↓ 用户确认大纲（含 SCQA 变体）
Phase 3-4: 素材搜集与事实核查（调研 Agent × 2，并行）
    ↓ 案例/数据/金句汇总
Phase 5: 撰写（写作 Agent × 2，并行）
    ↓ 每段/点/条完成、SCQA 标注
Phase 6: 审校（编辑 Agent）
    ↓ 12 项 QC + 3 种结构 profile 通过
Phase 7: 排版整合（排版 Agent）
    ↓ 格式规范化、目录索引
Phase 8: 定稿（主编 Agent）
```

---

## Phase 详细说明

### Phase 0: 启动与长文类型判断

**执行者**：主编 Agent

**任务**：
1. 判断长文类型（3 段式 / 10 点式 / 32 条 / 5商派 SCA++）
2. 选定默认 SCQA 变体（3段式→ASC、10点式→QSCA、32条→CSA、5商派→ASC）
3. 创建项目目录结构
4. 初始化进度文件

**输出**：
```
article-project/
├── .book/
│   ├── progress.json
│   ├── research/
│   ├── drafts/
│   └── reviews/
├── article.md
└── assets/
```

**交互**：向用户确认长文类型判断

---

### Phase 1: 选题与角度确认

**交互模式**：渐进式配置菜单

```
请选择长文配置：

A. 结构类型
- A1 3 段式（引言 + 3 主体 + 最后的话）
- A2 10 点式（开头 + 10 个环环相扣的点 + 收束）
- A3 32 条（32 句要点，每句 60-100 字）
- A4 5商派 SCA++（场景导入 + 打破认知 + 核心逻辑 + 举一反三 + 回顾）

B. 选题角度
- B1 商业评论（对热点事件、企业战略、行业现象的评论）
- B2 方法论（把经验/规律总结为可迁移的步骤）
- B3 案例拆解（拆解一家公司/一位企业家的成功路径）
- B4 企业家专访（与企业家对话后的整理稿）
- B5 参访游记（参访企业后的所见所思）

C. 目标读者
- C1 商业读者
- C2 创业者
- C3 企业管理者
- C4 投资人

D. 篇幅
- D1 短（1500 字以内）— 3 段式
- D2 中（1500-3000 字）— 3 段式/32 条
- D3 长（3000-5000 字）— 10 点式/5商派
```

**确认节点**：用户必须确认配置

**注意**：商业长文不存在"低密度"概念，已删除原"密度"配置项

---

### Phase 2: 大纲设计

**执行者**：主编 Agent

**任务**：
1. 根据结构类型选择对应蓝图
2. 生成段/点/条的大纲
3. 显式标注 SCQA 节点位置（S/C/Q/A 各自出现在哪一段）
4. 生成大纲预览

**输出**：
- `.book/outline.json`（使用 outline-schema.json 中的 article_type 字段）
- 大纲预览

**3 段式大纲示例**：
```
§01 引言：为什么写这篇文章（ASC 中的 A 或 S）
§02 第一个核心论点
§03 第二个核心论点
§04 第三个核心论点
§05 最后的话
```

**10 点式大纲示例**：
```
引子：你可能正在......
01 第一个点（开篇点睛）
02 第二个点（承接 01）
...
10 第十个点
收束：金句升华
```

**32 条大纲示例**：
```
第 01 句：[一句话]
第 02 句：[一句话]
...
第 32 句：[一句话]
```

**确认节点**：用户确认大纲与 SCQA 节点标注

---

### Phase 3-4: 素材搜集与事实核查（并行）

**调研 Agent #1** - 案例与故事搜集：
- 收集企业家故事、企业参访纪要、企业传记关键段落
- 整理 36 氪/虎嗅/钛媒体/晚点 LatePost 的深度报道
- 提取华为/阿里/腾讯等公司的公开演讲实录
- 输出到 `.book/research/cases.md`

**调研 Agent #2** - 数据与金句素材：
- 收集公司财报数据（巨潮资讯、SEC EDGAR、Wind）
- 整理行业研究（中信证券研报、艾瑞咨询、CB Insights）
- 提取刘润过往文章的金句库（用于参考而不直接照搬）
- 输出到 `.book/research/data.md` 和 `.book/research/jinju.md`

**事实核查要求**：
- 所有数据必须标注来源与时效（"截至2024年Q3"）
- 所有案例必须经过 2 个独立来源验证
- 商业黑话检测：避免"赋能""抓手""底层逻辑""打通"等刘润反感的词

**输出**：
- `.book/research/cases.md`（案例库）
- `.book/research/data.md`（数据汇总）
- `.book/research/jinju.md`（金句素材）
- `.book/research/facts-check.md`（事实核查报告）

---

### Phase 5: 长文撰写

**执行者**：写作 Agent（最多 2 个并行）

**每段/点/条流程**：
1. 根据结构类型选择对应模板（chapter-templates.md）
2. 撰写内容，遵循 style-dna.md 8 大心法
3. 显式标注 SCQA 节点（用 `**S 背景**` `**C 冲突**` `**Q 问题**` `**A 答案**` 标记）
4. 至少使用 1 个 callout（参考 callout-patterns.md 7 种格式）
5. 执行 QC 自检（12 项）
6. 保存草稿
7. 等待用户确认

**SCQA 标注示例**：
```markdown
**A 答案**：把提成制改为奖金制。
[正文展开]

> **金句**：用对人，比改制度更重要。
```

**确认节点**：每段/点/条完成需要用户确认

**输出**：
- `.book/drafts/article-v1.md`

---

### Phase 6: 编辑审校

**执行者**：编辑 Agent

**任务**：
1. 执行每段/点/条 12 项 QC（结构 4 + 风格 5 + 内容 3）
2. 执行全文 10 项 QC
3. 根据结构类型加载对应 profile（3 段式/10 点式/32 条/5商派）
4. SCQA 完整性检查：S/C/Q/A 节点是否齐全且顺序正确
5. 同理心开头检查：开头 3 段内是否出现同理心锚点
6. 禁用词零容忍检查：「大家」必须为 0
7. 生成审校报告

**确认节点**：用户确认是否执行修复

**输出**：
- `.book/reviews/edit-notes.md`
- `.book/reviews/quality-report.md`

---

### Phase 7: 排版整合

**执行者**：排版 Agent

**任务**：
1. 格式规范化（统一 H 层级、callout 格式、表格语法）
2. 整理长文结构（添加必要的目录索引、章节衔接）
3. 合并所有段落/点/条
4. 准备最终交付的 Markdown 文件

**输出**：
- `.book/final/article-final.md`

**确认节点**：用户验收长文 Markdown

---

### Phase 8: 精校定稿

**执行者**：主编 Agent

**任务**：
1. 最终质量检查
2. 打包交付物
3. 可选清理过程文件

**最终交付**：
```
article-project/
├── article-final.md
├── .book/
└── README.md
```

---

## 进度文件格式

### progress.json

```json
{
  "article_id": "32-tiao-hongmeng",
  "article_title": "关于鸿蒙我想说的 32 句话",
  "article_type": "32条",
  "scqa_pattern": "CSA",
  "target_reader": "C2",
  "length_estimate": "D2",
  "current_phase": 5,
  "phases": {
    "0": {"status": "completed", "timestamp": "..."},
    "1": {"status": "completed", "timestamp": "..."},
    "2": {"status": "completed", "timestamp": "..."},
    "3": {"status": "completed", "timestamp": "..."},
    "4": {"status": "completed", "timestamp": "..."},
    "5": {"status": "in_progress", "current_section": "第12句"}
  },
  "sections": [
    {
      "id": "第01句",
      "status": "completed",
      "qc_result": "passed",
      "user_confirmed": true
    },
    {
      "id": "第02句",
      "status": "completed",
      "qc_result": "passed",
      "user_confirmed": true
    },
    {
      "id": "第12句",
      "status": "in_progress"
    }
  ]
}
```

---

## Agent 通信机制

1. **状态共享**：通过 `.book/progress.json` 共享进度
2. **文件传递**：通过 `.book/research/` 和 `.book/drafts/` 传递中间产物
3. **用户确认**：关键节点（Phase 1 配置、Phase 2 大纲、Phase 5 每段/点/条、Phase 7 排版）必须等待用户确认

---

## 8 大心法在协作流中的体现

| 心法 | 体现位置 |
|------|----------|
| **同理心** | Phase 1 选题时确认目标读者；Phase 5 撰写时要求"开头 3 段内出现同理心锚点" |
| **对象感** | Phase 5 自检「大家」= 0；用「你」替代 |
| **君子自污** | Phase 1 选题鼓励"我"视角；Phase 5 至少 1 个自污框 |
| **逻辑势能 SCQA** | Phase 2 大纲必须显式标注 S/C/Q/A 节点位置 |
| **5商派 SCA++** | Phase 2 大纲可选 SCA++ 5 步结构 |
| **3 种结构** | Phase 0 判断；Phase 5 按结构选模板 |
| **单反聚焦** | Phase 5 每段/点/条至少 1 个故事框/举例框/比方框 |
| **用词推敲** | Phase 6 重点审查金句密度、推敲框 |

---

## 错误处理

| 错误场景 | 处理方式 |
|---------|----------|
| 案例素材无法核实 | 标注「待核实」，不直接使用 |
| 数据来源不可靠 | 标记 warning，不在金句中使用 |
| 用户拒绝确认 | 收集反馈后重新执行 |
| SCQA 节点缺失 | 编辑 Agent 必须要求回写到 Phase 2 重做 |
| 「大家」出现 ≥ 1 次 | 编辑 Agent 必须强制替换为「你」或具体人名 |
| 句长 > 45 字连续 5 句 | 触发推敲流程，要求拆句 |

---

## 与其他 Skills 的关系

```
liurun-research → 商业信息调研（可独立）
       ↓
liurun-bookwriter ← 本 skill（核心）
```
