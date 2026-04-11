#!/usr/bin/env node
/**
 * Bella 终端对话 CLI
 * 用法：node scripts/bella-cli.js
 * 需后端已启动（port 3001）
 */
const readline = require('readline');
const http = require('http');

const API_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const history = [];

function post(path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, API_URL);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            if (res.statusCode >= 400) {
              reject(new Error(j.error || buf));
            } else {
              resolve(j);
            }
          } catch (e) {
            reject(new Error(buf || e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(360000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.write(data);
    req.end();
  });
}

async function chat(message) {
  const body = {
    message,
    history: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
  };
  const res = await post('/api/assistant/chat', body);
  history.push({ role: 'user', content: message });
  history.push({ role: 'assistant', content: res.reply });
  return res;
}

async function main() {
  console.log('========================================');
  console.log('  Bella 终端对话');
  console.log('  输入消息后回车，输入 /quit 或 /q 退出');
  console.log('  需后端已启动: ' + API_URL);
  console.log('========================================\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => rl.question('你: ', async (line) => {
    const msg = (line || '').trim();
    if (!msg) {
      prompt();
      return;
    }
    if (msg === '/quit' || msg === '/q') {
      console.log('再见～');
      rl.close();
      process.exit(0);
    }

    try {
      process.stdout.write('Bella: ');
      const res = await chat(msg);
      console.log(res.reply);
      if (res.imageUrl) console.log('\n[图片]', res.imageUrl);
      if (res.videoUrl) console.log('\n[视频]', res.videoUrl);
    } catch (e) {
      console.log('错误:', e.message);
    }
    console.log('');
    prompt();
  });

  prompt();
}

main().catch(console.error);
