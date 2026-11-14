# Verification map

Live URL: https://ground-truth-production-694ae5bd.up.railway.app
Code: https://github.com/Abdullah-webd/ground-truth (private)
Deploy: `railway up --no-gitignore -s ground-truth` (uploads code + data/derived + warm caches; see `.railwayignore`). The trend maps are git-ignored, so a GitHub-connected deploy would have no data.
Start for tests (production-style, one server): `make build` once, then `cd backend && WEB_DIST=../web/dist ../.venv/bin/uvicorn ground_truth.api:app --port 8790`

## Checks
- Static: `cd web && npx tsc -b && npx oxlint src && npm run build`; `cd backend && ../.venv/bin/python -m pytest -q`
- Smoke: `node ~/.claude/skills/ship-verify/scripts/smoke.mjs <url> --out .verify --paths /,/explore`
- Flows (web/e2e): `walkthrough.mjs <url>` (search, change scan, plant growth, play years, opposite trends, How we know, fires, landing → globe), `labels.mjs <url>` (names at 7 heights incl. tilted 3D city), `ask.mjs "<question>" <name> <url>`, `go.mjs <url>` (Go to a place → briefing + analyst), voice: `POST /api/voice/session` → 200
- Analyst quality: `cd backend && ../.venv/bin/python scripts/agent_eval.py` (18 questions)

## Critical flows
- Landing → Open the globe
- Click the globe or Go to a place → plain-English case file; Ask the analyst (text and voice)
- Scan for changes (demo places are cached; new places need Earth Engine credentials)
- Fires now → Fly to the biggest fire → fire card with nearest town
- Place names at every zoom; click a name → its report

## Known limits
- Earth Engine is not configured on Railway: saved change scans for the demo places work; scanning a brand-new place returns a clear 503 message.
- Rate limits (env, per visitor per hour / site per day): LIMIT_AGENT_* 40/1500, LIMIT_VOICE_* 8/150, LIMIT_CHANGE_* 30/600, LIMIT_LOCATE_* 120/5000.
- railway.json "config as code" is deprecated by Railway but works until 2026-12-01 (`railway config migrate`).
