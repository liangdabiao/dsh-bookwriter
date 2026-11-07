#!/usr/bin/env python3
"""
结构验证脚本
验证罗振宇风格认知/启发/商业长文的结构是否符合规范
支持 3 种结构类型：罗胖60秒、罗辑思维长文、跨年演讲稿
"""

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set, Pattern


@dataclass
class ValidationError:
    """验证错误"""
    line: int
    message: str
    severity: str  # error, warning


@dataclass
class Section:
    """段落信息（罗振宇风格的通用段落）"""
    id: str
    title: str
    line: int
    word_count: int = 0


@dataclass
class Article:
    """长文信息"""
    article_type: str = ""  # 罗胖60秒 / 罗辑思维长文 / 跨年演讲稿
    scqa_pattern: str = ""  # TQA / CAA / PEI / 无
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


class LuozhenyuValidator:
    """罗振宇风格长文结构验证器"""

    # 子串匹配的禁用词（短语类，安全，不会误伤）
    FORBIDDEN_PHRASES: List[str] = [
        # 严谨文体禁用
        "综上所述",
        "值得注意的是",
        "接下来我们将",
        "进行操作",
        # 罗振宇特定禁用（套话）
        "我们一起来看看",
        "让我们一起",
        "我们都知道",
        "我们一起",
        "众所周知",
        "不言而喻",
        "显而易见",
        "在当今这个时代",
        "某种程度上",
        "一定程度上",
        "可以说是",
        # 商业黑话（罗振宇更严，与 SKILL.md/style-dna.md 对齐）
        "赋能",
        "抓手",
        "底层逻辑",
        "打通",
        "闭环",
    ]

    # 需要词边界匹配的禁用词（单词类，避免子串误伤）
    # "大家" 会误伤"大家伙/大家族"，必须用边界匹配
    FORBIDDEN_WORDS_BOUNDED: List[str] = [
        "大家",
        "我们要知道",
        "我们要做的",
        "加油",
    ]

    # 模糊词（连续出现 3 次以上警告）
    HEDGING_WORDS: List[str] = ["或许", "可能", "也许"]

    # "我们" 频次限制（罗振宇比刘润更严）
    WOMEN_MAX_PER_KW: float = 5.0

    # 罗振宇风格开头模式（"我是罗胖" / "你可能正在" / "今天我看到"）
    OPENING_PATTERNS: List[Pattern] = [
        re.compile(r"我是罗胖"),
        re.compile(r"你可能正在"),
        re.compile(r"你也许正在"),
        re.compile(r"今天我看到"),
        re.compile(r"今天我听说"),
        re.compile(r"今天我读到"),
        re.compile(r"前几天"),
        re.compile(r"你正在看"),
        re.compile(r"你想过没有"),
        re.compile(r"我常常会想"),
    ]

    # SCQA 节点模式（TQA / CAA / PEI）
    SCQA_NODE_PATTERNS = {
        # TQA 触发式
        "T": re.compile(r"\*\*T 触发\*\*|## 触发"),
        "Q": re.compile(r"\*\*Q 问题\*\*|## 问题"),
        "A": re.compile(r"\*\*A 答案\*\*|## 答案"),
        # CAA 行动式
        "C": re.compile(r"\*\*C 具体\*\*|## 具体"),
        # PEI 启发式
        "P": re.compile(r"\*\*P 现象\*\*|## 现象"),
        "E": re.compile(r"\*\*E 解释\*\*|## 解释"),
        "I": re.compile(r"\*\*I 启发\*\*|## 启发"),
    }

    # 18 字心法识别
    XINFA_18_PATTERN: Pattern = re.compile(
        r"一具体.*?就深刻|一行动.*?就创新|一困惑.*?就出门"
    )

    # 段落标题模式
    # 罗胖60秒: ## 一段 / ## 短文（两种模板写法都支持）
    SECTION_60MIAO_PATTERN: Pattern = re.compile(r"^##\s+(一段|短文)[：:]?\s*(.*)$")
    # 罗辑思维长文: ## §NN
    SECTION_LUOJI_PATTERN: Pattern = re.compile(r"^##\s+§(\d+)\s+(.+)$")
    # 跨年演讲稿: ## 开场 / 主题一..主题N / 第一段..第六段 / 收束
    #   同时兼容 book-blueprints.md 的"主题一"写法和 toc-template 的"第N段"写法
    SECTION_CROSSYEAR_PATTERN: Pattern = re.compile(
        r"^##\s+(开场|第[一二三四五六七八九十]段|主题[一二三四五六七八九十]|收束)[：:]?\s*(.*)$"
    )

    # callout 类型识别（罗振宇核心 7 种 + 扩展）
    # 格式参考 callout-patterns.md：> **类型词**：内容
    # 躬身入局框在文档里写作 "> **做事的人**："，需同时识别
    CALLOUT_PATTERNS: Dict[str, Pattern] = {
        "躬身入局": re.compile(r"^>\s*\*\*(躬身入局|做事的人)\*\*"),
        "长期主义": re.compile(r"^>\s*\*\*(长期主义|1000\s*天视角)\*\*"),
        "一XX就XX": re.compile(r"^>\s*\*\*(一[具体行动困惑][，,]?\s*就[深刻创新出门]|一XX就XX)\*\*"),
        "故事": re.compile(r"^>\s*\*\*(故事|故事细节)\*\*"),
        "金句": re.compile(r"^>\s*\*\*(金句|对仗金句|数字金句|对仗|数字)\*\*"),
        "启发": re.compile(r"^>\s*\*\*(我的启发|我有一个启发|启示|启发)\*\*"),
        "时代拷问": re.compile(r"^>\s*\*\*(时代拷问|灵魂拷问)\*\*"),
    }

    def __init__(self, content: str):
        self.content = content
        self.lines = content.split("\n")
        self.result = ValidationResult()
        self.total_words = 0
        self.you_count = 0
        self.wo_count = 0
        self.women_count = 0  # "我们" 频次
        self.dajia_count = 0
        self.jinju_count = 0
        self.xinfa_18_count = 0
        self.max_sentence_length = 0
        self.callout_counts: Dict[str, int] = {
            "躬身入局": 0, "长期主义": 0, "一XX就XX": 0,
            "故事": 0, "金句": 0, "启发": 0, "时代拷问": 0
        }
        self.scqa_nodes_found: Set[str] = set()
        self.hedging_counts: Dict[str, int] = {w: 0 for w in self.HEDGING_WORDS}

        # 预编译禁用词正则
        # 1. 短语类禁用词：直接子串匹配
        self._forbidden_phrase_pattern = re.compile(
            "|".join(re.escape(w) for w in self.FORBIDDEN_PHRASES)
        )
        # 2. 单词类禁用词：用非中文字符边界匹配，避免误伤"大家伙/大家族"
        #    边界定义：前后不能紧贴中文字符（用环视断言）
        self._forbidden_bounded_patterns = [
            re.compile(r"(?<![,\u4e00-\u9fff])" + re.escape(w) + r"(?![\u4e00-\u9fff])")
            for w in self.FORBIDDEN_WORDS_BOUNDED
        ]

    def validate(self) -> bool:
        """执行完整验证"""
        self.detect_article_type()
        self.check_metadata()
        self.check_sections()
        self.check_forbidden_words()
        self.check_hedging_words()
        self.check_opening_anchor()
        self.check_pronoun_frequencies()
        self.check_callouts()
        self.check_scqa_nodes()
        self.check_xinfa_18()
        self.check_jinju_density()
        self.check_sentence_length()
        self.check_structure_specific()
        self.print_results()

        return self.result.error_count == 0

    def detect_article_type(self) -> None:
        """检测文章类型（从元数据或段落模式推断）"""
        header = "\n".join(self.lines[:50])

        type_match = re.search(
            r"(?:\*\*)?结构类型(?:\*\*)?[：:]\s*(罗胖60秒|罗辑思维长文|跨年演讲稿)",
            header
        )
        if type_match:
            self.result.article.article_type = type_match.group(1)

        scqa_match = re.search(
            r"(?:\*\*)?SCQA 变体(?:\*\*)?[：:]\s*(TQA|CAA|PEI|无)",
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
                message="缺少元数据字段: 结构类型（应为 罗胖60秒/罗辑思维长文/跨年演讲稿）",
                severity="error"
            )
        if not self.result.article.scqa_pattern:
            self.result.add_error(
                line=1,
                message="缺少元数据字段: SCQA 变体（应为 TQA/CAA/PEI/无）",
                severity="warning"
            )

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
        # 先统计正文字数（后续各结构检查依赖此值）
        self._count_words()

        article_type = self.result.article.article_type

        if article_type == "罗胖60秒":
            self._check_sections_60miao()
        elif article_type == "罗辑思维长文":
            self._check_sections_luoji()
        elif article_type == "跨年演讲稿":
            self._check_sections_crossyear()
        else:
            self.result.add_error(
                line=1,
                message="无法确定文章结构类型（元数据缺失或不支持）",
                severity="warning"
            )

    def _count_words(self) -> None:
        """统计正文字数（含引用块正文，仅排除代码块、标题、元数据行）"""
        in_code = False
        for line in self.lines:
            if line.strip().startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            if line.startswith("#"):
                continue
            # 跳过元数据行（如 **创作者**: ...）
            if line.strip().startswith("**") and "**:" in line:
                continue
            self.total_words += len([c for c in line if '\u4e00' <= c <= '\u9fff'])

    def _check_sections_60miao(self) -> None:
        """检查罗胖60秒结构（恰好 1 段）"""
        found = False
        for i, line in enumerate(self.lines):
            match = self.SECTION_60MIAO_PATTERN.match(line)
            if match:
                section_title = match.group(1)
                self.result.article.sections.append(Section(
                    id="一段", title=section_title, line=i + 1
                ))
                found = True
                break

        # 罗胖60秒允许通过 # 一级标题识别（无 ## 段落标题）
        if not found:
            # 检查是否整个文章只有 1 段（无 H2 段落）
            h2_count = sum(1 for line in self.lines if line.startswith("## "))
            if h2_count == 0:
                self.result.article.sections.append(Section(
                    id="一段", title="单段60秒", line=1
                ))

        if len(self.result.article.sections) != 1:
            self.result.add_error(
                line=1,
                message=f"罗胖60秒应为 1 段，实际 {len(self.result.article.sections)} 段",
                severity="error"
            )

        # 字数检查（60-150 字）
        if self.total_words > 200:
            self.result.add_error(
                line=0,
                message=f"罗胖60秒字数过多: {self.total_words} 字 (阈值 ≤ 200)",
                severity="warning"
            )
        elif self.total_words < 50:
            self.result.add_error(
                line=0,
                message=f"罗胖60秒字数过少: {self.total_words} 字 (阈值 ≥ 50)",
                severity="warning"
            )

    def _check_sections_luoji(self) -> None:
        """检查罗辑思维长文结构（§01-§07）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_LUOJI_PATTERN.match(line)
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
                message=f"罗辑思维长文段落编号不连续: {section_nums}",
                severity="error"
            )

        # 罗辑思维长文应有 5-7 段
        if len(self.result.article.sections) < 5 or len(self.result.article.sections) > 7:
            self.result.add_error(
                line=1,
                message=f"罗辑思维长文应有 5-7 段，实际 {len(self.result.article.sections)} 段",
                severity="error"
            )

        # 检查收束段：标题含"收束/启发/启示"之一，或段落正文含"启发/启示"信号
        # （兼容 book-blueprints.md 的 "## §05 收束" 标题写法）
        if self.result.article.sections:
            last_section = self.result.article.sections[-1]
            title_ok = any(k in last_section.title for k in ("收束", "启发", "启示"))
            # 取该段正文（从该段行到文件末尾）检查启发信号
            body = "\n".join(self.lines[last_section.line:])
            body_ok = ("启发" in body) or ("启示" in body)
            if not (title_ok or body_ok):
                self.result.add_error(
                    line=last_section.line,
                    message=f"罗辑思维长文收束段应含'启发/启示'信号: 标题'{last_section.title}'",
                    severity="warning"
                )

    def _check_sections_crossyear(self) -> None:
        """检查跨年演讲稿结构（开场 + 3-5 段 + 收束）"""
        for i, line in enumerate(self.lines):
            match = self.SECTION_CROSSYEAR_PATTERN.match(line)
            if match:
                section_type = match.group(1)
                section_title = match.group(2)
                self.result.article.sections.append(Section(
                    id=section_type, title=section_title, line=i + 1
                ))

        section_ids = [s.id for s in self.result.article.sections]

        # 跨年演讲稿必须有"开场"
        if "开场" not in section_ids:
            self.result.add_error(
                line=1,
                message="跨年演讲稿缺少'开场：我是罗胖'段",
                severity="error"
            )

        # 跨年演讲稿必须有"收束"
        if "收束" not in section_ids:
            self.result.add_error(
                line=1,
                message="跨年演讲稿缺少'收束'段",
                severity="error"
            )

        # 收束段：标题或正文含"启发/启示"信号即可
        shou_shu = next((s for s in self.result.article.sections if s.id == "收束"), None)
        if shou_shu:
            title_ok = any(k in shou_shu.title for k in ("收束", "启发", "启示"))
            body = "\n".join(self.lines[shou_shu.line:])
            body_ok = ("启发" in body) or ("启示" in body)
            if not (title_ok or body_ok):
                self.result.add_error(
                    line=shou_shu.line,
                    message=f"跨年演讲稿收束段应含'启发/启示'信号: 标题'{shou_shu.title}'",
                    severity="warning"
                )

        # 跨年演讲稿应有 5-7 段（开场 + 3-5 段 + 收束）
        if len(self.result.article.sections) < 5 or len(self.result.article.sections) > 8:
            self.result.add_error(
                line=1,
                message=f"跨年演讲稿应有 5-8 段（开场 + 3-5 段 + 收束），实际 {len(self.result.article.sections)} 段",
                severity="error"
            )

    def check_forbidden_words(self) -> None:
        """检查禁用词（短语子串匹配 + 单词词边界匹配）"""
        for i, line in enumerate(self.lines):
            if line.startswith("```"):
                continue
            # 1. 短语类（子串匹配，安全）
            phrase_matches = self._forbidden_phrase_pattern.findall(line)
            for word in phrase_matches:
                self.result.add_error(
                    line=i + 1,
                    message=f"发现禁用词: '{word}'",
                    severity="warning"
                )
            # 2. 单词类（词边界匹配，避免误伤"大家伙/大家族"）
            for pat in self._forbidden_bounded_patterns:
                for m in pat.finditer(line):
                    word = m.group(0)
                    # 「大家」是 error（零容忍），其他是 warning
                    severity = "error" if word == "大家" else "warning"
                    self.result.add_error(
                        line=i + 1,
                        message=f"发现{'禁用' if severity == 'error' else ''}词: '{word}'",
                        severity=severity
                    )
                    if word == "大家":
                        self.dajia_count += 1

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

    def check_opening_anchor(self) -> None:
        """检查罗振宇风格开头锚点（开头 5 段内）"""
        # 取前 30 行（开头几段）
        header = "\n".join(self.lines[:30])

        if not any(p.search(header) for p in self.OPENING_PATTERNS):
            self.result.add_error(
                line=1,
                message="开头 3 段内缺少罗振宇风格锚点（如'我是罗胖'/'你可能正在'/'今天我看到'）",
                severity="warning"
            )

    def check_pronoun_frequencies(self) -> None:
        """检查人称频率"""
        for line in self.lines:
            if not line.startswith("```"):
                self.you_count += line.count("你")
                self.wo_count += line.count("我")
                self.women_count += line.count("我们")

        if self.total_words > 0:
            you_per_kw = self.you_count / (self.total_words / 1000)
            wo_per_kw = self.wo_count / (self.total_words / 1000)
            women_per_kw = self.women_count / (self.total_words / 1000)

            if you_per_kw < 3:
                self.result.add_error(
                    line=0,
                    message=f"'你' 频次过低: {you_per_kw:.1f} 次/千字 (阈值 ≥ 3)",
                    severity="warning"
                )

            if wo_per_kw < 4:
                self.result.add_error(
                    line=0,
                    message=f"'我' 频次过低: {wo_per_kw:.1f} 次/千字 (阈值 ≥ 4)",
                    severity="warning"
                )

            if women_per_kw > self.WOMEN_MAX_PER_KW:
                self.result.add_error(
                    line=0,
                    message=f"'我们' 频次过高: {women_per_kw:.1f} 次/千字 (阈值 ≤ {self.WOMEN_MAX_PER_KW})",
                    severity="warning"
                )

        if self.dajia_count > 0:
            self.result.add_error(
                line=0,
                message=f"'大家' 出现 {self.dajia_count} 次（必须为 0）",
                severity="error"
            )

    def check_callouts(self) -> None:
        """检查 callout 使用（核心 7 种）

        按文章类型区分阈值（对齐 quality-checkpoints.md 的内容块频率表）：
        - 罗胖60秒：躬身入局≥0、故事≥0、金句≥1、启发≥1（极简，不强制躬身入局/故事）
        - 罗辑思维长文：躬身入局≥1、故事≥1、金句≥1、启发≥1
        - 跨年演讲稿：躬身入局≥1、故事≥1、金句≥1、启发≥1
        """
        for line in self.lines:
            for callout_type, pattern in self.CALLOUT_PATTERNS.items():
                if pattern.match(line):
                    self.callout_counts[callout_type] += 1

        article_type = self.result.article.article_type
        # 罗胖60秒不强制躬身入局框和故事框
        need_goshen = article_type != "罗胖60秒"
        need_story = article_type != "罗胖60秒"

        if need_goshen and self.callout_counts["躬身入局"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'躬身入局'框（罗振宇风格核心标识）",
                severity="warning"
            )

        if self.callout_counts["启发"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'启发'框（'我有一个启发…'是罗振宇风格核心）",
                severity="warning"
            )

        if need_story and self.callout_counts["故事"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'故事'框（罗振宇要求必含具体时间/地点/数字）",
                severity="warning"
            )

        if self.callout_counts["金句"] == 0:
            self.result.add_error(
                line=0,
                message="缺少'金句'框（金句主义是罗振宇核心标识）",
                severity="warning"
            )

    def check_scqa_nodes(self) -> None:
        """检查 SCQA 节点标注"""
        for line in self.lines:
            for node, pattern in self.SCQA_NODE_PATTERNS.items():
                if pattern.search(line):
                    self.scqa_nodes_found.add(node)

        if not self.scqa_nodes_found and self.result.article.scqa_pattern != "无":
            self.result.add_error(
                line=0,
                message="未发现显式 SCQA 节点标注（建议在文中标注 T/Q/A 或 C/A 或 P/E/I 节点）",
                severity="warning"
            )

    def check_xinfa_18(self) -> None:
        """检查 18 字心法（跨年演讲稿必含）"""
        if self.result.article.article_type != "跨年演讲稿":
            return

        # 跨年演讲稿必有 18 字心法
        full_text = "\n".join(self.lines)
        matches = self.XINFA_18_PATTERN.findall(full_text)
        self.xinfa_18_count = len(matches)

        if self.xinfa_18_count == 0:
            self.result.add_error(
                line=0,
                message="跨年演讲稿缺少 18 字心法（'一具体，就深刻' / '一行动，就创新' / '一困惑，就出门' 必含其一）",
                severity="error"
            )

    def check_jinju_density(self) -> None:
        """检查金句密度（≥ 3 句/千字）

        覆盖 style-dna.md 第 5.2 节列出的 8 种罗振宇标志句式，避免系统性低估。
        """
        full_text = "\n".join(self.lines)
        CJK = r"[\u4e00-\u9fff]"
        patterns = [
            # 1. "一X，就Y"（一具体就深刻 / 一行动就创新 / 一困惑就出门）
            re.compile(rf"一{CJK}{{1,6}}，?就{CJK}{{1,6}}"),
            # 2. "把X留给A，把Y交给B" 分配式
            re.compile(rf"把{CJK}{{1,8}}(留给|交给){CJK}{{1,8}}[，,]?把{CJK}{{1,8}}(留给|交给){CJK}{{1,8}}"),
            # 3. "凡X，皆Y"
            re.compile(rf"凡{CJK}{{1,8}}[，,]?皆{CJK}{{1,8}}"),
            # 4. "发X，迈X，走X，磕X" 递进式（也匹配三句版）
            re.compile(rf"发{CJK}{{1,4}}[，、]迈{CJK}{{1,4}}[，、]走{CJK}{{1,4}}"),
            # 5. "放弃X，转而Y" 价值重估式
            re.compile(rf"放弃{CJK}{{1,8}}[，,]?转而{CJK}{{1,8}}"),
            # 6. "X不是A，是B" 重定义式（X 不是 Y，是 Z）
            re.compile(rf"{CJK}{{1,8}}不是{CJK}{{1,8}}[，,]?是{CJK}{{1,8}}"),
            # 7. "看一个人X，看他Y" 观察式
            re.compile(rf"看一个人{CJK}{{1,8}}[，,]?看他{CJK}{{1,8}}"),
            # 8. "向内问X个问题" 工具式
            re.compile(rf"向内问{CJK}{{0,3}}个问题"),
            # 9. 显式金句 callout（> **金句**：……）单独计 1 句
            re.compile(r"^>\s*\*\*(金句|对仗金句|数字金句)\*\*", re.MULTILINE),
        ]

        all_matches: Set[str] = set()
        for pat in patterns:
            for m in pat.findall(full_text):
                if isinstance(m, str):
                    all_matches.add(m.strip())

        self.jinju_count = len(all_matches)

        if self.total_words > 0:
            jinju_per_kw = self.jinju_count / (self.total_words / 1000)
            if jinju_per_kw < 3:
                self.result.add_error(
                    line=0,
                    message=f"金句密度过低: {jinju_per_kw:.1f} 句/千字 (阈值 ≥ 3)",
                    severity="warning"
                )

    def check_sentence_length(self) -> None:
        """检查句长（罗振宇比刘润更严：≤ 40 字）"""
        # 只对正文行做句子切分：排除元数据(以**开头)、标题(#)、引用(>)、代码块
        body_lines = []
        in_code = False
        for line in self.lines:
            if line.strip().startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            if line.startswith("#"):
                continue
            if line.startswith(">"):
                continue
            if line.strip().startswith("**") and line.rstrip().endswith("**"):
                continue
            body_lines.append(line)
        body = "\n".join(body_lines)

        # 提取所有句子（以。！？.!? 结尾）
        sentence_pattern = re.compile(r"[^。！？.!?]+[。！？.!?]")
        sentences = sentence_pattern.findall(body)

        if sentences:
            sentence_lengths = [len(re.sub(r"[^\u4e00-\u9fff]", "", s)) for s in sentences]
            self.max_sentence_length = max(sentence_lengths) if sentence_lengths else 0

            long_sentences = [n for n in sentence_lengths if n > 40]
            if len(long_sentences) > 5:
                self.result.add_error(
                    line=0,
                    message=f"句长 > 40 字连续出现 {len(long_sentences)} 句 (罗振宇要求 ≤ 40 字)",
                    severity="warning"
                )

    def check_structure_specific(self) -> None:
        """按结构类型做特定检查"""
        article_type = self.result.article.article_type

        if article_type == "罗胖60秒":
            # 罗胖60秒必须有"启发"信号
            full_text = "\n".join(self.lines)
            if "启发" not in full_text and "启示" not in full_text:
                self.result.add_error(
                    line=0,
                    message="罗胖60秒必须有'启发'或'启示'",
                    severity="error"
                )

    def print_results(self) -> None:
        """输出验证结果"""
        print(f"\n=== 罗振宇风格长文验证结果 ===")
        print(f"文章类型: {self.result.article.article_type or '未识别'}")
        print(f"SCQA 变体: {self.result.article.scqa_pattern or '未识别'}")
        print(f"段落数: {len(self.result.article.sections)}")
        print(f"正文字数: ~{self.total_words} 字")
        if self.max_sentence_length:
            print(f"最长句: {self.max_sentence_length} 字 (阈值 ≤ 40)")
        print(f"\n人称频率:")
        print(f"  '我' 出现 {self.wo_count} 次 ({self.wo_count / max(1, self.total_words / 1000):.1f} 次/千字, 阈值 ≥ 4)")
        print(f"  '你' 出现 {self.you_count} 次 ({self.you_count / max(1, self.total_words / 1000):.1f} 次/千字, 阈值 ≥ 3)")
        print(f"  '我们' 出现 {self.women_count} 次 ({self.women_count / max(1, self.total_words / 1000):.1f} 次/千字, 阈值 ≤ 5)")
        print(f"  '大家' 出现 {self.dajia_count} 次 (阈值 = 0)")
        print(f"\nCallout 使用:")
        for callout_type, count in self.callout_counts.items():
            marker = "✅" if count > 0 else "❌"
            print(f"  {marker} {callout_type}框: {count} 个")
        print(f"\nSCQA 节点标注: {sorted(self.scqa_nodes_found) or '无'}")
        if self.result.article.article_type == "跨年演讲稿":
            print(f"18 字心法命中: {self.xinfa_18_count} 次")
        print(f"金句密度: {self.jinju_count} 句 ({self.jinju_count / max(1, self.total_words / 1000):.1f} 句/千字, 阈值 ≥ 3)")

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
        description="验证罗振宇风格认知/启发/商业长文结构",
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
    validator = LuozhenyuValidator(content)
    success = validator.validate()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
