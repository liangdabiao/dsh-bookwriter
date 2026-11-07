#!/usr/bin/env python3
"""
结构验证脚本
验证刘润风格商业长文的结构是否符合规范
支持 3 种结构类型：3段式、10点式、32条
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Pattern


@dataclass
class ValidationError:
    """验证错误"""
    line: int
    message: str
    severity: str  # error, warning


@dataclass
class Section:
    """段落信息（刘润风格的通用段落）"""
    id: str
    title: str
    line: int
    word_count: int = 0


@dataclass
class Article:
    """长文信息"""
    article_type: str = ""  # 3段式 / 10点式 / 32条 / 5商派
    scqa_pattern: str = ""  # ASC / CSA / QSCA / 无
    title: str = ""
    sections: List[Section] = field(default_factory=list)


@dataclass
class ValidationResult:
    """验证结果"""
    errors: List[ValidationError] = field(default_factory=list)
    article: Article = field(default_factory=Article)

    def add_error(self, line: int, message: str, severity: str = "error") -> None:
        """添加验证错误"""
        self.errors.append(ValidationError(line=line, message=message, severity=severity))

    @property
    def error_count(self) -> int:
        """错误数量"""
        return len([e for e in self.errors if e.severity == "error"])

    @property
    def warning_count(self) -> int:
        """警告数量"""
        return len([e for e in self.errors if e.severity == "warning"])


class LiurunValidator:
    """刘润风格长文结构验证器"""

    # 禁用词列表（刘润风格）
    FORBIDDEN_WORDS: List[str] = [
        # 严谨文体禁用
        "综上所述",
        "值得注意的是",
        "接下来我们将",
        "进行操作",
        "强大的",
        "革命性的",
        # 刘润特定禁用（最重要）
        "大家",  # 零容忍
        "众所周知",
        "不言而喻",
        "显而易见",
        "我们一起来看看",
        "让我们一起",
        "在当今这个时代",
        "某种程度上",
        "一定程度上",
        "可以说是",
        # 商业黑话（刘润反而避免）
        "赋能",
        "抓手",
        "底层逻辑",
        "打通",
        "闭环",
    ]

    # 模糊词（连续出现 3 次以上警告）
    HEDGING_WORDS: List[str] = ["或许", "可能", "也许"]

    # 同理心锚点模式
    EMPATHY_PATTERNS: List[Pattern] = [
        re.compile(r"你可能正在"),
        re.compile(r"你也许正在"),
        re.compile(r"你不妨"),
        re.compile(r"你有没有遇到"),
        re.compile(r"你猜猜"),
        re.compile(r"你正在看"),
    ]

    # SCQA 节点模式
    SCQA_NODE_PATTERNS = {
        "S": re.compile(r"\*\*S 背景\*\*|## 背景"),
        "C": re.compile(r"\*\*C 冲突\*\*|## 冲突"),
        "Q": re.compile(r"\*\*Q 问题\*\*|## 问题"),
        "A": re.compile(r"\*\*A 答案\*\*|## 答案"),
    }

    # 段落标题模式
    # 3 段式: ## §01 / §02 ...
    SECTION_3_PATTERN: Pattern = re.compile(r"^##\s+§(\d+)\s+(.+)$")
    # 10 点式: ## 01 / 02 ... 或 ## 01 ...
    SECTION_10_PATTERN: Pattern = re.compile(r"^##\s+(\d{2})\s+(.+)$")
    # 32 条: ## 第01句 / 第02句 ...
    SECTION_32_PATTERN: Pattern = re.compile(r"^##\s+第(\d+)句[：:]\s*(.+)$")
    # 5商派: ## 第一步 / 第二步 ...
    SECTION_5SHANG_PATTERN: Pattern = re.compile(r"^##\s+第[一二三四五一二三四五]步[：:]?\s*(.+)$")

    # callout 类型识别
    CALLOUT_PATTERNS: Dict[str, Pattern] = {
        "同理心": re.compile(r"^>\s*\*\*你在想什么\*\*"),
        "自污": re.compile(r"^>\s*\*\*先认个错\*\*"),
        "金句": re.compile(r"^>\s*\*\*金句\*\*"),
        "故事": re.compile(r"^>\s*\*\*故事\*\*"),
        "举例": re.compile(r"^>\s*\*\*举例\*\*"),
        "比方": re.compile(r"^>\s*\*\*比方\*\*"),
        "推敲": re.compile(r"^>\s*\*\*推敲\*\*"),
    }

    def __init__(self, content: str):
        self.content = content
        self.lines = content.split("\n")
        self.result = ValidationResult()
        self.total_words = 0
        self.you_count = 0
        self.wo_count = 0
        self.dajia_count = 0
        self.jinju_count = 0
        self.callout_counts: Dict[str, int] = {
            "同理心": 0, "自污": 0, "金句": 0,
            "故事": 0, "举例": 0, "比方": 0, "推敲": 0
        }
        self.scqa_nodes_found: Set[str] = set()
        self.hedging_counts: Dict[str, int] = {w: 0 for w in self.HEDGING_WORDS}

        # 预编译禁用词正则
        self._forbidden_word_pattern = re.compile(
            "|".join(re.escape(word) for word in self.FORBIDDEN_WORDS)
        )

    def validate(self) -> bool:
        """执行完整验证"""
        self.detect_article_type()
        self.check_metadata()
        self.check_sections()
        self.check_forbidden_words()
        self.check_hedging_words()
        self.check_emperor_anchor()
        self.check_pronoun_frequencies()
        self.check_callouts()
        self.check_scqa_nodes()
        self.check_structure_specific()
        self.print_results()

        return self.result.error_count == 0

    def detect_article_type(self) -> None:
        """检测文章类型（从元数据或段落模式推断）"""
        header = "\n".join(self.lines[:50])

        # 兼容 `**结构类型**: 3段式`（加粗+冒号）和 `结构类型: 3段式`（无加粗）
        type_match = re.search(
            r"(?:\*\*)?结构类型(?:\*\*)?[：:]\s*(3段式|10点式|32条|5商派)",
            header
        )
        if type_match:
            self.result.article.article_type = type_match.group(1)

        scqa_match = re.search(
            r"(?:\*\*)?SCQA 变体(?:\*\*)?[：:]\s*(ASC|CSA|QSCA|无)",
            header
        )
        if scqa_match:
            self.result.article.scqa_pattern = scqa_match.group(1)

        title_match = re.search(r"^#\s+(.+)$", self.content, re.MULTILINE)
        if title_match:
            self.result.article.title = title_match.group(1)

    def check_metadata(self) -> None:
        """检查元数据块"""
        if not self.result.article.article_type:
            self.result.add_error(
                line=1,
                message="缺少元数据字段: 结构类型（应为 3段式/10点式/32条/5商派）",
                severity="error"
            )
        if not self.result.article.scqa_pattern:
            self.result.add_error(
                line=1,
                message="缺少元数据字段: SCQA 变体（应为 ASC/CSA/QSCA/无）",
                severity="warning"
            )

        # 检查元数据完整性
        required_fields = [
            ("**创作者**", "创作者"),
            ("**出处栏目**", "出处栏目"),
            ("**发布日期**", "发布日期"),
            ("**结构类型**", "结构类型"),
            ("**SCQA 变体**", "SCQA 变体"),
        ]

        header_content = "\n".join(self.lines[:50])
        for marker, name in required_fields:
            if marker not in header_content:
                self.result.add_error(
                    line=1,
                    message=f"缺少元数据字段: {name}",
                    severity="warning"
                )

    def check_sections(self) -> None:
        """检查段落结构（根据文章类型）"""
        article_type = self.result.article.article_type

        if article_type == "3段式":
            self._check_sections_3()
        elif article_type == "10点式":
            self._check_sections_10()
        elif article_type == "32条":
            self._check_sections_32()
        elif article_type == "5商派":
            self._check_sections_5shang()
        else:
            self.result.add_error(
                line=1,
                message="无法确定文章结构类型（元数据缺失或不支持）",
                severity="warning"
            )

        # 统计字数
        for i, line in enumerate(self.lines):
            # 统计中文字数（仅正文，排除代码块和引用）
            if not line.startswith("```") and not line.startswith(">"):
                self.total_words += len([c for c in line if '\u4e00' <= c <= '\u9fff'])

    def _check_sections_3(self) -> None:
        """检查 3 段式结构（§01-§05）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_3_PATTERN.match(line)
            if match:
                section_id = f"§{match.group(1)}"
                section_title = match.group(2)
                self.result.article.sections.append(Section(
                    id=section_id, title=section_title, line=i + 1
                ))

        # 检查段落编号连续性
        section_nums = [int(s.id[1:]) for s in self.result.article.sections]
        if section_nums and section_nums != list(range(1, len(section_nums) + 1)):
            self.result.add_error(
                line=1,
                message=f"3段式段落编号不连续: {section_nums}",
                severity="error"
            )

        if len(self.result.article.sections) != 5:
            self.result.add_error(
                line=1,
                message=f"3段式应有 5 段（§01-§05），实际 {len(self.result.article.sections)} 段",
                severity="error"
            )

        # 检查是否有"最后的话"段
        has_ending = any("最后的话" in s.title for s in self.result.article.sections)
        if self.result.article.sections and not has_ending:
            self.result.add_error(
                line=1,
                message="3段式缺少'最后的话'段（§05）",
                severity="error"
            )

    def _check_sections_10(self) -> None:
        """检查 10 点式结构（1 开头 + 10 点 + 1 收束）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_10_PATTERN.match(line)
            if match:
                section_id = match.group(1)
                section_title = match.group(2)
                # 排除不是 10 点式的（比如 §01）
                if section_id.isdigit() and 1 <= int(section_id) <= 10:
                    self.result.article.sections.append(Section(
                        id=section_id, title=section_title, line=i + 1
                    ))

        # 10 点式应该有 1 开头 + 10 点 + 1 收束 = 12 段
        # 但开头和收束的格式可能不同（如"引子"、"收束"等）
        section_nums = sorted(set(int(s.id) for s in self.result.article.sections))
        expected = list(range(1, 11))
        if section_nums != expected:
            self.result.add_error(
                line=1,
                message=f"10点式核心编号不完整: 应有 01-10，实际 {section_nums}",
                severity="error"
            )

        # 检查是否有"收束"段
        has_ending = any("收束" in s.title for s in self.result.article.sections)
        if self.result.article.sections and not has_ending:
            self.result.add_error(
                line=1,
                message="10点式缺少'收束'段",
                severity="error"
            )

    def _check_sections_32(self) -> None:
        """检查 32 条结构（恰好 32 条）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_32_PATTERN.match(line)
            if match:
                section_id = match.group(1)
                section_title = match.group(2)
                if section_id.isdigit() and 1 <= int(section_id) <= 32:
                    self.result.article.sections.append(Section(
                        id=section_id, title=section_title, line=i + 1
                    ))

        if len(self.result.article.sections) != 32:
            self.result.add_error(
                line=1,
                message=f"32条式应有 32 条，实际 {len(self.result.article.sections)} 条",
                severity="error"
            )

    def _check_sections_5shang(self) -> None:
        """检查 5商派 SCA++ 结构（5 步）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_5SHANG_PATTERN.match(line)
            if match:
                section_title = match.group(1)
                self.result.article.sections.append(Section(
                    id=f"step-{len(self.result.article.sections)+1}",
                    title=section_title, line=i + 1
                ))

        if len(self.result.article.sections) != 5:
            self.result.add_error(
                line=1,
                message=f"5商派应有 5 步，实际 {len(self.result.article.sections)} 步",
                severity="error"
            )

    def check_forbidden_words(self) -> None:
        """检查禁用词"""
        for i, line in enumerate(self.lines):
            matches = self._forbidden_word_pattern.findall(line)
            for word in matches:
                # 「大家」是 error，其他是 warning
                severity = "error" if word == "大家" else "warning"
                self.result.add_error(
                    line=i + 1,
                    message=f"发现{'禁用' if severity == 'error' else ''}词: '{word}'",
                    severity=severity
                )
                if word == "大家":
                    self.dajia_count += line.count(word)

    def check_hedging_words(self) -> None:
        """检查模糊词（连续 3 次以上警告）"""
        for i, line in enumerate(self.lines):
            for word in self.HEDGING_WORDS:
                count = line.count(word)
                self.hedging_counts[word] += count

        for word, count in self.hedging_counts.items():
            if count >= 3:
                self.result.add_error(
                    line=0,
                    message=f"模糊词'{word}'出现 {count} 次（连续 3 次以上建议改直接断言）",
                    severity="warning"
                )

    def check_emperor_anchor(self) -> None:
        """检查同理心锚点（开头 3 段内）"""
        # 取前 30 行（开头 3 段）
        header = "\n".join(self.lines[:30])

        if not any(p.search(header) for p in self.EMPATHY_PATTERNS):
            self.result.add_error(
                line=1,
                message="开头 3 段内缺少同理心锚点（如'你可能正在......'）",
                severity="warning"
            )

    def check_pronoun_frequencies(self) -> None:
        """检查人称频率"""
        # 统计 "我" 和 "你" 的次数
        for line in self.lines:
            # 排除代码块
            if not line.startswith("```"):
                self.you_count += line.count("你")
                self.wo_count += line.count("我")

        # 计算每千字频次
        if self.total_words > 0:
            you_per_kw = self.you_count / (self.total_words / 1000)
            wo_per_kw = self.wo_count / (self.total_words / 1000)

            if you_per_kw < 6:
                self.result.add_error(
                    line=0,
                    message=f"'你' 频次过低: {you_per_kw:.1f} 次/千字 (阈值 ≥ 6)",
                    severity="warning"
                )

            if wo_per_kw < 2:
                self.result.add_error(
                    line=0,
                    message=f"'我' 频次过低: {wo_per_kw:.1f} 次/千字 (阈值 ≥ 2)",
                    severity="warning"
                )

        if self.dajia_count > 0:
            self.result.add_error(
                line=0,
                message=f"'大家' 出现 {self.dajia_count} 次（必须为 0）",
                severity="error"
            )

    def check_callouts(self) -> None:
        """检查 callout 使用"""
        for line in self.lines:
            for callout_type, pattern in self.CALLOUT_PATTERNS.items():
                if pattern.match(line):
                    self.callout_counts[callout_type] += 1

        # 至少要有 1 个同理心框
        if self.callout_counts["同理心"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'你在想什么'同理心框（建议开头使用）",
                severity="warning"
            )

        # 至少要有 1 个金句框
        if self.callout_counts["金句"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'金句'框（刘润风格核心标识）",
                severity="warning"
            )

        # 故事/例子/比方至少 1 个
        content_callouts = (
            self.callout_counts["故事"]
            + self.callout_counts["举例"]
            + self.callout_counts["比方"]
        )
        if content_callouts == 0:
            self.result.add_error(
                line=0,
                message="缺少故事/举例/比方框（必须至少 1 个）",
                severity="error"
            )

    def check_scqa_nodes(self) -> None:
        """检查 SCQA 节点标注"""
        for line in self.lines:
            for node, pattern in self.SCQA_NODE_PATTERNS.items():
                if pattern.search(line):
                    self.scqa_nodes_found.add(node)

        # 至少要标注 1 个 SCQA 节点（隐式不算）
        if not self.scqa_nodes_found and self.result.article.scqa_pattern != "无":
            self.result.add_error(
                line=0,
                message="未发现显式 SCQA 节点标注（建议在文中标注 S/C/Q/A 节点）",
                severity="warning"
            )

    def check_structure_specific(self) -> None:
        """按结构类型做特定检查"""
        article_type = self.result.article.article_type

        if article_type == "32条":
            # 32 条不应该有"最后的话"段
            has_final_word = any("最后" in s.title and "话" in s.title for s in self.result.article.sections)
            if has_final_word:
                self.result.add_error(
                    line=0,
                    message="32条式不应有'最后的话'段（克制本身就是结构）",
                    severity="error"
                )

    def print_results(self) -> None:
        """输出验证结果"""
        print(f"\n=== 验证结果 ===")
        print(f"文章类型: {self.result.article.article_type or '未识别'}")
        print(f"SCQA 变体: {self.result.article.scqa_pattern or '未识别'}")
        print(f"段落数: {len(self.result.article.sections)}")
        print(f"正文字数: ~{self.total_words} 字")
        print(f"\n人称频率:")
        print(f"  '我' 出现 {self.wo_count} 次 ({self.wo_count / max(1, self.total_words / 1000):.1f} 次/千字)")
        print(f"  '你' 出现 {self.you_count} 次 ({self.you_count / max(1, self.total_words / 1000):.1f} 次/千字)")
        print(f"  '大家' 出现 {self.dajia_count} 次 (阈值 = 0)")
        print(f"\nCallout 使用:")
        for callout_type, count in self.callout_counts.items():
            if count > 0:
                print(f"  {callout_type}框: {count} 个")
        print(f"\nSCQA 节点标注: {sorted(self.scqa_nodes_found) or '无'}")

        print(f"\n错误/警告:")
        print(f"  ❌ 错误: {self.result.error_count}")
        print(f"  ⚠️  警告: {self.result.warning_count}")

        errors = [e for e in self.result.errors if e.severity == "error"]
        warnings = [e for e in self.result.errors if e.severity == "warning"]

        if errors:
            print("\n错误:")
            for e in errors:
                line_info = f"行 {e.line}" if e.line > 0 else "全局"
                print(f"  {line_info}: {e.message}")

        if warnings:
            print("\n警告:")
            for e in warnings:
                line_info = f"行 {e.line}" if e.line > 0 else "全局"
                print(f"  {line_info}: {e.message}")

        if not errors and not warnings:
            print("\n✅ 所有检查通过！")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="验证刘润风格商业长文结构",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s article.md              # 验证长文结构
  %(prog)s article.md --quiet      # 静默模式，只返回退出码
        """
    )
    parser.add_argument(
        "input",
        type=Path,
        help="要验证的Markdown文件"
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="静默模式，不输出详细信息"
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"❌ 错误：文件不存在: {args.input}")
        sys.exit(1)

    content = args.input.read_text(encoding="utf-8")
    validator = LiurunValidator(content)
    success = validator.validate()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
