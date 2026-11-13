"""Gut-check A: where did Lagos change between 2018 and 2024? (AlphaEarth embeddings in Earth Engine)"""
import ee

ee.Initialize(project="gen-lang-client-0773831544")

lagos = ee.Geometry.Point([3.40, 6.50]).buffer(30000)
col = ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL").filterBounds(lagos)

y2018 = col.filterDate("2018-01-01", "2019-01-01").mosaic()
y2024 = col.filterDate("2024-01-01", "2025-01-01").mosaic()

# Embeddings are unit-length, so the dot product is the similarity (1 = identical).
similarity = y2018.multiply(y2024).reduce(ee.Reducer.sum())
change = ee.Image(1).subtract(similarity).rename("change").clip(lagos)

stats = change.reduceRegion(
    reducer=ee.Reducer.percentile([50, 90, 99]).combine(ee.Reducer.mean(), sharedInputs=True),
    geometry=lagos, scale=30, maxPixels=1e9,
).getInfo()
print("Change score (0 = same, higher = more change):")
for k, v in sorted(stats.items()):
    print(f"  {k}: {v:.3f}")

frac = change.gt(0.3).reduceRegion(ee.Reducer.mean(), lagos, 30, maxPixels=1e9).getInfo()["change"]
print(f"Share of area with strong change (>0.3): {frac * 100:.1f}%")

url = change.getThumbURL({
    "min": 0, "max": 0.5, "palette": ["000000", "ffff00", "ff0000"],
    "region": lagos, "dimensions": 768,
})
print("Map image:", url)
