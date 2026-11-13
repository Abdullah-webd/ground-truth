# Ground Truth: Research notes

Collected 2026-11-13. Everything marked **verified** was run against the live service from this machine with the team's accounts.

## 1. The challenge

- Official page: https://www.spaceappschallenge.org/2026/challenges/be-an-earth-system-trend-detective/
- The task: select variables measured by NASA missions or produced by NASA models, visualize how they change over time, and determine what is changing, where, how much, and whether the change is statistically significant. The brief notes that one variable can trend in opposite directions in different regions even when one process drives both.
- Official resource list (provided by the user from the challenge page): Giovanni, Hydrology Time Series, AppEEARS, NOAA CDO, a SeaWiFS chlorophyll significance-testing article, KNMI Climate Explorer, two articles on trend tests and significance, and CSA resources (RADARSAT, Geo.ca, SWOT, SAR tutorial). The list is a suggestion, not a requirement. We keep Giovanni for cross-checks and cite the significance articles.
- Event dates per third-party listings: 14–15 November 2026. Unverified: the rules on code written before the event starts.

## 2. Comparable projects (same challenge, public on GitHub)

| Project | What it does | Takeaway for us |
|---|---|---|
| [entitySource/trend_detective](https://github.com/entitySource/trend_detective) | Globe and map, 15 NASA variables 2003–2025, Mann-Kendall variants (Hamed-Rao, pre-whitening), Sen's slope, FDR correction, turning points, Monte Carlo false-alarm tests, validation against NSIDC and GISTEMP | Rigorous statistics are already table stakes. Our edge has to be discovery (finding change without picking a variable) plus the agent. Copy their idea of a public "checks" page. |
| [GOHSUNJIN/TerraTrend](https://github.com/GOHSUNJIN/TerraTrend) | 3D globe, 8 variables, Mann-Kendall | Globe + MK alone is common. |
| [Orion Space](https://nabeulislam.github.io/orion-space/) | "Earth Intelligence Agent" | AI agents are already in the field; ours must take real actions and show its numbers. |
| [rossycoder/terradetective-ai](https://github.com/rossycoder/terradetective-ai) | AI climate detective with NASA data | Same. |
| [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) | CesiumJS globe aggregating live public feeds; click-to-track, sensor shader looks, voice/text agent that drives the camera, share links | The interaction model we borrow: layers, fly-to, agent that operates the console, world-stable motion. MIT licensed. |
| NASA Worldview / Giovanni | Official layer viewer / time-series tool | What judges already know; we must do what they cannot (significance maps, discovery, divergence). |

No public entry found uses AlphaEarth embeddings to find change without choosing a variable first.

## 3. Data sources (all verified)

| Source | Access | Coverage verified | Use |
|---|---|---|---|
| AlphaEarth embeddings `GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL` | Earth Engine | 2017 → 2025, 64 bands (A00–A63), 10 m | Discovery: change score = 1 − dot(year A, year B) |
| Dynamic World `GOOGLE/DYNAMICWORLD/V1` | Earth Engine | 2015 → now, 9 class probabilities + label | "From → to" labels for each hotspot |
| MODIS NDVI `MODIS/061/MOD13A2` | Earth Engine | 2000-02 → 2026-10, 16-day, 1 km | Vegetation trend |
| GPM IMERG monthly `NASA/GPM_L3/IMERG_MONTHLY_V07` | Earth Engine | 1998-01 → 2025-09 | Rainfall trend |
| GRACE mascon `NASA/GRACE/MASS_GRIDS_V04/MASCON` | Earth Engine | 2002-04 → 2024-09, `lwe_thickness` | Land water storage trend |
| GISTEMP v4 gridded `gistemp1200_GHCNv4_ERSSTv5.nc.gz` | data.giss.nasa.gov, no login (HTTP 200) | 1880 → now, 2° | Temperature trend |
| NASA POWER API | power.larc.nasa.gov, no key | Monthly/daily point series since 1981; climatology endpoint | Click-anywhere temperature, "now vs normal" |
| NASA FIRMS | Map key, 5,000 requests / 10 min | 9,364 VIIRS NOAA-20 detections worldwide on 2026-11-13 | Live fires layer |
| NASA GIBS WMTS | No key | BlueMarble, MODIS/VIIRS true colour | Basemap and daily imagery |

Also available in Earth Engine if needed later: MODIS LST `MODIS/061/MOD11A2`, MERRA-2 `NASA/GSFC/MERRA/slv/2` (1980 →), GLDAS 2.1, FLDAS.

Gut-check results (2026-11-13):
- NASA POWER T2M, Lagos, 1981–2024: increasing, +0.17 °C/decade, Hamed-Rao modified MK p < 1e-6.
- AlphaEarth 2018 vs 2024, 30 km around Lagos: median change 0.033, 99th percentile 0.264, 0.7 % of area above 0.3; hotspots on the Lekki corridor and the northern urban fringe (plausible, not yet checked against imagery).

## 4. Statistics

- Mann-Kendall test for monotonic trend; Sen's slope for magnitude.
- Hamed & Rao (1998) variance correction for autocorrelation (pymannkendall `hamed_rao_modification_test`).
- Benjamini-Hochberg false discovery rate across grid cells (Wilks 2016, "The stippling shows statistically significant grid points", BAMS) to stop map-wide false positives.
- Validation targets: global-mean GISTEMP trend over the same period against NASA GISS's published figure; our vectorized MK against pymannkendall on sampled cells.

## 5. Stack versions (npm / PyPI, 2026-11-13)

cesium 1.147.0 · resium 1.28.0 · react 19.3.1 · vite 8.3.8 · tailwindcss 4.3.5 · gsap 3.15.1 · motion 14.13.0 · zustand 5.1.0 · @tanstack/react-query 5.107.1
fastapi 0.162.5 · uvicorn 0.54.0 · anthropic 2.8.0 · earthengine-api (installed) · xarray 2026.9.0 · netCDF4 1.7.5 · pymannkendall 1.4.3 · Python 3.12.14 · Node 24.19.0

## 6. Claude API

- Model: `claude-opus-5-5` (default for this project). Thinking is always on; control depth with `output_config.effort`. Forced `tool_choice` returns 400, so use `auto` plus `strict: true` tools. Include server-side `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Agent loop: Python SDK tool runner (`client.beta.messages.tool_runner`), streaming to the browser over Server-Sent Events.
- No Anthropic API key is configured on this machine yet.

## 7. Pitfalls found

- Large Earth Engine aggregations over whole collections time out (Dynamic World `aggregate_min` over the full collection did not return in 120 s). Always filter by region and date first.
- AlphaEarth has only 9 annual steps: use it for discovery, not for trend significance.
- Earth Engine `computePixels` has a per-request size limit; export global grids one year at a time.
- Running `earthengine authenticate --auth_mode=localhost` from Claude Code's shell coincided with the user being logged out of Claude Code. Do authentication in the user's own terminal only.
- Cesium's default imagery and terrain require a Cesium ion token; we use GIBS and other keyless tiles instead.
