// 测试启动脚本
console.log('开始测试启动...');
console.log('Node.js 版本:', process.version);
console.log('当前目录:', process.cwd());

try {
  require('dotenv').config();
  console.log('环境变量加载成功');
  console.log('PORT:', process.env.PORT);
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  
  const express = require('express');
  const app = express();
  const PORT = process.env.PORT || 3001;
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  app.listen(PORT, () => {
    console.log(`✅ 服务成功启动在 http://localhost:${PORT}`);
    console.log('测试完成，服务正在运行...');
  });
  
} catch (error) {
  console.error('❌ 启动失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}
