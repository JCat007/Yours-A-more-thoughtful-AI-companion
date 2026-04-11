# OpenClaw PDF skill (LobsterAI origin)

Derived from [LobsterAI](https://github.com/netease-youdao/LobsterAI) (NetEase Youdao). Handles PDF text/table extraction, merge/split, forms, etc. **No bridge server** — OpenClaw runs Python via `exec`.

## Capabilities

- Extract text and tables  
- Merge / split PDFs  
- Fill PDF forms  
- Create PDFs, watermarks, passwords (per upstream scripts)

## vs `markitdown`

| Goal | Use |
|------|-----|
| Turn PDFs into **Markdown** / bulk text for the model | **markitdown** ([MarkItDown](https://github.com/microsoft/markitdown)) |
| **Merge/split**, **forms**, watermarks, scripted tables | **pdf** (LobsterAI) |

Scan quality depends on OCR stack; try both tools on difficult scans.

## China / World

`global: true` — same behavior in China and World; depends on local Python libs only.

---

## Install

### 1) Copy the skill into `~/.openclaw/skills`

**A — git (Linux/WSL/macOS)**

```bash
cd ~/.openclaw/skills
git clone --depth 1 https://github.com/netease-youdao/LobsterAI.git _lobster_temp
mv _lobster_temp/SKILLs/pdf pdf
rm -rf _lobster_temp
```

**B — sparse clone on Windows PowerShell**

```powershell
cd $env:USERPROFILE\.openclaw\skills
git clone --depth 1 --filter=blob:none --sparse https://github.com/netease-youdao/LobsterAI.git _lobster_temp
cd _lobster_temp
git sparse-checkout set SKILLs/pdf
cd ..
xcopy /E /I _lobster_temp\SKILLs\pdf pdf
rmdir /S /Q _lobster_temp
```

**C — ZIP download**

Download `SKILLs/pdf` from GitHub and copy into `~/.openclaw/skills/pdf`.

### 2) Python dependencies

Use the shared venv: `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`.

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install pypdf pdfplumber reportlab
```

Optional (scanned PDFs, Excel export):

```bash
"$PYTHON_SKILLS_VENV/bin/python" -m pip install pdf2image pytesseract pandas openpyxl pillow
```

`pdf2image` needs **poppler** on the PATH (Windows: conda or [poppler builds](https://github.com/oschwartz10612/poppler-windows/releases)).

### 3) Enable in `openclaw.json`

```json
{
  "skills": {
    "entries": {
      "pdf": {
        "enabled": true,
        "env": {
          "SKILLS_ROOT": "$HOME/.openclaw/skills",
          "PYTHON_SKILLS_VENV": "$HOME/.openclaw/venvs/python-skills"
        }
      }
    }
  }
}
```

### 4) Restart gateway

```bash
openclaw gateway --port 18789
```

---

## Verify

Ask Bella / OpenClaw to extract or merge PDFs (provide workspace paths or uploads depending on your client).

---

## Notes

1. **Exec policy** — sandboxing may block Python; tune `tools.exec` if needed.  
2. **Paths** — PDFs must be reachable from the workspace or uploaded through supported flows.  
3. **License** — upstream LobsterAI PDF skill is proprietary; read `LICENSE.txt` in the skill folder.

## References

- [LobsterAI `SKILLs/pdf`](https://github.com/netease-youdao/LobsterAI/tree/main/SKILLs/pdf)  
- [OpenClaw skills](https://docs.openclaw.ai/)  
- [SKILL_CONVENTION_CHINA_WORLD.md](SKILL_CONVENTION_CHINA_WORLD.md)
