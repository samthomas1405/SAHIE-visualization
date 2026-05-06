// Time Series Forecasting Models
// ==============================
// Predicts future values based on historical trends (2006-2022)

const ForecastingModels = {

  // Cache for fetchAllHistoricalData: key = demographics hash, value = { [fips]: [{year,value}] }
  _allHistoricalCache: null,
  _allHistoricalCacheKey: null,

  /**
   * Anchor year for forecasts: last historical year by default, or max(lastHist, wall clock).
   * Pass anchorYearOverride for backtests (e.g. last training year).
   */
  resolveAnchorYear(historicalData, anchorYearOverride) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const lastHistoricalYear = sorted[sorted.length - 1].year;
    const anchorYear = anchorYearOverride != null
      ? anchorYearOverride
      : Math.max(lastHistoricalYear, new Date().getFullYear());
    const yearsGap = anchorYear - lastHistoricalYear;
    return { sorted, lastHistoricalYear, anchorYear, yearsGap };
  },

  /** Sigmoid soft clamp into (0, 100) for ensemble saturation */
  softPct(x, steepness = 0.12, midpoint = 50) {
    return Math.max(0, Math.min(100, 100 / (1 + Math.exp(-steepness * (x - midpoint)))));
  },

  _holtFitState(values, alpha, beta) {
    let level = values[0];
    let trend = values.length > 1 ? values[1] - values[0] : 0;
    for (let i = 1; i < values.length; i++) {
      const prevL = level;
      const prevT = trend;
      level = alpha * values[i] + (1 - alpha) * (prevL + prevT);
      trend = beta * (level - prevL) + (1 - beta) * prevT;
    }
    return { level, trend };
  },

  /** One-step-ahead forecast at end of series (next point) */
  _holtOneStepAhead(trainData, alpha, beta) {
    if (!trainData || trainData.length < 2) return null;
    const vals = [...trainData].sort((a, b) => a.year - b.year).map(d => d.value);
    const { level, trend } = this._holtFitState(vals, alpha, beta);
    return level + trend;
  },

  /** Grid search Holt (alpha, beta) by one-step-ahead MSE on expanding windows */
  selectHoltsParams(historicalData) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const alphas = [0.1, 0.3, 0.5, 0.7, 0.9];
    const betas = [0.01, 0.05, 0.1, 0.2];
    let best = { alpha: 0.3, beta: 0.1, mse: Infinity };
    if (sorted.length < 4) return { alpha: 0.3, beta: 0.1 };
    for (const alpha of alphas) {
      for (const beta of betas) {
        let sse = 0;
        let count = 0;
        for (let t = 2; t < sorted.length; t++) {
          const train = sorted.slice(0, t);
          const actual = sorted[t].value;
          const pred = this._holtOneStepAhead(train, alpha, beta);
          if (pred == null) continue;
          const e = pred - actual;
          sse += e * e;
          count++;
        }
        const mse = count > 0 ? sse / count : Infinity;
        if (mse < best.mse) best = { alpha, beta, mse };
      }
    }
    return { alpha: best.alpha, beta: best.beta };
  },

  // Fetch historical time series data for insurance coverage
  async fetchHistoricalInsuranceData(fips, demographics = {}) {
    try {
      const isState = fips.length === 2;
      const geoClause = isState ? 'for=state:*' : 'for=county:*&in=state:*';
      const raceParam = isState && demographics.raceCat !== undefined && demographics.raceCat !== '0' 
        ? `&RACECAT=${demographics.raceCat}` : '';
      const getParams = isState
        ? 'get=NAME,PCTIC_PT,STATE'
        : 'get=NAME,PCTIC_PT,STATE,COUNTY';

      const ageCat = demographics.ageCat || 0;
      const sexCat = demographics.sexCat || 0;
      const iprCat = demographics.iprCat || 0;

      // Fetch all years 2006-2022 (historical data available)
      const years = [];
      for (let year = 2006; year <= 2022; year++) {
        const url = `https://api.census.gov/data/timeseries/healthins/sahie?${getParams}&${geoClause}&AGECAT=${ageCat}&SEXCAT=${sexCat}&IPRCAT=${iprCat}${raceParam}&time=${year}`;
        try {
          const response = await fetch(url);
          const data = await response.json();
          const rows = data.slice(1);
          
          for (const row of rows) {
            const stateFIPS = row[2];
            const key = isState ? stateFIPS : `${stateFIPS}${row[3]}`.padStart(5, '0');
            if (key === fips) {
              const value = parseFloat(row[1]);
              if (!isNaN(value)) {
                years.push({ year, value });
              }
              break;
            }
          }
        } catch (error) {
          console.warn(`Error fetching data for year ${year}:`, error);
        }
      }
      
      return years.sort((a, b) => a.year - b.year);
    } catch (error) {
      console.error('Error fetching historical insurance data:', error);
      return [];
    }
  },

  /**
   * Fetch historical data for ALL locations (states or counties) for spatial/hierarchical forecasting.
   * Results cached by demographics + mapLevel to avoid repeated API calls.
   * @param {Object} demographics - ageCat, sexCat, raceCat, iprCat
   * @param {string} mapLevel - 'state' or 'county'
   * @returns {Object} { [fips]: [{ year, value }, ...] }
   */
  async fetchAllHistoricalData(demographics = {}, mapLevel = 'county') {
    const ageCat = demographics.ageCat || 0;
    const sexCat = demographics.sexCat || 0;
    const iprCat = demographics.iprCat || 0;
    const raceCat = demographics.raceCat || 0;
    const cacheKey = `${mapLevel}:${ageCat}:${sexCat}:${iprCat}:${raceCat}`;

    if (this._allHistoricalCache && this._allHistoricalCacheKey === cacheKey) {
      return this._allHistoricalCache;
    }

    try {
      const isState = mapLevel === 'state';
      const geoClause = isState ? 'for=state:*' : 'for=county:*&in=state:*';
      const raceParam = isState && raceCat !== '0' ? `&RACECAT=${raceCat}` : '';
      const getParams = isState
        ? 'get=NAME,PCTIC_PT,STATE'
        : 'get=NAME,PCTIC_PT,STATE,COUNTY';

      const allData = {};

      for (let year = 2006; year <= 2022; year++) {
        const url = `https://api.census.gov/data/timeseries/healthins/sahie?${getParams}&${geoClause}&AGECAT=${ageCat}&SEXCAT=${sexCat}&IPRCAT=${iprCat}${raceParam}&time=${year}`;
        try {
          const response = await fetch(url);
          const data = await response.json();
          const rows = data.slice(1);
          for (const row of rows) {
            const stateFIPS = row[2];
            const key = isState ? stateFIPS : `${stateFIPS}${row[3]}`.padStart(5, '0');
            const value = parseFloat(row[1]);
            if (!isNaN(value)) {
              if (!allData[key]) allData[key] = [];
              allData[key].push({ year, value });
            }
          }
        } catch (error) {
          console.warn(`Error fetching data for year ${year}:`, error);
        }
      }

      for (const fips of Object.keys(allData)) {
        allData[fips].sort((a, b) => a.year - b.year);
      }

      this._allHistoricalCache = allData;
      this._allHistoricalCacheKey = cacheKey;
      return allData;
    } catch (error) {
      console.error('Error fetching all historical data:', error);
      return {};
    }
  },

  // 5-year linear regression (uses only last 5 years of data)
  forecast5YearLinear(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], trend: null, rSquared: 0, slope: 0 };
    }

    // Use only last 5 years
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const recentData = sorted.slice(-5);
    const n = recentData.length;
    const years = recentData.map(d => d.year);
    const values = recentData.map(d => d.value);
    
    // Calculate means
    const meanYear = years.reduce((s, y) => s + y, 0) / n;
    const meanValue = values.reduce((s, v) => s + v, 0) / n;
    
    // Calculate slope (b) and intercept (a) for y = a + b*x
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const dx = years[i] - meanYear;
      const dy = values[i] - meanValue;
      numerator += dx * dy;
      denominator += dx * dx;
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = meanValue - slope * meanYear;
    
    // Calculate R-squared (coefficient of determination)
    let ssRes = 0; // Residual sum of squares
    let ssTot = 0; // Total sum of squares
    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * years[i];
      const residual = values[i] - predicted;
      ssRes += residual * residual;
      const total = values[i] - meanValue;
      ssTot += total * total;
    }
    const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
    
    const { anchorYear } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const predicted = intercept + slope * futureYear;
      
      // Calculate confidence interval (95% CI using standard error)
      const stdError = Math.sqrt(ssRes / (n - 2));
      const xMeanSq = years.reduce((s, y) => s + Math.pow(y - meanYear, 2), 0) / n;
      const tValue = 1.96; // Approximate t-value for 95% CI
      const margin = tValue * stdError * Math.sqrt(1 + (1/n) + Math.pow(futureYear - meanYear, 2) / xMeanSq);
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)), // Clamp to 0-100%
        lowerBound: Math.max(0, Math.min(100, predicted - margin)),
        upperBound: Math.max(0, Math.min(100, predicted + margin)),
        confidence: Math.max(0, Math.min(1, rSquared)) // Use R² as confidence proxy
      });
    }
    
    return {
      forecast,
      trend: { intercept, slope, rSquared },
      rSquared,
      slope
    };
  },

  // Holt's Linear (Double Exponential Smoothing with Trend); optional grid-selected (alpha, beta)
  forecastHoltsLinear(historicalData, yearsAhead = 5, alpha = null, beta = null, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], level: null, trend: null };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);
    const years = sorted.map(d => d.year);

    let a = alpha;
    let b = beta;
    if (a == null || b == null) {
      const sel = this.selectHoltsParams(sorted);
      a = a == null ? sel.alpha : a;
      b = b == null ? sel.beta : b;
    }
    
    let level = values[0];
    let trend = values.length > 1 ? values[1] - values[0] : 0;
    const levels = [level];
    const trends = [trend];
    
    for (let i = 1; i < values.length; i++) {
      const prevLevel = level;
      const prevTrend = trend;
      level = a * values[i] + (1 - a) * (prevLevel + prevTrend);
      trend = b * (level - prevLevel) + (1 - b) * prevTrend;
      levels.push(level);
      trends.push(trend);
    }
    
    const { anchorYear: anchor, yearsGap } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchor + i;
      const h = yearsGap + i;
      const predicted = level + h * trend;
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.75
      });
    }
    
    return { 
      forecast, 
      level: level,
      trend: trend,
      rSquared: this.calculateRSquared(values, levels.slice(0, values.length)),
      holtsAlpha: a,
      holtsBeta: b
    };
  },

  /** Holt's damped trend: long horizons pull trend toward zero via phi in (0,1) */
  forecastDampedHolts(historicalData, yearsAhead = 5, phi = 0.9, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], level: null, trend: null };
    }
    const sel = this.selectHoltsParams(historicalData);
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);
    const { level, trend } = this._holtFitState(values, sel.alpha, sel.beta);
    const { anchorYear: anchor, yearsGap } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchor + i;
      const h = yearsGap + i;
      let sumPhi = 0;
      for (let j = 1; j <= h; j++) sumPhi += Math.pow(phi, j);
      const predicted = level + sumPhi * trend;
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.72,
        method: 'damped_holts'
      });
    }
    const holtRef = this.forecastHoltsLinear(historicalData, 1, sel.alpha, sel.beta, anchorYearOverride);
    return {
      forecast,
      level,
      trend,
      phi,
      rSquared: holtRef.rSquared != null ? holtRef.rSquared : 0
    };
  },
  
  // Helper function to calculate R²
  calculateRSquared(actual, predicted) {
    if (actual.length !== predicted.length || actual.length < 2) return 0;
    const meanActual = actual.reduce((s, v) => s + v, 0) / actual.length;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < actual.length; i++) {
      ssRes += Math.pow(actual[i] - predicted[i], 2);
      ssTot += Math.pow(actual[i] - meanActual, 2);
    }
    return ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
  },

  // ARIMA(1,1,1) - AutoRegressive Integrated Moving Average (simplified)
  forecastARIMA111(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 4) {
      return { forecast: [], arCoeff: 0, maCoeff: 0, rSquared: 0 };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);
    const n = values.length;
    
    const diffValues = [];
    for (let i = 1; i < n; i++) {
      diffValues.push(values[i] - values[i - 1]);
    }
    
    if (diffValues.length < 3) {
      return { forecast: [], arCoeff: 0, maCoeff: 0, rSquared: 0 };
    }
    
    let arSum = 0;
    let arDenom = 0;
    for (let i = 1; i < diffValues.length; i++) {
      arSum += diffValues[i] * diffValues[i - 1];
      arDenom += diffValues[i - 1] * diffValues[i - 1];
    }
    const arCoeff = arDenom !== 0 ? Math.max(-0.9, Math.min(0.9, arSum / arDenom)) : 0;
    
    const residuals = [diffValues[0]];
    for (let i = 1; i < diffValues.length; i++) {
      const predicted = arCoeff * diffValues[i - 1];
      residuals.push(diffValues[i] - predicted);
    }
    
    let maSum = 0;
    let maDenom = 0;
    for (let i = 1; i < residuals.length; i++) {
      maSum += residuals[i] * residuals[i - 1];
      maDenom += residuals[i - 1] * residuals[i - 1];
    }
    const maCoeff = maDenom !== 0 ? Math.max(-0.9, Math.min(0.9, maSum / maDenom)) : 0;

    let ssResD = 0;
    let ssTotD = 0;
    const meanD = diffValues.reduce((s, v) => s + v, 0) / diffValues.length;
    for (let i = 1; i < diffValues.length; i++) {
      const predDiff = arCoeff * diffValues[i - 1] + maCoeff * residuals[i - 1];
      ssResD += Math.pow(diffValues[i] - predDiff, 2);
      ssTotD += Math.pow(diffValues[i] - meanD, 2);
    }
    const rSquared = ssTotD > 0 ? Math.max(0, Math.min(1, 1 - ssResD / ssTotD)) : 0;

    const { anchorYear: anchor } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    
    let lastDiff = diffValues[diffValues.length - 1];
    let lastResidual = residuals[residuals.length - 1];
    let lastValue = values[values.length - 1];
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchor + i;
      const forecastDiff = arCoeff * lastDiff + maCoeff * lastResidual;
      const predicted = lastValue + forecastDiff;
      const prevDiff = lastDiff;
      lastDiff = forecastDiff;
      lastResidual = forecastDiff - arCoeff * prevDiff;
      lastValue = predicted;
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.72
      });
    }
    
    return { 
      forecast, 
      arCoeff: arCoeff,
      maCoeff: maCoeff,
      rSquared: Math.max(0, Math.min(1, rSquared))
    };
  },

  // Compound annual growth rate (CAGR) forecast
  forecastCAGR(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 2) {
      return { forecast: [], cagr: 0 };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const firstValue = sorted[0].value;
    const lastValue = sorted[sorted.length - 1].value;
    const firstYear = sorted[0].year;
    const lastYear = sorted[sorted.length - 1].year;
    const periods = lastYear - firstYear;
    
    if (periods === 0 || firstValue <= 0) {
      return { forecast: [], cagr: 0 };
    }
    
    const cagr = Math.pow(lastValue / firstValue, 1 / periods) - 1;
    const { anchorYear, yearsGap } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const predicted = lastValue * Math.pow(1 + cagr, yearsGap + i);
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        cagr: cagr * 100 // Convert to percentage
      });
    }
    
    return { forecast, cagr: cagr * 100 };
  },

  // Polynomial regression (2nd and 3rd degree) - captures non-linear trends
  forecastPolynomial(historicalData, yearsAhead = 5, degree = 2, anchorYearOverride = null) {
    if (historicalData.length < degree + 2) {
      return { forecast: [], rSquared: 0, coefficients: [] };
    }

    const sortedPoly = [...historicalData].sort((a, b) => a.year - b.year);
    const n = sortedPoly.length;
    const years = sortedPoly.map(d => d.year);
    const values = sortedPoly.map(d => d.value);
    
    // Center years for numerical stability
    const meanYear = years.reduce((s, y) => s + y, 0) / n;
    const centeredYears = years.map(y => y - meanYear);
    
    // Build design matrix X
    const X = [];
    for (let i = 0; i < n; i++) {
      const row = [1]; // intercept
      for (let d = 1; d <= degree; d++) {
        row.push(Math.pow(centeredYears[i], d));
      }
      X.push(row);
    }
    
    // Solve using normal equation: (X'X)^(-1)X'y
    // Simplified: use least squares
    const coefficients = this.leastSquares(X, values);
    
    // Calculate R-squared
    let ssRes = 0, ssTot = 0;
    const meanValue = values.reduce((s, v) => s + v, 0) / n;
    for (let i = 0; i < n; i++) {
      let predicted = coefficients[0];
      for (let d = 1; d <= degree; d++) {
        predicted += coefficients[d] * Math.pow(centeredYears[i], d);
      }
      ssRes += Math.pow(values[i] - predicted, 2);
      ssTot += Math.pow(values[i] - meanValue, 2);
    }
    const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
    
    const { anchorYear } = this.resolveAnchorYear(sortedPoly, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const centeredFutureYear = futureYear - meanYear;
      let predicted = coefficients[0];
      for (let d = 1; d <= degree; d++) {
        predicted += coefficients[d] * Math.pow(centeredFutureYear, d);
      }
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: Math.max(0, Math.min(1, rSquared))
      });
    }
    
    return { forecast, rSquared, coefficients, degree };
  },

  // Least squares solver for polynomial regression
  leastSquares(X, y) {
    // Simple matrix multiplication: (X'X)^(-1)X'y
    // For small matrices, use Gaussian elimination
    const n = X.length;
    const m = X[0].length;
    
    // X'X
    const XtX = [];
    for (let i = 0; i < m; i++) {
      XtX[i] = [];
      for (let j = 0; j < m; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += X[k][i] * X[k][j];
        }
        XtX[i][j] = sum;
      }
    }
    
    // X'y
    const Xty = [];
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * y[k];
      }
      Xty[i] = sum;
    }
    
    // Solve XtX * coefficients = Xty using Gaussian elimination
    return this.solveLinearSystem(XtX, Xty);
  },

  // Gaussian elimination for solving linear systems
  solveLinearSystem(A, b) {
    const n = A.length;
    const augmented = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // Eliminate
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }
    
    return x;
  },

  // Weighted linear regression (gives more weight to recent data)
  forecastWeightedLinear(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    if (historicalData.length < 3) {
      return { forecast: [], rSquared: 0, slope: 0 };
    }

    const sortedW = [...historicalData].sort((a, b) => a.year - b.year);
    const n = sortedW.length;
    const years = sortedW.map(d => d.year);
    const values = sortedW.map(d => d.value);
    
    // More aggressive exponential weights: recent data gets MUCH more weight
    // Use stronger decay factor (0.5 instead of 0.3) to emphasize recent trends
    const weights = [];
    for (let i = 0; i < n; i++) {
      // Recent data points (last 5 years) get significantly more weight
      const recentWeightBoost = i >= n - 5 ? 1.5 : 1.0;
      weights.push(Math.exp((i - (n - 1)) * 0.5) * recentWeightBoost);
    }
    const sumWeights = weights.reduce((s, w) => s + w, 0);
    
    // Weighted means
    let weightedMeanYear = 0, weightedMeanValue = 0;
    for (let i = 0; i < n; i++) {
      weightedMeanYear += years[i] * weights[i];
      weightedMeanValue += values[i] * weights[i];
    }
    weightedMeanYear /= sumWeights;
    weightedMeanValue /= sumWeights;
    
    // Weighted slope and intercept
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      const dx = years[i] - weightedMeanYear;
      const dy = values[i] - weightedMeanValue;
      numerator += weights[i] * dx * dy;
      denominator += weights[i] * dx * dx;
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = weightedMeanValue - slope * weightedMeanYear;
    
    // Calculate weighted R-squared
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * years[i];
      const residual = values[i] - predicted;
      ssRes += weights[i] * residual * residual;
      const total = values[i] - weightedMeanValue;
      ssTot += weights[i] * total * total;
    }
    const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;
    
    const { anchorYear } = this.resolveAnchorYear(sortedW, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const predicted = intercept + slope * futureYear;
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: Math.max(0, Math.min(1, rSquared))
      });
    }
    
    return { forecast, rSquared, slope, intercept };
  },

  /** BIC for AR order selection on a value series */
  selectAROrder(values, maxOrder = 4) {
    const n = values.length;
    let best = { order: 1, bic: Infinity };
    for (let order = 1; order <= Math.min(maxOrder, n - 3); order++) {
      const X = [];
      const y = [];
      for (let i = order; i < n; i++) {
        const row = [1];
        for (let j = 1; j <= order; j++) row.push(values[i - j]);
        X.push(row);
        y.push(values[i]);
      }
      const m = y.length;
      if (m < order + 2) continue;
      const coeffs = this.leastSquares(X, y);
      let sse = 0;
      for (let r = 0; r < m; r++) {
        let pred = coeffs[0];
        for (let j = 0; j < order; j++) pred += coeffs[j + 1] * X[r][j + 1];
        sse += Math.pow(y[r] - pred, 2);
      }
      const k = order + 1;
      const bic = m * Math.log(sse / m + 1e-10) + k * Math.log(m);
      if (bic < best.bic) best = { order, bic };
    }
    return best.bic === Infinity ? 1 : best.order;
  },

  // Autoregressive (AR) model - BIC order selection (1..4)
  forecastAR(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    const sortedAR = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sortedAR.map(d => d.value);
    const order = this.selectAROrder(values, 4);
    if (sortedAR.length < order + 2) {
      return { forecast: [], coefficients: [], order, rSquared: 0 };
    }
    const n = values.length;
    
    const X = [];
    const y = [];
    for (let i = order; i < n; i++) {
      const row = [1];
      for (let j = 1; j <= order; j++) {
        row.push(values[i - j]);
      }
      X.push(row);
      y.push(values[i]);
    }
    
    const coefficients = this.leastSquares(X, y);
    const fitted = y.map((_, r) => {
      let pred = coefficients[0];
      for (let j = 0; j < order; j++) pred += coefficients[j + 1] * X[r][j + 1];
      return pred;
    });
    const rSquared = this.calculateRSquared(y, fitted);

    const { anchorYear } = this.resolveAnchorYear(sortedAR, anchorYearOverride);
    const forecast = [];
    const recentValues = values.slice(-order);
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      let predicted = coefficients[0];
      for (let j = 0; j < order; j++) {
        const valueIndex = order - 1 - j;
        predicted += coefficients[j + 1] * recentValues[valueIndex];
      }
      recentValues.shift();
      recentValues.push(predicted);
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: Math.max(0.5, Math.min(1, rSquared))
      });
    }
    
    return { forecast, coefficients, order, rSquared: Math.max(0, Math.min(1, rSquared)) };
  },

  // Moving average with trend detection
  forecastMovingAverage(historicalData, yearsAhead = 5, window = 3, anchorYearOverride = null) {
    if (historicalData.length < window + 1) {
      return { forecast: [], trend: 0 };
    }

    const sortedMA = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sortedMA.map(d => d.value);
    const years = sortedMA.map(d => d.year);
    
    // Calculate moving average for last window
    let sum = 0;
    for (let i = values.length - window; i < values.length; i++) {
      sum += values[i];
    }
    const movingAvg = sum / window;
    
    // Calculate trend from moving averages
    const movingAvgs = [];
    for (let i = window - 1; i < values.length; i++) {
      let wSum = 0;
      for (let j = i - window + 1; j <= i; j++) {
        wSum += values[j];
      }
      movingAvgs.push(wSum / window);
    }
    
    let trend = 0;
    if (movingAvgs.length >= 2) {
      trend = (movingAvgs[movingAvgs.length - 1] - movingAvgs[0]) / (movingAvgs.length - 1);
    }
    
    const { anchorYear, yearsGap } = this.resolveAnchorYear(sortedMA, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = anchorYear + i;
      const predicted = movingAvg + trend * (yearsGap + i);
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.7
      });
    }
    
    return { forecast, trend, movingAvg };
  },

  /** Naive: repeat last observed value */
  forecastNaive(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1];
    const { anchorYear } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      forecast.push({
        year: anchorYear + i,
        predicted: Math.max(0, Math.min(100, last.value)),
        confidence: 0.55,
        method: 'naive'
      });
    }
    return { forecast, rSquared: 0 };
  },

  /**
   * Global pooled gradient-boosted trees (trained offline; see scripts/train-xgboost-model.mjs).
   * Exposed as ensemble method `xgboostGlobal`. Requires window.XGBGLOBAL_MODEL_JSON, XGBoostFeatures, XGBoostScorer.
   */
  forecastXGBoostGlobal(historicalData, yearsAhead = 5, anchorYearOverride = null, fips = '', allData = {}) {
    const XF = typeof XGBoostFeatures !== 'undefined' ? XGBoostFeatures : (typeof window !== 'undefined' && window.XGBoostFeatures);
    const XS = typeof XGBoostScorer !== 'undefined' ? XGBoostScorer : (typeof window !== 'undefined' && window.XGBoostScorer);
    const model = typeof window !== 'undefined' && window.XGBGLOBAL_MODEL_JSON;
    if (!XF || !XS || !model || !model.trees || !historicalData || historicalData.length < 5) {
      return { forecast: [], error: 'Global tree model unavailable' };
    }
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const { anchorYear } = this.resolveAnchorYear(sorted, anchorYearOverride);
    let working = sorted.filter((d) => d.year <= anchorYear);
    if (working.length < 5) return { forecast: [], error: 'Insufficient data' };

    const forecast = [];
    for (let h = 1; h <= yearsAhead; h++) {
      const anchor = working[working.length - 1].year;
      const feat = XF.buildFeatureVector(working, fips, allData, anchor);
      if (!feat) break;
      const pred = XS.predictOne(model, feat);
      if (pred == null || isNaN(pred)) break;
      const futureYear = anchorYear + h;
      forecast.push({
        year: futureYear,
        predicted: pred,
        confidence: 0.65,
        method: 'xgboost_global'
      });
      working = [...working, { year: futureYear, value: pred }].sort((a, b) => a.year - b.year);
    }
    if (forecast.length === 0) return { forecast: [], error: 'Global model prediction failed' };
    return { forecast, rSquared: 0.55 };
  },

  /** Drift: extend line from first to last observation */
  forecastDrift(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    if (sorted.length < 2) return { forecast: [], rSquared: 0 };
    const y0 = sorted[0].value;
    const yT = sorted[sorted.length - 1].value;
    const t0 = sorted[0].year;
    const tT = sorted[sorted.length - 1].year;
    const slope = (yT - y0) / Math.max(1, tT - t0);
    const { anchorYear, lastHistoricalYear } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const y = anchorYear + i;
      const h = y - lastHistoricalYear;
      const predicted = yT + slope * h;
      forecast.push({
        year: y,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.6,
        method: 'drift'
      });
    }
    return { forecast, slope, rSquared: 0.5 };
  },

  /** Theta-style: OLS trend + SES on residuals; combine with equal weight to last-value extrapolation */
  forecastTheta(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    if (sorted.length < 4) return { forecast: [], rSquared: 0 };
    const n = sorted.length;
    const years = sorted.map(d => d.year);
    const vals = sorted.map(d => d.value);
    const meanT = years.reduce((s, y) => s + y, 0) / n;
    const meanV = vals.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (years[i] - meanT) * (vals[i] - meanV);
      den += (years[i] - meanT) ** 2;
    }
    const b = den !== 0 ? num / den : 0;
    const a = meanV - b * meanT;
    const trendFit = years.map(t => a + b * t);
    const resid = vals.map((v, i) => v - trendFit[i]);

    const alphas = [0.2, 0.35, 0.5, 0.65, 0.8];
    let bestAlpha = 0.35;
    let bestMse = Infinity;
    for (const alpha of alphas) {
      let level = resid[0], mse = 0, cnt = 0;
      for (let i = 1; i < resid.length; i++) {
        const pred = level;
        mse += (pred - resid[i]) ** 2;
        cnt++;
        level = alpha * resid[i] + (1 - alpha) * level;
      }
      if (cnt > 0 && mse / cnt < bestMse) {
        bestMse = mse / cnt;
        bestAlpha = alpha;
      }
    }
    let sesLevel = resid[0];
    for (let i = 1; i < resid.length; i++) {
      sesLevel = bestAlpha * resid[i] + (1 - bestAlpha) * sesLevel;
    }

    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      ssRes += (vals[i] - trendFit[i]) ** 2;
      ssTot += (vals[i] - meanV) ** 2;
    }
    const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

    const lastYear = years[n - 1];
    const lastVal = vals[n - 1];
    const { anchorYear, yearsGap } = this.resolveAnchorYear(sorted, anchorYearOverride);
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const y = anchorYear + i;
      const h = yearsGap + i;
      const lin = a + b * y;
      const sescontrib = sesLevel * Math.pow(0.92, h);
      const naiveLin = lastVal + b * (y - lastYear);
      const pred = 0.5 * (lin + sescontrib) + 0.5 * naiveLin;
      forecast.push({
        year: y,
        predicted: Math.max(0, Math.min(100, pred)),
        confidence: Math.max(0.5, rSquared)
      });
    }
    return { forecast, rSquared, thetaAlpha: bestAlpha };
  },

  // Balanced ensemble forecasting with recent trends and historical context
  forecastEnsemble(historicalData, yearsAhead = 5, anchorYearOverride = null) {
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const lastValue = sorted[sorted.length - 1].value;
    const firstValue = sorted[0].value;
    const { anchorYear: currentYear, lastHistoricalYear } = this.resolveAnchorYear(sorted, anchorYearOverride);
    
    // Calculate recent trend from last 3-5 years (most relevant)
    const recentYears = sorted.slice(-5); // Last 5 years
    const recentYearChanges = [];
    for (let i = 1; i < recentYears.length; i++) {
      const change = recentYears[i].value - recentYears[i - 1].value;
      recentYearChanges.push(change);
    }
    
    // Calculate average recent year-over-year change
    const avgRecentChange = recentYearChanges.length > 0
      ? recentYearChanges.reduce((sum, c) => sum + c, 0) / recentYearChanges.length
      : 0;
    
    // Calculate recent trend rate (per year) from last 5 years
    const recentTrendRate = recentYears.length >= 2
      ? (recentYears[recentYears.length - 1].value - recentYears[0].value) / (recentYears.length - 1)
      : 0;
    
    // Calculate longer-term trend (all historical data) for context
    const longTermTrendRate = sorted.length >= 2
      ? (lastValue - firstValue) / (sorted[sorted.length - 1].year - sorted[0].year)
      : 0;
    
    // Calculate historical volatility (standard deviation of year-over-year changes)
    const allYearChanges = [];
    for (let i = 1; i < sorted.length; i++) {
      allYearChanges.push(sorted[i].value - sorted[i - 1].value);
    }
    const avgAllChanges = allYearChanges.length > 0
      ? allYearChanges.reduce((sum, c) => sum + c, 0) / allYearChanges.length
      : 0;
    const variance = allYearChanges.length > 1
      ? allYearChanges.reduce((sum, c) => sum + Math.pow(c - avgAllChanges, 2), 0) / allYearChanges.length
      : 0;
    const historicalVolatility = Math.sqrt(variance);
    
    // Use weighted average: 70% recent trend, 30% longer-term trend for stability
    const baseTrendRate = recentTrendRate * 0.7 + longTermTrendRate * 0.3;
    
    // Use year-over-year average if it's more conservative (less extreme)
    const conservativeTrendRate = Math.abs(avgRecentChange) < Math.abs(baseTrendRate)
      ? avgRecentChange
      : baseTrendRate;
    
    const linear5Year = this.forecast5YearLinear(historicalData, yearsAhead, currentYear);
    const holts = this.forecastHoltsLinear(historicalData, yearsAhead, null, null, currentYear);
    const arima = this.forecastARIMA111(historicalData, yearsAhead, currentYear);
    const quadratic = this.forecastPolynomial(historicalData, yearsAhead, 2, currentYear);
    const cagr = this.forecastCAGR(historicalData, yearsAhead, currentYear);
    
    const methods = {
      linear5Year, holts, arima, quadratic, cagr
    };
    
    const forecast = [];
    const realisticMax = 96.0;
    const gapYears = Math.max(0, currentYear - lastHistoricalYear);
    
    // Track the previous forecast value for sequential calculation
    let previousForecastValue = lastValue;
    
    // First, fill in gap years (2023, 2024, 2025 if last data is 2022)
    for (let gap = 1; gap <= gapYears; gap++) {
      const gapYear = lastHistoricalYear + gap;
      const yearsFromLast = gap;
      
      // Base projection from trend - build sequentially from previous value
      const baseValue = gap === 1 ? lastValue : previousForecastValue;
      let trendProjection = baseValue + (conservativeTrendRate * 1); // Project 1 year ahead
      
      // Apply saturation: growth slows as we approach high percentages
      if (baseValue > 80) {
        const saturationFactor = 1.0 - ((baseValue - 80) / 20) * 0.4;
        trendProjection = baseValue + (conservativeTrendRate * saturationFactor * 1);
      }
      
      // Gentle decay over time
      const timeDecay = Math.exp(-yearsFromLast * 0.05);
      trendProjection = baseValue + (conservativeTrendRate * timeDecay * 1);
      
      // Get method predictions for this gap year
      const predictions = [];
      let totalWeight = 0;
      
      for (const [name, result] of Object.entries(methods)) {
        // For gap years, we need to calculate what the method would predict
        // Use the method's trend to project forward
        let value;
        if (name === 'linear5Year' && result.trend) {
          value = result.trend.intercept + result.trend.slope * gapYear;
        } else if (name === 'holts' && result.level !== undefined && result.trend !== undefined) {
          value = result.level + (yearsFromLast * result.trend);
        } else if (name === 'arima' && result.arCoeff !== undefined) {
          // For ARIMA, use simplified projection
          const diffEstimate = conservativeTrendRate;
          value = lastValue + (diffEstimate * yearsFromLast);
        } else if (name === 'quadratic' && result.rSquared !== undefined) {
          // For quadratic, use linear approximation for gap years
          value = lastValue + (conservativeTrendRate * yearsFromLast);
        } else if (name === 'cagr' && result.cagr !== undefined) {
          value = lastValue * Math.pow(1 + result.cagr / 100, yearsFromLast);
        } else {
          // For other methods, use simple trend projection
          value = lastValue + (conservativeTrendRate * yearsFromLast);
        }
        
        // Cap extreme predictions
        if (value > realisticMax) {
          const excess = value - realisticMax;
          value = realisticMax + excess * Math.exp(-excess / 3);
        }
        if (value < 0) {
          value = 0;
        }
        
        // Base weight on method quality
        let weight = 0.1;
        if (result.rSquared !== undefined && result.rSquared > 0) {
          weight = result.rSquared * 0.6;
        }
        
        // Boost weight if prediction aligns with trend
        const diffFromTrend = Math.abs(value - trendProjection);
        const maxDiff = Math.max(8, Math.abs(conservativeTrendRate * yearsFromLast * 2.5));
        const alignmentScore = 1.0 - Math.min(1.0, diffFromTrend / maxDiff);
        weight = weight * (0.4 + alignmentScore * 0.6);
        
        // Moderate penalty for extreme predictions
        if (value > 97 || value < lastValue - 8) {
          weight *= 0.4;
        } else if (value > 94 || value < lastValue - 5) {
          weight *= 0.7;
        }
        
        // Prefer simpler, more stable methods
        if (name === 'linear5Year' || name === 'cagr') {
          weight *= 1.15;
        } else if (name === 'holts' || name === 'quadratic') {
          weight *= 1.05;
        } else if (name === 'arima') {
          weight *= 0.95; // Slightly lower weight for ARIMA (more complex)
        }
        
        if (weight > 0.01) {
          predictions.push({ value: value, weight: weight });
          totalWeight += weight;
        }
      }
      
      // Calculate weighted average of method predictions
      let methodAverage = baseValue;
      if (predictions.length > 0 && totalWeight > 0) {
        methodAverage = predictions.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;
      }
      
      let ensembleValue = trendProjection * 0.6 + methodAverage * 0.4;
      ensembleValue = Math.min(ensembleValue, realisticMax);
      
      const maxYearlyChange = Math.min(4.0, Math.abs(conservativeTrendRate) * 1.8 + historicalVolatility);
      const minYearlyChange = -Math.min(3.0, Math.abs(conservativeTrendRate) * 1.5 + historicalVolatility);
      ensembleValue = Math.max(
        baseValue + minYearlyChange,
        Math.min(baseValue + maxYearlyChange, ensembleValue)
      );
      
      if (baseValue > 90) {
        const remainingSpace = 100 - baseValue;
        const maxGrowth = remainingSpace * 0.25 * Math.exp(-yearsFromLast * 0.15);
        ensembleValue = Math.min(ensembleValue, baseValue + maxGrowth);
      }
      
      ensembleValue = this.softPct(ensembleValue, 0.1, Math.min(92, Math.max(8, baseValue)));
      
      let confidence = 0.7;
      if (recentYearChanges.length > 1) {
        const recentVariance = recentYearChanges.reduce((sum, c) => {
          return sum + Math.pow(c - avgRecentChange, 2);
        }, 0) / recentYearChanges.length;
        const recentStdDev = Math.sqrt(recentVariance);
        const coefficientOfVariation = Math.abs(avgRecentChange) > 0.1 
          ? recentStdDev / Math.abs(avgRecentChange) 
          : 0.3;
        const stabilityScore = Math.max(0.5, 1.0 - Math.min(0.5, coefficientOfVariation));
        const trendAlignment = Math.abs(recentTrendRate - longTermTrendRate) < 0.5 ? 1.0 : 0.8;
        confidence = Math.min(0.9, Math.max(0.5, (stabilityScore + trendAlignment) / 2));
      }
      
      const stdError = historicalVolatility * Math.sqrt(yearsFromLast);
      const lowerBound = Math.max(0, ensembleValue - 1.5 * stdError);
      const upperBound = Math.min(100, ensembleValue + 1.5 * stdError);
      
      forecast.push({
        year: gapYear,
        predicted: Math.round(ensembleValue * 10) / 10,
        confidence: confidence,
        lowerBound: Math.round(lowerBound * 10) / 10,
        upperBound: Math.round(upperBound * 10) / 10,
        method: 'ensemble',
        isGapYear: true // Mark as gap year
      });
      
      // Update previous value for next iteration
      previousForecastValue = ensembleValue;
    }
    
    // Now generate forecasts for the requested years ahead (starting from currentYear + 1)
    for (let i = 0; i < yearsAhead; i++) {
      const year = currentYear + i + 1;
      const yearsFromLast = gapYears + i + 1; // Total years from last historical data
      
      // Base projection from trend - build sequentially from previous value
      // Use previous forecast value (which could be from gap years or previous forecast year)
      const baseValue = previousForecastValue;
      let trendProjection = baseValue + (conservativeTrendRate * 1); // Project 1 year ahead from previous
      
      // Apply saturation: growth slows as we approach high percentages
      // Use the base value (previous forecast) for saturation calculation
      if (baseValue > 80) {
        const saturationFactor = 1.0 - ((baseValue - 80) / 20) * 0.4; // Slow down by up to 40% above 80%
        trendProjection = baseValue + (conservativeTrendRate * saturationFactor * 1);
      }
      
      // Gentle decay over time (trends don't continue forever, but slowly)
      const timeDecay = Math.exp(-yearsFromLast * 0.05); // 5% decay per year (gentler)
      trendProjection = baseValue + (conservativeTrendRate * timeDecay * 1);
      
      // Collect method predictions and weight them
      const predictions = [];
      let totalWeight = 0;
      
      for (const [name, result] of Object.entries(methods)) {
        if (result.forecast && result.forecast[i]) {
          let value = result.forecast[i].predicted;
          
          // Cap extreme predictions
          if (value > realisticMax) {
            const excess = value - realisticMax;
            value = realisticMax + excess * Math.exp(-excess / 3);
          }
          if (value < 0) {
            value = 0;
          }
          
          // Base weight on method quality
          let weight = 0.1;
          if (result.rSquared !== undefined && result.rSquared > 0) {
            weight = result.rSquared * 0.6; // Give more weight to good fits
          } else if (result.forecast[i].confidence) {
            weight = result.forecast[i].confidence * 0.6;
          }
          
          // Boost weight if prediction aligns with trend (but allow some variation)
          const diffFromTrend = Math.abs(value - trendProjection);
          const maxDiff = Math.max(8, Math.abs(conservativeTrendRate * yearsFromLast * 2.5)); // Allow more variation
          const alignmentScore = 1.0 - Math.min(1.0, diffFromTrend / maxDiff);
          weight = weight * (0.4 + alignmentScore * 0.6); // 40-100% based on alignment
          
          // Moderate penalty for extreme predictions (but allow some)
          if (value > 97 || value < lastValue - 8) {
            weight *= 0.4; // Moderate penalty
          } else if (value > 94 || value < lastValue - 5) {
            weight *= 0.7; // Light penalty
          }
          
        // Prefer simpler, more stable methods
        if (name === 'linear5Year' || name === 'cagr') {
          weight *= 1.15;
        } else if (name === 'holts' || name === 'quadratic') {
          weight *= 1.05;
        } else if (name === 'arima') {
          weight *= 0.95; // Slightly lower weight for ARIMA (more complex)
        }
          
          if (weight > 0.01) {
            predictions.push({
              value: value,
              weight: weight
            });
            totalWeight += weight;
          }
        }
      }
      
      // Calculate weighted average of method predictions
      let methodAverage = lastValue;
      if (predictions.length > 0 && totalWeight > 0) {
        methodAverage = predictions.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;
      }
      
      let ensembleValue = trendProjection * 0.6 + methodAverage * 0.4;
      ensembleValue = Math.min(ensembleValue, realisticMax);
      
      // 2. Limit year-over-year change based on historical patterns
      // Allow up to 1.8x the recent trend rate or 4% per year, whichever is smaller
      const maxYearlyChange = Math.min(4.0, Math.abs(conservativeTrendRate) * 1.8 + historicalVolatility);
      const minYearlyChange = -Math.min(3.0, Math.abs(conservativeTrendRate) * 1.5 + historicalVolatility);
      // Apply constraints relative to previous value (sequential)
      ensembleValue = Math.max(
        baseValue + minYearlyChange,
        Math.min(baseValue + maxYearlyChange, ensembleValue)
      );
      
      // 3. If already very high (>90%), limit growth but allow some
      // Use baseValue (previous forecast) for this check
      if (baseValue > 90) {
        const remainingSpace = 100 - baseValue;
        const maxGrowth = remainingSpace * 0.25 * Math.exp(-yearsFromLast * 0.15); // Allow up to 25% of remaining space
        ensembleValue = Math.min(ensembleValue, baseValue + maxGrowth);
      }
      
      ensembleValue = this.softPct(ensembleValue, 0.1, Math.min(92, Math.max(8, previousForecastValue)));
      
      // Calculate confidence based on trend stability and data quality
      let confidence = 0.7;
      if (recentYearChanges.length > 1) {
        // Calculate standard deviation of recent changes
        const recentVariance = recentYearChanges.reduce((sum, c) => {
          return sum + Math.pow(c - avgRecentChange, 2);
        }, 0) / recentYearChanges.length;
        const recentStdDev = Math.sqrt(recentVariance);
        
        // Higher confidence if recent trends are stable
        const coefficientOfVariation = Math.abs(avgRecentChange) > 0.1 
          ? recentStdDev / Math.abs(avgRecentChange) 
          : 0.3;
        const stabilityScore = Math.max(0.5, 1.0 - Math.min(0.5, coefficientOfVariation));
        
        // Also consider how well recent trend matches long-term trend
        const trendAlignment = Math.abs(recentTrendRate - longTermTrendRate) < 0.5 ? 1.0 : 0.8;
        
        confidence = Math.min(0.9, Math.max(0.5, (stabilityScore + trendAlignment) / 2));
      }
      
      // Calculate confidence intervals based on historical volatility
      const stdError = historicalVolatility * Math.sqrt(yearsFromLast);
      const lowerBound = Math.max(0, ensembleValue - 1.5 * stdError);
      const upperBound = Math.min(100, ensembleValue + 1.5 * stdError);
      
      forecast.push({
        year,
        predicted: Math.round(ensembleValue * 10) / 10,
        confidence: confidence,
        lowerBound: Math.round(lowerBound * 10) / 10,
        upperBound: Math.round(upperBound * 10) / 10,
        method: 'ensemble',
        methods: {
          linear5Year: methods.linear5Year.forecast[i]?.predicted,
          holts: methods.holts.forecast[i]?.predicted,
          arima: methods.arima.forecast[i]?.predicted,
          quadratic: methods.quadratic.forecast[i]?.predicted,
          cagr: methods.cagr.forecast[i]?.predicted
        }
      });
      
      // Update previous value for next iteration (sequential building)
      previousForecastValue = ensembleValue;
    }
    
    return {
      forecast,
      methods: {
        linear5Year: linear5Year.trend,
        holts: { level: holts.level, trend: holts.trend, rSquared: holts.rSquared },
        arima: { arCoeff: arima.arCoeff, maCoeff: arima.maCoeff, rSquared: arima.rSquared },
        quadratic: { rSquared: quadratic.rSquared, degree: 2 },
        cagr: cagr.cagr
      },
      weights: { recentTrendRate: conservativeTrendRate }
    };
  },

  // Calculate method score based on historical fit and trend alignment
  calculateMethodScore(methodResult, historicalData) {
    if (!methodResult.forecast || historicalData.length < 3) {
      return 0.1; // Default low score
    }
    
    // Get base score from R-squared or confidence
    let baseScore = 0.3;
    if (methodResult.rSquared !== undefined) {
      baseScore = Math.max(0.1, methodResult.rSquared);
    } else if (methodResult.forecast[0]?.confidence) {
      baseScore = Math.max(0.1, methodResult.forecast[0].confidence);
    }
    
    // Analyze recent trend (last 5 years)
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const recentYears = sorted.slice(-5);
    const recentChange = recentYears.length >= 2 
      ? recentYears[recentYears.length - 1].value - recentYears[0].value 
      : 0;
    const lastValue = sorted[sorted.length - 1].value;
    
    // Check if method's forecast aligns with recent trend
    if (methodResult.forecast && methodResult.forecast[0]) {
      const forecastChange = methodResult.forecast[0].predicted - lastValue;
      const forecastDirection = forecastChange > 0 ? 1 : forecastChange < 0 ? -1 : 0;
      const recentDirection = recentChange > 0.5 ? 1 : recentChange < -0.5 ? -1 : 0;
      
      // Boost score if forecast aligns with recent trend (especially for strong trends)
      if (recentDirection !== 0 && forecastDirection === recentDirection) {
        const trendStrength = Math.min(1, Math.abs(recentChange) / 5); // Normalize trend strength
        const alignmentBonus = 0.3 * trendStrength; // Up to 30% bonus
        baseScore = baseScore * (1 + alignmentBonus);
      }
      
      // Penalize methods that strongly contradict recent trends
      if (recentDirection !== 0 && forecastDirection === -recentDirection && Math.abs(recentChange) > 2) {
        const contradictionPenalty = 0.5; // 50% penalty for strong contradictions
        baseScore = baseScore * (1 - contradictionPenalty);
      }
      
      // Extra boost for weighted linear regression (it's designed to follow recent trends)
      if (methodResult.slope !== undefined && methodResult.rSquared > 0.5) {
        const slopeDirection = methodResult.slope > 0 ? 1 : methodResult.slope < 0 ? -1 : 0;
        if (slopeDirection === recentDirection && recentDirection !== 0) {
          baseScore = baseScore * 1.2; // 20% bonus for weighted methods aligning with trends
        }
      }
    }
    
    return Math.max(0.05, Math.min(1.0, baseScore)); // Clamp between 0.05 and 1.0
  },

  // Calculate trend direction and strength
  analyzeTrend(historicalData) {
    if (historicalData.length < 2) {
      return { direction: 'insufficient_data', strength: 0, change: 0 };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const first = sorted[0].value;
    const last = sorted[sorted.length - 1].value;
    const change = last - first;
    const percentChange = first !== 0 ? (change / first) * 100 : 0;

    const linear = this.forecast5YearLinear(historicalData, 1);
    const rSquared = Math.max(0, Math.min(1, linear.rSquared || 0));

    // Year-over-year direction consistency: what fraction of years moved in the overall direction?
    let sameDirectionCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      const yoyChange = sorted[i].value - sorted[i - 1].value;
      if ((change > 0 && yoyChange > 0) || (change < 0 && yoyChange < 0) || (Math.abs(change) < 0.5)) {
        sameDirectionCount++;
      }
    }
    const directionConsistency = sorted.length > 1 ? sameDirectionCount / (sorted.length - 1) : 0.5;

    // Magnitude of change relative to volatility (signal-to-noise)
    const values = sorted.map(d => d.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const volatility = Math.sqrt(variance) || 1;
    const signalToNoise = Math.min(2, Math.abs(change) / volatility) / 2;

    // Blend: 40% R², 35% direction consistency, 25% signal-to-noise
    let strength = rSquared * 0.4 + directionConsistency * 0.35 + signalToNoise * 0.25;
    strength = Math.max(0.1, Math.min(1, strength));

    let direction = 'stable';
    if (Math.abs(percentChange) < 1) {
      direction = 'stable';
    } else if (change > 0) {
      direction = strength > 0.7 ? 'strong_increasing' : strength > 0.4 ? 'moderate_increasing' : 'weak_increasing';
    } else {
      direction = strength > 0.7 ? 'strong_decreasing' : strength > 0.4 ? 'moderate_decreasing' : 'weak_decreasing';
    }

    return {
      direction,
      strength,
      change: change.toFixed(2),
      percentChange: percentChange.toFixed(2),
      firstYear: sorted[0].year,
      lastYear: sorted[sorted.length - 1].year
    };
  },

  // Format forecast results for display
  formatForecastResult(forecast, trendAnalysis) {
    const directionEmoji = {
      'strong_increasing': '📈',
      'moderate_increasing': '↗️',
      'weak_increasing': '↗',
      'stable': '➡️',
      'weak_decreasing': '↘',
      'moderate_decreasing': '↘️',
      'strong_decreasing': '📉',
      'insufficient_data': '❓'
    };
    
    return {
      forecast,
      trendAnalysis,
      emoji: directionEmoji[trendAnalysis.direction] || '📊',
      summary: this.generateForecastSummary(forecast, trendAnalysis)
    };
  },

  // Generate human-readable forecast summary
  generateForecastSummary(forecast, trendAnalysis) {
    if (!forecast || forecast.length === 0) {
      return 'Insufficient historical data for forecasting.';
    }
    
    const nextYear = forecast[0];
    const fiveYear = forecast[4] || forecast[forecast.length - 1];
    
    const directionText = {
      'strong_increasing': 'strongly increasing',
      'moderate_increasing': 'moderately increasing',
      'weak_increasing': 'slightly increasing',
      'stable': 'stable',
      'weak_decreasing': 'slightly decreasing',
      'moderate_decreasing': 'moderately decreasing',
      'strong_decreasing': 'strongly decreasing'
    };
    
    const trendDesc = directionText[trendAnalysis.direction] || 'uncertain';
    const changeText = trendAnalysis.percentChange > 0 
      ? `increased by ${Math.abs(trendAnalysis.percentChange)}%` 
      : `decreased by ${Math.abs(trendAnalysis.percentChange)}%`;
    
    return `Historical trend is ${trendDesc} (${changeText} from ${trendAnalysis.firstYear} to ${trendAnalysis.lastYear}). ` +
           `Forecasted ${nextYear?.year}: ${nextYear?.predicted.toFixed(1)}%. ` +
           `Forecasted ${fiveYear?.year}: ${fiveYear?.predicted.toFixed(1)}%.`;
  },

  // Generate detailed explanation of forecast results in plain language
  generateDetailedExplanation(forecastResult, historicalData, locationName) {
    if (!historicalData || historicalData.length === 0) {
      return 'Insufficient historical data for detailed analysis.';
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const firstData = sorted[0];
    const lastData = sorted[sorted.length - 1];
    const values = sorted.map(d => d.value);
    
    // Find recent trends
    const recentYears = sorted.slice(-5); // Last 5 years
    const recentChange = recentYears.length >= 2 
      ? recentYears[recentYears.length - 1].value - recentYears[0].value 
      : 0;
    
    // Get forecast values
    const nextForecast = forecastResult.forecast[0];
    const fiveYearForecast = forecastResult.forecast[4] || forecastResult.forecast[forecastResult.forecast.length - 1];
    const forecastChange = nextForecast.predicted - lastData.value;
    
    // Analyze method performance
    const weights = forecastResult.weights || {};
    const sortedMethods = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, weight]) => weight > 0.05);
    
    // Get method details
    const methods = forecastResult.methods || {};
    
    // Build natural language explanation
    let explanation = `<div style="padding: 16px; background: #f9fafb; border-radius: 8px; font-size: 13px; line-height: 1.8; color: #374151;">`;
    
    explanation += `<p style="margin: 0 0 16px 0;"><strong>Why this forecast?</strong></p>`;
    
    // Historical context
    explanation += `<p style="margin: 0 0 16px 0;">`;
    explanation += `Looking at ${locationName}'s historical data from ${firstData.year} to ${lastData.year}, `;
    explanation += `insurance coverage started at <strong>${firstData.value.toFixed(1)}%</strong> and reached <strong>${lastData.value.toFixed(1)}%</strong> by ${lastData.year}. `;
    
    if (lastData.value > firstData.value + 1) {
      explanation += `That's an increase of <strong>${(lastData.value - firstData.value).toFixed(1)} percentage points</strong> over ${lastData.year - firstData.year} years, `;
      explanation += `showing a clear upward trend. `;
    } else if (lastData.value < firstData.value - 1) {
      explanation += `That's a decrease of <strong>${(firstData.value - lastData.value).toFixed(1)} percentage points</strong> over ${lastData.year - firstData.year} years, `;
      explanation += `showing a downward trend. `;
    } else {
      explanation += `The values have remained relatively stable over this period. `;
    }
    explanation += `</p>`;
    
    // Recent trend
    explanation += `<p style="margin: 0 0 16px 0;">`;
    explanation += `In the most recent 5 years (${recentYears[0].year}-${recentYears[recentYears.length - 1].year}), `;
    if (Math.abs(recentChange) > 0.5) {
      if (recentChange > 0) {
        explanation += `coverage has been <strong style="color: #059669;">increasing</strong>, rising from ${recentYears[0].value.toFixed(1)}% to ${recentYears[recentYears.length - 1].value.toFixed(1)}%. `;
        explanation += `This recent upward momentum suggests the trend is likely to continue. `;
      } else {
        explanation += `coverage has been <strong style="color: #dc2626;">declining</strong>, dropping from ${recentYears[0].value.toFixed(1)}% to ${recentYears[recentYears.length - 1].value.toFixed(1)}%. `;
        explanation += `This recent downward trend suggests it may continue unless there's a policy change. `;
      }
    } else {
      explanation += `coverage has remained relatively <strong>stable</strong>, fluctuating within a narrow range. `;
      explanation += `This consistency suggests future values will likely stay close to the current level. `;
    }
    explanation += `</p>`;
    
    // Forecast explanation
    explanation += `<p style="margin: 0 0 16px 0;">`;
    explanation += `Based on this historical pattern, the forecast predicts that by ${nextForecast.year}, `;
    explanation += `insurance coverage will be approximately <strong>${nextForecast.predicted.toFixed(1)}%</strong>. `;
    
    if (forecastChange > 0.5) {
      explanation += `This represents an increase of <strong style="color: #059669;">${forecastChange.toFixed(1)} percentage points</strong> from the ${lastData.year} value of ${lastData.value.toFixed(1)}%. `;
      explanation += `This projection is based on the consistent upward trend we've seen, particularly in recent years. `;
    } else if (forecastChange < -0.5) {
      explanation += `This represents a decrease of <strong style="color: #dc2626;">${Math.abs(forecastChange).toFixed(1)} percentage points</strong> from the ${lastData.year} value of ${lastData.value.toFixed(1)}%. `;
      explanation += `This projection reflects the declining trend observed in the historical data. `;
    } else {
      explanation += `This is very close to the ${lastData.year} value of ${lastData.value.toFixed(1)}%, `;
      explanation += `reflecting the stable pattern we've observed over time. `;
    }
    
    explanation += `Looking further ahead to ${fiveYearForecast.year}, the forecast suggests coverage will be around <strong>${fiveYearForecast.predicted.toFixed(1)}%</strong>. `;
    explanation += `</p>`;
    
    // Method explanation
    if (sortedMethods.length > 0) {
      const topMethod = sortedMethods[0];
      explanation += `<p style="margin: 0 0 16px 0;">`;
      explanation += `The forecasting system used multiple methods to analyze your data, and the most influential approach was `;
      
      if (topMethod[0] === 'linear5Year') {
        explanation += `5-year linear regression, which found a ${methods.linear5Year?.slope > 0 ? 'steady upward' : 'steady downward'} trend. `;
        explanation += `This method focuses on recent patterns and works best when the data follows a consistent direction. `;
      } else if (topMethod[0] === 'holts') {
        explanation += `Holt's linear exponential smoothing, which tracks both level and trend components. `;
        explanation += `This method adapts to recent changes while maintaining trend information. `;
      } else if (topMethod[0] === 'arima') {
        explanation += `ARIMA(1,1,1) modeling, which uses autoregressive and moving average components with differencing. `;
        explanation += `This method captures complex temporal dependencies in the data. `;
      } else if (topMethod[0] === 'quadratic') {
        explanation += `quadratic regression, which detected that the data follows a curved pattern rather than a straight line. `;
        explanation += `This suggests the rate of change has been ${methods.quadratic?.rSquared > 0.7 ? 'accelerating or decelerating' : 'varying'} over time. `;
      } else if (topMethod[0] === 'cagr') {
        const cagr = methods.cagr || 0;
        explanation += `compound growth analysis, which calculated an average annual growth rate of ${Math.abs(cagr).toFixed(2)}%. `;
        explanation += `This method projects that the historical growth rate will continue. `;
      } else {
        explanation += `ensemble forecasting, which combines multiple methods for robust predictions. `;
      }
      
      explanation += `This method contributed <strong>${(topMethod[1] * 100).toFixed(0)}%</strong> to the final forecast. `;
      explanation += `</p>`;
    }
    
    // Data quality note
    explanation += `<p style="margin: 0 0 0 0; font-size: 12px; color: #6b7280; font-style: italic;">`;
    explanation += `Note: This forecast is based on ${sorted.length} years of historical data (${firstData.year}-${lastData.year}). `;
    explanation += `While the system uses advanced machine learning to identify patterns, actual future values may differ due to `;
    explanation += `unforeseen policy changes, economic factors, or other external events.`;
    explanation += `</p>`;
    
    explanation += `</div>`;
    
    return explanation;
  }
};

// Export for use in other modules
window.ForecastingModels = ForecastingModels;

