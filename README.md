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

## Data credits

NASA GISS GISTEMP v4; NASA MODIS MOD13C1 (LP DAAC); NASA GPM IMERG V07 (GES DISC); NASA JPL GRACE/GRACE-FO mascons; NASA POWER; NASA FIRMS; NASA GIBS imagery (Black Marble, Blue Marble). AlphaEarth Foundations satellite embeddings (Google DeepMind) and Dynamic World (Google, World Resources Institute) via Google Earth Engine. Sentinel-2 cloudless 2023 by EOX IT Services GmbH (contains modified Copernicus Sentinel data), CC BY-NC-SA 4.0. Place search © OpenStreetMap contributors (Nominatim).
