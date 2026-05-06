// Enhanced Forecasting Models with Spatiotemporal and Multivariate Features
// ======================================================================

const EnhancedForecastingModels = {
  
  // Spatial neighbor data cache
  spatialNeighborCache: {},
  
  // State and national averages cache
  aggregateAveragesCache: {},

  /** County-focused knobs (batch retuning target; user-facing path reads these). */
  COUNTY_TUNING: {
    hierBlendWeight: 0.2,
    spatialNeighborPull: 0.185,
    stateDeviationCap: 19,
    cvBoostNaive: 1.06,
    cvBoostWeightedLinear: 1.08,
    cvBoostTheta: 1.05,
    cvPenaltyDampedHolts: 0.97,
    uncertaintyCalibration: 1.38
  },

  clearSpatialCaches() {
    this.spatialNeighborCache = {};
    this.aggregateAveragesCache = {};
  },

  /**
   * Fixed ensemble weights for internal batch runs (skips per-fold adaptive CV).
   */
  getPresetFastBatchWeights(isCounty) {
    const base = {
      naive: 0.12,
      linear5Year: 0.18,
      holts: 0.14,
      dampedHolts: 0.08,
      arima: 0.06,
      quadratic: 0.04,
      cagr: 0.06,
      theta: 0.1,
      weightedLinear: 0.12,
      ar: 0.04,
      spatiotemporal: 0.02,
      multivariate: 0.02,
      yoyChange: 0.015,
      xgboostGlobal: 0.065
    };
    if (isCounty) {
      base.naive += 0.03;
      base.weightedLinear += 0.03;
      base.theta += 0.02;
      base.spatiotemporal = Math.max(0.01, base.spatiotemporal - 0.02);
      base.multivariate = Math.max(0.01, base.multivariate - 0.02);
    }
    const w = {};
    let s = 0;
    for (const name of this.CV_METHOD_NAMES) s += base[name] || 0;
    for (const name of this.CV_METHOD_NAMES) w[name] = (base[name] || 0) / s;
    return w;
  },

  summarizeCountyBatchBacktest(perCountyRows) {
    const evaluated = perCountyRows.filter(c => c && c.nTests > 0);
    const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const median = arr => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const maes = evaluated.map(c => c.mae).filter(v => v != null);
    const rmses = evaluated.map(c => c.rmse).filter(v => v != null);
    const mapes = evaluated.map(c => c.mape).filter(v => v != null);
    const skills = evaluated.map(c => c.naiveSkillScore).filter(v => v != null);
    const posSkill = evaluated.filter(c => c.naiveSkillScore != null && c.naiveSkillScore > 0).length;

    const aggHorizon = {};
    for (const h of [1, 3, 5]) {
      const rows = evaluated
        .map(c => c.byHorizonMetrics && c.byHorizonMetrics[h])
        .filter(Boolean);
      const maeH = mean(rows.map(r => r.mae).filter(v => v != null));
      const rmseH = mean(rows.map(r => r.rmse).filter(v => v != null));
      aggHorizon[h] = { meanMae: maeH, meanRmse: rmseH, n: rows.length };
    }

    const byMae = [...evaluated].sort((a, b) => (a.mae || 1e9) - (b.mae || 1e9));
    return {
      nSampled: perCountyRows.length,
      nEvaluated: evaluated.length,
      meanMae: mean(maes),
      medianMae: median(maes),
      meanRmse: mean(rmses),
      medianRmse: median(rmses),
      meanMape: mean(mapes),
      meanNaiveSkill: mean(skills),
      sharePositiveNaiveSkill: evaluated.length ? posSkill / evaluated.length : null,
      byHorizonAggregate: aggHorizon,
      bestByMae: byMae.slice(0, 5).map(c => ({ fips: c.fips, name: c.name, mae: c.mae, rmse: c.rmse })),
      worstByMae: byMae.slice(-5).reverse().map(c => ({ fips: c.fips, name: c.name, mae: c.mae, rmse: c.rmse })),
      perCounty: perCountyRows
    };
  },

  /**
   * Internal batch backtest over a pre-built county sample (see DataManager sampling helpers).
   * @param {Object} opts
   * @param {Object} opts.allData - county panel from fetchAllHistoricalData
   * @param {Array} opts.countySample - [{ fips, name, stateFips }, ...]
   * @param {Object|null} opts.geojson
   * @param {boolean} [opts.fastBatch=true] - skip adaptive CV + lighter hierarchy/spatial in ensemble
   * @param {function(number,number,string)} [opts.onProgress]
   */
  async runCountyBatchBacktest(opts = {}) {
    const { allData, countySample, geojson = null, fastBatch = true, onProgress = null } = opts;
    if (!allData || !Array.isArray(countySample) || countySample.length === 0) {
      return this.summarizeCountyBatchBacktest([]);
    }
    const perCounty = [];
    const n = countySample.length;
    for (let i = 0; i < n; i++) {
      const row = countySample[i];
      const { fips, name = fips, stateFips = fips?.slice(0, 2) } = row;
      const historicalData = allData[fips];
      if (typeof onProgress === 'function') onProgress(i + 1, n, fips);
      this.clearSpatialCaches();
      const bt = await this.backtestForecast(historicalData, fips, allData, geojson, { fastBatch });
      perCounty.push({
        fips,
        name,
        stateFips,
        mae: bt.mae,
        rmse: bt.rmse,
        mape: bt.mape,
        naiveSkillScore: bt.naiveSkillScore,
        naiveMae: bt.naiveMae,
        nTests: bt.nTests,
        directionalAccuracy: bt.directionalAccuracy,
        intervalCoverage: bt.intervalCoverage,
        byHorizonMetrics: bt.byHorizonMetrics,
        accuracyWithin2: bt.accuracyWithin2,
        accuracyWithin5: bt.accuracyWithin5
      });
    }
    return this.summarizeCountyBatchBacktest(perCounty);
  },
  
  /**
   * Initialize spatial relationships for a given FIPS code
   * Uses same-state counties or all states as neighbors (county/state level only).
   * @param {string} fips - FIPS code (state or county)
   * @param {Object} allData - All historical data by FIPS
   * @param {Object} _geojson - Unused (kept for API compatibility)
   * @returns {Object} Spatial neighbor information
   */
  async initializeSpatialRelationships(fips, allData = {}, _geojson = null) {
    const isState = fips.length === 2;
    if (this.spatialNeighborCache[fips]) {
      return this.spatialNeighborCache[fips];
    }

    const spatialInfo = {
      neighbors: [],
      stateFIPS: isState ? fips : fips.substring(0, 2),
      nationalAverage: null,
      stateAverage: null
    };

    if (!isState) {
      const stateFIPS = fips.substring(0, 2);
      Object.keys(allData).forEach(key => {
        if (key.length === 5 && key.substring(0, 2) === stateFIPS && key !== fips) {
          spatialInfo.neighbors.push(key);
        }
      });
    } else {
      Object.keys(allData).forEach(key => {
        if (key.length === 2 && key !== fips) {
          spatialInfo.neighbors.push(key);
        }
      });
    }
    
    // Calculate state and national averages
    const allValues = Object.values(allData).flatMap(data => 
      Array.isArray(data) ? data : []
    );
    
    if (allValues.length > 0) {
      const sum = allValues.reduce((s, v) => s + (v.value || 0), 0);
      spatialInfo.nationalAverage = sum / allValues.length;
    }
    
    // Calculate state average for counties
    if (!isState) {
      const stateValues = spatialInfo.neighbors
        .map(n => allData[n])
        .filter(d => d && Array.isArray(d))
        .flatMap(d => d)
        .map(d => d.value)
        .filter(v => !isNaN(v));
      
      if (stateValues.length > 0) {
        spatialInfo.stateAverage = stateValues.reduce((s, v) => s + v, 0) / stateValues.length;
      }
    }
    
    this.spatialNeighborCache[fips] = spatialInfo;
    return spatialInfo;
  },
  
  /**
   * Calculate spatial lag features
   * @param {string} fips - FIPS code
   * @param {Array} historicalData - Historical data for the location
   * @param {Object} allData - All historical data by FIPS
   * @param {number} year - Year to calculate features for
   * @returns {Object} Spatial lag features
   */
  calculateSpatialLagFeatures(fips, historicalData, allData, year) {
    const spatialInfo = this.spatialNeighborCache[fips] || {};
    const features = {
      neighborAverage: null,
      stateDifference: null,
      nationalDifference: null,
      neighborCount: spatialInfo.neighbors?.length || 0
    };
    
    // Get current year value
    const currentValue = historicalData.find(d => d.year === year)?.value;
    if (!currentValue) return features;
    
    // Calculate neighbor average for current year
    if (spatialInfo.neighbors && spatialInfo.neighbors.length > 0) {
      const neighborValues = spatialInfo.neighbors
        .map(neighborFIPS => {
          const neighborData = allData[neighborFIPS];
          if (!neighborData || !Array.isArray(neighborData)) return null;
          const yearData = neighborData.find(d => d.year === year);
          return yearData?.value;
        })
        .filter(v => v !== null && !isNaN(v));
      
      if (neighborValues.length > 0) {
        features.neighborAverage = neighborValues.reduce((s, v) => s + v, 0) / neighborValues.length;
      }
    }
    
    // Calculate differences from state and national averages
    if (spatialInfo.stateAverage !== null) {
      features.stateDifference = currentValue - spatialInfo.stateAverage;
    }
    
    if (spatialInfo.nationalAverage !== null) {
      features.nationalDifference = currentValue - spatialInfo.nationalAverage;
    }
    
    return features;
  },
  
  /**
   * Fetch exogenous variables (health outcomes, socioeconomic indicators)
   * @param {string} fips - FIPS code
   * @param {number} year - Year
   * @returns {Object} Exogenous variables
   */
  async fetchExogenousVariables(fips, year) {
    const exogenous = {
      healthOutcomes: {},
      socioeconomic: {}
    };
    
    try {
      // Fetch health outcomes from CDC PLACES (if available)
      const placesData = AppConfig.getPlacesDataStore();
      if (placesData[fips]) {
        exogenous.healthOutcomes = {
          diabetes: placesData[fips].value || null,
          // Add more health measures as needed
        };
      }
      
      // Socioeconomic indicators (simplified - would need additional data sources)
      // These could include: unemployment rate, median income, education levels, etc.
      exogenous.socioeconomic = {
        // Placeholder for future implementation
      };
      
    } catch (error) {
      console.warn('Error fetching exogenous variables:', error);
    }
    
    return exogenous;
  },
  
  /**
   * Spatiotemporal forecasting model
   * Incorporates spatial relationships between neighboring regions
   */
  async forecastSpatiotemporal(historicalData, fips, yearsAhead = 5, allData = {}, geojson = null, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }
    
    const spatialInfo = await this.initializeSpatialRelationships(fips, allData, geojson);
    const isCounty = fips.length === 5;
    const pull = isCounty
      ? (this.COUNTY_TUNING?.spatialNeighborPull ?? 0.185)
      : 0.22;
    const stateCap = isCounty
      ? (this.COUNTY_TUNING?.stateDeviationCap ?? 19)
      : 18;
    
    const baseForecast = ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYearOverride);
    
    // Calculate spatial lag features for recent years
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const recentYears = sorted.slice(-3);
    const spatialFeatures = recentYears.map(d => 
      this.calculateSpatialLagFeatures(fips, historicalData, allData, d.year)
    );
    
    // Calculate average spatial lag features
    const avgNeighborDiff = spatialFeatures
      .map(f => f.neighborAverage ? (sorted.find(d => d.year === recentYears[spatialFeatures.indexOf(f)].year)?.value - f.neighborAverage) : 0)
      .filter(d => d !== 0);
    const avgNeighborDiffValue = avgNeighborDiff.length > 0 
      ? avgNeighborDiff.reduce((s, v) => s + v, 0) / avgNeighborDiff.length 
      : 0;
    
    // Adjust forecast based on spatial relationships
    const forecast = baseForecast.forecast.map((pred, idx) => {
      let adjustedValue = pred.predicted;
      
      // Apply spatial adjustment (regression toward neighbor mean)
      if (spatialInfo.neighbors && spatialInfo.neighbors.length > 0 && avgNeighborDiffValue !== 0) {
        // Spatial autocorrelation: values tend to converge toward neighbor average
        const spatialAdjustment = avgNeighborDiffValue * pull;
        adjustedValue = adjustedValue - spatialAdjustment * (1 - idx * 0.08);
      }
      
      // Apply state/national constraints
      if (spatialInfo.stateAverage !== null) {
        const stateDiff = adjustedValue - spatialInfo.stateAverage;
        // Constrain: don't deviate too far from state average
        if (Math.abs(stateDiff) > stateCap) {
          adjustedValue = spatialInfo.stateAverage + Math.sign(stateDiff) * stateCap;
        }
      }
      
      return {
        ...pred,
        predicted: Math.max(0, Math.min(100, adjustedValue)),
        spatialAdjustment: avgNeighborDiffValue * pull * (1 - idx * 0.08)
      };
    });
    
    return {
      forecast,
      spatialInfo,
      baseForecast: baseForecast.forecast
    };
  },
  
  /**
   * Multivariate forecasting with exogenous variables
   */
  async forecastMultivariate(historicalData, fips, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }
    
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const lastYear = sorted[sorted.length - 1].year;
    
    // Fetch exogenous variables for recent years
    const exogenousData = [];
    for (let year = Math.max(2018, sorted[0].year); year <= lastYear; year++) {
      const exog = await this.fetchExogenousVariables(fips, year);
      const historical = sorted.find(d => d.year === year);
      if (historical) {
        exogenousData.push({
          year,
          insurance: historical.value,
          ...exog
        });
      }
    }
    
    if (exogenousData.length < 2) {
      return ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYearOverride);
    }
    
    // Build multivariate regression model
    // y = β₀ + β₁*t + β₂*health + β₃*spatial_lag + ...
    const n = exogenousData.length;
    const years = exogenousData.map(d => d.year);
    const insuranceValues = exogenousData.map(d => d.insurance);
    
    // Calculate coefficients using least squares
    // Simplified multivariate regression
    const meanYear = years.reduce((s, y) => s + y, 0) / n;
    const meanInsurance = insuranceValues.reduce((s, v) => s + v, 0) / n;
    
    // Time trend coefficient
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      const dx = years[i] - meanYear;
      const dy = insuranceValues[i] - meanInsurance;
      numerator += dx * dy;
      denominator += dx * dx;
    }
    const timeCoeff = denominator !== 0 ? numerator / denominator : 0;
    const intercept = meanInsurance - timeCoeff * meanYear;
    
    const { anchorYear } = ForecastingModels.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const timeTrend = intercept + timeCoeff * futureYear;
      
      // Apply exogenous variable adjustments (simplified)
      // In practice, would use health outcomes trends, policy signals, etc.
      let exogenousAdjustment = 0;
      
      // Example: if health outcomes are improving, insurance might increase
      // This is a placeholder - would need actual health trend data
      
      const predicted = timeTrend + exogenousAdjustment;
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        timeTrend,
        exogenousAdjustment
      });
    }
    
    return { forecast, coefficients: { intercept, timeCoeff } };
  },
  
  /** Filter panel data to years <= endYear (for CV / backtest leakage control) */
  filterAllDataToEndYear(allData, endYear) {
    const filtered = {};
    for (const [key, arr] of Object.entries(allData)) {
      if (!Array.isArray(arr)) continue;
      const sub = arr.filter(d => d.year <= endYear);
      if (sub.length >= 2) filtered[key] = sub;
    }
    return filtered;
  },

  /**
   * One-step expanding-window CV MSE for a single method (inverse-MSE weighting).
   */
  async computeMethodCvMse(methodName, historicalData, fips, allData, geojson) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const MIN_TRAIN = 5;
    let sse = 0;
    let count = 0;
    for (let end = MIN_TRAIN; end < sorted.length; end++) {
      const train = sorted.slice(0, end);
      const actualPt = sorted[end];
      const lastTrain = train[train.length - 1];
      if (actualPt.year !== lastTrain.year + 1) continue;
      const anchor = lastTrain.year;
      const ctx = this.filterAllDataToEndYear(allData, anchor);

      let pred = null;
      try {
        switch (methodName) {
          case 'linear5Year':
            pred = ForecastingModels.forecast5YearLinear(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'holts':
            pred = ForecastingModels.forecastHoltsLinear(train, 1, null, null, anchor).forecast[0]?.predicted;
            break;
          case 'dampedHolts':
            pred = ForecastingModels.forecastDampedHolts(train, 1, 0.9, anchor).forecast[0]?.predicted;
            break;
          case 'arima':
            pred = ForecastingModels.forecastARIMA111(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'quadratic':
            pred = ForecastingModels.forecastPolynomial(train, 1, 2, anchor).forecast[0]?.predicted;
            break;
          case 'cagr':
            pred = ForecastingModels.forecastCAGR(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'theta':
            pred = ForecastingModels.forecastTheta(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'weightedLinear':
            pred = ForecastingModels.forecastWeightedLinear(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'ar':
            pred = ForecastingModels.forecastAR(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'spatiotemporal': {
            const r = await this.forecastSpatiotemporal(train, fips, 1, ctx, geojson, anchor);
            pred = r.forecast[0]?.predicted;
            break;
          }
          case 'multivariate': {
            const r = await this.forecastMultivariate(train, fips, 1, anchor);
            pred = r.forecast[0]?.predicted;
            break;
          }
          case 'yoyChange':
            pred = this.forecastYearOverYearChange(train, 1, anchor).forecast[0]?.predicted;
            break;
          case 'xgboostGlobal': {
            const r = ForecastingModels.forecastXGBoostGlobal(train, 1, anchor, fips, ctx);
            pred = r.forecast && r.forecast[0] ? r.forecast[0].predicted : null;
            break;
          }
          case 'naive':
            pred = ForecastingModels.forecastNaive(train, 1, anchor).forecast[0]?.predicted;
            break;
          default:
            pred = null;
        }
      } catch (_) {
        pred = null;
      }
      if (pred != null && !isNaN(pred)) {
        const e = pred - actualPt.value;
        sse += e * e;
        count++;
      }
    }
    return count > 0 ? sse / count : 1e4;
  },

  CV_METHOD_NAMES: [
    'naive', 'linear5Year', 'holts', 'dampedHolts', 'arima', 'quadratic', 'cagr',
    'theta', 'weightedLinear', 'ar', 'spatiotemporal', 'multivariate', 'yoyChange',
    'xgboostGlobal'
  ],

  /**
   * Adaptive weights: expanding-window one-step MSE, inverse-MSE, trim methods >3× best, floor 2%.
   */
  async calculateAdaptiveWeights(historicalData, fips, allData = {}, geojson = null) {
    const spatialInfo = this.spatialNeighborCache[fips] || {};
    const weights = {};
    const mse = {};
    let best = Infinity;
    for (const name of this.CV_METHOD_NAMES) {
      mse[name] = await this.computeMethodCvMse(name, historicalData, fips, allData, geojson);
      if (mse[name] < best) best = mse[name];
    }
    const trimThreshold = best * 3 + 1e-8;
    const EPS = 0.08;
    let rawSum = 0;
    const raw = {};
    for (const name of this.CV_METHOD_NAMES) {
      const effectiveMse = mse[name] <= trimThreshold ? mse[name] : trimThreshold * 10;
      raw[name] = 1 / (effectiveMse + EPS);
      rawSum += raw[name];
    }
    for (const name of this.CV_METHOD_NAMES) {
      weights[name] = raw[name] / rawSum;
    }
    const FLOOR = 0.02;
    for (const name of this.CV_METHOD_NAMES) {
      weights[name] = Math.max(FLOOR, weights[name]);
    }
    const s2 = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const name of this.CV_METHOD_NAMES) {
      weights[name] /= s2;
    }

    const isSmallRegion = historicalData.length < 10 || (spatialInfo.neighbors?.length || 0) < 5;
    if (isSmallRegion) {
      if (weights.naive != null) weights.naive *= 1.08;
      if (weights.linear5Year != null) weights.linear5Year *= 1.12;
      if (weights.cagr != null) weights.cagr *= 1.08;
      if (weights.arima != null) weights.arima *= 0.88;
      let norm = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const name of this.CV_METHOD_NAMES) weights[name] /= norm;
    }

    const isCounty = fips.length === 5;
    const ct = this.COUNTY_TUNING;
    if (isCounty && ct) {
      if (ct.cvBoostNaive != null && weights.naive != null) weights.naive *= ct.cvBoostNaive;
      if (ct.cvBoostWeightedLinear != null && weights.weightedLinear != null) weights.weightedLinear *= ct.cvBoostWeightedLinear;
      if (ct.cvBoostTheta != null && weights.theta != null) weights.theta *= ct.cvBoostTheta;
      if (ct.cvPenaltyDampedHolts != null && weights.dampedHolts != null) weights.dampedHolts *= ct.cvPenaltyDampedHolts;
      const norm2 = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const name of this.CV_METHOD_NAMES) weights[name] /= norm2;
    }

    return weights;
  },

  /**
   * Year-over-year change modeling (better for volatile small regions)
   */
  forecastYearOverYearChange(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }
    
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    
    // Calculate year-over-year changes
    const yoyChanges = [];
    for (let i = 1; i < sorted.length; i++) {
      yoyChanges.push({
        year: sorted[i].year,
        change: sorted[i].value - sorted[i - 1].value,
        percentChange: ((sorted[i].value - sorted[i - 1].value) / sorted[i - 1].value) * 100
      });
    }
    
    // Forecast changes instead of absolute values
    const recentChanges = yoyChanges.slice(-5);
    const avgChange = recentChanges.reduce((s, c) => s + c.change, 0) / recentChanges.length;
    const changeVolatility = Math.sqrt(
      recentChanges.reduce((s, c) => s + Math.pow(c.change - avgChange, 2), 0) / recentChanges.length
    );
    
    const lastValue = sorted[sorted.length - 1].value;
    const lastYear = sorted[sorted.length - 1].year;
    const { anchorYear: anchor } = ForecastingModels.resolveAnchorYear(sorted, anchorYearOverride);
    
    const forecast = [];
    let currentValue = lastValue;
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchor + i;
      const yearsFromLast = futureYear - lastYear;
      
      // Project change with decay (changes don't persist forever)
      const projectedChange = avgChange * Math.exp(-yearsFromLast * 0.1);
      currentValue = currentValue + projectedChange;
      
      // Add uncertainty based on historical volatility
      const uncertainty = changeVolatility * Math.sqrt(yearsFromLast);
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, currentValue)),
        change: projectedChange,
        lowerBound: Math.max(0, Math.min(100, currentValue - 1.96 * uncertainty)),
        upperBound: Math.max(0, Math.min(100, currentValue + 1.96 * uncertainty)),
        method: 'yoy_change'
      });
    }
    
    return {
      forecast,
      avgChange,
      changeVolatility
    };
  },
  
  /**
   * Enhanced uncertainty estimation with prediction intervals
   */
  calculateUncertaintyIntervals(forecast, historicalData, confidenceLevel = 0.95, horizonStepOverride = null, calibrationOverride = null) {
    if (historicalData.length < 3) {
      return forecast.map(p => ({
        ...p,
        lowerBound: p.predicted,
        upperBound: p.predicted,
        confidence: 0
      }));
    }
    
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);

    const yoy = [];
    for (let i = 1; i < values.length; i++) yoy.push(values[i] - values[i - 1]);
    const meanYoy = yoy.reduce((s, v) => s + v, 0) / yoy.length;
    const sigmaYoy = Math.sqrt(
      yoy.reduce((s, d) => s + (d - meanYoy) ** 2, 0) / Math.max(1, yoy.length)
    ) || 0.5;

    const residuals = [];
    for (let i = 1; i < values.length; i++) {
      const trend = (values[values.length - 1] - values[0]) / Math.max(1, values.length - 1);
      const predicted = values[i - 1] + trend;
      residuals.push(Math.abs(values[i] - predicted));
    }
    const residualStdDev = Math.sqrt(
      residuals.reduce((s, r) => s + r * r, 0) / residuals.length
    ) || sigmaYoy;

    const sigma = Math.max(sigmaYoy, residualStdDev * 0.85, 0.35);
    const calibration = calibrationOverride != null ? calibrationOverride : 1.42;

    const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.90 ? 1.645 : 2.576;
    
    return forecast.map((pred, idx) => {
      const horizon = horizonStepOverride != null ? horizonStepOverride : idx + 1;
      const uncertainty = sigma * calibration * Math.sqrt(horizon);
      
      return {
        ...pred,
        lowerBound: Math.max(0, Math.min(100, pred.predicted - zScore * uncertainty)),
        upperBound: Math.max(0, Math.min(100, pred.predicted + zScore * uncertainty)),
        confidence: Math.max(0, Math.min(1, 1 - (uncertainty / 50)))
      };
    });
  },
  
  /**
   * Backtest forecast accuracy using rolling-window cross-validation.
   * For each horizon (1, 3, 5 years), trains on data ending at year Y, predicts Y+horizon, compares to actual.
   * @param {Array} historicalData - Historical data for the location
   * @param {string} fips - FIPS code
   * @param {Object} allData - All historical data by FIPS (for spatial models)
   * @param {Object} geojson - GeoJSON for H3 neighbors
   * @returns {Object} { mae, rmse, accuracyWithin2, accuracyWithin5, nTests, byHorizon }
   */
  _metricsFromRows(rows) {
    if (!rows.length) return { mae: null, rmse: null, mape: null };
    const abs = rows.map(r => Math.abs(r.error));
    const mae = abs.reduce((s, e) => s + e, 0) / rows.length;
    const rmse = Math.sqrt(abs.reduce((s, e) => s + e * e, 0) / rows.length);
    const mapeVals = rows
      .map(r => (Math.abs(r.actual) > 1e-6 ? (Math.abs(r.error) / Math.abs(r.actual)) * 100 : null))
      .filter(v => v != null);
    const mape = mapeVals.length ? mapeVals.reduce((s, v) => s + v, 0) / mapeVals.length : null;
    return { mae, rmse, mape };
  },

  async backtestForecast(historicalData, fips, allData = {}, geojson = null, runOptions = {}) {
    const empty = {
      mae: null, rmse: null, mape: null, accuracyWithin2: null, accuracyWithin5: null,
      directionalAccuracy: null, naiveSkillScore: null, intervalCoverage: null,
      nTests: 0, byHorizon: {}, byHorizonMetrics: {}, pairs: []
    };
    if (historicalData.length < 5) return empty;

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const records = [];
    const byHorizon = { 1: [], 3: [], 5: [] };

    const filterAllDataByYear = (maxYear) => {
      const filtered = {};
      for (const [key, arr] of Object.entries(allData)) {
        if (!Array.isArray(arr)) continue;
        const sub = arr.filter(d => d.year < maxYear);
        if (sub.length >= 3) filtered[key] = sub;
      }
      return filtered;
    };

    for (const horizon of [1, 3, 5]) {
      for (let i = 0; i < sorted.length - horizon; i++) {
        const trainData = sorted.slice(0, i + 1);
        if (trainData.length < 3) continue;
        const lastTrainYear = trainData[trainData.length - 1].year;
        const lastTrainVal = trainData[trainData.length - 1].value;
        const targetYear = lastTrainYear + horizon;
        const actualPoint = sorted.find(d => d.year === targetYear);
        if (!actualPoint) continue;

        const filteredAll = filterAllDataByYear(lastTrainYear + 1);
        const result = await this.forecastEnhancedEnsemble(
          trainData,
          fips,
          horizon,
          filteredAll,
          geojson,
          { anchorYear: lastTrainYear, fastBatch: !!runOptions.fastBatch }
        );
        if (!result.forecast || result.forecast.length < horizon) continue;

        const pred = result.forecast[horizon - 1];
        const err = pred.predicted - actualPoint.value;
        const absErr = Math.abs(err);
        const naivePred = lastTrainVal;
        const naiveErr = Math.abs(naivePred - actualPoint.value);

        let inInterval = null;
        if (pred.lowerBound != null && pred.upperBound != null) {
          inInterval = actualPoint.value >= pred.lowerBound && actualPoint.value <= pred.upperBound;
        }

        const actualDelta = actualPoint.value - lastTrainVal;
        const predDelta = pred.predicted - lastTrainVal;
        let dirOk = null;
        if (Math.abs(actualDelta) >= 0.25) {
          dirOk = (actualDelta > 0 && predDelta > 0) || (actualDelta < 0 && predDelta < 0);
        }

        const rec = {
          horizon,
          year: targetYear,
          predicted: pred.predicted,
          actual: actualPoint.value,
          error: err,
          absError: absErr,
          naiveAbsError: naiveErr,
          intervalHit: inInterval,
          directionalOk: dirOk,
          lowerBound: pred.lowerBound,
          upperBound: pred.upperBound
        };
        records.push(rec);
        byHorizon[horizon].push(rec);
      }
    }

    const nTests = records.length;
    if (nTests === 0) return empty;

    const errors = records.map(r => r.absError);
    const mae = errors.reduce((s, e) => s + e, 0) / nTests;
    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / nTests);
    const mapeParts = records.map(r =>
      Math.abs(r.actual) > 1e-6 ? (r.absError / Math.abs(r.actual)) * 100 : null
    ).filter(v => v != null);
    const mape = mapeParts.length ? mapeParts.reduce((s, v) => s + v, 0) / mapeParts.length : null;

    const accuracyWithin2 = (errors.filter(e => e <= 2).length / nTests) * 100;
    const accuracyWithin5 = (errors.filter(e => e <= 5).length / nTests) * 100;

    const naiveMae = records.reduce((s, r) => s + r.naiveAbsError, 0) / nTests;
    const naiveSkillScore = naiveMae > 1e-6 ? 1 - mae / naiveMae : null;

    const dirRows = records.filter(r => r.directionalOk !== null);
    const directionalAccuracy = dirRows.length
      ? (dirRows.filter(r => r.directionalOk).length / dirRows.length) * 100
      : null;

    const ivRows = records.filter(r => r.intervalHit !== null);
    const intervalCoverage = ivRows.length
      ? (ivRows.filter(r => r.intervalHit).length / ivRows.length) * 100
      : null;

    const byHorizonMetrics = {};
    for (const h of [1, 3, 5]) {
      byHorizonMetrics[h] = this._metricsFromRows(byHorizon[h].map(r => ({
        error: r.predicted - r.actual,
        actual: r.actual
      })));
    }

    return {
      mae,
      rmse,
      mape,
      accuracyWithin2,
      accuracyWithin5,
      directionalAccuracy,
      naiveSkillScore,
      intervalCoverage,
      naiveMae,
      nTests,
      byHorizon,
      byHorizonMetrics,
      pairs: records.map(r => ({ predicted: r.predicted, actual: r.actual }))
    };
  },

  /**
   * Rolling backtest for Bayesian AR(1)+trend (MCMC). Same windows/horizons as backtestForecast.
   */
  async backtestMcmcForecast(historicalData, fips, allData = {}, geojson = null, runOptions = {}) {
    const MC = typeof McmcForecasting !== 'undefined' ? McmcForecasting : (typeof window !== 'undefined' && window.McmcForecasting);
    const empty = {
      mae: null, rmse: null, mape: null, accuracyWithin2: null, accuracyWithin5: null,
      directionalAccuracy: null, naiveSkillScore: null, intervalCoverage: null,
      nTests: 0, byHorizon: {}, byHorizonMetrics: {}, pairs: [],
      modelLabel: 'Bayesian AR(1) + trend (MCMC)'
    };
    if (!MC || historicalData.length < 5) return empty;

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const records = [];
    const byHorizon = { 1: [], 3: [], 5: [] };

    const mcmcSeed = (trainEndYear, horizon) => {
      let h = 2166136261;
      const str = String(fips);
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
      h = Math.imul(h ^ trainEndYear, 16777619);
      h = Math.imul(h ^ horizon, 16777619);
      return h >>> 0;
    };

    for (const horizon of [1, 3, 5]) {
      for (let i = 0; i < sorted.length - horizon; i++) {
        const trainData = sorted.slice(0, i + 1);
        if (trainData.length < 3) continue;
        const lastTrainYear = trainData[trainData.length - 1].year;
        const lastTrainVal = trainData[trainData.length - 1].value;
        const targetYear = lastTrainYear + horizon;
        const actualPoint = sorted.find(d => d.year === targetYear);
        if (!actualPoint) continue;

        const result = MC.forecastAR1Trend(
          trainData,
          horizon,
          lastTrainYear,
          { seed: mcmcSeed(lastTrainYear, horizon), ...runOptions.mcmcOptions }
        );
        if (!result.forecast || result.forecast.length < horizon) continue;

        const pred = result.forecast[horizon - 1];
        const err = pred.predicted - actualPoint.value;
        const absErr = Math.abs(err);
        const naivePred = lastTrainVal;
        const naiveErr = Math.abs(naivePred - actualPoint.value);

        let inInterval = null;
        if (pred.lowerBound != null && pred.upperBound != null) {
          inInterval = actualPoint.value >= pred.lowerBound && actualPoint.value <= pred.upperBound;
        }

        const actualDelta = actualPoint.value - lastTrainVal;
        const predDelta = pred.predicted - lastTrainVal;
        let dirOk = null;
        if (Math.abs(actualDelta) >= 0.25) {
          dirOk = (actualDelta > 0 && predDelta > 0) || (actualDelta < 0 && predDelta < 0);
        }

        const rec = {
          horizon,
          year: targetYear,
          predicted: pred.predicted,
          actual: actualPoint.value,
          error: err,
          absError: absErr,
          naiveAbsError: naiveErr,
          intervalHit: inInterval,
          directionalOk: dirOk,
          lowerBound: pred.lowerBound,
          upperBound: pred.upperBound
        };
        records.push(rec);
        byHorizon[horizon].push(rec);
      }
    }

    const nTests = records.length;
    if (nTests === 0) return empty;

    const errors = records.map(r => r.absError);
    const mae = errors.reduce((s, e) => s + e, 0) / nTests;
    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / nTests);
    const mapeParts = records.map(r =>
      Math.abs(r.actual) > 1e-6 ? (r.absError / Math.abs(r.actual)) * 100 : null
    ).filter(v => v != null);
    const mape = mapeParts.length ? mapeParts.reduce((s, v) => s + v, 0) / mapeParts.length : null;

    const accuracyWithin2 = (errors.filter(e => e <= 2).length / nTests) * 100;
    const accuracyWithin5 = (errors.filter(e => e <= 5).length / nTests) * 100;

    const naiveMae = records.reduce((s, r) => s + r.naiveAbsError, 0) / nTests;
    const naiveSkillScore = naiveMae > 1e-6 ? 1 - mae / naiveMae : null;

    const dirRows = records.filter(r => r.directionalOk !== null);
    const directionalAccuracy = dirRows.length
      ? (dirRows.filter(r => r.directionalOk).length / dirRows.length) * 100
      : null;

    const ivRows = records.filter(r => r.intervalHit !== null);
    const intervalCoverage = ivRows.length
      ? (ivRows.filter(r => r.intervalHit).length / ivRows.length) * 100
      : null;

    const byHorizonMetrics = {};
    for (const h of [1, 3, 5]) {
      byHorizonMetrics[h] = this._metricsFromRows(byHorizon[h].map(r => ({
        error: r.predicted - r.actual,
        actual: r.actual
      })));
    }

    return {
      mae,
      rmse,
      mape,
      accuracyWithin2,
      accuracyWithin5,
      directionalAccuracy,
      naiveSkillScore,
      intervalCoverage,
      naiveMae,
      nTests,
      byHorizon,
      byHorizonMetrics,
      pairs: records.map(r => ({ predicted: r.predicted, actual: r.actual })),
      modelLabel: 'Bayesian AR(1) + trend (MCMC)'
    };
  },

  /**
   * Hierarchical forecasting with state and national constraints
   */
  async forecastHierarchical(historicalData, fips, yearsAhead = 5, allData = {}, geojson = null, anchorYearOverride = null, hierOptions = {}) {
    if (historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }
    
    const isState = fips.length === 2;
    const fastBatch = !!hierOptions.fastBatch;
    
    const baseForecast = fastBatch
      ? ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYearOverride)
      : await this.forecastSpatiotemporal(historicalData, fips, yearsAhead, allData, geojson, anchorYearOverride);
    
    if (!baseForecast.forecast || baseForecast.forecast.length === 0) {
      return baseForecast;
    }
    
    let stateForecast = null;
    if (!isState) {
      const stateFIPS = fips.substring(0, 2);
      const stateData = allData[stateFIPS];
      if (stateData && Array.isArray(stateData) && stateData.length >= 3) {
        stateForecast = fastBatch
          ? ForecastingModels.forecast5YearLinear(stateData, yearsAhead, anchorYearOverride)
          : await this.forecastSpatiotemporal(stateData, stateFIPS, yearsAhead, allData, geojson, anchorYearOverride);
      }
    }
    
    // Calculate national forecast (aggregate all states)
    let nationalForecast = null;
    const stateDataPoints = Object.keys(allData)
      .filter(key => key.length === 2)
      .map(key => allData[key])
      .filter(d => d && Array.isArray(d) && d.length >= 3);
    
    if (stateDataPoints.length > 0) {
      // Aggregate to national level (simplified)
      const nationalData = [];
      const years = new Set();
      stateDataPoints.forEach(stateData => {
        stateData.forEach(d => years.add(d.year));
      });
      
      Array.from(years).sort().forEach(year => {
        const yearValues = stateDataPoints
          .map(stateData => stateData.find(d => d.year === year))
          .filter(d => d)
          .map(d => d.value)
          .filter(v => !isNaN(v));
        
        if (yearValues.length > 0) {
          nationalData.push({
            year,
            value: yearValues.reduce((s, v) => s + v, 0) / yearValues.length
          });
        }
      });
      
      if (nationalData.length >= 3) {
        nationalForecast = ForecastingModels.forecast5YearLinear(nationalData, yearsAhead, anchorYearOverride);
      }
    }
    
    // Apply hierarchical constraints
    const constrainedForecast = baseForecast.forecast.map((pred, idx) => {
      let constrainedValue = pred.predicted;
      
      // Constrain to state forecast if available
      if (stateForecast && stateForecast.forecast && stateForecast.forecast[idx]) {
        const statePred = stateForecast.forecast[idx].predicted;
        const deviation = constrainedValue - statePred;
        
        if (Math.abs(deviation) > 24) {
          constrainedValue = statePred + Math.sign(deviation) * 24;
        }
        
        constrainedValue = constrainedValue * 0.93 + statePred * 0.07;
      }
      
      // Constrain to national forecast if available
      if (nationalForecast && nationalForecast.forecast && nationalForecast.forecast[idx]) {
        const nationalPred = nationalForecast.forecast[idx].predicted;
        const deviation = constrainedValue - nationalPred;
        
        if (Math.abs(deviation) > 36) {
          constrainedValue = nationalPred + Math.sign(deviation) * 36;
        }
        
        constrainedValue = constrainedValue * 0.97 + nationalPred * 0.03;
      }
      
      return {
        ...pred,
        predicted: Math.max(0, Math.min(100, constrainedValue)),
        stateConstraint: stateForecast?.forecast?.[idx]?.predicted || null,
        nationalConstraint: nationalForecast?.forecast?.[idx]?.predicted || null
      };
    });
    
    return {
      forecast: constrainedForecast,
      stateForecast: stateForecast?.forecast || null,
      nationalForecast: nationalForecast?.forecast || null
    };
  },
  
  /**
   * Enhanced ensemble forecasting with all improvements
   */
  async forecastEnhancedEnsemble(historicalData, fips, yearsAhead = 5, allData = {}, geojson = null, options = {}) {
    if (historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }

    const anchorYearOverride = options.anchorYear != null ? options.anchorYear : null;
    const spatialInfo = await this.initializeSpatialRelationships(fips, allData, geojson);

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const lastValue = sorted[sorted.length - 1].value;
    const lastHistoricalYear = sorted[sorted.length - 1].year;
    const { anchorYear } = ForecastingModels.resolveAnchorYear(sorted, anchorYearOverride);

    const isCounty = fips.length === 5;
    const fastBatch = !!options.fastBatch;

    const spatiotemporal = fastBatch
      ? ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYear)
      : await this.forecastSpatiotemporal(historicalData, fips, yearsAhead, allData, geojson, anchorYear);
    const multivariate = fastBatch
      ? ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYear)
      : await this.forecastMultivariate(historicalData, fips, yearsAhead, anchorYear);

    const methods = {
      naive: ForecastingModels.forecastNaive(historicalData, yearsAhead, anchorYear),
      linear5Year: ForecastingModels.forecast5YearLinear(historicalData, yearsAhead, anchorYear),
      holts: ForecastingModels.forecastHoltsLinear(historicalData, yearsAhead, null, null, anchorYear),
      dampedHolts: ForecastingModels.forecastDampedHolts(historicalData, yearsAhead, 0.9, anchorYear),
      arima: ForecastingModels.forecastARIMA111(historicalData, yearsAhead, anchorYear),
      quadratic: ForecastingModels.forecastPolynomial(historicalData, yearsAhead, 2, anchorYear),
      cagr: ForecastingModels.forecastCAGR(historicalData, yearsAhead, anchorYear),
      theta: ForecastingModels.forecastTheta(historicalData, yearsAhead, anchorYear),
      weightedLinear: ForecastingModels.forecastWeightedLinear(historicalData, yearsAhead, anchorYear),
      ar: ForecastingModels.forecastAR(historicalData, yearsAhead, anchorYear),
      spatiotemporal,
      multivariate,
      yoyChange: this.forecastYearOverYearChange(historicalData, yearsAhead, anchorYear),
      xgboostGlobal: ForecastingModels.forecastXGBoostGlobal(
        historicalData,
        yearsAhead,
        anchorYear,
        fips,
        allData
      )
    };

    const weights = fastBatch
      ? { ...this.getPresetFastBatchWeights(isCounty) }
      : await this.calculateAdaptiveWeights(historicalData, fips, allData, geojson);

    const hierarchical = await this.forecastHierarchical(
      historicalData,
      fips,
      yearsAhead,
      allData,
      geojson,
      anchorYear,
      { fastBatch }
    );

    const forecast = [];
    const gapYears = Math.max(0, anchorYear - lastHistoricalYear);

    for (let i = 0; i < yearsAhead; i++) {
      const futureYear = anchorYear + i + 1;

      let weightedSum = 0;
      let totalWeight = 0;
      const methodPredictions = {};

      Object.keys(methods).forEach(methodName => {
        const method = methods[methodName];
        if (method.forecast && method.forecast[i]) {
          const prediction = method.forecast[i].predicted;
          const weight = weights[methodName] != null ? weights[methodName] : 0.02;
          weightedSum += prediction * weight;
          totalWeight += weight;
          methodPredictions[methodName] = prediction;
        }
      });

      const ensembleValue = totalWeight > 0 ? weightedSum / totalWeight : lastValue;
      const hierPred = hierarchical.forecast[i]?.predicted;
      const hierW = isCounty
        ? (this.COUNTY_TUNING?.hierBlendWeight ?? 0.2)
        : 0.14;
      const blended =
        hierPred != null
          ? (1 - hierW) * ensembleValue + hierW * hierPred
          : ensembleValue;
      const constrainedValue = Math.max(0, Math.min(100, blended));

      const horizonSteps = i + 1;
      const tempForecast = [{ predicted: constrainedValue }];
      const uncertaintyCal =
        isCounty && this.COUNTY_TUNING?.uncertaintyCalibration != null
          ? this.COUNTY_TUNING.uncertaintyCalibration
          : null;
      const withUncertainty = this.calculateUncertaintyIntervals(
        tempForecast,
        historicalData,
        0.95,
        horizonSteps,
        uncertaintyCal
      );

      forecast.push({
        year: futureYear,
        predicted: constrainedValue,
        lowerBound: withUncertainty[0].lowerBound,
        upperBound: withUncertainty[0].upperBound,
        confidence: withUncertainty[0].confidence,
        method: 'enhanced_ensemble',
        methodPredictions,
        weights
      });
    }

    if (gapYears > 0 && forecast.length > 0) {
      const firstFuturePred = forecast[0].predicted;
      const firstFutureYear = anchorYear + 1;
      const denom = firstFutureYear - lastHistoricalYear;
      const gapYearForecasts = [];
      for (let g = 1; g <= gapYears; g++) {
        const gapYear = lastHistoricalYear + g;
        const t = g / denom;
        const interpolated = lastValue + (firstFuturePred - lastValue) * t;
        gapYearForecasts.push({
          year: gapYear,
          predicted: Math.max(0, Math.min(100, interpolated)),
          lowerBound: Math.max(0, interpolated - 2),
          upperBound: Math.min(100, interpolated + 2),
          confidence: 0.7,
          method: 'enhanced_ensemble',
          isGapYear: true
        });
      }
      forecast.unshift(...gapYearForecasts);
    }
    
    return {
      forecast,
      methods,
      weights,
      spatialInfo
    };
  }
};

// Export for use in other modules
window.EnhancedForecastingModels = EnhancedForecastingModels;
