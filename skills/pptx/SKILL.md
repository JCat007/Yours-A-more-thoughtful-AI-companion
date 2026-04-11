---
name: pptx
description: Presentation creation, editing, and analysis for .pptx files. Use when creating new presentations, modifying content, working with layouts, adding comments or speaker notes.
license: Proprietary. LICENSE.txt has complete terms
official: true
metadata: {"openclaw":{"requires":{"bins":["python","node"]}}}
---

# PPTX creation, editing, and analysis

## 与 markitdown 的分工

- **只读：把 .pptx 转成 Markdown**（大纲、全文进上下文）：用 **markitdown** skill；命令与下面「Reading Content」一致，由模型统一走 markitdown 可减少歧义。
- **新建幻灯片、改版式、模板映射、替换文本、unpack 改 XML**：用本 **pptx** skill。

二者关系：markitdown = 理解内容；pptx = 改文件。
统一约定：Python 命令优先走共享 venv（`$PYTHON_SKILLS_VENV`，默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

## Reading Content

- **Text extraction**（与 markitdown skill 相同工具）: `$PYTHON_SKILLS_VENV/bin/python -m markitdown path-to-file.pptx` 或 `$PYTHON_SKILLS_VENV/bin/markitdown path-to-file.pptx -o out.md`
- **Raw XML**: Unpack with `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/unpack.py <file>`, read `ppt/slides/slide{N}.xml`, `ppt/theme/theme1.xml`

## Creating New Presentation (no template)

1. Read `html2pptx.md` for full syntax
2. Create HTML for each slide (720pt × 405pt for 16:9)
3. Use `html2pptx.js` + PptxGenJS to convert to PowerPoint
4. Visual validation: `$PYTHON_SKILLS_VENV/bin/python scripts/thumbnail.py output.pptx`

**Design**: State content-informed design approach before coding. Use web-safe fonts, clear hierarchy, consistent palette.

## Editing Existing

1. Unpack: `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/unpack.py presentation.pptx`
2. Edit `ppt/slides/slide{N}.xml`
3. Validate: `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/validate.py --original presentation.pptx unpacked/`
4. Pack: `$PYTHON_SKILLS_VENV/bin/python ooxml/scripts/pack.py unpacked output.pptx`

## Creating with Template

1. Extract: `$PYTHON_SKILLS_VENV/bin/python -m markitdown template.pptx > template-content.md`
2. Thumbnails: `$PYTHON_SKILLS_VENV/bin/python scripts/thumbnail.py template.pptx`
3. Create outline and template mapping
4. Rearrange: `$PYTHON_SKILLS_VENV/bin/python scripts/rearrange.py template.pptx working.pptx 0,34,34,50`
5. Inventory: `$PYTHON_SKILLS_VENV/bin/python scripts/inventory.py working.pptx text-inventory.json`
6. Replace: `$PYTHON_SKILLS_VENV/bin/python scripts/replace.py working.pptx replacement-text.json output.pptx`

## Dependencies

- Python packages (via `$PYTHON_SKILLS_VENV`): `markitdown`, `defusedxml`
- Node packages: `pptxgenjs`, `playwright`, `react-icons`, `sharp`
- System tools: `LibreOffice`, `poppler-utils`
