---
name: markitdown-multimodal
description: Multimodal extraction with MarkItDown for image/audio/youtube/plugin-enabled workflows, including OCR and enhanced conversion paths.
license: MarkItDown library is MIT (see https://github.com/microsoft/markitdown). This SKILL.md is project guidance.
official: true
global: true
metadata: {"openclaw":{"requires":{"bins":["python"]}}}
---

# MarkItDown Multimodal（子 skill：多模态与插件）

本 skill 专注 **图片、音频、YouTube、插件增强、Doc Intelligence** 等扩展能力。

统一约定：Python 命令优先走共享 venv（`$PYTHON_SKILLS_VENV`，默认 `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`）。

## 什么时候使用

- 用户提到 `图片 OCR`、`音频转写`、`YouTube 转文字`
- 需要 `--use-plugins` 或第三方 markitdown 插件
- 需要 Azure Document Intelligence 路径

## 不要使用（转交其他 skill）

- 普通单文件 PDF/Office 转 md：转 `markitdown`
- 大批量目录处理和 manifest：转 `markitdown-ingest`
- 需要编辑文件本体：转 `docx/pptx/xlsx/pdf`

## 依赖建议

建议安装全量 extras（或按需）：

```bash
"$PYTHON_SKILLS_VENV/bin/python" -m pip install "markitdown[all]"
```

常见能力对应：
- 音频转写：`[audio-transcription]`
- YouTube 转写：`[youtube-transcription]`
- 旧版 Excel：`[xls]`
- Doc Intelligence：`[az-doc-intel]`

## 常用命令模板

```bash
# 启用插件
"$PYTHON_SKILLS_VENV/bin/markitdown" --use-plugins "/data/input/file.pdf" -o "/data/out/file.md"

# 列出插件
"$PYTHON_SKILLS_VENV/bin/markitdown" --list-plugins
```

Python API（LLM 客户端）示意：

```python
from markitdown import MarkItDown
from openai import OpenAI

md = MarkItDown(enable_plugins=True, llm_client=OpenAI(), llm_model="gpt-4o")
res = md.convert("input.jpg")
print(res.text_content)
```

## Azure Document Intelligence（可选）

CLI 路径：

```bash
"$PYTHON_SKILLS_VENV/bin/markitdown" "input.pdf" -o "out.md" -d -e "<document_intelligence_endpoint>"
```

## 验证

- 「把这个图片做 OCR 转 markdown」
- 「帮我把这个 YouTube 链接转成文本 markdown」
- 「对这批文件开启插件抽取」
