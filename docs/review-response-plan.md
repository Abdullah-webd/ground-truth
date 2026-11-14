# Plan: answering the school review (evidence, Aisha, Africa-first)

Status: plan for team review (2026-11-14). Nothing built yet.

**Deadline:** Space Apps 2026 runs 14–15 November. A third-party source says submissions close **15 November, 11:59 PM local time**; confirm this on the official local event page. The plan is tiered so the most important fixes land first, with time left for the video.

## The story we tell (positioning)

> **Ground Truth is an evidence-based Earth observation and environmental intelligence platform, built for Africa and open to the whole planet.** Ask Aisha, our AI analyst, any question about where you live, by voice or text. She answers only from NASA satellite records, shows you the evidence for every claim, and tells you plainly what is proven, what is only observed, and what is still uncertain.

The name *Ground Truth* is the promise: **every claim comes with its evidence.** We are not a chatbot with facts made up; Aisha can only say what the data and the statistics support, and you can check it.

## What the reviewer asked for, mapped to fixes

| # | Request | Where we are | Fix |
|---|---|---|---|
| A1 | Scientific credibility: datasets, sources, resolution, processing, methods; traceable and reproducible | Documented in `docs/methods.md`; partly in the app ("For scientists") | **Methods & Data page** in the app; **"Download the data"** on every finding (yearly values, test results, settings) |
| A2 | Validation: how is significance decided, what does "confidence" mean | Validated method, but the meaning of "proven" isn't stated | State it: **"Proven = 95 % confidence after correcting for testing the whole map."** Add a **95 % range on every rate**. Show the validation results (false alarms 3–8 % vs 5 % target; 6/6 published findings reproduced) |
| A3 | Innovation vs existing platforms | Not written down | Comparison table and positioning statement (below) |
| A4 | Local impact: communities, farmers, researchers, policymakers in Nigeria and Africa | Not shown | Africa-first defaults, Nigerian example questions, **"Who are you?" quick-starts** for each kind of person, Africa case studies |
| A5 | Groundwater: data and method | GRACE total land water, labelled "Underground water" (overstated); real footprint ~300 km | Rename honestly; add a real **Groundwater** layer from NASA GLDAS-2.2 (which assimilates GRACE) |
| A6 / B4 | Explainability; separate *observed changes*, *statistically established trends* and *possible explanations* | Plain findings exist, without this separation | Three labelled tiers everywhere (answers and case file); "what's uncertain" stated |
| B1 | Aisha's answers must come from the platform's data, with evidence | Numbers are already checked against the data, but the evidence isn't shown | **Evidence cards under every answer**, plus a "numbers checked" badge |
| B2/B3/B7 | Voice in the demo; one complete user journey; tell a story | Voice works; demo plan was feature-by-feature | One scripted journey: *"Is it getting drier in Abuja?"* (below), used in the demo and the trailer |
| B5 | Sources and the period covered, always visible | In "For scientists" only | Every evidence card and finding shows the **source and years** |
| B6 | Farmer, student, researcher, journalist, policymaker | Not addressed | "Who are you?" quick-starts and a "Who it's for" section |
| UX | The AI assistant is hard to find at first glance | Our fault: it sits in a panel among other tools | **Aisha**, a visible character with a big Talk button on every screen; new phone layout (below) |
| Docs | Architecture, datasets, methods, limitations, future work | Spread over several files | One **Technical Report** page (printable to PDF) |

## 1. Evidence: "show me why" (the heart of Ground Truth)

