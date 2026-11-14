import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Aisha } from "../components/Aisha";
import { api } from "../lib/api";
import { navigate } from "../lib/router";

/**
 * Methods & Data: every dataset, how it is processed and tested, how we validated the test, how Aisha
 * stays honest, and what we can't tell. Readable by a judge; prints to PDF as the Technical Report.
 */

const DATASETS = [
  {
    name: "Surface temperature",
    product: "NASA GISS Surface Temperature Analysis (GISTEMP v4)",
    url: "https://data.giss.nasa.gov/gistemp/",
    native: "2° grid (1,200 km smoothing of station and ocean data)",
    shown: "2° (about 220 km)",
    years: "1980–2025",
    processing: "Annual mean temperature anomaly versus 1951–1980.",
  },
  {
    name: "Plant greenness",
    product: "NASA MODIS Terra Vegetation Indices (MOD13C1, collection 6.1)",
    url: "https://lpdaac.usgs.gov/products/mod13c1v061/",
    native: "0.05° (about 5.6 km), every 16 days",
    shown: "0.5° (about 55 km)",
    years: "2001–2025",
    processing: "Annual mean NDVI (0 = bare ground, about 0.9 = dense forest), averaged to 0.5°.",
  },
  {
    name: "Rainfall",
    product: "NASA GPM IMERG Final, monthly, version 07",
    url: "https://gpm.nasa.gov/data/imerg",
    native: "0.1° (about 11 km), monthly",
    shown: "0.5° (about 55 km)",
    years: "2001–2024",
    processing: "Monthly rates converted to millimetres and summed into annual totals, averaged to 0.5°.",
  },
  {
    name: "Water in the land",
    product: "NASA JPL GRACE and GRACE-FO mascons (RL06.3, v04)",
    url: "https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/",
    native: "about 3° mascons (≈300 km): the real footprint of the gravity measurement",
    shown: "0.5° grid, but each value describes the ≈300 km region around it",
    years: "2003–2023",
    processing:
      "Annual mean water-equivalent thickness (mm) of all water stored in the land: groundwater, soil moisture, rivers, lakes, snow and ice. Years with fewer than 9 months of data (the GRACE to GRACE-FO gap) are left out.",
  },
  {
    name: "Groundwater",
    product: "NASA GLDAS-2.2 Catchment Land Surface Model, daily, with GRACE data assimilation",
    url: "https://disc.gsfc.nasa.gov/datasets/GLDAS_CLSM025_DA1_D_2.2/summary",
    native: "0.25° model grid (≈28 km), but constrained by GRACE's ≈300 km footprint",
    shown: "0.5° (about 55 km)",
    years: "2003–2025",
    processing:
      "Annual mean groundwater storage (mm of water). GLDAS splits GRACE's total land water into soil moisture, snow, surface water and groundwater with a land-surface model (Li et al. 2019), the standard way to separate groundwater from GRACE.",
  },
  {
    name: "Weather now and recent months",
    product: "NASA POWER daily (MERRA-2 temperature, IMERG-based rainfall)",
    url: "https://power.larc.nasa.gov/",
    native: "0.5° × 0.625°, daily",
    shown: "the clicked point",
    years: "Last 30 days to 5 years, compared with 1991–2020",
    processing: "Observed only: compared with the 1991–2020 normal for the same days; never tested as a trend.",
  },
  {
    name: "Fires now",
    product: "NASA FIRMS active fires (VIIRS on NOAA-20)",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    native: "375 m",
    shown: "each detection, with its 375 m footprint up close",
    years: "Last 24 hours, refreshed every 10 minutes",
    processing: "Observed only.",
  },
  {
    name: "Where the land changed (not NASA)",
    product: "Google DeepMind AlphaEarth Foundations annual embeddings + Dynamic World land cover",
    url: "https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL",
    native: "10 m, yearly",
    shown: "patches over 0.05 km²",
    years: "2017–2025",
    processing:
      "Change score = 1 − cosine similarity of a pixel's embedding in two years; patches above 0.3 are mapped, named by their Dynamic World class before and after. Observed only: it finds where to look, NASA records test whether it matters.",
  },
];

