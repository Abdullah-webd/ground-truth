# Ground Truth: run everything locally.
PY := .venv/bin/python
BACKEND_PORT := 8765

.PHONY: setup pipeline warm dev backend web test test-live eval e2e build

setup:            ## Python env + backend package + web dependencies
	uv venv --python 3.12 .venv
	uv pip install --python $(PY) -e "backend[dev]"
	cd web && npm install

pipeline:         ## Build the four NASA trend maps (first run ~10 min; cached afterwards)
	cd backend && ../$(PY) -m ground_truth.pipeline.build
	cd backend && ../$(PY) scripts/compare_trend_tests.py --out ../data/derived/checks/trend_tests.json

warm:             ## Pre-compute change scans for demo places so they answer instantly
	cd backend && ../$(PY) scripts/warm.py

backend:          ## API on http://127.0.0.1:8765
	cd backend && ../.venv/bin/uvicorn ground_truth.api:app --host 127.0.0.1 --port $(BACKEND_PORT)

web:              ## Web app (dev) on http://localhost:5179
	cd web && npm run dev

dev:              ## Backend + web together (Ctrl-C stops both)
	$(MAKE) -j2 backend web

build:            ## Production web build, served on http://localhost:4179
	cd web && npm run build && npx vite preview --port 4179

test:             ## Fast offline tests (statistics, API, agent plumbing) + web type-check
	cd backend && ../$(PY) -m pytest -q
	cd web && npx tsc -b

test-live:        ## Tests that call Earth Engine and NASA services
	cd backend && ../$(PY) -m pytest -q -m live

eval:             ## Ask the analyst 14 test questions and grade the answers (uses the OpenAI API)
	cd backend && ../$(PY) scripts/agent_eval.py

e2e:              ## Browser walkthrough with screenshots (backend + web must be running)
	cd web && node e2e/walkthrough.mjs && node e2e/labels.mjs http://localhost:5179 ../.verify/walkthrough
