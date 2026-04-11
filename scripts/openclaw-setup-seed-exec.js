#!/usr/bin/env node
/**
 * 配置 OpenClaw 以允许 seedream/seedance 技能执行
 * - 创建/更新 ~/.openclaw/exec-approvals.json（autoAllowSkills + node allowlist）
 * - 在 openclaw.json 中设置 tools.exec（host=gateway，避免 sandbox 失败）
 *
 * 用法：node scripts/openclaw-setup-seed-exec.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OPENCLAW_DIR = process.env.HOME
  ? path.join(process.env.HOME, '.openclaw')
  : path.join(process.env.USERPROFILE || '', '.openclaw');
const EXEC_APPROVALS_PATH = path.join(OPENCLAW_DIR, 'exec-approvals.json');
const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const TEMPLATE_APPROVALS = path.join(__dirname, '../docs/templates/openclaw-exec-approvals.json');

function resolveNodePaths() {
  const paths = [];
  try {
    const out = execSync('which node 2>/dev/null || where node 2>nul', { encoding: 'utf8' });
    const p = out.trim().split('\n')[0]?.trim();
    if (p) paths.push(p);
  } catch {}
  // 常见路径（OpenClaw 与 setup 可能在不同环境，尽量多覆盖）
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const toAdd = [
    '/bin/sh',
    '/bin/bash',
    '/usr/bin/node',
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
  ];
  if (home) {
    toAdd.push(path.join(home, '.nvm', 'versions', 'node', '*', 'bin', 'node'));
    toAdd.push(path.join(home, '.fnm', 'node-versions', '*', 'installation', 'bin', 'node'));
  }
  for (const p of toAdd) {
    if (p && !paths.some((x) => x === p)) paths.push(p);
  }
  return paths;
}

function resolveCommonExecPaths() {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  const tryWhich = (bin) => {
    try {
      const p = execSync(`which ${bin} 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n')[0]?.trim();
      if (p) add(p);
    } catch {}
  };

  // Shells
  add('/bin/sh');
  add('/bin/bash');

  // Node runtime
  resolveNodePaths().forEach(add);

  // Python toolchain often used by PDF/docx flows
  ['python', 'python3', 'pip', 'pip3'].forEach(tryWhich);
  add('/usr/bin/python');
  add('/usr/bin/python3');
  add('/usr/local/bin/python');
  add('/usr/local/bin/python3');

  // Common converters/parsers used by document skills
  ['pandoc', 'soffice', 'libreoffice', 'pdftoppm', 'pdfinfo'].forEach(tryWhich);
  add('/usr/bin/pandoc');
  add('/usr/bin/soffice');
  add('/usr/bin/libreoffice');
  add('/usr/bin/pdftoppm');
  add('/usr/bin/pdfinfo');

  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    // User-level npm global binaries and Python virtualenvs.
    add(path.join(home, '.npm-global', 'bin', '*'));
    add(path.join(home, '.local', 'bin', '*'));
    add(path.join(home, '.venvs', '*', 'bin', '*'));

    // OpenClaw usually maintains its own venv under ~/.openclaw/venv.
    // PDF/docx flows often call python from this venv, so we must allow it.
    add(path.join(home, '.openclaw', 'venv', 'bin', '*'));
  }

  return out;
}

function main() {
  console.log('=== OpenClaw Seedream/Seedance Exec 配置 ===\n');

  // exec 安全等级：用于本地开发/排障时避免 allowlist 路径差异导致的“卡死”问题。
  // 默认 full；如你需要严格 allowlist，把环境变量改成 allowlist 即可。
  const execSecurity = process.env.OPENCLAW_EXEC_SECURITY || 'full';

  // 1. 创建 exec-approvals.json
  const execPaths = resolveCommonExecPaths();
  const template = JSON.parse(fs.readFileSync(TEMPLATE_APPROVALS, 'utf8'));

  let approvals = template;
  if (fs.existsSync(EXEC_APPROVALS_PATH)) {
    try {
      approvals = JSON.parse(fs.readFileSync(EXEC_APPROVALS_PATH, 'utf8'));
      console.log('已存在 exec-approvals.json，合并配置');
    } catch (e) {
      console.warn('无法解析现有 exec-approvals.json，使用模板');
    }
  }

  const ensureAgent = (id) => {
    if (!id) return;
    approvals.agents = approvals.agents || {};
    approvals.agents[id] = approvals.agents[id] || {};
    approvals.agents[id].security = execSecurity;
    approvals.agents[id].ask = 'off';
    approvals.agents[id].askFallback = 'allowlist';
    approvals.agents[id].autoAllowSkills = true;
    approvals.agents[id].allowlist = approvals.agents[id].allowlist || [];
  };

  const configuredAgentIds = new Set(['main', 'main-china', 'main-world']);
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const list = cfg?.agents?.list;
      if (Array.isArray(list)) {
        for (const a of list) configuredAgentIds.add(a?.id);
      }
    } catch {}
  }
  if (approvals?.agents && typeof approvals.agents === 'object') {
    for (const id of Object.keys(approvals.agents)) configuredAgentIds.add(id);
  }
  [...configuredAgentIds].forEach(ensureAgent);

  const norm = (p) => (p || '').replace(/\\/g, '/');
  const addToAllAgents = (pattern) => {
    for (const id of configuredAgentIds) {
      const list = approvals.agents[id].allowlist;
      const exists = list.some((e) => {
        const p = typeof e === 'string' ? e : e.pattern;
        return p && norm(p) === norm(pattern);
      });
      if (!exists) {
        list.push({ id: 'seed-' + id + '-' + Date.now().toString(36), pattern });
      }
    }
  };

  for (const p of execPaths) {
    addToAllAgents(p);
  }
  console.log('已添加可执行路径到 allowlist:', execPaths.length ? execPaths.join(', ') : '(无)');
  if (execPaths.length === 0) {
    console.warn('未解析到可执行路径，请手动在 exec-approvals.json 的 agents.main.allowlist 中添加二进制路径');
  }

  fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
  fs.writeFileSync(EXEC_APPROVALS_PATH, JSON.stringify(approvals, null, 2), 'utf8');
  console.log('已写入 ~/.openclaw/exec-approvals.json\n');

  // 2. 更新 openclaw.json：tools.exec
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('未找到 openclaw.json，跳过 tools.exec 配置');
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.tools = config.tools || {};
  // Keep existing optional fields, but force the key safety defaults.
  config.tools.exec = {
    ...(config.tools.exec || {}),
    host: 'gateway',
    security: execSecurity,
    ask: 'off',
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log(`已更新 openclaw.json：tools.exec.host=gateway, security=${execSecurity}, ask=off`);

  // 3. 确保 seedream/seedance 有 ARK_API_KEY（从 DOUBAO_API_KEY 继承）
  const doubaoKey = config.env?.DOUBAO_API_KEY || process.env.DOUBAO_API_KEY;
  if (doubaoKey && config.skills?.entries) {
    for (const name of ['seedream', 'seedance']) {
      if (config.skills.entries[name]) {
        config.skills.entries[name].env = config.skills.entries[name].env || {};
        if (!config.skills.entries[name].env.ARK_API_KEY) {
          config.skills.entries[name].env.ARK_API_KEY = doubaoKey;
          console.log(`已为 ${name} 设置 ARK_API_KEY`);
        }
      }
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  }
  console.log('');

  console.log('完成。请重启 OpenClaw Gateway:');
  console.log('  openclaw gateway stop');
  console.log('  openclaw gateway --port 18789');
}

main();
