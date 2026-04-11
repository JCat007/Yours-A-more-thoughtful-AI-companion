#!/usr/bin/env node
/**
 * 从 ~/.openclaw/openclaw.json 移除代理配置（国内模式不走代理）
 * 用法：node scripts/openclaw-remove-proxy.js
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.openclaw',
  'openclaw.json'
);

if (!fs.existsSync(configPath)) {
  console.error('未找到', configPath);
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(configPath, 'utf8'));
let changed = false;

if (j.env) {
  if (j.env.HTTP_PROXY) { delete j.env.HTTP_PROXY; changed = true; }
  if (j.env.HTTPS_PROXY) { delete j.env.HTTPS_PROXY; changed = true; }
}

if (j.skills?.entries?.weather?.env?.WEATHER_PROXY) {
  delete j.skills.entries.weather.env.WEATHER_PROXY;
  changed = true;
}

if (changed) {
  fs.writeFileSync(configPath, JSON.stringify(j, null, 2), 'utf8');
  console.log('已移除代理配置，请重启 Gateway');
} else {
  console.log('配置中无代理，无需修改');
}
