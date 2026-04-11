---
name: markitdown
description: Convert office documents, PDFs, and many other formats to Markdown for summarization, RAG, indexing, or chat context. Use when the user wants text extraction as .md, batch conversion, or ingest—not when they need to edit the original file structure, formulas, or PDF forms.
license: MarkItDown library is MIT (see https://github.com/microsoft/markitdown). This SKILL.md is project guidance.
official: true
global: true
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# MarkItDown：统一入口（主 skill）

[MarkItDown](https://github.com/microsoft/markitdown) 把多种文件转为 Markdown，适合交给 LLM 做摘要、问答、入库。输出面向**文本分析**，不是高保真排版还原。

## 与本项目其他技能的分工（必须先读）

| 用户意图 | 使用本 skill（markitdown） | 使用其他 skill |
|----------|---------------------------|----------------|
| 把 pdf/docx/pptx/xlsx **转成 Markdown**、单文件抽取、给模型读 | ✅ | |
| 目录级批处理、清洗、分块、生成索引/manifest | 转交 **markitdown-ingest** | |
| 图片/音频/YouTube/插件高级流程、多模态抽取 | 转交 **markitdown-multimodal** | |
| **编辑** Word（修订、批注、OOXML） | | **docx** |
| **新建/改** PPT 版式、模板替换、幻灯片 XML | | **pptx** |
| **改单元格、保公式、重算** Excel | | **xlsx** |
| PDF **合并/拆分/填表/水印**、脚本化表格抽取 | | **pdf**（LobsterAI） |
| 只要用 **pandas** 做数据分析（DataFrame） | 可选；结构化分析仍以 **xlsx** 为准 | **xlsx** |

原则：**主 skill 先承接，再按意图分流**。  
- 「理解内容 → Markdown（单文件/轻量）」走 `markitdown`。  
- 「批量 ingest」走 `markitdown-ingest`。  
- 「多模态与插件增强」走 `markitdown-multimodal`。  
- 「改文件本体」走 `docx/pptx/xlsx/pdf`。

## 分流规则（主 skill 必须执行）

当用户请求符合下列特征时，不在本 skill 内硬做，直接按优先级转交子 skill：

1. 命中以下关键词或目标，转 `markitdown-ingest`：
   - 关键词：`批量` `目录` `文件夹` `全量` `清洗` `分块` `chunk` `索引` `manifest` `入库` `RAG`
   - 目标：对多个文件统一转换并产出可追踪清单
2. 命中以下关键词或目标，转 `markitdown-multimodal`：
   - 关键词：`图片 OCR` `音频转写` `YouTube` `插件` `--use-plugins` `Doc Intelligence`
   - 目标：调用多模态来源或插件能力完成抽取
3. 如果同时命中 1 和 2，先转 `markitdown-multimodal` 处理抽取，再按需要交由 `markitdown-ingest` 做批量落盘与 manifest。

## 安装依赖

需要 **Python 3.10+**。本项目建议统一使用共享 venv：`$PYTHON_SKILLS_VENV`（默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

```bash
# 初始化并安装共享 venv（只需一次，推荐）
bash ./scripts/setup-openclaw-python-venv.sh

# 或手动执行
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
python3 -m venv "$PYTHON_SKILLS_VENV"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install -U pip setuptools wheel
"$PYTHON_SKILLS_VENV/bin/python" -m pip install "markitdown[all]"
```

更多可选组见上游 README：`[xls] [outlook] [az-doc-intel] [audio-transcription] [youtube-transcription]` 等。

## 命令行用法

```bash
# 输出到文件
"$PYTHON_SKILLS_VENV/bin/markitdown" path-to-file.pdf -o document.md

# 重定向
"$PYTHON_SKILLS_VENV/bin/markitdown" path-to-file.docx > out.md

# 管道
cat path-to-file.pptx | "$PYTHON_SKILLS_VENV/bin/markitdown"
```

若 `markitdown` 不在 PATH，可用模块方式：

```bash
"$PYTHON_SKILLS_VENV/bin/python" -m markitdown path-to-file.pptx -o out.md
```

## Python API（需要自定义时）

```python
from markitdown import MarkItDown

md = MarkItDown(enable_plugins=False)
result = md.convert("path/to/file")
print(result.text_content)
```

- **插件**：`$PYTHON_SKILLS_VENV/bin/markitdown --list-plugins`；启用：`$PYTHON_SKILLS_VENV/bin/markitdown --use-plugins <file>`
- **Azure Document Intelligence**：CLI `-d -e "<endpoint>"` 或构造 `MarkItDown(docintel_endpoint="...")`
- **图片/PPT 用 LLM 描述**：传入 `llm_client`、`llm_model`（见上游文档）
- **Docker**：上游提供 Dockerfile，适合隔离运行

## 批量 / 目录处理建议

1. 遍历目录，按扩展名过滤（`.pdf` `.docx` `.pptx` `.xlsx` 等）。
2. 对每个文件执行 `"$PYTHON_SKILLS_VENV/bin/markitdown" <in> -o <out>.md`，失败时记录路径与错误信息。
3. 大文件或 ZIP：MarkItDown 支持 ZIP 内迭代转换；注意超时与磁盘空间。

## 注意事项

- **Excel**：转 Markdown 便于「通读」；涉及公式正确性、报表结构编辑，必须用 **xlsx** skill（openpyxl + recalc）。
- **PDF**：扫描件质量依赖转换链；复杂填表/合并拆分用 **pdf** skill。
- **Word**：需要 tracked changes、精确版式或法律修订流程，用 **docx**（pandoc + OOXML），不要只靠 markitdown。

## 验证

- 「把这个 pptx/pdf 转成 markdown 给我」
- 「批量把文件夹里的 office 文件转成 md」

## 参考

- 项目仓库：<https://github.com/microsoft/markitdown>
- 另提供 **markitdown-mcp**（MCP 接入），见上游 README 提示。
