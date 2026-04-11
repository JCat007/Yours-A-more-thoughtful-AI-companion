---
name: markitdown-ingest
description: Batch ingest pipeline for document-to-Markdown conversion. Use when users need folder-level conversion, normalization, chunking, and manifest/index outputs for RAG or archival.
license: MarkItDown library is MIT (see https://github.com/microsoft/markitdown). This SKILL.md is project guidance.
official: true
global: true
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# MarkItDown Ingest（子 skill：批处理与入库）

本 skill 专注目录级和批量流程：**批量转换 -> 清洗 -> 分块 -> 产出索引/manifest**。

## 什么时候使用

- 用户明确说了：`批量`、`目录`、`文件夹`、`全量转换`
- 需要输出：`manifest`、`索引`、`失败清单`、`可追踪入库文件`
- 目标是给 RAG/知识库做前处理

## 不要使用（转交其他 skill）

- 单个文件快速转换：转 `markitdown`（主 skill）
- 图片/音频/YouTube/插件增强：转 `markitdown-multimodal`
- 需要编辑 Word/PPT/Excel/PDF 文件本体：转 `docx/pptx/xlsx/pdf`

## 推荐执行步骤

1. 发现输入目录，递归筛选支持扩展名（`pdf docx pptx xlsx xls html csv json xml epub zip` 等）。
2. 对每个文件执行：
   - `markitdown <input> -o <output>.md`
   - 失败则记录到错误清单（错误信息、文件路径、时间戳）。
3. 对转换结果做轻量清洗（可选）：
   - 去空行风暴、统一标题层级、保留表格结构。
4. 分块（可选）：
   - 按标题或固定 token/字符窗口切分，生成 chunk 文件或 JSONL。
5. 生成 `manifest`：
   - 至少包含：`source_path`、`output_md`、`status`、`error`、`chunk_count`。

## 统一 venv（必须）

所有 Python 命令使用共享 venv：`$PYTHON_SKILLS_VENV`（默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

## 最小命令模板

```bash
mkdir -p output_md
"$PYTHON_SKILLS_VENV/bin/markitdown" "/data/input/a.pdf" -o "output_md/a.md"
```

建议用 Python 脚本封装批处理，统一日志和错误重试。

## 输出约定建议

- `output_md/`：转换后的 Markdown
- `output_chunks/`：分块结果（可选）
- `manifest.jsonl`：逐文件状态
- `errors.jsonl`：失败项

## 验证

- 「把这个目录所有文档转 markdown，并给我 manifest」
- 「把转换后的 md 再按标题分块」
