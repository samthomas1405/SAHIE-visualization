// Analytics Management Module
// ===========================

// Analytics panel state
let isAnalyticsPanelOpen = false;
let isAnalyticsPanelMinimized = false;

/** Show panel once app is ready */
function ensureAnalyticsPanelVisible() {
  // Panel is now controlled by the FAB, so we don't auto-show it
  // Just ensure it's properly initialized
  initializeAnalyticsPanel();
}

/** Initialize analytics panel functionality */
function initializeAnalyticsPanel() {
  // FAB click handler
  if (DOMRefs.analyticsFAB) {
    DOMRefs.analyticsFAB.addEventListener('click', toggleAnalyticsPanel);
  }
  
  // Minimize button handler
  if (DOMRefs.apMinimize) {
    DOMRefs.apMinimize.addEventListener('click', toggleMinimize);
  }
  
  // Close button handler
  if (DOMRefs.apClose) {
    DOMRefs.apClose.addEventListener('click', closeAnalyticsPanel);
  }
  
  // Overlay click handler
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('analytics-overlay')) {
      closeAnalyticsPanel();
    }
  });
  
  // ESC key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isAnalyticsPanelOpen) {
      closeAnalyticsPanel();
    }
  });
}

/** Toggle analytics panel */
function toggleAnalyticsPanel() {
  if (isAnalyticsPanelOpen) {
    closeAnalyticsPanel();
  } else {
    openAnalyticsPanel();
  }
}

/** Open analytics panel */
function openAnalyticsPanel() {
  if (!DOMRefs.analyticsPanel) return;
  
  // Create overlay if it doesn't exist
  let overlay = document.querySelector('.analytics-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'analytics-overlay';
    document.body.appendChild(overlay);
  }
  
  // Show panel and overlay
  DOMRefs.analyticsPanel.classList.add('open');
  overlay.classList.add('show');
  isAnalyticsPanelOpen = true;
  
  // Update FAB appearance
  if (DOMRefs.analyticsFAB) {
    DOMRefs.analyticsFAB.style.transform = 'scale(0.9)';
    DOMRefs.analyticsFAB.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  }
  
  // Update analytics data
  updateAnalyticsPanel();
}

/** Close analytics panel */
function closeAnalyticsPanel() {
  if (!DOMRefs.analyticsPanel) return;
  
  // Hide panel and overlay
  DOMRefs.analyticsPanel.classList.remove('open', 'minimized');
  const overlay = document.querySelector('.analytics-overlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  
  isAnalyticsPanelOpen = false;
  isAnalyticsPanelMinimized = false;
  
  // Reset FAB appearance
  if (DOMRefs.analyticsFAB) {
    DOMRefs.analyticsFAB.style.transform = '';
    DOMRefs.analyticsFAB.style.background = '';
  }
}

/** Toggle minimize state */
function toggleMinimize() {
  if (!DOMRefs.analyticsPanel) return;
  
  isAnalyticsPanelMinimized = !isAnalyticsPanelMinimized;
  
  if (isAnalyticsPanelMinimized) {
    DOMRefs.analyticsPanel.classList.add('minimized');
    DOMRefs.apMinimize.textContent = '+';
    DOMRefs.apMinimize.title = 'Expand';
  } else {
    DOMRefs.analyticsPanel.classList.remove('minimized');
    DOMRefs.apMinimize.textContent = '−';
    DOMRefs.apMinimize.title = 'Minimize';
  }
}

/** Safe number formatting */
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d) + '%');

/** Quantiles on sorted copy */
function quantiles(arr) {
  if (!arr.length) return { q1: NaN, med: NaN, q3: NaN };
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => {
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos), rest = pos - base;
    if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
    return a[base];
  };
  return { q1: q(0.25), med: q(0.5), q3: q(0.75) };
}

/** Basic stats */
function summarize(values) {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v));
  const n = clean.length;
  if (n === 0) return { n: 0, missing: values.length, min: NaN, max: NaN, mean: NaN, std: NaN, q1: NaN, med: NaN, q3: NaN };
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const mean = clean.reduce((s, v) => s + v, 0) / n;
  const { q1, med, q3 } = quantiles(clean);
  const variance = clean.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  return { n, missing: values.length - n, min, max, mean, std, q1, med, q3 };
}

/** Build a joined dataset for Combined view and for correlation */
function buildJoinedRows() {
  const rows = [];
  for (const [fips, ins] of Object.entries(AppConfig.getDataStore() || {})) {
    const h = AppConfig.getPlacesDataStore()?.[fips]?.value;
    if (typeof ins === 'number' && typeof h === 'number') {
      rows.push({ fips, name: DataManager.nameForFIPS(fips), insurance: ins, health: h });
    }
  }
  return rows;
}

