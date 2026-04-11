import './loadEnv';
import express from 'express';
import cors from 'cors';
import { isGbrainEnabled } from './services/gbrainCli';
import assistantRouter from './routes/assistant';
import authRouter from './routes/auth';
import iflyRouter from './routes/ifly';
import asrRouter from './routes/asr';
import starOfficeRouter, { isStarOfficeModuleEnabled } from './modules/starOffice/routes';

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Upload API puts base64 in JSON bodies (~4/3 size inflation).
// Align default express.json limit with ASSISTANT_UPLOAD_MAX_BYTES so large uploads are not rejected at parse time.
const assistantMaxBytes = Number(process.env.ASSISTANT_UPLOAD_MAX_BYTES || 20 * 1024 * 1024);
const defaultJsonLimitMb = Math.ceil((assistantMaxBytes * 4) / 3 / 1024 / 1024 + 4);

// Behind Nginx/Cloudflare, set TRUST_PROXY=1 (or higher) so req.ip reflects the client for rate limiting.
if ((process.env.TRUST_PROXY || '').trim()) {
  const v = process.env.TRUST_PROXY!.trim();
  const n = Number(v);
  app.set('trust proxy', Number.isFinite(n) ? n : v);
}

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || `${defaultJsonLimitMb}mb` }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/asr', asrRouter);
app.use('/api/ifly', iflyRouter);
if (isStarOfficeModuleEnabled()) {
  app.use('/api/star-office', starOfficeRouter);
}

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listen on 0.0.0.0 so localhost / 127.0.0.1 both reach the dev server.
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
  console.log(`   Start the frontend (npm run dev), then open http://localhost:5173`);
  if (isGbrainEnabled()) {
    console.log('[gbrain] Companion memory is ON (GBRAIN_ENABLED). Ensure `gbrain` is on PATH and DB is inited.');
  } else {
    console.warn(
      '[gbrain] Companion memory is OFF. To enable: set GBRAIN_ENABLED=1 in backend/.env, install gbrain CLI, run `gbrain init` with the same DATABASE_URL as Bella, then restart the backend.'
    );
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the other process or change PORT in .env.`);
    process.exit(1);
  }
  throw err;
});
