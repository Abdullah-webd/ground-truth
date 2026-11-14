# Ground Truth: one service that serves the API and the built web app.
# Build:  docker build -t ground-truth .        Run:  docker run -p 8080:8080 --env-file .env ground-truth

# 1. Web app (Vite + React + Cesium)
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
COPY web/scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. API (FastAPI) + precomputed NASA trend maps + warm caches
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/ground_truth backend/ground_truth
RUN pip install -e ./backend
# Trend maps produced by `make pipeline` (not in git: regenerate with the pipeline).
COPY data/derived data/derived
# Caches that make the demo places instant: change scans, place labels, geocoding, climate normals.
COPY data/cache/change data/cache/change
COPY data/cache/labels data/cache/labels
COPY data/cache/geocode data/cache/geocode
COPY data/cache/power_normals data/cache/power_normals
COPY --from=web /app/web/dist web/dist
ENV WEB_DIST=/app/web/dist
RUN useradd --create-home app && chown -R app /app/data
USER app
WORKDIR /app/backend
EXPOSE 8080
CMD ["sh", "-c", "uvicorn ground_truth.api:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
