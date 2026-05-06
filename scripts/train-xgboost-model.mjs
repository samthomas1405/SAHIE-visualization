#!/usr/bin/env node
/**
 * Trains a pooled global gradient-boosted tree ensemble (ml-cart) on county SAHIE,
 * exports portable JSON for the browser scorer (method xgboostGlobal).
 * Run: npm run train-xgboost
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Matrix } from 'ml-matrix';

const require = createRequire(import.meta.url);
const { DecisionTreeRegression } = require('ml-cart');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

globalThis.window = undefined;
globalThis.globalThis = globalThis;

const featCode = fs.readFileSync(path.join(root, 'js/xgboost-features.js'), 'utf8');
vm.runInThisContext(featCode, { filename: 'xgboost-features.js' });
const { buildFeatureVector } = globalThis.XGBoostFeatures;

const demographics = { ageCat: 0, sexCat: 0, iprCat: 0, raceCat: '0' };

async function fetchAllCountyData() {
  const allData = {};
  for (let year = 2006; year <= 2022; year++) {
    const url = `https://api.census.gov/data/timeseries/healthins/sahie?get=NAME,PCTIC_PT,STATE,COUNTY&for=county:*&in=state:*&AGECAT=${demographics.ageCat}&SEXCAT=${demographics.sexCat}&IPRCAT=${demographics.iprCat}&time=${year}`;
    const res = await fetch(url);
    const data = await res.json();
    const rows = data.slice(1);
    for (const row of rows) {
      const stateFIPS = row[2];
      const key = `${stateFIPS}${row[3]}`.padStart(5, '0');
      const value = parseFloat(row[1]);
      if (!isNaN(value)) {
        if (!allData[key]) allData[key] = [];
        allData[key].push({ year, value });
      }
    }
  }
  for (const k of Object.keys(allData)) {
    allData[k].sort((a, b) => a.year - b.year);
  }
  return allData;
}

function buildRows(allData) {
  const X = [];
  const y = [];
  const holdout = [];

  for (const fips of Object.keys(allData)) {
    const series = allData[fips];
    if (!series || series.length < 6) continue;
    const lastY = series[series.length - 1].year;

    for (let end = 5; end < series.length - 1; end++) {
      const trainSlice = series.slice(0, end + 1);
      const anchorYear = trainSlice[trainSlice.length - 1].year;
      const nextPt = series[end + 1];
      if (!nextPt || nextPt.year !== anchorYear + 1) continue;

      const feat = buildFeatureVector(trainSlice, fips, allData, anchorYear);
      if (!feat) continue;

      const target = nextPt.value;
      const isHoldout = nextPt.year >= lastY - 1;

      if (isHoldout) {
        holdout.push({ feat, target });
      } else {
        X.push(feat);
        y.push(target);
      }
    }
  }

  return { X, y, holdout };
}

function trainGBDT(X, y, opts = {}) {
  const nEstimators = opts.nEstimators ?? 80;
  const maxDepth = opts.maxDepth ?? 4;
  const learningRate = opts.learningRate ?? 0.08;
  const minNumSamples = opts.minNumSamples ?? 8;

  const n = X.length;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let F = y.map(() => meanY);
  const trees = [];

  const mat = new Matrix(X);

  for (let m = 0; m < nEstimators; m++) {
    const residual = y.map((yi, i) => yi - F[i]);
    const tree = new DecisionTreeRegression({
      maxDepth,
      minNumSamples,
      gainFunction: 'regression',
      splitFunction: 'mean'
    });
    tree.train(mat, residual);
    const pred = tree.predict(mat);
    for (let i = 0; i < n; i++) {
      F[i] += learningRate * pred[i];
    }
    trees.push(tree.toJSON());
  }

  return { initialMean: meanY, learningRate, trees };
}

function rmse(pred, actual) {
  let s = 0;
  for (let i = 0; i < pred.length; i++) {
    const e = pred[i] - actual[i];
    s += e * e;
  }
  return Math.sqrt(s / pred.length);
}

function evaluateModel(model, rows) {
  const { initialMean, learningRate, trees } = model;
  const preds = rows.map(({ feat }) => {
    let s = initialMean;
    for (const tr of trees) {
      const dt = DecisionTreeRegression.load(tr);
      const p = dt.predict([feat])[0];
      s += learningRate * p;
    }
    return Math.max(0, Math.min(100, s));
  });
  const actual = rows.map((r) => r.target);
  return rmse(preds, actual);
}

function predictRow(model, feat) {
  const { initialMean, learningRate, trees } = model;
  let s = initialMean;
  const mat = new Matrix([feat]);
  for (const tr of trees) {
    const dt = DecisionTreeRegression.load(tr);
    const p = dt.predict(mat)[0];
    s += learningRate * p;
  }
  return Math.max(0, Math.min(100, s));
}

console.error('Fetching county SAHIE (2006–2022)...');
const allData = await fetchAllCountyData();
console.error('Building training rows...');
let { X, y, holdout } = buildRows(allData);
console.error(`Train rows (full): ${X.length}, holdout: ${holdout.length}`);

if (X.length < 500) {
  console.error('Too few training rows; abort.');
  process.exit(1);
}

/** Subsample for tractable training time (full county panel is ~28k rows). */
const MAX_TRAIN = 4000;
if (X.length > MAX_TRAIN) {
  const idx = [...Array(X.length).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const take = idx.slice(0, MAX_TRAIN);
  X = take.map((i) => X[i]);
  y = take.map((i) => y[i]);
  console.error(`Subsampled training to ${X.length} rows`);
}

const model = trainGBDT(X, y, {
  nEstimators: 18,
  maxDepth: 3,
  learningRate: 0.12,
  minNumSamples: 12
});

model.name = 'global-gbt';
model.version = 1;
model.featureDim = 10;

const trainPreds = X.map((feat, i) => {
  let s = model.initialMean;
  for (const tr of model.trees) {
    const dt = DecisionTreeRegression.load(tr);
    s += model.learningRate * dt.predict(new Matrix([feat]))[0];
  }
  return Math.max(0, Math.min(100, s));
});
console.error('Train RMSE:', rmse(trainPreds, y).toFixed(4));
if (holdout.length > 0) {
  console.error('Hold-out RMSE:', evaluateModel(model, holdout).toFixed(4));
}

const outPath = path.join(root, 'js/xgboost-model-data.js');
const jsonPath = path.join(root, 'js/xgboost-model.json');
const payload = JSON.stringify(model);
fs.writeFileSync(jsonPath, payload, 'utf8');
fs.writeFileSync(
  outPath,
  `/** Auto-generated by scripts/train-xgboost-model.mjs — do not edit by hand */\n` +
    `window.XGBGLOBAL_MODEL_JSON = ${payload};\n`,
  'utf8'
);
console.error(`Wrote ${jsonPath} and ${outPath}`);
