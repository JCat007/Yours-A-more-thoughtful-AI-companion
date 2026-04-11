---
name: docx
description: Document creation, editing, and analysis for .docx files. Use when creating new documents, modifying content, working with tracked changes, adding comments, or any document tasks.
license: Proprietary. LICENSE.txt has complete terms
official: true
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# DOCX creation, editing, and analysis

## 与 markitdown 的分工

- **仅要把 .docx 内容抽成 Markdown**（摘要、入库、给模型通读）：优先用 **markitdown** skill（`$PYTHON_SKILLS_VENV/bin/markitdown file.docx -o out.md` 或 `$PYTHON_SKILLS_VENV/bin/python -m markitdown`）。
- **创建/编辑文档、修订（tracked changes）、批注、OOXML 级修改、法律红批**：用本 **docx** skill（pandoc、`unpack.py` / `pack.py` 等）。

统一约定：Python 命令优先走共享 venv（`$PYTHON_SKILLS_VENV`，默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

需要版式与修订语义时不要用 markitdown 替代 pandoc + OOXML 流程。

## Workflow Decision Tree

### Reading/Analyzing
- **Text extraction**: `pandoc --track-changes=all path-to-file.docx -o output.md`
- **Raw XML access**: Unpack with `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/unpack.py <file>`, read `word/document.xml`, `word/comments.xml`, `word/media/`

### Creating New Document
Use **docx-js** (JavaScript/TypeScript). Read `docx-js.md` for full syntax. Use Document, Paragraph, TextRun components, export with Packer.toBuffer().

### Editing Existing
- **Simple changes**: Basic OOXML editing workflow
- **Review/legal docs**: Redlining workflow with tracked changes

## Redlining Workflow

1. `pandoc --track-changes=all doc.docx -o current.md`
2. Identify changes, group into batches of 3-10
3. Unpack: `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/unpack.py doc.docx`
4. Edit `word/document.xml` - use minimal precise edits: [unchanged] + [deletion] + [insertion] + [unchanged]
5. Pack: `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/pack.py unpacked reviewed.docx`

## Converting to Images

```bash
soffice --headless --convert-to pdf document.docx
pdftoppm -jpeg -r 150 document.pdf page
```

## Dependencies

- Python packages (via `$PYTHON_SKILLS_VENV`): `defusedxml`, `markitdown` (for read-only extraction path)
- System tools: `pandoc`, `LibreOffice`, `poppler-utils`
- Node packages: `docx` (npm)
