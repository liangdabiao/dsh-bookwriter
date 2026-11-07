#!/usr/bin/env python3
"""
刘润风格商业长文 Agent 调度脚本
实现多Agent协作的商业长文创作流程（3段式 / 10点式 / 32条 / 5商派）
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime


class AgentRole(Enum):
    """Agent角色（刘润风格商业长文创作）"""
    MAIN = "main"           # 主编Agent
    RESEARCH = "research"   # 调研Agent（商业案例+数据+金句）
    WRITER = "writer"       # 写作Agent（3种结构+SCQA+7 callout）
    EDITOR = "editor"       # 编辑Agent（12项QC+3种结构 profile）
    LAYOUT = "layout"       # 排版Agent（长文格式规范化、目录索引、最终整合）


class Phase(Enum):
    """执行阶段（商业长文创作）"""
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
    status: str = "pending"  # pending, running, completed, failed
    result: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class AgentState:
    """Agent状态（商业长文项目）"""
    article_id: str
    article_type: str = ""  # 3段式 / 10点式 / 32条 / 5商派
    scqa_pattern: str = ""  # ASC / CSA / QSCA / 无
    current_phase: Phase = Phase.PHASE_0
    tasks: List[AgentTask] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "article_id": self.article_id,
            "article_type": self.article_type,
            "scqa_pattern": self.scqa_pattern,
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
    """Agent调度器"""

    # 每个阶段对应的Agent角色
    PHASE_AGENTS: Dict[Phase, List[AgentRole]] = {
        Phase.PHASE_0: [AgentRole.MAIN],
        Phase.PHASE_1: [AgentRole.MAIN],  # 用户交互
        Phase.PHASE_2: [AgentRole.MAIN],
        Phase.PHASE_3: [AgentRole.RESEARCH],
        Phase.PHASE_4: [AgentRole.RESEARCH],
        Phase.PHASE_5: [AgentRole.WRITER],
        Phase.PHASE_6: [AgentRole.EDITOR],
        Phase.PHASE_7: [AgentRole.LAYOUT],
        Phase.PHASE_8: [AgentRole.MAIN],
    }

    # 并行限制
    MAX_PARALLEL: Dict[AgentRole, int] = {
        AgentRole.MAIN: 1,
        AgentRole.RESEARCH: 2,
        AgentRole.WRITER: 2,
        AgentRole.EDITOR: 1,
        AgentRole.LAYOUT: 1,
    }

    def __init__(self, article_id: str, work_dir: Path, article_type: str = "", scqa_pattern: str = ""):
        """
        初始化调度器

        Args:
            article_id: 长文ID
            work_dir: 工作目录
            article_type: 长文类型（3段式 / 10点式 / 32条 / 5商派）
            scqa_pattern: SCQA 变体（ASC / CSA / QSCA / 无）
        """
        self.article_id = article_id
        self.work_dir = work_dir
        self.state = AgentState(
            article_id=article_id,
            article_type=article_type,
            scqa_pattern=scqa_pattern,
            current_phase=Phase.PHASE_0
        )
        self._running_agents: Dict[AgentRole, int] = {role: 0 for role in AgentRole}

        # 确保工作目录存在
        self.work_dir.mkdir(parents=True, exist_ok=True)
        (self.work_dir / ".book").mkdir(exist_ok=True)

    def can_spawn(self, role: AgentRole) -> bool:
        """检查是否可以启动该角色的Agent"""
        return self._running_agents[role] < self.MAX_PARALLEL[role]

    def spawn_agent(self, role: AgentRole, task: AgentTask) -> Dict:
        """
        启动Agent执行任务

        Args:
            role: Agent角色
            task: 任务描述

        Returns:
            执行结果
        """
        if not self.can_spawn(role):
            return {
                "status": "rejected",
                "message": f"已达到{role.value} Agent的最大并行数"
            }

        self._running_agents[role] += 1
        task.status = "running"

        # 生成执行提示（供Claude Code执行）
        prompt = self._generate_prompt(role, task)

        result = {
            "status": "spawned",
            "task_id": task.task_id,
            "role": role.value,
            "prompt": prompt
        }

        # 保存状态
        self._save_state()

        return result

    def complete_task(self, task_id: str, result: str) -> None:
        """标记任务完成"""
        for task in self.state.tasks:
            if task.task_id == task_id:
                task.status = "completed"
                task.result = result
                self._running_agents[task.role] -= 1
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
        """生成Agent执行提示"""
        prompts = {
            AgentRole.MAIN: f"""
你是主编Agent，负责{task.phase.value}。

任务：{task.description}

工作目录：{self.work_dir}

请按照SKILL.md中的规范执行任务。
执行完成后，报告结果并等待用户确认。
""",
            AgentRole.RESEARCH: f"""
