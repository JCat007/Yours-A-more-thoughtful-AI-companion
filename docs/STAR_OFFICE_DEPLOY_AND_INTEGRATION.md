# Star Office UI Production Deploy And Integration

This guide gives you:
- A production startup path (`gunicorn` + `systemd`)
- A container startup path (`Docker Compose`)
- A practical plan to integrate `star-office-ui` into your main frontend in a modular way

## 1) Production startup with systemd

### Files added
- `star-office-ui/backend/wsgi.py`
- `star-office-ui/backend/requirements-prod.txt`
- `star-office-ui/backend/run-prod.sh`
- `star-office-ui/deploy/systemd/star-office-ui.service`
- `star-office-ui/deploy/systemd/install-systemd.sh`

### Quick steps
1. Ensure script executable:
   - `chmod +x star-office-ui/backend/run-prod.sh`
   - `chmod +x star-office-ui/deploy/systemd/install-systemd.sh`
2. Install service:
   - `cd star-office-ui`
   - `./deploy/systemd/install-systemd.sh <linux-user> <absolute-path-to-star-office-ui>`
3. Check logs:
   - `sudo journalctl -u star-office-ui -f`

### Notes
- Set strong values for:
  - `FLASK_SECRET_KEY`
  - `ASSET_DRAWER_PASS`
- If needed, override env safely:
  - `sudo systemctl edit star-office-ui`

---

## 2) Production startup with Docker Compose

### Files added
- `star-office-ui/deploy/docker/Dockerfile`
- `star-office-ui/deploy/docker/docker-compose.yml`

### Quick steps
1. Ensure runtime files exist (copy from `*.sample.json` if missing):
   - `state.json`
   - `agents-state.json`
   - `join-keys.json`
   - `asset-positions.json`
   - `asset-defaults.json`
   - `runtime-config.json`
2. Start:
   - `cd star-office-ui/deploy/docker`
   - `docker compose up -d --build`
3. Logs:
   - `docker compose logs -f star-office-ui`

### Notes
- Replace placeholder secrets in compose env before production.
- Exposed port: `19000`.

---

## 3) Should you integrate star-office-ui into your own frontend?

Short answer: **yes, usually better** for long-term maintenance.

### Why better
- One domain + one auth model
- Unified UI theme and component system
- Easier feature toggles and permission control
- Easier to remove/replace modules later

### Recommended modular structure

Keep `star-office-ui` as a bounded module, not a copy-paste blob:

- `frontend/src/modules/starOffice/`
  - `pages/OfficePage.tsx`
  - `components/OfficeCanvas.tsx`
  - `components/OfficePanels.tsx`
  - `components/OfficeSettings.tsx`
  - `services/officeApi.ts`
  - `types.ts`
  - `styles/office.css`

- `backend/src/modules/starOffice/`
  - `routes.ts`
  - `stateStore.ts`
  - `assetsService.ts`
  - `agentsService.ts`
  - `security.ts`

### Integration strategy (low-risk)
1. **Phase A (already in your project):** iframe embedding.
2. **Phase B:** extract API contract and move endpoints under your main backend router.
3. **Phase C:** gradually port UI pieces:
   - settings menu
   - panel cards
   - asset drawer
   - eventually replace iframe canvas wrapper
4. **Phase D:** retire standalone `star-office-ui` runtime.

### Make it easy to delete/modify later
- Keep module config in one file:
  - `frontend/src/modules/starOffice/config.ts`
- Do not hardcode paths/ports in components.
- Feature-flag entry route:
  - Backend: `STAR_OFFICE_MODULE_ENABLED=1` (registers `/api/star-office`)
  - Frontend: `VITE_ENABLE_STAR_OFFICE_UI=1` (`/` loads the office iframe shell)
- Keep API adapter thin (`officeApi.ts`) so backend endpoint changes don't leak into UI.

---

## 4) What to run today

If you want immediate stable production behavior with minimal changes:
- Use `systemd` + `gunicorn` now.
- Keep iframe integration short-term.
- Start Phase B/C refactor when UI changes become frequent.
