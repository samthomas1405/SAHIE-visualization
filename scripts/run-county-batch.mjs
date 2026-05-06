#!/usr/bin/env node
/**
 * Headless county batch backtest using the same modules as the browser.
 * Usage: node scripts/run-county-batch.mjs [--full] [--sample=55] [--seed=42]
 *   --full   use slow path (no fastBatch); otherwise fastBatch for runtime
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const useFull = args.includes('--full');
const sampleArg = args.find(a => a.startsWith('--sample='));
const seedArg = args.find(a => a.startsWith('--seed='));
const sampleSize = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 55;
const seed = seedArg != null ? parseInt(seedArg.split('=')[1], 10) : 42;

globalThis.window = globalThis;

function loadJS(rel) {
  const full = path.join(root, rel);
  const code = fs.readFileSync(full, 'utf8');
  vm.runInThisContext(code, { filename: full });
}

loadJS('js/config.js');
loadJS('js/xgboost-features.js');
globalThis.XGBGLOBAL_MODEL_JSON = JSON.parse(
  fs.readFileSync(path.join(root, 'js/xgboost-model.json'), 'utf8')
);
loadJS('js/xgboost-scorer.js');
loadJS('js/forecasting-models.js');
loadJS('js/enhanced-forecasting-models.js');
loadJS('js/data-manager.js');

const { ForecastingModels, EnhancedForecastingModels, DataManager } = globalThis;

const demographics = { ageCat: 0, sexCat: 0, iprCat: 0, raceCat: '0' };

console.error('Fetching county SAHIE panel (2006–2022)...');
const allData = await ForecastingModels.fetchAllHistoricalData(demographics, 'county');
console.error('Fetching county GeoJSON...');
const geoRes = await fetch(
  'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'
);
const geojson = await geoRes.json();

const valid = DataManager.enumerateValidCountiesFromAllData(allData, geojson, 5);
const sample = DataManager.stratifiedSampleCountiesByState(valid, sampleSize, seed);

console.error(
  `Running backtest: ${sample.length} counties, fastBatch=${!useFull} (use --full for production-weight path)...`
);

const raw = await EnhancedForecastingModels.runCountyBatchBacktest({
  allData,
  countySample: sample,
  geojson,
  fastBatch: !useFull,
  onProgress: (i, n, fips) => {
    if (i % 5 === 0 || i === n) console.error(`  ${i}/${n} … ${fips}`);
  }
});

const evaluated = raw.perCounty.filter(c => c.nTests > 0 && Number.isFinite(c.mae));
const byMae = [...evaluated].sort((a, b) => a.mae - b.mae);
const bySkill = [...evaluated]
  .filter(c => Number.isFinite(c.naiveSkillScore))
  .sort((a, b) => b.naiveSkillScore - a.naiveSkillScore);

const out = {
  generatedAt: new Date().toISOString(),
  sampleSize: sample.length,
  seed,
  fastBatch: !useFull,
  nCandidates: valid.length,
  nEvaluated: raw.nEvaluated,
  meanMae: raw.meanMae,
  medianMae: raw.medianMae,
  topByLowestMae: byMae.slice(0, 15).map((c, i) => ({
    rank: i + 1,
    fips: c.fips,
    name: c.name,
    mae: +c.mae.toFixed(4),
    rmse: c.rmse != null ? +c.rmse.toFixed(4) : null,
    mape: c.mape != null ? +c.mape.toFixed(2) : null,
    naiveSkill:
      c.naiveSkillScore != null && Number.isFinite(c.naiveSkillScore)
        ? +c.naiveSkillScore.toFixed(4)
        : null,
    nTests: c.nTests
  })),
  topByNaiveSkill: bySkill.slice(0, 10).map((c, i) => ({
    rank: i + 1,
    fips: c.fips,
    name: c.name,
    naiveSkill: +c.naiveSkillScore.toFixed(4),
    mae: +c.mae.toFixed(4)
  }))
};

const reportPath = path.join(root, 'county-batch-results.json');
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2), 'utf8');
console.error(`Wrote ${reportPath}`);

console.log('\n=== Best counties by MAE (lowest error) — for professor / notebook ===\n');
for (const r of out.topByLowestMae) {
  console.log(
    `${r.rank}. ${r.name} (${r.fips}) — MAE ${r.mae} pp, RMSE ${r.rmse} pp, naive skill ${r.naiveSkill ?? 'n/a'}, tests ${r.nTests}`
  );
}
console.log('\n=== Highest naive skill (vs last-year baseline) ===\n');
for (const r of out.topByNaiveSkill) {
  console.log(`${r.rank}. ${r.name} (${r.fips}) — skill ${r.naiveSkill}, MAE ${r.mae} pp`);
}
console.log(
  `\nNote: fastBatch=${out.fastBatch}. For the same weighting as the live panel backtest, run: node scripts/run-county-batch.mjs --full`
);