const REFERENCES = [
  "Mann (1945) Econometrica 13, 245–259",
  "Sen (1968) JASA 63, 1379–1389",
  "Gilbert (1987) Statistical Methods for Environmental Pollution Monitoring",
  "Yue & Wang (2004) Water Resources Management 18, 201–218",
  "Benjamini & Hochberg (1995) JRSS B 57, 289–300",
  "Wilks (2016) BAMS 97, 2263–2273",
  "Rodell, Velicogna & Famiglietti (2009) Nature 460, 999–1002",
  "Li et al. (2019) Water Resources Research 55 (GLDAS-2.2 GRACE data assimilation)",
  "Velicogna et al. (2020) GRL 47, e2020GL087291",
  "Rantanen et al. (2022) Communications Earth & Environment 3, 168",
  "Chen et al. (2019) Nature Sustainability 2, 122–129",
  "Biasutti (2019) WIREs Climate Change 10, e591",
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="print-show break-inside-avoid border-t border-line pt-10"
    >
      <h2 className="atlas text-[clamp(30px,4vw,48px)] leading-[0.95] text-ink">{title}</h2>
      <div className="mt-5 flex flex-col gap-4 text-[16px] leading-relaxed text-ink/90">{children}</div>
    </motion.section>
  );
}

const pct = (v: number | undefined) => (v == null ? "n/a" : `${(v * 100).toFixed(1)} %`);