Research note: people rarely click citation links, and links alone make answers look more trustworthy than they are ([NN/g](https://nngroup.com/articles/explainable-ai/)). Claim-level evidence placed right next to the text works best ([e-commerce grounding study](https://arxiv.org/abs/2503.04830v3)). So the evidence is **shown, not hidden behind links**.

Under each of Aisha's answers, automatically:
- **Evidence cards:** one per NASA record she used, each showing:
  - the tier label: **Observed change**, **Proven trend** or **Not proven**
  - the finding in plain words
  - **the source** (for example "NASA GPM IMERG rainfall") and **the years** (2001–2024)
  - the rate with its 95 % range
  - "the chance it's luck"
  - a mini chart
  - buttons: **Show on the map** and **Download the data**
- **A "✓ 9 numbers checked against NASA data" badge.** Any number that couldn't be matched is flagged visibly.
- **Possible explanations** appear in a separate box, marked **"Possible explanation, not tested by Ground Truth"**, so cause is never mixed with evidence.

Aisha's instructions change to answer in that structure: *what the data shows* → *what is proven* → *what it could mean* → *what's uncertain*.

**The three tiers, used everywhere:**

| Tier | Meaning | Example |
|---|---|---|
| **Observed change** | Something the satellites recorded, not tested as a long-term trend | "Trees became buildings here between 2018 and 2024"; "this month was 2.6 °C hotter than usual" |
| **Proven trend** | A long-term change that passed the significance test (95 % confidence, whole-map corrected) | "Getting hotter: +0.25 °C per decade since 1980, likely +0.20 to +0.30" |
| **Possible explanation** | A plausible reason, *not* established by our data | "Expanding built-up areas can make local temperatures rise" |

## 2. Aisha: an assistant you can't miss

**Name:** Aisha. It's a familiar name across Nigeria and much of Africa, and it means *alive*, which fits a living planet. She is clearly labelled as an AI ("Aisha, AI analyst"), so nobody mistakes her for a person.

**Character:** an **original** mascot. The robot in the WhatsApp screenshot belongs to another product, so it's inspiration only. My suggestion: a small round "field-scientist" satellite-bot in Ground Truth's colours, with the yellow highlighter as her visor, drawn and animated in code (SVG). That keeps her crisp at any size, fast, and able to react:
- idle: gentle float
- listening: her visor pulses with your voice
- thinking: an orbit spinner
- speaking: wave bars

Higgsfield can make promo art of her for the trailer and the landing page later.

**Desktop:** the left panel becomes **"Aisha"** with her face, a large **Talk to Aisha** button and the text box at the top. The other tools (Go to a place, change scan, opposite trends) move into a collapsible **"More tools"** section below. On the landing page, she appears next to "Open the globe" ("Ask Aisha anything").

**Phones (a new layout, replacing what we built):**
- **The map is the whole screen.** No panel is open by default.
- **One big Aisha button** floats at the bottom centre, which you can't miss. **Tap = talk** (voice first); a small keyboard icon beside it means type.
- While you talk, Aisha's character, the live transcript and her answer (with evidence cards) slide up in a sheet. The map flies to the place you asked about.
- **The sheet can be dragged all the way off the screen** to see just the map; Aisha's button remains.
- Layers stays as is. "More tools" lives inside the sheet.

**Persona quick-starts** (onboarding and point B6): the first time you open the globe, Aisha asks *"Who are you?"* with five chips: **Farmer, Student, Researcher, Journalist, Policymaker**. Each chip offers three starter questions suited to that person, with Nigeria and Africa first. For example:
- **Farmer:** "Is the rainy season in Kano getting drier?"; "Was this month hotter than normal in Kaduna?"
- **Journalist:** "Is Lagos really losing its green spaces?"
- **Policymaker:** "Which parts of northern Nigeria are proven to be warming fastest?"
- **Researcher:** "Show me where groundwater is proven to be falling in Africa", plus downloads
- **Student:** "Is Lake Chad really shrinking?"

## 3. Africa-first (while supporting everywhere)

- The globe opens on Africa, and the example questions are Nigerian and African first.
- Landing page: "Built for Africa. Works for the whole planet." Plus an **Africa case-studies** strip: Lagos (green cover loss and warming), Abuja (growth and drying signals), Kano (farm rainfall), Lake Chad (water), the Sahel (rainfall recovery). All use our real numbers.
- "Who it's for" section: a farmer, a student, a researcher, a journalist and a policymaker in Nigeria, each with what they would check and what it tells them.

## 4. Groundwater, done properly

**Facts:** NASA's GRACE satellites measure changes in **all water stored in the land** (groundwater, soil moisture, rivers and lakes, snow and ice) by weighing it through gravity, at roughly **300 km** real resolution. Groundwater has to be separated out. The standard method subtracts soil moisture, snow and canopy water from a land model, NASA GLDAS ([Rodell et al. 2009](https://new.fore.yale.edu/files/Rodell_Velicogna_Famiglietti.pdf); [Tiwari et al. 2009](https://geodynamicsprogram.whoi.edu/wp-content/uploads/sites/14/2018/10/tiwari_et_al.2009_117064.pdf)).

**Fix:**
1. Rename the GRACE layer **"Water stored in the land (GRACE)"**, and explain what it includes and its ~300 km footprint.
2. Add a **"Groundwater (NASA GLDAS-2.2)"** layer. GLDAS-2.2 is NASA's land model that **assimilates GRACE**, and gives groundwater storage directly (`GWS_tavg`, mm, ~28 km grid, daily, 2003 to August 2026, in Earth Engine). We build annual means from 2003 to 2025, run the same trend test, and check it reproduces the known north-west India decline.

This adds GLDAS, a model the challenge names, as a fifth NASA record.

## 5. Methods & Data page and Technical Report

A public page in the app (`/methods`) with:
- **Every dataset:** name, provider, version, link or DOI, spatial resolution (native vs shown), time span, update cadence.
- **The processing steps:** for example yearly means, grid, masks for years with too few months.
- **The statistics,** in plain words and in technical terms: Mann-Kendall test, Theil-Sen rate and 95 % range, correction for year-to-year persistence, correction for testing the whole map, what "proven" means.
- **The validation:** the simulation results and the six published findings it reproduces.
- **How Aisha stays honest:** tool-only answers, number checking, and the 18-question evaluation.
- **Limitations:** grid sizes, record lengths, GRACE's coarse footprint, clouds, no claims of cause.
- **Architecture and future work.**

It can be printed to PDF as the Technical Report for the school and the judges.

## 6. What makes us different (innovation)

| | Digital Earth Africa | Global Forest Watch | NASA Giovanni / Worldview | Google Earth AI | **Ground Truth** |
|---|---|---|---|---|---|
| Who it's for | Analysts and coders (maps, Python Sandbox) | Forest monitoring | Scientists | Enterprises and US Pro users | **Anyone: farmers to policymakers** |
| Plain-language / voice | No | No | No | Text AI (Gemini) | **Voice and text, plain English** |
| Tests whether a trend is real (significance, whole-map corrected) | No built-in trend test that we found | Alerts, not trend tests | Plots and maps; no trend significance test in its user guide | Not published | **Yes, validated** |
| Finds change without choosing a variable first | Change detection per dataset | Forest only | No | Yes | **Yes (AlphaEarth), then names it and tests it with NASA records** |
| Evidence shown for every AI claim | n/a | n/a | n/a | Not shown | **Yes: evidence cards, numbers checked** |
| Africa focus | Yes | Global | Global | Global | **Africa-first, global** |

Sources:
- [Digital Earth Africa platform](https://digitaltwins.iwmi.org/wp-content/uploads/2025/10/DEAfrica_platform.pdf)
- [GFW integrated alerts](https://www.globalforestwatch.org/blog/data-and-tools/integrated-deforestation-alerts)
- [Giovanni user guide](https://giovanni.gsfc.nasa.gov/giovanni/doc/UsersManualworkingdocument.docx.html)
- [Google Earth AI geospatial reasoning](https://research.google/blog/google-earth-ai-unlocking-geospatial-insights-with-foundation-models-and-cross-modal-reasoning/)

Phrasing in the pitch stays careful: "no built-in trend significance test that we could find", not "they can't".

## 7. The one complete user journey (for the demo and the trailer)

> A farmer near Abuja taps **Aisha** and asks out loud: *"Is it getting drier where I farm, near Abuja?"*

1. The map flies to Abuja. Aisha says she's checking NASA rainfall, plant and temperature records.
2. Aisha answers in a few plain sentences, and the **evidence cards** appear:
   - **Observed change:** this season's rain compared with normal (NASA POWER)
   - **Rainfall:** whether the long-term trend is proven (NASA GPM, 2001–2024, with the range and the chance it's luck)
   - **Plant greenness** and **temperature:** proven or not
   - **Possible explanation:** clearly marked as untested.
3. The farmer taps **Show on the map** (the rainfall trend map) and sees the evidence for themselves, or **Download the data**.
4. Aisha says what is still uncertain, and what it may mean for planting.

We pick the place (Abuja or Lagos) whose real numbers tell the clearest story, and add it to Aisha's test set so it's reliable on demo day.

## Priorities for the deadline

**Tier 1, must ship (about 8 hours):**
1. Evidence cards, three-tier labels and the numbers-checked badge; Aisha's new answer structure.
2. Aisha: name, original animated character, discoverable everywhere; new phone layout (big Aisha button, sheet can disappear).
3. Groundwater renamed honestly, with an explanation.
4. A 95 % range on every rate, and "what proven means".
5. The Methods & Data page, plus Download the data.
6. Africa-first copy, Nigerian example questions, persona quick-starts.
7. The demo journey tested and added to the evaluation.

**Tier 2, if time (about 3–4 hours):** the GLDAS groundwater layer; the Africa case studies on the landing page; the Technical Report PDF.

**Then the trailer**, rebuilt around the one journey with Aisha (about 3–4 hours including your recordings).

**After the hackathon:** answers in Hausa, Yoruba, Igbo and Pidgin; alerts for farmers (SMS or WhatsApp); more variables (soil moisture, evapotranspiration, air quality); partnerships (for example NiMet, Digital Earth Africa).
