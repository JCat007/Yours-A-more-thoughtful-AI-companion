---
name: xlsx
description: Spreadsheet creation, editing, and analysis for .xlsx/.csv files. Use when creating spreadsheets with formulas, reading/analyzing data, modifying while preserving formulas, or recalculating.
license: Proprietary. LICENSE.txt has complete terms
official: true
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# XLSX creation, editing, and analysis

## 与 markitdown 的分工

- **通读表格为 Markdown**（多 sheet 概览、给 LLM 读）：可用 **markitdown**（`$PYTHON_SKILLS_VENV/bin/markitdown file.xlsx -o out.md`）。
- **数据分析（DataFrame）、改单元格、保公式、重算、财务模型规范**：必须用本 **xlsx** skill（pandas / openpyxl / `recalc.py`）。

MarkItDown 不保证公式语义与 Excel 重算结果；任何「改表 + 公式正确」场景不要依赖 markitdown。
统一约定：Python 命令优先走共享 venv（`$PYTHON_SKILLS_VENV`，默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

## Requirements

- **Zero formula errors**: No #REF!, #DIV/0!, #VALUE!, #N/A, #NAME?
- **Use formulas, not hardcoded values**: Let Excel calculate; use `=SUM(B2:B9)` not Python-computed totals
- **Recalculate after editing**: Run `$PYTHON_SKILLS_VENV/bin/python recalc.py output.xlsx` for openpyxl-modified files

## Reading/Analyzing

```python
import pandas as pd
df = pd.read_excel('file.xlsx')
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)
```

## Creating New

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active
sheet['A1'] = 'Hello'
sheet['B2'] = '=SUM(A1:A10)'  # Use formulas!
wb.save('output.xlsx')
```

## Editing Existing

```python
from openpyxl import load_workbook
wb = load_workbook('existing.xlsx')
sheet = wb['SheetName']
sheet['A1'] = 'New Value'
wb.save('modified.xlsx')
```

## Recalculate Formulas

```bash
"$PYTHON_SKILLS_VENV/bin/python" recalc.py output.xlsx 30
```

Returns JSON with status, total_errors, error_summary. Fix errors and recalculate.

## Financial Model Conventions (when applicable)

- Blue: Hardcoded inputs
- Black: Formulas
- Green: Cross-sheet links
- Red: External links
- Yellow background: Key assumptions

## Dependencies

- Python packages (via `$PYTHON_SKILLS_VENV`): `pandas`, `openpyxl`, `markitdown` (read-only extraction path)
- System tools: `LibreOffice` (for recalc.py)
