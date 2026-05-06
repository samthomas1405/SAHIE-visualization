/**
 * Internal dev tooling: stratified county batch backtest (no public UI).
 *
 * Usage (browser console after app load):
 *   const summary = await BatchForecastEval.runCountyBacktest({ sampleSize: 55, fastBatch: true });
 *   BatchForecastEval.logSummary(summary);
 *   BatchForecastEval.downloadJson(summary, 'county-batch.json');
 */
window.BatchForecastEval = {
  /**
   * @param {Object} options
   * @param {Object} [options.demographics] - { ageCat, sexCat, iprCat, raceCat }; defaults from AppConfig
   * @param {number} [options.sampleSize=55]
   * @param {number} [options.minHistoryPoints=5]
   * @param {number|null} [options.seed] - optional PRNG seed for sampling
   * @param {boolean} [options.fastBatch=true] - skips adaptive CV + lighter spatial/hierarchy (50+ counties)
   * @param {boolean} [options.includePerCounty=true] - set false for smaller JSON
   * @param {function(number,number,string)} [options.onProgress]
   */
  async runCountyBacktest(options = {}) {
    const demographics = options.demographics || {
      ageCat: typeof AppConfig !== 'undefined' ? AppConfig.ageCat : 0,
      sexCat: typeof AppConfig !== 'undefined' ? AppConfig.sexCat : 0,
      iprCat: typeof AppConfig !== 'undefined' ? AppConfig.iprCat : 0,
      raceCat: typeof AppConfig !== 'undefined' ? String(AppConfig.raceCat) : '0'
    };
    const sampleSize = options.sampleSize ?? 55;
    const minHistoryPoints = options.minHistoryPoints ?? 5;
    const fastBatch = options.fastBatch !== false;
    const seed = options.seed != null ? options.seed : null;

    const allData = await ForecastingModels.fetchAllHistoricalData(demographics, 'county');
    const geojson = await DataManager.loadGeoJSONForLevel('county');
    const valid = DataManager.enumerateValidCountiesFromAllData(allData, geojson, minHistoryPoints);
    const sample = DataManager.stratifiedSampleCountiesByState(valid, sampleSize, seed);

    const raw = await EnhancedForecastingModels.runCountyBatchBacktest({
      allData,
      countySample: sample,
      geojson,
      fastBatch,
      onProgress: options.onProgress
    });

    const summary = {
      generatedAt: new Date().toISOString(),
      demographics,
      sampleSize,
      minHistoryPoints,
      fastBatch,
      seed,
      nCandidates: valid.length,
      aggregate: { ...raw }
    };

    if (options.includePerCounty === false) {
      delete summary.aggregate.perCounty;
    }

    return summary;
  },

  logSummary(summary) {
    if (!summary || !summary.aggregate) {
      console.warn('[BatchForecastEval] No summary to log');
      return;
    }
    const a = summary.aggregate;
    console.log('[BatchForecastEval] County batch backtest');
    console.log('  demographics:', summary.demographics);
    console.log('  fastBatch:', summary.fastBatch, '| candidates:', summary.nCandidates, '| evaluated:', a.nEvaluated);
    console.log('  mean MAE:', a.meanMae?.toFixed?.(4), '| median MAE:', a.medianMae?.toFixed?.(4));
    console.log('  mean RMSE:', a.meanRmse?.toFixed?.(4), '| median RMSE:', a.medianRmse?.toFixed?.(4));
    console.log('  mean MAPE:', a.meanMape?.toFixed?.(2));
    const skillShare =
      a.sharePositiveNaiveSkill != null
        ? `${(a.sharePositiveNaiveSkill * 100).toFixed(1)}%`
        : 'n/a';
    console.log('  mean naive skill:', a.meanNaiveSkill?.toFixed?.(4), '| share skill>0:', skillShare);
    console.log('  by horizon (mean MAE):', a.byHorizonAggregate);
    console.log('  best (MAE):', a.bestByMae);
    console.log('  worst (MAE):', a.worstByMae);
    if (a.perCounty?.length) {
      console.table(
        a.perCounty.map(c => ({
          fips: c.fips,
          name: c.name,
          mae: c.mae != null ? +c.mae.toFixed(4) : null,
          rmse: c.rmse != null ? +c.rmse.toFixed(4) : null,
          skill: c.naiveSkillScore != null ? +c.naiveSkillScore.toFixed(3) : null,
          nTests: c.nTests
        }))
      );
    }
  },

  downloadJson(summary, filename = 'county-batch-backtest.json') {
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Rank counties from a batch summary. sortBy: mae | rmse (lower better), naiveSkill (higher better).
   */
  topCounties(summary, { limit = 15, sortBy = 'mae' } = {}) {
    const rows = [...(summary?.aggregate?.perCounty || [])].filter(c => c && c.nTests > 0);
    const key = sortBy === 'rmse' ? 'rmse' : sortBy === 'naiveSkill' ? 'naiveSkillScore' : 'mae';
    const good = rows.filter(c => c[key] != null && !Number.isNaN(c[key]));
    const asc = sortBy !== 'naiveSkill';
    good.sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]));
    return good.slice(0, limit).map((c, i) => ({
      rank: i + 1,
      fips: c.fips,
      name: c.name,
      mae: c.mae,
      rmse: c.rmse,
      mape: c.mape,
      naiveSkill: c.naiveSkillScore,
      nTests: c.nTests
    }));
  },

  /**
   * Plain-text + markdown table for lab reports (copy from console or return string).
   */
  professorReport(summary, { limit = 12 } = {}) {
    if (!summary?.aggregate) return '(No batch summary — run runCountyBacktest first.)';
    const a = summary.aggregate;
    const bestMae = this.topCounties(summary, { limit, sortBy: 'mae' });
    const bestSkill = this.topCounties(summary, { limit: Math.min(limit, 10), sortBy: 'naiveSkill' });

    const line = (t, d = 4) => (t == null || Number.isNaN(t) ? '—' : Number(t).toFixed(d));
    const rowsMd = ['| Rank | County | FIPS | MAE (pp) | RMSE (pp) | MAPE (%) | Naive skill | Tests |', '|---:|---|---|---:|---:|---:|---:|---:|'];
    bestMae.forEach(r => {
      rowsMd.push(
        `| ${r.rank} | ${String(r.name).replace(/\|/g, '/')} | ${r.fips} | ${line(r.mae)} | ${line(r.rmse)} | ${line(r.mape, 2)} | ${line(r.naiveSkill, 3)} | ${r.nTests} |`
      );
    });

    const header = [
      'County batch backtest — best performers (lowest MAE)',
      `Generated: ${summary.generatedAt || 'n/a'}`,
      `Sample: ${summary.sampleSize} counties | fastBatch: ${summary.fastBatch} | evaluated: ${a.nEvaluated}/${a.nSampled}`,
      `Sample mean MAE: ${line(a.meanMae)} | median MAE: ${line(a.medianMae)}`,
      ''
    ].join('\n');

    const skillLines = bestSkill.map(
      r => `  ${r.rank}. ${r.name} (${r.fips}) — naive skill ${line(r.naiveSkill, 3)}, MAE ${line(r.mae)}`
    );

    return (
      header +
      '\n### Lowest MAE (best overall fit in this sample)\n\n' +
      rowsMd.join('\n') +
      '\n\n### Highest naive skill (beats “last year” baseline by most)\n\n' +
      skillLines.join('\n') +
      '\n'
    );
  },

  logProfessorReport(summary, opts) {
    const text = this.professorReport(summary, opts);
    console.log(text);
    return text;
  }
};
