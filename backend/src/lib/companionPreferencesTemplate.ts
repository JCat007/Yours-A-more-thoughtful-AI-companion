/**
 * Default markdown for `companion/<userId>/preferences` when the page is first created.
 * Includes a structured basic profile block for gbrain retrieval.
 */
export function buildDefaultCompanionPreferencesMarkdown(): string {
  return `---
type: concept
title: Companion preferences
tags: [companion,bella,profile]
---

_(Bella companion memory — edit freely; Bella may retrieve snippets when companion memory is on.)_

## Basic profile（基础画像）

Optional fields you can fill; keep only what you are comfortable sharing.

| Field | Your value |
|-------|------------|
| Preferred name / 称呼 | |
| Pronouns / 代词 | |
| Gender / 性别 | |
| Birth date (YYYY-MM-DD) / 生日 | |
| Height / 身高 | |
| Weight / 体重 | |
| City or region / 所在地区 | |
| Timezone / 时区 | |
| Languages / 常用语言 | |
| Occupation or study / 职业或学业 | |
| Relationship status (optional) / 感情状态（可选） | |
| Diet, allergies, or exercise (optional) / 饮食、过敏或运动习惯（可选） | |
| Health context for chat only, not medical advice / 与健康相关的聊天背景（非医疗建议） | |
| Communication style (tone, length, formality) / 沟通偏好（语气、长短、正式度） | |

---

## Preferences & boundaries（偏好与边界）

| Topic | Notes |
|-------|-------|
| Topics to avoid | |
| Preferred topics | |

---

## Timeline

_(Below: lines appended by Bella “remember …” and auto-learn.)_

`;
}
