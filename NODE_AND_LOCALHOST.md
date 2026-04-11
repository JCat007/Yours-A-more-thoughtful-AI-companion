# Node.js and localhost access

## Node is already installed (example machine)

- **Node.js:** v24.11.1  
- **npm:** 11.6.2  

Other machines should install the current LTS from [nodejs.org](https://nodejs.org/) before running this project.

---

## Browser says “connection refused” for localhost

### 1) Confirm dev servers are running

After launching your bootstrap script (or manual `npm run dev`):

- Keep the terminal windows open—closing them stops the servers.  
- You should see logs similar to:
  - Backend: `Server` / `listening` on port **3001**  
  - Frontend: Vite **5173**

### 2) Try `127.0.0.1` instead of `localhost`

Some DNS/resolver setups break `localhost`:

- Frontend: `http://127.0.0.1:5173`  
- Backend health: `http://127.0.0.1:3001/health`

### 3) Wait a few seconds

The backend may start before Vite finishes compiling—wait ~5–10s after logs appear, then reload.

### 4) Check listening ports (Windows CMD)

```bat
netstat -ano | findstr "3001"
netstat -ano | findstr "5173"
```

No rows → process not listening; inspect the dev terminal for stack traces.

---

## Installing Node on a fresh PC

1. Download the **LTS** installer from [https://nodejs.org/](https://nodejs.org/).  
2. Install, then reboot (or at least open a new terminal).  
3. Run `node -v` — a version string means success.

---

## Summary

- Keep dev-server terminals alive.  
- Prefer `http://127.0.0.1:5173`.  
- If ports are closed, capture the terminal error output for debugging.
