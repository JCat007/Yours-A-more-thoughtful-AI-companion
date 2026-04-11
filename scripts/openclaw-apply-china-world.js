#!/usr/bin/env node
/**
 * 将 openclaw-china-world 配置合并到 ~/.openclaw/openclaw.json
 * 国内模式：minimax-cn (api.minimaxi.com)，不走代理
 * 国际模式：openai-codex 主 + minimax-global 替补 (api.minimax.io)
 *
 * 用法：node scripts/openclaw-apply-china-world.js
 */

const fs = require('fs');
const path = require('path');

const OPENCLAW_DIR = process.env.HOME ? path.join(process.env.HOME, '.openclaw') : path.join(process.env.USERPROFILE || '', '.openclaw');
const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const BACKUP_PATH = path.join(OPENCLAW_DIR, 'openclaw.json.bak.' + Date.now());
const TEMPLATE_PATH = path.join(__dirname, '../docs/templates/openclaw-china-world.json');

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('未找到 ~/.openclaw/openclaw.json，请先运行 openclaw onboard 或创建配置');
    process.exit(1);
  }

  const current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

  // 替换模板占位符
  const workspace = current.agents?.defaults?.workspace || path.join(OPENCLAW_DIR, 'workspace');
  const skillsRoot =
    current.skills?.entries?.['web-to-markdown']?.env?.SKILLS_ROOT ||
    path.join(OPENCLAW_DIR, 'skills');
  const minimaxKey = current.env?.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || '请替换';
  const doubaoKey = current.env?.DOUBAO_API_KEY || process.env.DOUBAO_API_KEY || '请替换';

  const replace = (obj) => {
    if (typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'string') {
        obj[k] = obj[k]
          .replace('REPLACE_WORKSPACE', workspace)
          .replace('REPLACE_SKILLS_ROOT', skillsRoot)
          .replace('REPLACE_MINIMAX_KEY', minimaxKey)
          .replace('REPLACE_DOUBAO_KEY', doubaoKey);
      } else {
        replace(obj[k]);
      }
    }
  };
  replace(template);

  // 深度合并：template 覆盖 current，但保留 current 中 template 没有的顶级键
  const merged = { ...current };

  if (template.models) {
    merged.models = { ...current.models, ...template.models };
    const providers = { ...(current.models?.providers || {}) };
    delete providers.minimax; // 用 minimax-cn / minimax-global 替代
    merged.models.providers = { ...providers, ...(template.models?.providers || {}) };

    // 强制覆盖关键模型字段，避免 shallow/deep merge 在某些结构上失效导致仍停留在旧模型版本（如 M2.5）。
    if (template.models?.providers?.['minimax-cn']) {
      merged.models.providers = merged.models.providers || {};
      merged.models.providers['minimax-cn'] = {
        ...(merged.models.providers['minimax-cn'] || {}),
        ...template.models.providers['minimax-cn'],
        // models 数组通常是唯一差异点（MiniMax-M2.5 vs MiniMax-M2.7），直接用模板值确保正确
        models: template.models.providers['minimax-cn'].models,
      };
    }
    if (template.models?.providers?.['minimax-global']) {
      merged.models.providers = merged.models.providers || {};
      merged.models.providers['minimax-global'] = {
        ...(merged.models.providers['minimax-global'] || {}),
        ...template.models.providers['minimax-global'],
        models: template.models.providers['minimax-global'].models,
      };
    }
  }

  if (template.agents) {
    merged.agents = { ...current.agents, ...template.agents };
    if (template.agents.list) {
      merged.agents.list = template.agents.list;
    }
    if (template.agents.defaults) {
      merged.agents.defaults = { ...(current.agents?.defaults || {}), ...template.agents.defaults };
    }

    // 强制覆盖 agents 默认模型与 main-* 列表中的 primary/fallbacks（防止合并后仍停留旧模型）
    if (template.agents?.defaults?.model?.primary) {
      merged.agents.defaults = merged.agents.defaults || {};
      merged.agents.defaults.model = merged.agents.defaults.model || {};
      merged.agents.defaults.model.primary = template.agents.defaults.model.primary;
    }
    if (Array.isArray(template.agents?.list)) {
      merged.agents.list = Array.isArray(merged.agents.list) ? merged.agents.list : [];
      for (const t of template.agents.list) {
        if (!t?.id || !t?.model) continue;
        const idx = merged.agents.list.findIndex((x) => x?.id === t.id);
        if (idx >= 0) {
          merged.agents.list[idx] = {
            ...merged.agents.list[idx],
            ...t,
            model: {
              ...(merged.agents.list[idx]?.model || {}),
              ...t.model,
            },
          };
        }
      }
    }
  }

  if (template.env) {
    merged.env = { ...current.env, ...template.env };
    // 国内模式：移除代理
    delete merged.env.HTTP_PROXY;
    delete merged.env.HTTPS_PROXY;
  }

  // 确保 OpenAI 兼容聊天端点开启；否则 /v1/chat/completions 会 404。
  merged.gateway = { ...(current.gateway || {}) };
  merged.gateway.http = { ...((current.gateway || {}).http || {}) };
  merged.gateway.http.endpoints = { ...(((current.gateway || {}).http || {}).endpoints || {}) };
  merged.gateway.http.endpoints.chatCompletions = {
    ...((((current.gateway || {}).http || {}).endpoints || {}).chatCompletions || {}),
    enabled: true,
  };

  if (template.skills?.entries) {
    merged.skills = merged.skills || { install: {}, entries: {} };
    merged.skills.entries = { ...(current.skills?.entries || {}), ...template.skills.entries };
    // 移除 weather 的 WEATHER_PROXY（国内不走代理）
    if (merged.skills.entries.weather?.env) {
      delete merged.skills.entries.weather.env.WEATHER_PROXY;
    }
  }

  // 默认用托管 Chromium（openclaw profile），避免模型优先走 user/Chrome MCP；与 Bella 后端浏览器失败重试策略一致
  if (template.browser && typeof template.browser === 'object') {
    merged.browser = { ...(current.browser || {}), ...template.browser };
  }

  fs.writeFileSync(BACKUP_PATH, fs.readFileSync(CONFIG_PATH));
  console.log('已备份到', BACKUP_PATH);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log('已更新 ~/.openclaw/openclaw.json');
  console.log('');
  console.log('国内模式：main-china，minimax-cn (api.minimaxi.com)，无代理');
  console.log('国际模式：main-world，openai-codex 主 + minimax-global 替补');
  console.log('');
  console.log('请重启 Gateway: openclaw gateway stop && openclaw gateway --port 18789');
}

main();