你是调研Agent，负责{task.phase.value}。

任务：{task.description}

工作目录：{self.work_dir}

请执行以下操作：
1. 搜集官方文档、GitHub仓库、技术博客等信息
2. 验证技术版本准确性
3. 生成调研报告保存到 .book/research/ 目录

参考：references/research-sources.md
""",
            AgentRole.WRITER: f"""
你是写作Agent，负责{task.phase.value}。

任务：{task.description}

工作目录：{self.work_dir}

请执行以下操作：
1. 根据大纲选择章节模板
2. 遵循style-dna.md写作风格
3. 每章完成后执行QC检查
4. 保存到 .book/drafts/ 目录

参考：
- references/chapter-templates.md
- references/style-dna.md
- references/quality-checkpoints.md
""",
            AgentRole.EDITOR: f"""
你是编辑Agent，负责{task.phase.value}。

任务：{task.description}

工作目录：{self.work_dir}

请执行以下操作：
1. 执行每章12项QC检查
2. 执行全书10项QC检查
3. 跨章节一致性检查
4. 生成审校报告

参考：references/quality-checkpoints.md
""",
            AgentRole.LAYOUT: f"""
你是排版Agent，负责{task.phase.value}。

任务：{task.description}

工作目录：{self.work_dir}

请执行以下操作：
1. 格式规范化（统一 H 层级、callout 格式、表格语法）
2. 整理长文结构（添加必要的章节衔接与目录索引）
3. 合并所有段落/点/条
4. 准备最终交付的 Markdown 文件
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
        description="刘润风格商业长文多Agent协作调度器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --init "32-tiao-hongmeng" --type "32条" --scqa "CSA"
                                                # 初始化一篇32条商业长文
  %(prog)s --init "hua-wei-10" --type "10点式" --scqa "QSCA"
                                                # 初始化一篇华为10点式长文
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
        choices=["3段式", "10点式", "32条", "5商派"],
        default="",
        help="长文类型（3段式/10点式/32条/5商派）"
    )
    parser.add_argument(
        "--scqa",
        type=str,
        choices=["ASC", "CSA", "QSCA", "无"],
        default="",
        help="SCQA 变体（ASC/CSA/QSCA/无）"
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
        scheduler = AgentScheduler(
            args.init, args.work_dir,
            article_type=args.type, scqa_pattern=args.scqa
        )
        scheduler._save_state()
        print(f"✅ 初始化完成: {args.init}")
        print(f"长文类型: {args.type or '未指定（待Phase 1确认）'}")
        print(f"SCQA 变体: {args.scqa or '未指定（待Phase 1确认）'}")
        print(f"工作目录: {args.work_dir}")
        return

    # 加载现有状态
    state_file = args.work_dir / ".book" / "agent_state.json"
    if not state_file.exists():
        print("❌ 未找到项目状态，请先使用 --init 初始化")
        sys.exit(1)

    # 从状态文件获取article_id
    with open(state_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        article_id = data["article_id"]
        article_type = data.get("article_type", "")
        scqa_pattern = data.get("scqa_pattern", "")

    scheduler = AgentScheduler(
        article_id, args.work_dir,
        article_type=article_type, scqa_pattern=scqa_pattern
    )
    scheduler.load_state()

    # 查看状态
    if args.status:
        print(f"\n长文ID: {scheduler.state.article_id}")
        print(f"长文类型: {scheduler.state.article_type or '未指定'}")
        print(f"SCQA 变体: {scheduler.state.scqa_pattern or '未指定'}")
        print(f"当前阶段: {scheduler.state.current_phase.value}")
        print(f"\n任务列表:")
        for task in scheduler.state.tasks:
            status_icon = "✅" if task.status == "completed" else "🔄" if task.status == "running" else "⏳"
            print(f"  {status_icon} [{task.role.value}] {task.description}")
        return

    # 获取下一批任务
    if args.next:
        tasks = scheduler.get_next_tasks()
        print(f"\n下一批任务 (阶段: {scheduler.state.current_phase.value}):")
        for task in tasks:
            print(f"\n任务ID: {task.task_id}")
            print(f"角色: {task.role.value}")
            print(f"描述: {task.description}")
        return

    # 启动任务
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

    # 完成任务
    if args.complete:
        task_id, result = args.complete
        scheduler.complete_task(task_id, result)
        print(f"✅ 任务完成: {task_id}")
        return

    # 推进阶段
    if args.advance:
        next_phase = scheduler.advance_phase()
        if next_phase:
            print(f"✅ 推进到: {next_phase.value}")
        else:
            print("✅ 已完成所有阶段")
        return

    # 无参数时显示帮助
    parser.print_help()


if __name__ == "__main__":
    main()