#!/usr/bin/env python3
"""
罗振宇风格认知/启发/商业长文 Agent 调度脚本
实现多Agent协作的罗振宇风格长文创作流程
支持 3 种结构：罗胖60秒 / 罗辑思维长文 / 跨年演讲稿
支持 3 种 SCQA 变体：TQA / CAA / PEI
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime


class AgentRole(Enum):
    """Agent角色（罗振宇风格长文创作）"""
    MAIN = "main"           # 主编Agent
    RESEARCH = "research"   # 调研Agent（罗振宇素材/故事细节/数字金句）
    WRITER = "writer"       # 写作Agent（3种结构+SCQA+7 callout+10心法）
    EDITOR = "editor"       # 编辑Agent（12项QC+3种结构 profile+禁用词零容忍）
    LAYOUT = "layout"       # 排版Agent（长文格式规范化、目录索引、最终整合）


class Phase(Enum):
    """执行阶段（罗振宇长文创作）"""
    PHASE_0 = "启动与长文类型判断"
    PHASE_1 = "选题与角度确认"
    PHASE_2 = "大纲设计"
    PHASE_3 = "素材搜集"
    PHASE_4 = "事实核查"
    PHASE_5 = "长文撰写"
    PHASE_6 = "编辑审校"
    PHASE_7 = "排版整合"
    PHASE_8 = "精校定稿"


@dataclass
class AgentTask:
    """Agent任务"""
    task_id: str
    role: AgentRole
    phase: Phase
    description: str
    status: str = "pending"
    result: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class AgentState:
    """Agent状态（罗振宇长文项目）"""
    article_id: str
    article_type: str = ""  # 罗胖60秒 / 罗辑思维长文 / 跨年演讲稿
    scqa_pattern: str = ""  # TQA / CAA / PEI / 无
    core_xinfa: List[str] = field(default_factory=list)  # 必含心法
    current_phase: Phase = Phase.PHASE_0
    tasks: List[AgentTask] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "article_id": self.article_id,
            "article_type": self.article_type,
            "scqa_pattern": self.scqa_pattern,
            "core_xinfa": self.core_xinfa,
            "current_phase": self.current_phase.value,
            "tasks": [
                {
                    "task_id": t.task_id,
                    "role": t.role.value,
                    "phase": t.phase.value,
                    "description": t.description,
                    "status": t.status,
                    "result": t.result,
                    "created_at": t.created_at
                }
                for t in self.tasks
            ],
            "context": self.context
        }


class AgentScheduler:
    """Agent调度器（罗振宇风格）"""

    PHASE_AGENTS: Dict[Phase, List[AgentRole]] = {
        Phase.PHASE_0: [AgentRole.MAIN],
        Phase.PHASE_1: [AgentRole.MAIN],
        Phase.PHASE_2: [AgentRole.MAIN],
        Phase.PHASE_3: [AgentRole.RESEARCH],
        Phase.PHASE_4: [AgentRole.RESEARCH],
        Phase.PHASE_5: [AgentRole.WRITER],
        Phase.PHASE_6: [AgentRole.EDITOR],
        Phase.PHASE_7: [AgentRole.LAYOUT],
        Phase.PHASE_8: [AgentRole.MAIN],
    }

    MAX_PARALLEL: Dict[AgentRole, int] = {
        AgentRole.MAIN: 1,
        AgentRole.RESEARCH: 2,
        AgentRole.WRITER: 2,
        AgentRole.EDITOR: 1,
        AgentRole.LAYOUT: 1,
    }

    def __init__(
        self,
        article_id: str,
        work_dir: Path,
        article_type: str = "",
        scqa_pattern: str = "",
        core_xinfa: Optional[List[str]] = None
    ):
        """
        初始化调度器

        Args:
            article_id: 长文ID
            work_dir: 工作目录
            article_type: 长文类型（罗胖60秒 / 罗辑思维长文 / 跨年演讲稿）
            scqa_pattern: SCQA 变体（TQA / CAA / PEI / 无）
            core_xinfa: 必含心法清单
        """
        self.article_id = article_id
        self.work_dir = work_dir
        self.state = AgentState(
            article_id=article_id,
            article_type=article_type,
            scqa_pattern=scqa_pattern,
            core_xinfa=core_xinfa or [],
            current_phase=Phase.PHASE_0
        )
        self._running_agents: Dict[AgentRole, int] = {role: 0 for role in AgentRole}

        self.work_dir.mkdir(parents=True, exist_ok=True)
        (self.work_dir / ".book").mkdir(exist_ok=True)

    def can_spawn(self, role: AgentRole) -> bool:
        """检查是否可以启动该角色的Agent"""
        return self._running_agents[role] < self.MAX_PARALLEL[role]

    def spawn_agent(self, role: AgentRole, task: AgentTask) -> Dict:
        """
        启动Agent执行任务
        """
        if not self.can_spawn(role):
            return {
                "status": "rejected",
                "message": f"已达到{role.value} Agent的最大并行数"
            }

        self._running_agents[role] += 1
        task.status = "running"

        prompt = self._generate_prompt(role, task)

        result = {
            "status": "spawned",
            "task_id": task.task_id,
            "role": role.value,
            "prompt": prompt
        }

        self._save_state()
        return result

    def complete_task(self, task_id: str, result: str) -> None:
        """标记任务完成"""
        for task in self.state.tasks:
            if task.task_id == task_id:
                # 幂等保护：已完成的任务不重复处理，避免计数器出现负数
                if task.status == "completed":
                    return
                task.status = "completed"
                task.result = result
                # 计数器下限保护，防止负数导致 can_spawn 失常
                self._running_agents[task.role] = max(0, self._running_agents[task.role] - 1)
                break
        self._save_state()

    def advance_phase(self) -> Optional[Phase]:
        """推进到下一阶段"""
        phases = list(Phase)
        current_idx = phases.index(self.state.current_phase)

        if current_idx < len(phases) - 1:
            self.state.current_phase = phases[current_idx + 1]
            self._save_state()
            return self.state.current_phase
        return None

    def get_next_tasks(self) -> List[AgentTask]:
        """获取下一批任务"""
        current_phase = self.state.current_phase
        roles = self.PHASE_AGENTS[current_phase]

        tasks = []
        for i, role in enumerate(roles):
            task = AgentTask(
                task_id=f"{self.article_id}-{current_phase.name}-{i}",
                role=role,
                phase=current_phase,
                description=f"执行{current_phase.value}阶段任务"
            )
            tasks.append(task)
            self.state.tasks.append(task)

        return tasks

    def _generate_prompt(self, role: AgentRole, task: AgentTask) -> str:
        """生成Agent执行提示（罗振宇风格）"""
        xinfa_hint = ""
        if self.state.core_xinfa:
            xinfa_hint = f"\n必含心法：{', '.join(self.state.core_xinfa)}"

        prompts = {
            AgentRole.MAIN: f"""
