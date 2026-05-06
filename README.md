# SAHIE Health Insurance Visualization & Forecasting

Interactive map and analytics for U.S. health insurance coverage (Census **SAHIE**) with chronic-health context (**CDC PLACES**), exploratory statistics, and browser-based forecasting. The UI is a **static site**—open `index.html` or serve the folder; all API calls run from the client.

## Features

### Map & layers
- **County / state** toggle, year slider, **time playback**, and **sidebar search** with autocomplete.
- **SAHIE** choropleth (% insured): blue scale, popups, demographic filters (age, sex, IPR, race where available).
- **CDC PLACES** choropleth: one dropdown to switch chronic-health measures (e.g. obesity, diabetes, mental distress).
- **Combined view**: blend insurance and a health measure with a **weight slider** (`getCombinedColor`).
- **H3 hex grid** (Uber H3 via CDN): toggle from county polygons, **resolution slider**, aggregation for spatial views and neighbor-aware modeling.

### Analytics & scatterplot
- **Distribution stats** (count, mean, median, SD, quartiles, range), **top/bottom** rankings, **dual-metric** summaries.
- **Correlation and OLS** between coverage and the active PLACES measure.
- **Scatterplot mode**: insurance % vs health % per place, synced with map selection and analytics.

### Predictive panel
- **Enhanced ensemble**: many baseline methods (linear, Holt, ARIMA-style steps, quadratic, CAGR, etc.) plus adaptive **rolling cross-validation** weighting, **hierarchical** blending with parent geography, **gap-year** interpolation, and optional **`xgboostGlobal`** from an offline-trained boosted tree (see scripts below).
- **Uncertainty bands** on the main forecast chart for the ensemble path.
- **Rolling backtests** (1 / 3 / 5 year horizons): **ensemble vs Bayesian AR(1)+trend MCMC** side-by-side (metrics, scatters); MCMC is a comparison model in validation, not drawn on the primary forecast chart.

### Documentation
- **Methodology & implementation details:** [`docs/PREDICTION_MODEL.md`](docs/PREDICTION_MODEL.md)
- **Talk outline (slides):** [`docs/PRESENTATION.md`](docs/PRESENTATION.md) *(optional)*

## Tech stack

- HTML5, CSS3, JavaScript (ES5-style globals / script tags)
- [Leaflet](https://leafletjs.com/), [h3-js](https://github.com/uber/h3-js) (UMD)
- [SAHIE API](https://www.census.gov/data/developers/data-sets/health-insurance.html), [PLACES](https://www.cdc.gov/places/)
- OpenStreetMap tiles

## Getting started

### Run the app
1. Clone the repo:
   ```bash
   git clone https://github.com/samthomas1405/SAHIE-visualization.git
   cd SAHIE-visualization
   ```
2. Open **`index.html`** in a modern browser, or use a local server (recommended for some environments):
   ```bash
   python3 -m http.server 8000
   # http://localhost:8000
   ```

You need network access for Census / CDC APIs and map tiles.

### Usage sketch
- Pick **layer** (insurance / health / combined), **year**, and **demographics**; use **search** or click the map.
- Open **analytics** for stats and correlation; switch to **scatterplot** for the joint view.
- Use **Predictive modeling** (FAB): choose place, horizon, run **Generate forecast**; expand backtest section for ensemble vs MCMC comparison.

## Optional: Node tooling

Not required to use the site. For retraining the pooled GBDT or re-running county batch evaluation:

```bash
npm install
npm run train-xgboost    # writes bundled model artifacts used by the app
node scripts/run-county-batch.mjs   # batch backtests (see script for options / output)
```

Dependencies are listed in [`package.json`](package.json).

## Project structure (high level)

```
SAHIE-visualization/
├── index.html
├── styles.css
├── package.json
├── docs/
│   ├── PREDICTION_MODEL.md    # forecasting & validation write-up
│   └── PRESENTATION.md       # slide outline
├── scripts/
│   ├── train-xgboost-model.mjs  # XGBoost training pipeline (`npm run train-xgboost`)
│   └── run-county-batch.mjs
├── js/
│   ├── app.js
│   ├── config.js
│   ├── dom-references.js
│   ├── data-manager.js        # SAHIE + PLACES + GeoJSON plumbing
│   ├── map-manager.js        # Leaflet, choropleth, H3, combined colors
│   ├── h3-spatial-indexing.js
│   ├── scatterplot-manager.js
│   ├── analytics-manager.js
│   ├── predictive-manager.js # forecast UI, chart, backtest panel
│   ├── predictive-models.js
│   ├── forecasting-models.js
│   ├── enhanced-forecasting-models.js
│   ├── mcmc-forecasting.js
│   ├── batch-forecast-eval.js
│   ├── xgboost-features.js
│   ├── xgboost-model-data.js
│   ├── xgboost-scorer.js
│   ├── ui-controls.js
│   └── README.md              # module notes
├── script.js                  # legacy / backup (not primary entry)
└── county-batch-results.json  # example batch output (if present)
```

*(Exact file list may grow; script load order is defined in `index.html`.)*

## Disclaimer

This project is for **education and exploration**. Maps and forecasts summarize public estimates and models—**not** official policy or medical guidance. Do not treat forecast intervals as guaranteed coverage of future outcomes.
