import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const BACKEND_API_KEY = (import.meta.env.VITE_BACKEND_API_KEY || '').trim();

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  if (BACKEND_API_KEY) {
    config.headers = config.headers || {};
    // For private/self-hosted setups only; never ship static secrets to public browsers.
    (config.headers as any)['x-api-key'] = BACKEND_API_KEY;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    const msg = err.message || '';
    const isHtmlResponse =
      (typeof data === 'string' && data.trim().toLowerCase().startsWith('<!doctype')) ||
      msg.includes('is not valid JSON');
    if (isHtmlResponse) {
      err.message =
        err.response?.status === 502 || err.response?.status === 504
          ? 'Backend is not responding. Make sure the backend (port 3001) is running.'
          : 'Server returned an HTML page. Ensure backend is running on port 3001 and CORS/proxy is correct.';
    }
    return Promise.reject(err);
  }
);

export default client;