你是主编 Agent，负责{task.phase.value}。

任务：{task.description}

长文类型：{self.state.article_type}
SCQA 变体：{self.state.scqa_pattern}{xinfa_hint}

工作目录：{self.work_dir}

请按以下步骤执行：
1. 确认长文类型（罗胖60秒 / 罗辑思维长文 / 跨年演讲稿）
2. 选定 SCQA 变体（TQA / CAA / PEI）
3. 确认必含心法（10 大心法：躬身入局、长期主义、启发式输出、一具体就深刻、一行动就创新、一困惑就出门、故事细节、金句主义、动词驱动、谦卑自嘲）
4. 创建设计大纲（含 SCQA 节点 + 心法命中点 + 故事细节占位）

参考 SKILL.md / references/agent-protocol.md
执行完成后报告结果并等待用户确认。
""",
            AgentRole.RESEARCH: f"""
你是调研 Agent，负责{task.phase.value}。

任务：{task.description}

长文类型：{self.state.article_type}{xinfa_hint}

工作目录：{self.work_dir}

请执行以下操作：
1. 调研罗振宇相关素材（《罗辑思维》/ 罗胖 60 秒 /《启发》/ 跨年演讲）
2. 搜集历史故事细节（仅限素材源可查的人物：曾国藩、张廷玉、拿破仑、卢梭、嘉庆、李鸿章、胡适）
3. 提取数字金句（仅限素材源可查：3652 条、11 场、523 个词条、24 条、1000 天、18 字心法）
4. 整理对仗式金句库（放弃A转而B / 一X就Y / X不是A是B 等）
5. 调研报告保存到 .book/research/ 目录

