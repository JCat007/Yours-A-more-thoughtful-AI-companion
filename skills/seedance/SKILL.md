---
name: seedance
description: 使用火山引擎 Seedance 模型生成 AI 视频。支持文本生成视频（T2V）、图片生成视频（I2V）。触发场景：用户请求生成视频、制作视频、视频创作、拍视频、发视频等。
official: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["ARK_API_KEY","DOUBAO_API_KEY"]},"primaryEnv":"ARK_API_KEY"}}
---

# Seedance 视频生成

使用火山引擎 Seedance 模型生成高质量 AI 视频。

## 配置

- **API Key**: 从环境变量 `ARK_API_KEY` 或 `DOUBAO_API_KEY` 读取
- **Base URL**: `https://ark.cn-beijing.volces.com/api/v3`
- **参考图（可选）**: I2V 时通过命令行 `--image <path|url>` 传入（可多次传入多张以获得更丰富的画面参考）；若未传入，则读取环境变量 `BELLA_REFERENCE_IMAGE`。该 skill 脚本不对 `--image` 张数做硬性限制，但会把所有传入图片逐一加入请求；为了避免请求体过大/耗时，建议在业务侧对张数做上限（例如 <= 8）。若上层调用方仅提供 1 张参考图，则只使用这张（通常是上传/选择的第一张）。

## 何时使用

当用户请求生成视频时使用本技能，例如：
- 「拍个视频」「发视频」「来段视频」「录个视频」
- 「看看你在做什么」「在干嘛」（若需要视频形式）
- 「视频看看」「拍视频」「动起来」
- 与 seedream 相同场景，用户明确要视频时（自拍可图片也可视频）

## Mirror / Direct 模式

与 seedream 共用同一套逻辑，视频版：

| 模式 | 适合场景 | 触发关键词 | 提示词要点 |
|------|----------|------------|------------|
| **Mirror** | 全身、穿搭展示 | 穿什么、outfit、穿搭、全身、看看你的衣服 | 「全身」「展示穿搭」「自然走动或转圈」 |
| **Direct** | 特写、场景、在做什么 | 自拍、看看你、在干嘛、咖啡厅、沙滩、健身房 | 「近景」或具体场景（在咖啡厅喝咖啡、在沙滩等） |

## 基本用法

```bash
node "$SKILLS_ROOT/seedance/scripts/generate_video.js" \
  --prompt "年轻亚洲女性在咖啡厅喝咖啡，自然微笑" \
  --duration 5 \
  --output "$WORKSPACE/bella_video.mp4"
```

## Bella 自拍风格

生成 Bella 形象视频时，使用以下风格的提示词：
- 年轻亚洲女性、写实风格、自然动作
- **Mirror**：全身展示穿搭、自然走动或转圈、从头到脚可见
- **Direct**：近景或结合具体场景（在咖啡厅喝咖啡、在沙滩晒太阳、在健身房运动等）
