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
- NASA POWER T2M, Lagos, 1981–2024: increasing, +0.17 °C/decade, p < 1e-6 (Hamed-Rao at the time; the final method is in docs/methods.md).
- AlphaEarth 2018 vs 2024, 30 km around Lagos: median change 0.033, 99th percentile 0.264, 0.7 % of area above 0.3; hotspots on the Lekki corridor and the northern urban fringe (plausible, not yet checked against imagery).

## 4. Statistics

- Mann-Kendall test for monotonic trend; Sen's slope for magnitude.
- Autocorrelation correction: Hamed & Rao (1998) was planned; simulation showed inflated false alarms on short records, so we use a bias-corrected AR(1) variance correction (Yue & Wang 2004). Details in docs/methods.md.
- Benjamini-Hochberg false discovery rate across grid cells (Wilks 2016, "The stippling shows statistically significant grid points", BAMS) to stop map-wide false positives.
- Validation targets: global-mean GISTEMP trend over the same period against NASA GISS's published figure; our vectorized MK against pymannkendall on sampled cells.

## 5. Stack versions (npm / PyPI, 2026-11-13)

cesium 1.147.0 · resium 1.28.0 · react 19.3.1 · vite 8.3.8 · tailwindcss 4.3.5 · gsap 3.15.1 · motion 14.13.0 · zustand 5.1.0 · @tanstack/react-query 5.107.1
fastapi 0.162.5 · uvicorn 0.54.0 · openai 3.50.0 · earthengine-api (installed) · xarray 2026.9.0 · netCDF4 1.7.5 · pymannkendall 1.4.3 · Python 3.12.14 · Node 24.19.0

## 6. Agent model (OpenAI)

- Model: `gpt-5.6-terra` (user's choice; listed on the account alongside `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.5`).
- Responses API function calling with `strict: true` schemas, verified live: without instructions the model answered from memory in 12.9 s and called no tool; with analyst instructions it called `locate_place("Lagos, Nigeria")` in 4.8 s (effort low) and 2.4 s (effort medium).
- Key stored in `.env` as `OPENAI_API_KEY`.

## 7. Pitfalls found

- Large Earth Engine aggregations over whole collections time out (Dynamic World `aggregate_min` over the full collection did not return in 120 s). Always filter by region and date first.
- AlphaEarth has only 9 annual steps: use it for discovery, not for trend significance.
- Earth Engine `computePixels` has a per-request size limit; export global grids one year at a time.
- Running `earthengine authenticate --auth_mode=localhost` from Claude Code's shell coincided with the user being logged out of Claude Code. Do authentication in the user's own terminal only.
- Cesium's default imagery and terrain require a Cesium ion token; we use GIBS and other keyless tiles instead.

## Fire close-up, street-level imagery and place labels (research, 2026-11-14)

Question: can a user zoom into a fire like Google Maps (building level, with place names), and see the actual fire?

Tested in this session:
- **Google Maps 2D imagery via our Cesium ion token works.** Assets 3830182 (Satellite), 3830183 (Satellite with Labels), 3830184 (Roadmap), 3830185 (Labels Only), 3830186 (Contour) all return endpoints. Tiles fetched at z20 (Harrison St, San Francisco: identical cars to Google Maps), z19 (Ikeja rooftops), z18 (Supreme Court, Abuja), z17 (Pilbara fire site). Labels at z13 over Lagos show Agege, Ikeja, Egbeda, Oshodi, Maryland. Counts toward ion's shared Global Imagery quota (Bing + Google). Source: [Cesium blog](https://cesium.com/blog/2025/10/02/introducing-google-maps-2d-tiles/), [CesiumJS imagery](https://cesium.com/learn/cesiumjs-learn/cesiumjs-imagery/). Labels-only asset does not drape on 3D Tiles ([#12940](https://github.com/CesiumGS/cesium/issues/12940)); use Satellite with Labels.
- **Geostationary, every 10 minutes:** EUMETView WMS `mtg_fd:rgb_firetemperature` and `mtg_fd:rgb_truecolour` (Meteosat Third Generation, Africa/Europe), Fees none, AccessConstraints none; live image over Nigeria at 11:00 UTC showed burning in the north. NASA GIBS: `Himawari_AHI_Band3_Red_Visible_1km` (Asia/Australia), `GOES-East/West_ABI_FireTemp` and `GeoColor` (Americas); ~40 min latency, 1–2 km pixels.
- **Daily, 375 m:** GIBS `VIIRS_NOAA20/21_CorrectedReflectance_TrueColor` (today's date available): smoke plumes.
- **Every 2–3 days, 10–20 m:** Sentinel-2 (S2A/B/C). Planetary Computer STAC: Pilbara fire site imaged 2026-11-11 and 2026-11-09, L2A processed ~4 h after sensing; Lagos 2026-11-12 (72 % cloud). Planetary Computer tiler renders true colour and SWIR (B12/B8A/B04) tiles without a key. SWIR shows active fire fronts and burn scars through smoke, not through cloud ([Copernicus](https://dataspace.copernicus.eu/gallery/2024-8-20-wildfire-tracking-madeira)). GIBS HLS 30 m lags ~8 days.
- **Landsat 30 m active fire NRT** is North America only ([Earthdata](https://www.earthdata.nasa.gov/learn/blog/new-nrt-product-firms-landsat-active-fire-data)).
- **Reverse geocoding:** Nominatim (1 req/s, cache): Maiduguri fire point → "Gangamari, Shehuri North, Maiduguri, Borno"; Pilbara → "Fortescue, Western Australia". Cesium ion geocoder has no reverse mode.
- **Not feasible for free:** live sub-metre imagery of flames. Planet's free education tier has a 30-day delay ([Planet](https://planet.com/markets/education-and-research/)); tasked commercial imagery is paid.

Decision (proposed, not built): a "fire close-up" that layers (1) Google sub-metre imagery and labels for what is on the ground, (2) the latest 10-minute geostationary fire image for "now", (3) today's VIIRS true colour for smoke, (4) the newest Sentinel-2 fire-vision image with its date, plus a named location ("in Gangamari, Maiduguri, Borno").