**关键要求**：
- 所有故事必须含具体时间/地点/人物/数字
- 所有数字金句必须有可验证来源（素材源 `罗振宇的内容.md`）
- 历史人物语录必须标注出处
- **严禁使用**素材源无据的内容：80 斤减肥、1.08 个赵露思、张之臻巴黎奥运、凡墙皆是门、王阳明/左宗棠/加缪/史铁生等

参考 references/research-sources.md
""",
            AgentRole.WRITER: f"""
你是写作 Agent，负责{task.phase.value}。

任务：{task.description}

长文类型：{self.state.article_type}
SCQA 变体：{self.state.scqa_pattern}{xinfa_hint}

工作目录：{self.work_dir}

请执行以下操作：
1. 根据长文类型选择对应模板（references/chapter-templates.md）
2. 遵循 10 大心法写作（references/style-dna.md）
3. 显式标注 SCQA 节点（用 **T 触发** / **Q 问题** / **A 答案** 或 **C 具体** / **A 抽象** / **A 行动** 或 **P 现象** / **E 解释** / **I 启发**）
4. **必含 1 个躬身入局框**（"做事的人"/"躬身入局"）
5. **必含 1 个故事细节框**（含具体时间/地点/数字）
6. **必含 1 个启发框**（"我有一个启发……"）
7. **必含 1 个金句框**（对仗式 / 数字式 / 动词式 / 递进式）
8. 每段完成后执行 QC 自检（12 项，references/quality-checkpoints.md）
9. 保存到 .book/drafts/ 目录

**禁用词零容忍**：大家、我们（>5次/千字）、赋能/抓手/底层逻辑/打通/闭环

参考：
- references/chapter-templates.md
- references/style-dna.md
- references/callout-patterns.md
- references/quality-checkpoints.md
""",
            AgentRole.EDITOR: f"""
你是编辑 Agent，负责{task.phase.value}。

任务：{task.description}

长文类型：{self.state.article_type}
SCQA 变体：{self.state.scqa_pattern}{xinfa_hint}

工作目录：{self.work_dir}

请执行以下操作：
1. 执行每段 12 项 QC（结构 4 + 风格 5 + 内容 3）
2. 执行全文 10 项 QC
3. 根据长文类型加载对应 profile（罗胖60秒 / 罗辑思维长文 / 跨年演讲稿）
4. SCQA 完整性检查（TQA 的 T/Q/A 或 CAA 的 C/A/A 或 PEI 的 P/E/I 节点齐全且顺序正确）
5. **躬身入局检查**：每篇 ≥ 1 个躬身入局框
6. **启发框检查**：每篇 ≥ 1 个"我有一个启发……"或"启示"
7. **故事细节检查**：每篇 ≥ 1 个含具体时间/地点/数字的故事
8. **数字金句检查**（跨年演讲稿）：≥ 2 个数字金句（如 3652 条 / 11 场 / 523 个词条 / 1000 天 / 18 字心法级别，须素材源可查）
9. **18 字心法检查**（跨年演讲稿）：必含 "一具体，就深刻" / "一行动，就创新" / "一困惑，就出门" 之一
10. **禁用词零容忍检查**：
    - 「大家」= 0
    - 「我们」频次 < 每千字 5 次
    - 「赋能」「抓手」「底层逻辑」「打通」「闭环」= 0
