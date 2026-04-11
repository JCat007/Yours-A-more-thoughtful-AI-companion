---
name: seedream
description: 使用火山引擎 Seedream 模型生成 AI 图片。支持文本生成图片（T2I）、图片编辑（I2I）。触发场景：用户请求生成图片、发自拍、发图、看看你、来张照片等。
official: true
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["ARK_API_KEY","DOUBAO_API_KEY"]},"primaryEnv":"ARK_API_KEY"}}
---

# Seedream 图片生成

使用火山引擎 Seedream 模型生成高质量 AI 图片。

## 配置

- **API Key**: 从环境变量 `ARK_API_KEY` 或 `DOUBAO_API_KEY` 读取
- **Base URL**: `https://ark.cn-beijing.volces.com/api/v3`
- **参考图（可选）**: 可通过命令行 `--image <path|url>` 传入（可重复传入多张以获得多图融合/组图）；若未传入，则读取环境变量 `BELLA_REFERENCE_IMAGE`。若上层调用方仅提供 1 张参考图，则只使用这张（通常是上传/选择的第一张）。

## 何时使用

当用户请求生成图片时使用本技能，例如：
- 「发自拍」「发张图」「看看你」「来张照片」「你的样子」
- 「发照片」「发图」「看看你在做什么」「在干嘛」（若需要图片形式）
- 用户提到具体场景（如「在咖啡厅」「穿牛仔帽」「在沙滩」）时传入对应描述

## Mirror / Direct 模式

根据用户意图选择镜头风格：

| 模式 | 适合场景 | 触发关键词 | 提示词要点 |
|------|----------|------------|------------|
| **Mirror** | 全身照、穿搭展示 | 穿什么、outfit、穿搭、全身、看看你的衣服 | 「全身照」「展示穿搭」「从头到脚」 |
| **Direct** | 特写、近景、具体场景 | 自拍、看看你、在干嘛、咖啡厅、沙滩、微笑 | 「近景」「面部特写」或具体场景 |

## 基本用法

```bash
node "$SKILLS_ROOT/seedream/scripts/generate_image.js" \
  --prompt "年轻亚洲女性自拍，温暖微笑，室内 casual 场景，写实风格" \
  --output "$WORKSPACE/bella_selfie.png"
```

## Bella 自拍风格

生成 Bella 形象图片时，使用以下风格的提示词：
- 保持参考图中人物的面部特征和形象（若有参考图）
- 年轻女性、写实风格、柔和光线
- **Mirror**：全身照、展示穿搭、从头到脚可见
- **Direct**：近景自拍、面部特写，或结合具体场景（咖啡厅、沙滩、健身房等）
