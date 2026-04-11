---
name: web-to-markdown
description: Convert a URL to clean Markdown text. Use when users want webpage content extraction, article cleanup, or URL-to-markdown output for summarization and RAG.
official: false
metadata: {"openclaw":{"requires":{"bins":["node"]}}}
---

# Web To Markdown

Convert webpage URLs into readable Markdown for downstream analysis.

## 触发意图

当用户提出以下诉求时使用本技能：
- 「把这个 URL 网页转成 markdown」
- 「抓取这篇文章正文」
- 「把网页内容提取出来给我总结」

## 输入

- 必填：`url`（HTTP/HTTPS）
- 可选：`--json`（输出结构化元数据）

命令示例：

```bash
node "$SKILLS_ROOT/web-to-markdown/scripts/url_to_markdown.mjs" "https://example.com/article"
node "$SKILLS_ROOT/web-to-markdown/scripts/url_to_markdown.mjs" "https://example.com/article" --json
```

## 输出

- 默认输出：纯 Markdown 文本
- `--json` 输出：
  - `ok`：是否成功
  - `strategy`：命中的抓取策略
  - `source`：最终抓取来源
  - `normalizedUrl`：归一化 URL
  - `markdown`：正文 Markdown
  - `error`：失败原因（仅失败时）

## 抓取策略

1. 默认先尝试 `r.jina.ai/http(s)://...` 直出 Markdown。
2. 若失败，尝试直连抓取 HTML，并做基础清洗后转 Markdown。
3. 若仍失败，输出明确错误并建议改用浏览器/登录态方案。

## 限制与失败处理

- 需要公网访问；内网、登录后页面、强反爬页面可能失败。
- 对于重 JS 渲染站点，本脚本可能只能拿到骨架 HTML。
- 失败时必须返回失败原因，避免静默空结果。
