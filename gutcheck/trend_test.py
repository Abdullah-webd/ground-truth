"""Gut-check B: is Lagos warming, and is it statistically significant? (NASA POWER data)"""
import requests
import pymannkendall as mk

url = "https://power.larc.nasa.gov/api/temporal/monthly/point"
params = {"parameters": "T2M", "community": "RE", "latitude": 6.5, "longitude": 3.4,
          "start": 1981, "end": 2024, "format": "JSON"}
data = requests.get(url, params=params, timeout=90).json()
t2m = data["properties"]["parameter"]["T2M"]

years = sorted(k for k in t2m if k.endswith("13") and t2m[k] != -999)  # "13" = annual mean
values = [t2m[k] for k in years]

r = mk.hamed_rao_modification_test(values)
print(f"Years: {years[0][:4]}-{years[-1][:4]} ({len(values)} years)")
print(f"Trend: {r.trend}")
print(f"Rate: {r.slope * 10:+.2f} °C per decade")
print(f"p-value: {r.p:.6f}")
print("SIGNIFICANT" if r.p < 0.05 else "NOT significant")