/** Correlation and regression on x=insurance, y=health */
function corrAndReg(rows) {
  if (!rows.length) return { r: NaN, a: NaN, b: NaN };
  const xs = rows.map(r => r.insurance), ys = rows.map(r => r.health);
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < rows.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const r = sxy / Math.sqrt((sxx || 1e-9) * (syy || 1e-9));
  const b = sxy / (sxx || 1e-9);
  const a = my - b * mx;
  return { r, a, b };
}

/** Create Top/Bottom 5 for a metric */
function topBottom(items, key, take = 5) {
  const clean = items.filter(x => typeof x[key] === 'number' && !isNaN(x[key]));
  clean.sort((a, b) => b[key] - a[key]);
  return {
    top: clean.slice(0, take),
    bottom: clean.slice(-take).reverse()
  };
}

/** Update panel content based on current layer and scope */
async function updateAnalyticsPanel() {
  ensureAnalyticsPanelVisible();

  // Ensure FIPS name cache is built for current geography level
  if (Object.keys(AppConfig.getFipsNameCache()).length === 0 && AppConfig.mapLevel) {
    const geojson = await DataManager.loadGeoJSON();
    DataManager.buildFipsNameCache(geojson);
  }

  const layer = AppConfig.dataLayer; // 'insurance' | 'health' | 'combined'
  const scope = AppConfig.mapLevel || '—';
  const year = AppConfig.selectedYear || '—';
  const measureText = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex]?.text || '';

  // Badges
  document.getElementById('apLayerBadge').textContent =
    layer === 'insurance' ? 'Insurance' :
    layer === 'health' ? 'Health' : 'Combined';
  document.getElementById('apScopeBadge').textContent = scope === 'state' ? 'State' : scope === 'county' ? 'County' : '—';
  document.getElementById('apYearBadge').textContent = `Year ${year}`;

  const measBadge = document.getElementById('apMeasureBadge');
  if (layer === 'health' || layer === 'combined') {
    measBadge.style.display = 'inline-block';
    measBadge.textContent = measureText;
  } else {
    measBadge.style.display = 'none';
  }

  // Compute stats depending on layer
  let values = [];
  let minLoc = '—', maxLoc = '—';
  let rows = [];
  let insVals = []; // Declare insVals at top level

  console.log('Analytics panel data check:', {
    mapLevel: AppConfig.mapLevel,
    dataLayer: AppConfig.dataLayer,
    dataStoreKeys: Object.keys(AppConfig.getDataStore() || {}).length,
    placesDataStoreKeys: Object.keys(AppConfig.getPlacesDataStore() || {}).length,
    fipsNameCacheKeys: Object.keys(AppConfig.getFipsNameCache()).length
  });

  if (layer === 'insurance') {
    rows = Object.entries(AppConfig.getDataStore() || {}).map(([fips, v]) => ({ fips, name: DataManager.nameForFIPS(fips), value: v }));
    values = rows.map(r => r.value);
    console.log('Insurance layer - rows:', rows.length, 'values:', values.length);
    const tb = topBottom(rows, 'value');
    if (tb.top[0]) maxLoc = `${tb.top[0].name} (${fmt(tb.top[0].value)})`;
    if (tb.bottom[0]) minLoc = `${tb.bottom[0].name} (${fmt(tb.bottom[0].value)})`;
    renderTopBottom(tb);
  } else if (layer === 'health') {
    rows = Object.entries(AppConfig.getPlacesDataStore() || {}).map(([fips, obj]) => ({ fips, name: DataManager.nameForFIPS(fips), value: obj?.value }));
    values = rows.map(r => r.value);
    console.log('Health layer - rows:', rows.length, 'values:', values.length);
    const tb = topBottom(rows, 'value');
    if (tb.top[0]) maxLoc = `${tb.top[0].name} (${fmt(tb.top[0].value)})`;
    if (tb.bottom[0]) minLoc = `${tb.bottom[0].name} (${fmt(tb.bottom[0].value)})`;
    renderTopBottom(tb);
  } else {
    // ===== Combined: split stats (Insurance vs Health) + correlation =====
    // Use the same data source as scatterplot for consistency
    const scatterData = ScatterplotManager.buildScatterData();
    console.log('Combined layer - scatterData:', scatterData.length);
    const joined = scatterData.map(p => ({
      fips: p.fips,
      name: p.name,
      insurance: p.x,
      health: p.y
    }));
    
    insVals = joined.map(x => x.insurance).filter(v => typeof v === 'number' && !isNaN(v));
    const hlthVals = joined.map(x => x.health).filter(v => typeof v === 'number' && !isNaN(v));
    console.log('Combined layer - joined:', joined.length, 'insVals:', insVals.length, 'hlthVals:', hlthVals.length);
    
    // Override values array to use scatterplot data for all statistics
    values = insVals;

    // Use global analytics data from scatterplot if available, otherwise calculate
    let r, a, b;
    if (AppConfig.getGlobalAnalyticsData().pointCount > 0) {
      r = AppConfig.getGlobalAnalyticsData().correlation;
      a = AppConfig.getGlobalAnalyticsData().regression.a;
      b = AppConfig.getGlobalAnalyticsData().regression.b;
      console.log('Analytics panel using global data:', {
        mapLevel: AppConfig.mapLevel,
        correlation: r.toFixed(3),
        pointCount: AppConfig.getGlobalAnalyticsData().pointCount,
        joinedLength: joined.length
      });
    } else {
      const corrData = corrAndReg(joined);
      r = corrData.r;
      a = corrData.a;
      b = corrData.b;
      console.log('Analytics panel calculating correlation:', {
        mapLevel: AppConfig.mapLevel,
        correlation: r.toFixed(3),
        pointCount: joined.length
      });
    }
    // Correlation is always visible in combined view now
    document.getElementById('apCorr').textContent = isFinite(r) ? r.toFixed(2) : '—';
    document.getElementById('apReg').textContent = (isFinite(a) && isFinite(b)) ? `y = ${a.toFixed(2)} + ${b.toFixed(2)}·x` : '—';

    // Prepare top/bottom (Insurance)
    const insItems = joined.map(x => ({ fips: x.fips, name: x.name, value: x.insurance }));
    const tbIns = topBottom(insItems, 'value');
    // Prepare top/bottom (Health)
    const hlthItems = joined.map(x => ({ fips: x.fips, name: x.name, value: x.health }));
    const tbHlth = topBottom(hlthItems, 'value');

    // Summary cards — INSURANCE
    const sIns = summarize(insVals);
    // Count and Missing are not shown in compact view
    document.getElementById('apMeanIns').textContent = fmt(sIns.mean);
    document.getElementById('apStdIns').textContent = isNaN(sIns.std) ? '—' : sIns.std.toFixed(1) + '%';
    document.getElementById('apMedianIns').textContent = fmt(sIns.med);
    // Q1 and Q3 are not shown in compact view
    document.getElementById('apMinIns').textContent = fmt(sIns.min);
    document.getElementById('apMaxIns').textContent = fmt(sIns.max);
    renderTopBottomInto('apTopListIns', 'apBottomListIns', tbIns);

    // Summary cards — HEALTH
    const sHlth = summarize(hlthVals);
    // Count and Missing are not shown in compact view
    document.getElementById('apMeanHlth').textContent = fmt(sHlth.mean);
    document.getElementById('apStdHlth').textContent = isNaN(sHlth.std) ? '—' : sHlth.std.toFixed(1) + '%';
    document.getElementById('apMedianHlth').textContent = fmt(sHlth.med);
    // Q1 and Q3 are not shown in compact view
    document.getElementById('apMinHlth').textContent = fmt(sHlth.min);
    document.getElementById('apMaxHlth').textContent = fmt(sHlth.max);
    renderTopBottomInto('apTopListHlth', 'apBottomListHlth', tbHlth);

    // Update the single view elements when in combined mode (for consistency)
    // These are hidden but we update them to avoid errors if view switches
    const apCount = document.getElementById('apCount');
    const apMissing = document.getElementById('apMissing');
    const apMean = document.getElementById('apMean');
    const apStd = document.getElementById('apStd');
    const apMedian = document.getElementById('apMedian');
    const apQ1 = document.getElementById('apQ1');
    const apQ3 = document.getElementById('apQ3');
    const apMin = document.getElementById('apMin');
    const apMax = document.getElementById('apMax');
    
    if (apCount) apCount.textContent = sIns.n.toString();
    if (apMissing) apMissing.textContent = `Missing: ${insItems.length - sIns.n}`;
    if (apMean) apMean.textContent = fmt(sIns.mean);
    if (apStd) apStd.textContent = isNaN(sIns.std) ? '—' : sIns.std.toFixed(2) + '%';
    if (apMedian) apMedian.textContent = fmt(sIns.med);
    if (apQ1) apQ1.textContent = fmt(sIns.q1);
    if (apQ3) apQ3.textContent = fmt(sIns.q3);
    if (apMin) apMin.textContent = fmt(sIns.min);
    if (apMax) apMax.textContent = fmt(sIns.max);
    
    // Update top/bottom lists for single view (hidden in combined mode)
    const apTopList = document.getElementById('apTopList');
    const apBottomList = document.getElementById('apBottomList');
    if (apTopList && apBottomList) {
      renderTopBottom(tbIns);
    }

    applyAnalyticsLayoutForLayer();
    return;
    }


  // Single/Combined view is now handled by applyAnalyticsLayoutForLayer

  // Summary cards
  console.log('Analytics panel summary check:', {
    layer,
    mapLevel: AppConfig.mapLevel,
    globalAnalyticsDataPointCount: AppConfig.getGlobalAnalyticsData().pointCount,
    valuesLength: values.length,
    insValsLength: insVals ? insVals.length : 'undefined'
  });
  
  const s = summarize(values);
  
  // Update single metric view elements with safe access
  const apCountEl = document.getElementById('apCount');
  const apMissingEl = document.getElementById('apMissing');
  const apMeanEl = document.getElementById('apMean');
  const apStdEl = document.getElementById('apStd');
  const apMedianEl = document.getElementById('apMedian');
  const apQ1El = document.getElementById('apQ1');
  const apQ3El = document.getElementById('apQ3');
  const apMinEl = document.getElementById('apMin');
  const apMaxEl = document.getElementById('apMax');
  
  // Set count - use global data for combined view, calculated data for others
  if (apCountEl) {
    if (layer === 'combined' && AppConfig.getGlobalAnalyticsData().pointCount > 0) {
      apCountEl.textContent = AppConfig.getGlobalAnalyticsData().pointCount.toString();
      console.log('Using global analytics data for count:', AppConfig.getGlobalAnalyticsData().pointCount);
    } else {
      apCountEl.textContent = s.n.toString();
      console.log('Using calculated data for count:', s.n);
    }
  }
  
  if (apMissingEl) apMissingEl.textContent = `Missing: ${s.missing}`;
  if (apMeanEl) apMeanEl.textContent = fmt(s.mean);
  if (apStdEl) apStdEl.textContent = isNaN(s.std) ? '—' : s.std.toFixed(2) + '%';
  if (apMedianEl) apMedianEl.textContent = fmt(s.med);
  if (apQ1El) apQ1El.textContent = fmt(s.q1);
  if (apQ3El) apQ3El.textContent = fmt(s.q3);
  if (apMinEl) apMinEl.textContent = fmt(s.min);
  if (apMaxEl) apMaxEl.textContent = fmt(s.max);
  applyAnalyticsLayoutForLayer();

}

