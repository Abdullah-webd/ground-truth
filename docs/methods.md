# Methods

## What "significant" means in Ground Truth

A change is called **statistically significant** when, after accounting for year-to-year persistence and for testing thousands of map cells at once, it is very unlikely to be produced by natural variability alone.

For every time series (a map cell, a clicked point, or a regional average) we compute:

1. **Direction:** the Mann-Kendall statistic S counts how often later years are higher than earlier years.
2. **Size:** the Theil-Sen slope, the median of the slopes between every pair of years, which ignores single extreme years. Reported per decade.
3. **Persistence correction:** climate series are "sticky" (a warm year tends to follow a warm year), which makes plain tests over-confident. We remove the Theil-Sen trend, estimate the lag-1 autocorrelation of what is left, correct that estimate for short-record bias, r' = (n·r + 1)/(n − 4) (Kendall 1954), clip it to [0, 0.95], and inflate the variance of S by the AR(1) effective-sample-size factor of Yue & Wang (2004).
4. **p-value:** two-sided, from the corrected Z score.
5. **Map-wide control:** across a map, p-values are converted to Benjamini-Hochberg q-values (Wilks 2016). A cell is significant when q < 0.05, so at most about 5 % of the highlighted cells are expected to be false discoveries.

Cells with fewer than 80 % valid years, fewer than 8 years, or a constant series are not tested and are shown as "no data".

Implementation: [backend/ground_truth/stats.py](../backend/ground_truth/stats.py). S, its tie-corrected variance, Kendall's tau and the Theil-Sen slope are tested to equal `pymannkendall.original_test`; the Benjamini-Hochberg step is tested against `statsmodels`.

## Choosing the test

We first planned the Hamed & Rao (1998) correction. A simulation (`backend/scripts/compare_trend_tests.py`, 1,500 replicates per case, seed 7) showed it raises too many false alarms on records as short as ours (21–45 years). We compared five methods on two measures:

- **False alarms:** how often a method flags a trend in data that has none (target: 5 %). Cases: 25 and 45 years, with year-to-year autocorrelation of 0, 0.3 and 0.6.
- **Power:** how often it detects a trend that is really there. Cases: a global-temperature-like trend, a strong short trend, a moderate trend, and a trend on autocorrelated noise.

| Method | False alarms (target 5 %) | Power |
|---|---|---|
| Original Mann-Kendall | 3.3–26.3 % | 90–100 % |
| Hamed-Rao, all lags | 7.1–22.1 % | 90–99 % |
| Pre-whitening (von Storch 1995) | 4.0–5.5 % | 27–76 % |
| Trend-free pre-whitening (Yue et al. 2002) | 5.3–34.7 % | 88–100 % |
| **Ours: bias-corrected variance correction** | **2.7–6.5 %** | **73–100 %** |

Only our method keeps false alarms near 5 % in every case while still detecting most real trends. Pre-whitening is equally well calibrated but misses a quarter to three quarters of strong trends, because removing autocorrelation from a trending series also removes part of the trend. The full numbers are in `data/derived/checks/trend_tests.json` and on the Checks page.

## References

- Kendall, M. G. (1954). Note on bias in the estimation of autocorrelation. *Biometrika* 41, 403–404.
- Mann, H. B. (1945). Nonparametric tests against trend. *Econometrica* 13, 245–259.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *JASA* 63, 1379–1389.
- Hamed, K. H. & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. *J. Hydrology* 204, 182–196.
- von Storch, H. (1995). Misuses of statistical analysis in climate research. In *Analysis of Climate Variability*, Springer.
- Yue, S., Pilon, P., Phinney, B. & Cavadias, G. (2002). The influence of autocorrelation on the ability to detect trend in hydrological series. *Hydrological Processes* 16, 1807–1829.
- Yue, S. & Wang, C. (2004). The Mann-Kendall test modified by effective sample size to detect trend in serially correlated hydrological series. *Water Resources Management* 18, 201–218.
- Wilks, D. S. (2016). "The stippling shows statistically significant grid points": how research results are routinely overstated and overinterpreted, and what to do about it. *BAMS* 97, 2263–2273.
- Benjamini, Y. & Hochberg, Y. (1995). Controlling the false discovery rate. *JRSS B* 57, 289–300.
