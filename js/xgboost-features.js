/**
 * Shared feature builder for the global tree ensemble (method xgboostGlobal).
 * Feature order must match training in scripts/train-xgboost-model.mjs
 */
(function (global) {
  const FEATURE_DIM = 10;

  /**
   * @param {Array<{year:number,value:number}>} series - sorted by year
   * @param {string} fips - 5-digit county or 2-digit state
   * @param {Object} allData - panel keyed by FIPS
   * @param {number} anchorYear - last training year to use for state average
   * @returns {number[]|null}
   */
  function buildFeatureVector(series, fips, allData, anchorYear) {
    if (!series || series.length < 5) return null;
    const sorted = [...series].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1];
    if (last.year !== anchorYear) {
      const at = sorted.find((d) => d.year === anchorYear);
      if (!at) return null;
    }
    const lastPt = sorted.find((d) => d.year === anchorYear) || last;
    const lastValue = lastPt.value;
    const n = sorted.length;
    const idx = sorted.findIndex((d) => d.year === anchorYear);
    if (idx < 0) return null;

    const y = (i) => sorted[i].value;
    const delta1 = idx >= 1 ? lastValue - y(idx - 1) : 0;
    const delta2 = idx >= 2 ? y(idx - 1) - y(idx - 2) : 0;
    const delta3 = idx >= 3 ? y(idx - 2) - y(idx - 3) : 0;

    const win = sorted.slice(Math.max(0, idx - 4), idx + 1);
    const vals = win.map((d) => d.value);
    const mean5 = vals.reduce((a, b) => a + b, 0) / vals.length;
    const meanV = mean5;
    const std5 = Math.sqrt(
      vals.reduce((s, v) => s + (v - meanV) ** 2, 0) / Math.max(1, vals.length)
    ) || 0;

    let slope5 = 0;
    if (win.length >= 2) {
      const ys = win.map((d) => d.year);
      const vs = win.map((d) => d.value);
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const mv = vs.reduce((a, b) => a + b, 0) / vs.length;
      let num = 0;
      let den = 0;
      for (let i = 0; i < win.length; i++) {
        const dx = ys[i] - my;
        num += dx * (vs[i] - mv);
        den += dx * dx;
      }
      slope5 = den !== 0 ? num / den : 0;
    }

    const stateFips = fips.length === 5 ? fips.slice(0, 2) : fips;
    let stateSum = 0;
    let stateCnt = 0;
    for (const key of Object.keys(allData || {})) {
      if (key.length !== 5) continue;
      if (key.slice(0, 2) !== stateFips) continue;
      const arr = allData[key];
      if (!Array.isArray(arr)) continue;
      const pt = arr.find((d) => d.year === anchorYear);
      if (pt && !isNaN(pt.value)) {
        stateSum += pt.value;
        stateCnt++;
      }
    }
    const stateAvg = stateCnt > 0 ? stateSum / stateCnt : lastValue;
    const diffFromState = lastValue - stateAvg;
    const seriesLength = n;

    return [
      lastValue,
      delta1,
      delta2,
      delta3,
      mean5,
      std5,
      slope5,
      stateAvg,
      diffFromState,
      seriesLength
    ];
  }

  const g = typeof globalThis !== 'undefined' ? globalThis : global;
  g.XGBoostFeatures = { FEATURE_DIM, buildFeatureVector };
})(typeof globalThis !== 'undefined' ? globalThis : this);
