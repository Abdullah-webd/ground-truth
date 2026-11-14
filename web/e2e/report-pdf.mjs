// Renders the Methods page to the downloadable Technical Report (public/ground-truth-technical-report.pdf).
// Usage: node e2e/report-pdf.mjs [baseUrl]   (run against the production build with the backend running)
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4179";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(base + "/methods", { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // live validation results
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: "public/ground-truth-technical-report.pdf",
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="font-size:8px;width:100%;text-align:center;color:#888">Ground Truth Technical Report, NASA Space Apps 2026. Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
});
await browser.close();
console.log("wrote public/ground-truth-technical-report.pdf");