/** Legacy helper: renders Top/Bottom lists for single layer views */
function renderTopBottom(tb) {
  const topEl = document.getElementById('apTopList');
  const botEl = document.getElementById('apBottomList');
  if (!topEl || !botEl) return;
  topEl.innerHTML = ''; botEl.innerHTML = '';
  tb.top.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    topEl.appendChild(li);
  });
  tb.bottom.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    botEl.appendChild(li);
  });
}


/** Render Top/Bottom lists */
function renderTopBottomInto(topId, bottomId, tb) {
  const topEl = document.getElementById(topId);
  const botEl = document.getElementById(bottomId);
  if (!topEl || !botEl) return;
  topEl.innerHTML = ''; botEl.innerHTML = '';
  tb.top.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    topEl.appendChild(li);
  });
  tb.bottom.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    botEl.appendChild(li);
  });
}

// Update views based on data layer
function applyAnalyticsLayoutForLayer() {
  if (!DOMRefs.singleMetricView || !DOMRefs.combinedMetricView) return;
  
  if (AppConfig.dataLayer === 'combined') {
    // Show combined view, hide single view
    DOMRefs.singleMetricView.style.display = 'none';
    DOMRefs.combinedMetricView.style.display = 'block';
    
    // Update health measure title
    if (DOMRefs.healthMeasureTitle) {
      DOMRefs.healthMeasureTitle.textContent = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex]?.text || 'Health Measure';
    }
  } else {
    // Show single view, hide combined view
    DOMRefs.singleMetricView.style.display = 'block';
    DOMRefs.combinedMetricView.style.display = 'none';
  }
}

/** Collapse/Expand */
(function wireAnalyticsToggle() {
  const btn = document.getElementById('apToggle');
  const body = document.getElementById('apBody');
  if (!btn || !body) return;
  btn.addEventListener('click', () => {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? '−' : '+';
  });
})();

// Export for use in other modules
window.AnalyticsManager = {
  ensureAnalyticsPanelVisible,
  initializeAnalyticsPanel,
  toggleAnalyticsPanel,
  openAnalyticsPanel,
  closeAnalyticsPanel,
  toggleMinimize,
  updateAnalyticsPanel,
  applyAnalyticsLayoutForLayer,
  fmt,
  quantiles,
  summarize,
  buildJoinedRows,
  corrAndReg,
  topBottom,
  renderTopBottom,
  renderTopBottomInto
};
