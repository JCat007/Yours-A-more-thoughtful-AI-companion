# AWS App Runner — Bella / assistant only

**Goal:** serve the web app with the default route going to `/bella`, and expose `/api/assistant/*` for chat.

**Assumptions:**

- `star-office-ui/` is not in GitHub or not deployed in this phase.
- Backend is this repo’s `backend/` (Express).
- Frontend is this repo’s `frontend/` (Vite/React).

---

## 0) Prerequisites (avoid “HTTP works but features don’t”)

App Runner must be able to reach the OpenClaw gateway on port **18789** over the network.  
If the gateway listens only on `127.0.0.1`, App Runner usually cannot connect.

---

## 1) Deploy backend on App Runner

1. AWS console → App Runner → Create service  
2. Source: **Code repository**  
3. Pick your GitHub repo and branch  
4. Build / start (adjust as needed):  
   - Build: `cd backend && npm install` then `cd backend && npm run build`  
   - Start: `cd backend && npm run start`  
5. Port: **3001** (matches default `PORT` in `backend/src/index.ts`)  
6. Environment variables (minimum):  
   - `PORT=3001`  
   - `TRUST_PROXY=1` (if behind a reverse proxy / CloudFront)  
   - `OPENCLAW_GATEWAY_URL=<reachable URL, e.g. http://<gateway-private-ip>:18789>`  
   - `OPENCLAW_GATEWAY_TOKEN=<matches openclaw.json>`  
   - `OPENCLAW_AGENT_ID=<matches agents in openclaw.json>`  
   - `STAR_OFFICE_MODULE_ENABLED=0` (do not register `/api/star-office`)  
   - `STAR_OFFICE_SYNC_ENABLED=0` (no `set_state` calls to an absent star-office-ui)  
7. After create, note the service URL, e.g. `https://xxxxxxxx.awsapprunner.com`

---

## 2) Deploy frontend — S3 + CloudFront

1. Build: `cd frontend && npm install && npm run build` (artifacts under `frontend/dist`).  
2. Upload `frontend/dist/*` to an S3 bucket.  
3. CloudFront: default origin = bucket.  
4. Add a behavior for `/api/*` with origin = App Runner hostname (`xxxxxxxx.awsapprunner.com`).  
5. SPA fallback: map **404** to `index.html` so client-side routes refresh correctly.

---

## 3) Default Bella route — frontend flag

- By default `/` redirects to `/bella`.  
- `/` shows the Star Office shell only if the build sets `VITE_ENABLE_STAR_OFFICE_UI=1`.

For this deployment (no star-office-ui): **do not** set `VITE_ENABLE_STAR_OFFICE_UI=1` in production builds.

---

## 4) Smoke tests (order matters)

1. Open `/` → expect redirect to `/bella`.  
2. Send a chat message → `/api/assistant/chat` returns content.  
3. Optional: file upload → `/api/assistant/upload-file` works.

---

## 5) Common failures

1. Chat errors / no response — check CloudFront `/api/*` → App Runner routing.  
2. Logs show OpenClaw gateway errors — verify network path and security groups between App Runner and gateway.  
3. Every request slow — confirm `STAR_OFFICE_MODULE_ENABLED=0` and `STAR_OFFICE_SYNC_ENABLED=0` when star-office-ui is absent.
