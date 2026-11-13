# Methods

## What "significant" means in Ground Truth

A change is called **statistically significant** when, after accounting for year-to-year persistence and for testing thousands of map cells at once, it is very unlikely to be produced by natural variability alone.

For every time series (a map cell, a clicked point, or a regional average) we compute:

1. **Direction:** the Mann-Kendall statistic S counts how often later years are higher than earlier years.
2. **Size:** the Theil-Sen slope, the median of the slopes between every pair of years, which ignores single extreme years. Reported per decade.
3. **Persistence correction:** climate series are "sticky" (a warm year tends to follow a warm year), which makes plain tests over-confident. We fit a quadratic curve, estimate the lag-1 autocorrelation of what is left, correct it for short-record bias, r' = (n·r + 3)/(n − 6), clip it to [0, 0.95], and inflate the variance of S by the AR(1) effective-sample-size factor of Yue & Wang (2004). Removing a quadratic rather than a straight line stops an accelerating trend from being mistaken for persistence. The constants 3 and 6 extend Kendall's (1954) bias correction and were calibrated by simulation.
4. **Worst-case check:** the variance formula is unreliable when persistence is very high, and it can dismiss smooth curved trends. So we also compare S with 20,000 simulated trend-free series at the strongest persistence we allow (0.95). If S is extreme even against that, the series is trending whatever its true persistence. The reported p-value is the smaller of the two.
5. **Map-wide control:** across a map, p-values are converted to Benjamini-Hochberg q-values (Wilks 2016). A cell is significant when q < 0.05, so at most about 5 % of the highlighted cells are expected to be false discoveries.

Cells with fewer than 80 % valid years, fewer than 8 years, or a constant series are not tested and are shown as "no data".

Implementation: [backend/ground_truth/stats.py](../backend/ground_truth/stats.py). S, its tie-corrected variance, Kendall's tau and the Theil-Sen slope are tested to equal `pymannkendall.original_test`; the Benjamini-Hochberg step is tested against `statsmodels`.

## Choosing the test

`backend/scripts/compare_trend_tests.py` (1,500 replicates per case, seed 7) compares five methods on two measures:

- **False alarms:** how often a method flags a trend in data that has none (target 5 %). Stationary AR(1) noise, 18, 25 and 45 years, year-to-year autocorrelation 0, 0.3 and 0.6.
- **Power:** how often it detects a trend that is really there. A global-temperature-like trend, a strong short trend, a moderate trend, a trend on autocorrelated noise, an accelerating decline (Greenland-like), a rise-then-flatten curve, and a step change.

| Method | False alarms (target 5 %) | Power |
|---|---|---|
| Original Mann-Kendall | 4.3–31.2 % | 91–100 % |
| Hamed-Rao, all lags | 7.3–27.7 % | 90–100 % |
| Pre-whitening (von Storch 1995) | 2.9–5.4 % | 2–100 % |
| Trend-free pre-whitening (Yue et al. 2002) | 4.5–38.7 % | 87–100 % |
| **Ours** | **3.2–7.9 %** | **63–100 %** |

How we got here:
1. We planned Hamed & Rao (1998). It raised 7–28 % false alarms on records as short as ours.
2. Pre-whitening is well calibrated but removes part of any trend along with the persistence: it detected only 2 % of rise-then-flatten curves.
3. A variance correction with linear detrending was well calibrated but called Greenland's ice loss (18 consecutive annual declines) non-significant (p = 0.12), because the accelerating curve looked like persistence. Quadratic detrending plus the worst-case check fixed that (p < 0.001) while adding at most 0.3 percentage points of false alarms.

**Limitation.** On short, strongly persistent records (18 years, autocorrelation 0.6) false alarms reach about 8 %, and higher still for persistence above 0.8. Every method we tested shares this limit except pre-whitening, which pays for it by missing real trends. The full numbers are in `data/derived/checks/trend_tests.json` and on the Checks page.

## Validation against published science

| Check | Our result | Published |
|---|---|---|
| Global temperature trend 1980–2025 (GISTEMP grid, area-weighted) | +0.210 °C/decade | +0.207 °C/decade from NASA GISS's own global series |
| Arctic amplification (66.5–90° N) | +0.689 °C/decade, 3.3× global | ~4× global since 1979 (Rantanen et al. 2022) |
| Greenland mass loss (GRACE) | −760 mm/decade, p < 0.001 | Sustained loss since 2002 (Velicogna et al. 2020) |
| North-west India groundwater (GRACE) | −267 mm/decade, p = 0.011 | Rapid depletion (Rodell et al. 2009) |
| China and India greening (MODIS NDVI) | +0.018 NDVI/decade, p = 0.003 | Strong greening (Chen et al. 2019) |
| Sahel rainfall (IMERG) | +31 mm/decade, p = 0.035 | Partial recovery (Biasutti 2019) |

## References

- Benjamini, Y. & Hochberg, Y. (1995). Controlling the false discovery rate. *JRSS B* 57, 289–300.
- Biasutti, M. (2019). Rainfall trends in the African Sahel. *WIREs Climate Change* 10, e591.
- Chen, C. et al. (2019). China and India lead in greening of the world through land-use management. *Nature Sustainability* 2, 122–129.
- Hamed, K. H. & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. *J. Hydrology* 204, 182–196.
- Kendall, M. G. (1954). Note on bias in the estimation of autocorrelation. *Biometrika* 41, 403–404.
- Mann, H. B. (1945). Nonparametric tests against trend. *Econometrica* 13, 245–259.
- Rantanen, M. et al. (2022). The Arctic has warmed nearly four times faster than the globe since 1979. *Communications Earth & Environment* 3, 168.
- Rodell, M., Velicogna, I. & Famiglietti, J. (2009). Satellite-based estimates of groundwater depletion in India. *Nature* 460, 999–1002.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *JASA* 63, 1379–1389.
- Velicogna, I. et al. (2020). Continuity of ice sheet mass loss in Greenland and Antarctica from the GRACE and GRACE Follow-On missions. *GRL* 47, e2020GL087291.
- von Storch, H. (1995). Misuses of statistical analysis in climate research. In *Analysis of Climate Variability*, Springer.
- Wilks, D. S. (2016). "The stippling shows statistically significant grid points". *BAMS* 97, 2263–2273.
- Yue, S., Pilon, P., Phinney, B. & Cavadias, G. (2002). The influence of autocorrelation on the ability to detect trend in hydrological series. *Hydrological Processes* 16, 1807–1829.
- Yue, S. & Wang, C. (2004). The Mann-Kendall test modified by effective sample size. *Water Resources Management* 18, 201–218.