export default function Methods() {
  const checks = useQuery({ queryKey: ["checks"], queryFn: api.checks, staleTime: Infinity });
  const c = checks.data;
  const ours = c?.trend_tests ? (c.trend_tests as unknown as { false_alarm: Record<string, Record<string, number>>; power: Record<string, Record<string, number>> }) : null;
  const range = (rec?: Record<string, number>) => {
    if (!rec) return null;
    const vals = Object.values(rec);
    return [Math.min(...vals), Math.max(...vals)] as const;
  };
  const fa = ours ? range(ours.false_alarm["ours"] ?? ours.false_alarm[Object.keys(ours.false_alarm).find((k) => /ours/i.test(k)) ?? ""]) : null;
  const pw = ours ? range(ours.power["ours"] ?? ours.power[Object.keys(ours.power).find((k) => /ours/i.test(k)) ?? ""]) : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-3 backdrop-blur-sm print:hidden md:px-10">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/", e.nativeEvent);
          }}
          className="atlas text-[24px]"
        >
          Ground Truth
        </a>
        <div className="flex items-center gap-3 text-sm">
          <a
            href="/ground-truth-technical-report.pdf"
            download
            className="btn btn-quiet inline-flex h-10 items-center rounded-full border border-line px-4 text-ink"
          >
            Technical Report (PDF)
          </a>
          <a
            href="/explore"
            onClick={(e) => {
              e.preventDefault();
              navigate("/explore", e.nativeEvent);
            }}
            className="btn btn-accent inline-flex h-10 items-center rounded-full bg-accent px-4 font-semibold text-accent-ink"
          >
            Open the globe
          </a>
        </div>
      </nav>

      <main className="mx-auto flex max-w-[980px] flex-col gap-12 px-5 pb-24 pt-14 md:px-10">
        <header>
          <p className="text-sm font-medium text-muted">Methods, data and validation</p>
          <h1 className="atlas mt-2 text-[clamp(48px,8vw,104px)] leading-[0.88]">
            How Ground Truth <span className="mark">knows</span>
          </h1>
          <p className="mt-6 max-w-[720px] text-[19px] leading-relaxed text-muted">
            Ground Truth is an evidence-based Earth observation platform, built for Africa and open to the whole planet. Every finding is traceable to a NASA
            record, tested with a validated statistical method, and downloadable so anyone can check it. This page explains exactly how.
          </p>
        </header>

        <Section id="tiers" title="Three kinds of statement">
          <p>We never mix these up, in the app or in Aisha's answers:</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Observed change", "bg-panel-2", "Something satellites really recorded (this month's weather, land that turned into buildings, a fire). Real, but not a tested long-term trend."],
              ["Proven trend", "bg-mark text-on-mark", "A long-term change that passed our significance test at 95 % confidence, corrected for testing the whole map. Reported with its size and a 95 % range."],
              ["Possible explanation", "border border-dashed border-line", "A plausible reason why. Never established by our data, and always labelled as untested."],
            ].map(([t, cls, d]) => (
              <div key={t} className="rounded-xl border border-line p-4">
                <span className={`inline-block rounded px-2 py-0.5 text-[13px] font-semibold ${cls}`}>{t}</span>
                <p className="mt-2 text-[15px] leading-snug text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="data" title="The data">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-left text-[14px]">
              <thead className="bg-ground text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Record</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Native resolution</th>
                  <th className="px-3 py-2">Shown at</th>
                  <th className="px-3 py-2">Years</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.map((d) => (
                  <tr key={d.name} className="border-t border-line align-top">
                    <td className="px-3 py-2.5 font-semibold">{d.name}</td>
                    <td className="px-3 py-2.5">
                      <a href={d.url} target="_blank" rel="noopener" className="link">
                        {d.product}
                      </a>
                      <span className="mt-1 block text-[13px] text-muted">{d.processing}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{d.native}</td>
                    <td className="px-3 py-2.5 text-muted">{d.shown}</td>
                    <td className="tabular px-3 py-2.5 text-muted">{d.years}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[15px] text-muted">
            The long records are reduced to one value per year (which removes the seasons), on a common grid, with the ocean masked for land-only records.
            Data are read through Google Earth Engine and NASA's own services (POWER, FIRMS, GIBS).
          </p>
        </Section>

        <Section id="test" title="How a trend is tested">
          <p>
            <strong>In plain words:</strong> we ask how often pure luck would produce a pattern this steady. If it's rarer than 1 time in 20, even after
            allowing for the fact that one year tends to resemble the next and that we test thousands of places at once, we call it <span className="mark">proven</span>.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px]">
            <li>
              <strong>Direction:</strong> the Mann-Kendall test counts how often later years are higher than earlier ones (Mann 1945).
            </li>
            <li>
              <strong>Size:</strong> the Theil-Sen rate, the median of the slopes between every pair of years, robust to single extreme years (Sen 1968),
              reported per decade with a <strong>95 % range</strong> (Gilbert 1987).
            </li>
            <li>
              <strong>Persistence:</strong> climate series are "sticky", which makes plain tests over-confident. We estimate the year-to-year autocorrelation
              after removing a curve, correct it for short records, and widen the test accordingly (Yue & Wang 2004). The 95 % range uses the same widening, so
              range and verdict always agree.
            </li>
            <li>
              <strong>Worst case:</strong> we also compare against 20,000 simulated trend-free records at the strongest persistence we allow, and keep the more
              cautious answer.
            </li>
            <li>
              <strong>The whole map:</strong> testing thousands of places at once guarantees some flukes, so p-values are adjusted with the Benjamini-Hochberg
              false discovery rate (Wilks 2016). "Proven" means adjusted q &lt; 0.05.
            </li>
          </ol>
        </Section>

        <Section id="validation" title="How we know the test works">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-muted">On 1,500 simulated records per case</p>
              <p className="mt-1 text-[15px]">
                False alarms <strong className="tabular">{fa ? `${pct(fa[0])}–${pct(fa[1])}` : "3.2–7.9 %"}</strong> (target 5 %), real trends detected{" "}
                <strong className="tabular">{pw ? `${pct(pw[0])}–${pct(pw[1])}` : "63–100 %"}</strong>. Four common alternatives raised up to 39 % false alarms or
                missed most curved trends.
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-muted">Against published science</p>
              <ul className="mt-1 flex flex-col gap-1 text-[15px]">
                {(c?.regional ?? []).slice(0, 6).map((r: { title: string; passed: boolean | null }) => (
                  <li key={r.title} className="flex items-start gap-2">
                    <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${r.passed ? "bg-ok" : "bg-bad"}`} aria-hidden />
                    {r.title}
                  </li>
                ))}
                {c?.global_temperature && (
                  <li className="flex items-start gap-2">
                    <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.global_temperature.passed ? "bg-ok" : "bg-bad"}`} aria-hidden />
                    Global temperature trend matches NASA GISS
                  </li>
                )}
              </ul>
            </div>
          </div>
        </Section>

        <Section id="aisha" title="How Aisha stays honest">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <Aisha size={88} className="shrink-0" />
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px]">
              <li>She can only answer by calling Ground Truth's data tools; she is told never to answer from memory.</li>
              <li>Every answer shows its evidence cards: the NASA record, the years, the result and the data, built from the tool's own output.</li>
              <li>
                Every number she says is checked against the tool results; anything unmatched is flagged on screen. Tested on{" "}
                {c?.agent_eval ? `${c.agent_eval.total} questions (${c.agent_eval.passed} passed)` : "20 questions"}, including honesty about
                significance and never claiming a cause.
              </li>
              <li>She labels every claim as observed, proven or not proven, and marks possible explanations as untested.</li>
              <li>Voice uses the same tools and the same checks as text (OpenAI gpt-realtime).</li>
            </ul>
          </div>
        </Section>

        <Section id="limits" title="What we can't tell (yet)">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px]">
            <li>Grid squares are 55–220 km; GRACE's water footprint is about 300 km. A finding describes the area, not one farm or street.</li>
            <li>Records are 21–46 years long. Some real trends need longer records to be proven; "not proven" is not "no change".</li>
            <li>GRACE measures all water in the land together. Our groundwater layer is a model estimate (NASA GLDAS-2.2, constrained by GRACE), not a measurement of individual wells.</li>
            <li>
              GLDAS groundwater changes are often smaller than GRACE-only estimates (north-west India: −46 vs −267 mm per decade of total water), because the
              model assigns part of the change to soil moisture. Rely on the direction and the proven verdict more than the exact size.
            </li>
            <li>On short, strongly persistent records, false alarms can reach about 8 %.</li>
            <li>We show what changed and how surely, never why: causes need further science.</li>
            <li>Land change uses Google DeepMind's AlphaEarth (not NASA) and starts in 2017.</li>
          </ul>
        </Section>

        <Section id="africa" title="Built for Africa, open to the world">
          <p>
            Most climate platforms speak to specialists. Ground Truth speaks to the people living with the change, starting in Nigeria and across Africa: a
            farmer asking whether the rains are failing, a student checking a claim, a journalist verifying a story, a policymaker looking for proven trends by
            place, a researcher who wants the numbers and the method.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead className="bg-ground text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">Digital Earth Africa</th>
                  <th className="px-3 py-2">Global Forest Watch</th>
                  <th className="px-3 py-2">NASA Giovanni / Worldview</th>
                  <th className="px-3 py-2">Google Earth AI</th>
                  <th className="px-3 py-2">Ground Truth</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["Made for", "Analysts and coders", "Forest monitoring", "Scientists", "Enterprises, US Pro users", "Anyone, Africa-first"],
                  ["Plain language and voice", "No", "No", "No", "Text AI", "Voice and text"],
                  ["Tests whether a trend is real", "No built-in trend test found", "Alerts, not trend tests", "No trend significance test in its guide", "Not published", "Yes, validated, whole-map corrected"],
                  ["Evidence shown for every AI claim", "n/a", "n/a", "n/a", "Not shown", "Yes, numbers checked"],
                ].map((row) => (
                  <tr key={row[0]} className="border-t border-line">
                    {row.map((cell, i) => (
                      <td key={i} className={`px-3 py-2 ${i === 0 ? "font-semibold text-ink" : i === row.length - 1 ? "font-semibold text-ink" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="architecture" title="How it's built">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px]">
            <li>A data pipeline reads the NASA records through Google Earth Engine, reduces them to yearly grids, and runs the trend test on every grid square.</li>
            <li>A Python (FastAPI) service answers questions for a point or region, runs live land-change scans, and serves the evidence.</li>
            <li>A React web app with a Cesium 3D globe (flat map on phones), Google 3D cities, and OpenStreetMap place names.</li>
            <li>Aisha: an OpenAI model with strict tools, number checking, evidence cards, and an evaluation set; live voice over WebRTC.</li>
            <li>Code and method notes are kept in the project repository; the test results are recomputed whenever the pipeline runs.</li>
          </ul>
        </Section>

        <Section id="next" title="What comes next">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px]">
            <li>Answers in Hausa, Yoruba, Igbo and Pidgin.</li>
            <li>Alerts for farmers by SMS or WhatsApp when a season departs from normal.</li>
            <li>More records: soil moisture, evapotranspiration, air quality.</li>
            <li>Partnerships with African institutions (for example NiMet and Digital Earth Africa).</li>
          </ul>
        </Section>

        <Section id="refs" title="References">
          <ul className="flex flex-col gap-1 text-[14px] text-muted">
            {REFERENCES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}
