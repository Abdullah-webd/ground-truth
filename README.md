# Ground Truth

**NASA Space Apps 2026 · Be An Earth System Trend Detective**

An AI analyst on a 3D globe. Ask a question in plain English or out loud. It finds where the land surface changed (without choosing a variable first), names what each place became, and proves whether NASA's long-term records show a statistically significant trend there.

- **Discovery:** AlphaEarth satellite embeddings (Google DeepMind) compare every 10 m patch of land between two years; Dynamic World labels say what it became ("water → built-up").
- **Proof:** NASA GISTEMP temperature, MODIS vegetation, GPM IMERG rainfall and GRACE/GRACE-FO water storage, tested with an autocorrelation-corrected Mann-Kendall test and false-discovery-rate control. Method and validation: [docs/methods.md](docs/methods.md).
- **Right now:** NASA POWER (last 30 days vs the 1991–2020 normal) and NASA FIRMS live fires.
- **Analyst:** OpenAI `gpt-5.6-terra` with read-only data tools; live voice with `gpt-realtime-2.1`. Every number in an answer is checked against the tool results.

Architecture and decisions: [ARCHITECTURE.md](ARCHITECTURE.md). Research and sources: [docs/research.md](docs/research.md).

## Run it

Needs Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 24, and:

1. A Google Earth Engine account. Authenticate once **in your own terminal**: `.venv/bin/earthengine authenticate`.
2. `.env` in the project root (copy `.env.example`):

| Variable | What it is |
|---|---|
| `EE_PROJECT` | Your Earth Engine Cloud project ID |
| `OPENAI_API_KEY` | For the text analyst and voice |
| `FIRMS_MAP_KEY` | Free NASA FIRMS key for live fires |
| `AGENT_MODEL` | Optional, default `gpt-5.6-terra` |
| `VOICE_MODEL` | Optional, default `gpt-realtime-2.1` |

```bash
make setup      # once
make pipeline   # once: builds the trend maps (~10 min)
make warm       # optional: pre-computes demo places
make dev        # backend on :8765, web app on http://localhost:5179
```

Then open http://localhost:5179. Use Chrome or Edge, and allow the microphone for voice.

## Test it

```bash
make test       # 40 offline tests + type-check
make test-live  # Earth Engine / NASA live tests
make eval       # 14 analyst questions, auto-graded (uses OpenAI credit)
make e2e        # browser walkthrough with screenshots (servers running)
```

## Credits and licences

- **NASA data:** GISTEMP v4 (GISS), MODIS Terra MOD13C1 (LP DAAC), GPM IMERG V07 and GLDAS-2.2 (GES DISC), GRACE/GRACE-FO JPL mascons, FIRMS VIIRS, NASA POWER, GIBS (Black Marble, Blue Marble).
- **Other data:** AlphaEarth Satellite Embedding (Google DeepMind) and Dynamic World (Google, WRI), CC BY 4.0, via Google Earth Engine (non-commercial / research use). Sentinel-2 cloudless 2023 by EOX (contains modified Copernicus Sentinel data), CC BY-NC-SA 4.0. Place names © OpenStreetMap contributors (ODbL), via OpenFreeMap; place search via Nominatim.
- **Maps and 3D:** CesiumJS (Apache 2.0). Terrain, Bing Maps aerial imagery and 3D buildings come from the Cesium ion free non-commercial tier, hence the "Upgrade for commercial use" notice on the map.
- **AI:** OpenAI models for Aisha's text answers and realtime voice.
- **Software:** React, TypeScript, Vite, Tailwind, GSAP, Motion, Lenis, TanStack Query, Zustand, Python, FastAPI, NumPy, SciPy, pyMannKendall, xarray, Earth Engine API. Fonts: Barlow Condensed and Public Sans (SIL OFL).
- **Hosting:** Railway.

The full list, ready for the NASA Space Apps References field, is in [docs/references.md](docs/references.md).

## Deploy (Railway)

Live: https://ground-truth-production-694ae5bd.up.railway.app

One service serves the API and the built web app (see `Dockerfile`). The Railway service is connected to this GitHub repository, and the computed trend maps (`data/derived`) are committed, so **pushing to `main` deploys**. After re-running `make pipeline`, commit `data/derived` and push.

Set these Railway variables: `OPENAI_API_KEY`, `FIRMS_MAP_KEY`, `CESIUM_ION_TOKEN`, `EE_PROJECT` (optional overrides: `AGENT_MODEL`, `VOICE_MODEL`, `LIMIT_*`). See `VERIFY.md` for the checks to run before and after each deploy.