11. 生成审校报告

参考 references/quality-checkpoints.md
""",
            AgentRole.LAYOUT: f"""
你是排版 Agent，负责{task.phase.value}。

任务：{task.description}

长文类型：{self.state.article_type}

工作目录：{self.work_dir}

请执行以下操作：
1. 格式规范化（统一 H 层级、callout 格式、表格语法）
2. 整理长文结构（添加必要的目录索引、章节衔接）
3. 合并所有段落
4. **添加罗振宇风格标识**：
   - 罗胖 60 秒：无特殊版块
   - 罗辑思维长文：开头"我是罗胖" / 收束"我有一个启发"
   - 跨年演讲稿："我是罗胖" 自嘲开篇（不编减肥数字）+ 18 字心法版块 + 数字金句角标
5. 准备最终交付的 Markdown 文件

输出：.book/final/article-final.md
"""
        }
        return prompts.get(role, "")

    def _save_state(self) -> None:
        """保存状态到文件"""
        state_file = self.work_dir / ".book" / "agent_state.json"
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(self.state.to_dict(), f, ensure_ascii=False, indent=2)

    def load_state(self) -> None:
        """从文件加载状态"""
        state_file = self.work_dir / ".book" / "agent_state.json"
        if state_file.exists():
            with open(state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.article_id = data["article_id"]
                self.state.article_id = data["article_id"]
                self.state.article_type = data.get("article_type", "")
                self.state.scqa_pattern = data.get("scqa_pattern", "")
                self.state.core_xinfa = data.get("core_xinfa", [])
                self.state.current_phase = Phase(data["current_phase"])
                self.state.tasks = [
                    AgentTask(
                        task_id=t["task_id"],
                        role=AgentRole(t["role"]),
                        phase=Phase(t["phase"]),
                        description=t["description"],
                        status=t["status"],
                        result=t.get("result"),
                        created_at=t["created_at"]
                    )
                    for t in data.get("tasks", [])
                ]
                self.state.context = data.get("context", {})


def main() -> None:
    parser = argparse.ArgumentParser(
        description="罗振宇风格认知/启发/商业长文多Agent协作调度器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --init "60miao-qidong" --type "罗胖60秒" --scqa "PEI"
                                                # 初始化一篇罗胖60秒
  %(prog)s --init "luoji-zhangqi" --type "罗辑思维长文" --scqa "TQA" --xinfa "躬身入局,启发式输出,金句主义"
                                                # 初始化一篇罗辑思维长文
  %(prog)s --init "kuanyue-2026" --type "跨年演讲稿" --scqa "TQA" --xinfa "躬身入局,长期主义,一具体就深刻,一行动就创新,一困惑就出门"
                                                # 初始化一篇跨年演讲稿
  %(prog)s --status                            # 查看当前状态
  %(prog)s --next                              # 获取下一批任务
  %(prog)s --complete "task-id" "result"       # 完成任务
  %(prog)s --advance                           # 推进到下一阶段
        """
    )
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=Path("."),
        help="工作目录"
    )
    parser.add_argument(
        "--init",
        type=str,
        metavar="ARTICLE_ID",
        help="初始化新长文项目"
    )
    parser.add_argument(
        "--type",
        type=str,
        choices=["罗胖60秒", "罗辑思维长文", "跨年演讲稿"],
        default="",
        help="长文类型（罗胖60秒/罗辑思维长文/跨年演讲稿）"
    )
    parser.add_argument(
        "--scqa",
        type=str,
        choices=["TQA", "CAA", "PEI", "无"],
        default="",
        help="SCQA 变体（TQA/CAA/PEI/无）"
    )
    parser.add_argument(
        "--xinfa",
        type=str,
        default="",
        help="必含心法（逗号分隔，如'躬身入局,启发式输出,金句主义'）"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="查看当前状态"
    )
    parser.add_argument(
        "--next",
        action="store_true",
        help="获取下一批任务"
    )
    parser.add_argument(
        "--spawn",
        type=str,
        metavar="TASK_ID",
        help="启动指定任务"
    )
    parser.add_argument(
        "--complete",
        nargs=2,
        metavar=("TASK_ID", "RESULT"),
        help="完成任务"
    )
    parser.add_argument(
        "--advance",
        action="store_true",
        help="推进到下一阶段"
    )

    args = parser.parse_args()

    # 初始化
    if args.init:
        core_xinfa = [x.strip() for x in args.xinfa.split(",") if x.strip()]
        scheduler = AgentScheduler(
            args.init, args.work_dir,
            article_type=args.type,
            scqa_pattern=args.scqa,
            core_xinfa=core_xinfa
        )
        scheduler._save_state()
        print(f"✅ 初始化完成: {args.init}")
        print(f"长文类型: {args.type or '未指定（待 Phase 1 确认）'}")
        print(f"SCQA 变体: {args.scqa or '未指定（待 Phase 1 确认）'}")
        if core_xinfa:
            print(f"必含心法: {', '.join(core_xinfa)}")
        print(f"工作目录: {args.work_dir}")
        return

    # 加载现有状态
    state_file = args.work_dir / ".book" / "agent_state.json"
    if not state_file.exists():
        print("❌ 未找到项目状态，请先使用 --init 初始化")
        sys.exit(1)

    with open(state_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        article_id = data["article_id"]
        article_type = data.get("article_type", "")
        scqa_pattern = data.get("scqa_pattern", "")
        core_xinfa = data.get("core_xinfa", [])

    scheduler = AgentScheduler(
        article_id, args.work_dir,
        article_type=article_type,
        scqa_pattern=scqa_pattern,
        core_xinfa=core_xinfa
    )
    scheduler.load_state()

    if args.status:
        print(f"\n长文ID: {scheduler.state.article_id}")
        print(f"长文类型: {scheduler.state.article_type or '未指定'}")
        print(f"SCQA 变体: {scheduler.state.scqa_pattern or '未指定'}")
        if scheduler.state.core_xinfa:
            print(f"必含心法: {', '.join(scheduler.state.core_xinfa)}")
        print(f"当前阶段: {scheduler.state.current_phase.value}")
        print(f"\n任务列表:")
        for task in scheduler.state.tasks:
            status_icon = "✅" if task.status == "completed" else "🔄" if task.status == "running" else "⏳"
            print(f"  {status_icon} [{task.role.value}] {task.description}")
        return

    if args.next:
        tasks = scheduler.get_next_tasks()
        print(f"\n下一批任务 (阶段: {scheduler.state.current_phase.value}):")
        for task in tasks:
            print(f"\n任务ID: {task.task_id}")
            print(f"角色: {task.role.value}")
            print(f"描述: {task.description}")
        return

    if args.spawn:
        for task in scheduler.state.tasks:
            if task.task_id == args.spawn:
                result = scheduler.spawn_agent(task.role, task)
                print(f"\n启动任务: {task.task_id}")
                print(f"角色: {task.role.value}")
                print(f"\n执行提示:\n{result.get('prompt', '')}")
                return
        print(f"❌ 未找到任务: {args.spawn}")
        sys.exit(1)

    if args.complete:
        task_id, result = args.complete
        scheduler.complete_task(task_id, result)
        print(f"✅ 任务完成: {task_id}")
        return

    if args.advance:
        next_phase = scheduler.advance_phase()
        if next_phase:
            print(f"✅ 推进到: {next_phase.value}")
        else:
            print("✅ 已完成所有阶段")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
