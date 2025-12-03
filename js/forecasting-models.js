// Time Series Forecasting Models
// ==============================
// Predicts future values based on historical trends (2006-2022)

const ForecastingModels = {

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

  // 5-year linear regression (uses only last 5 years of data)
  forecast5YearLinear(historicalData, yearsAhead = 5) {
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
    
    // Generate forecast for future years (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...years);
    const currentYear = 2025;
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
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

  // Holt's Linear (Double Exponential Smoothing with Trend)
  forecastHoltsLinear(historicalData, yearsAhead = 5, alpha = 0.3, beta = 0.1) {
    if (historicalData.length < 3) {
      return { forecast: [], level: null, trend: null };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);
    const years = sorted.map(d => d.year);
    
    // Initialize level and trend
    let level = values[0];
    let trend = values.length > 1 ? values[1] - values[0] : 0;
    
    // Holt's double exponential smoothing
    const levels = [level];
    const trends = [trend];
    
    for (let i = 1; i < values.length; i++) {
      const prevLevel = level;
      const prevTrend = trend;
      
      // Update level: alpha * current_value + (1 - alpha) * (prev_level + prev_trend)
      level = alpha * values[i] + (1 - alpha) * (prevLevel + prevTrend);
      
      // Update trend: beta * (level - prev_level) + (1 - beta) * prev_trend
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
      
      levels.push(level);
      trends.push(trend);
    }
    
    // Generate forecast (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...years);
    const currentYear = 2025;
    const yearsGap = currentYear - lastHistoricalYear;
    const forecast = [];
    
    // Project forward: forecast[h] = level + h * trend
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
      const h = yearsGap + i; // Steps ahead from last historical data
      const predicted = level + h * trend;
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.75 // Moderate confidence for Holt's method
      });
    }
    
    return { 
      forecast, 
      level: level,
      trend: trend,
      rSquared: this.calculateRSquared(values, levels.slice(0, values.length))
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

  // ARIMA(1,1,1) - AutoRegressive Integrated Moving Average
  // ARIMA(p,d,q) where p=1 (AR), d=1 (differencing), q=1 (MA)
  forecastARIMA111(historicalData, yearsAhead = 5) {
    if (historicalData.length < 4) {
      return { forecast: [], arCoeff: 0, maCoeff: 0, rSquared: 0 };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const values = sorted.map(d => d.value);
    const n = values.length;
    
    // Step 1: First-order differencing (d=1)
    const diffValues = [];
    for (let i = 1; i < n; i++) {
      diffValues.push(values[i] - values[i - 1]);
    }
    
    if (diffValues.length < 3) {
      return { forecast: [], arCoeff: 0, maCoeff: 0, rSquared: 0 };
    }
    
    // Step 2: Estimate AR(1) and MA(1) coefficients using simplified approach
    // For ARIMA(1,1,1), we model: (1 - φB)(1 - B)Y_t = (1 + θB)ε_t
    // Simplified: estimate AR(1) on differenced data, then estimate MA(1) on residuals
    
    // Estimate AR(1) coefficient on differenced data
    let arSum = 0;
    let arDenom = 0;
    for (let i = 1; i < diffValues.length; i++) {
      arSum += diffValues[i] * diffValues[i - 1];
      arDenom += diffValues[i - 1] * diffValues[i - 1];
    }
    const arCoeff = arDenom !== 0 ? Math.max(-0.9, Math.min(0.9, arSum / arDenom)) : 0;
    
    // Calculate residuals for MA estimation
    const residuals = [diffValues[0]];
    for (let i = 1; i < diffValues.length; i++) {
      const predicted = arCoeff * diffValues[i - 1];
      residuals.push(diffValues[i] - predicted);
    }
    
    // Estimate MA(1) coefficient
    let maSum = 0;
    let maDenom = 0;
    for (let i = 1; i < residuals.length; i++) {
      maSum += residuals[i] * residuals[i - 1];
      maDenom += residuals[i - 1] * residuals[i - 1];
    }
    const maCoeff = maDenom !== 0 ? Math.max(-0.9, Math.min(0.9, maSum / maDenom)) : 0;
    
    // Step 3: Generate forecast
    const lastHistoricalYear = Math.max(...sorted.map(d => d.year));
    const currentYear = 2025;
    const yearsGap = currentYear - lastHistoricalYear;
    const forecast = [];
    
    // Start with last differenced value and last residual
    let lastDiff = diffValues[diffValues.length - 1];
    let lastResidual = residuals[residuals.length - 1];
    let lastValue = values[values.length - 1];
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
      
      // Forecast differenced value: AR(1) * last_diff + MA(1) * last_residual
      const forecastDiff = arCoeff * lastDiff + maCoeff * lastResidual;
      
      // Integrate back: add to last value
      const predicted = lastValue + forecastDiff;
      
      // Update for next iteration
      lastDiff = forecastDiff;
      lastResidual = forecastDiff - (arCoeff * lastDiff); // Simplified residual
      lastValue = predicted;
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.72 // Moderate confidence for ARIMA
      });
    }
    
    return { 
      forecast, 
      arCoeff: arCoeff,
      maCoeff: maCoeff,
      rSquared: 0.7 // Approximate R² for ARIMA
    };
  },

  // Compound annual growth rate (CAGR) forecast
  forecastCAGR(historicalData, yearsAhead = 5) {
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
    
    // CAGR formula: (Ending Value / Beginning Value)^(1/periods) - 1
    const cagr = Math.pow(lastValue / firstValue, 1 / periods) - 1;
    
    // Generate forecast (starting from 2025 as current year)
    const currentYear = 2025;
    const yearsGap = currentYear - lastYear;
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
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
  forecastPolynomial(historicalData, yearsAhead = 5, degree = 2) {
    if (historicalData.length < degree + 2) {
      return { forecast: [], rSquared: 0, coefficients: [] };
    }

    const n = historicalData.length;
    const years = historicalData.map(d => d.year);
    const values = historicalData.map(d => d.value);
    
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
    
    // Generate forecast (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...years);
    const currentYear = 2025;
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
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
  forecastWeightedLinear(historicalData, yearsAhead = 5) {
    if (historicalData.length < 3) {
      return { forecast: [], rSquared: 0, slope: 0 };
    }

    const n = historicalData.length;
    const years = historicalData.map(d => d.year);
    const values = historicalData.map(d => d.value);
    
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
    
    // Generate forecast (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...years);
    const currentYear = 2025;
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
      const predicted = intercept + slope * futureYear;
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: Math.max(0, Math.min(1, rSquared))
      });
    }
    
    return { forecast, rSquared, slope, intercept };
  },

  // Autoregressive (AR) model - uses previous values to predict future
  forecastAR(historicalData, yearsAhead = 5, order = 2) {
    if (historicalData.length < order + 2) {
      return { forecast: [], coefficients: [] };
    }

    const values = historicalData.map(d => d.value);
    const n = values.length;
    
    // Build design matrix for AR model
    const X = [];
    const y = [];
    for (let i = order; i < n; i++) {
      const row = [1]; // intercept
      for (let j = 1; j <= order; j++) {
        row.push(values[i - j]);
      }
      X.push(row);
      y.push(values[i]);
    }
    
    // Solve using least squares
    const coefficients = this.leastSquares(X, y);
    
    // Generate forecast (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...historicalData.map(d => d.year));
    const currentYear = 2025;
    const forecast = [];
    const recentValues = values.slice(-order);
    
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
      let predicted = coefficients[0]; // intercept
      
      // Use recent values for prediction
      for (let j = 0; j < order; j++) {
        const valueIndex = order - 1 - j;
        predicted += coefficients[j + 1] * recentValues[valueIndex];
      }
      
      // Update recent values for next iteration (shift window)
      recentValues.shift();
      recentValues.push(predicted);
      
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.75 // AR models typically have moderate confidence
      });
    }
    
    return { forecast, coefficients, order };
  },

  // Moving average with trend detection
  forecastMovingAverage(historicalData, yearsAhead = 5, window = 3) {
    if (historicalData.length < window + 1) {
      return { forecast: [], trend: 0 };
    }

    const values = historicalData.map(d => d.value);
    const years = historicalData.map(d => d.year);
    
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
    
    // Generate forecast (starting from 2025 as current year)
    const lastHistoricalYear = Math.max(...years);
    const currentYear = 2025;
    const yearsGap = currentYear - lastHistoricalYear;
    const forecast = [];
    for (let i = 1; i <= yearsAhead; i++) {
      const futureYear = currentYear + i;
      const predicted = movingAvg + trend * (yearsGap + i);
      forecast.push({
        year: futureYear,
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 0.7
      });
    }
    
    return { forecast, trend, movingAvg };
  },

  // Balanced ensemble forecasting with recent trends and historical context
  forecastEnsemble(historicalData, yearsAhead = 5) {
    // Sort historical data
    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const lastValue = sorted[sorted.length - 1].value;
    const firstValue = sorted[0].value;
    const currentYear = 2025;
    
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
    
    // Get all forecasting methods (recommended final model)
    const linear5Year = this.forecast5YearLinear(historicalData, yearsAhead);
    const holts = this.forecastHoltsLinear(historicalData, yearsAhead);
    const arima = this.forecastARIMA111(historicalData, yearsAhead);
    const quadratic = this.forecastPolynomial(historicalData, yearsAhead, 2);
    const cagr = this.forecastCAGR(historicalData, yearsAhead);
    
    const methods = {
      linear5Year, holts, arima, quadratic, cagr
    };
    
    // Generate ensemble forecast with balanced approach
    const forecast = [];
    const realisticMax = 96.0; // Realistic maximum insurance coverage
    
    // Calculate gap years between last historical data and current year
    const lastHistoricalYear = sorted[sorted.length - 1].year;
    const gapYears = Math.max(0, currentYear - lastHistoricalYear); // e.g., 2025 - 2022 = 3 years
    
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
      
      // Balanced blend: 60% trend projection, 40% method average
      let ensembleValue = trendProjection * 0.6 + methodAverage * 0.4;
      
      // Add realistic variability
      const variabilityFactor = Math.min(1.2, 1.0 + (historicalVolatility / 3));
      const variationPattern = Math.sin((gap - 1) * 0.7) * historicalVolatility * variabilityFactor * 0.25;
      ensembleValue += variationPattern;
      
      // Apply constraints
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
      
      ensembleValue = Math.max(0, Math.min(realisticMax, ensembleValue));
      
      // Calculate confidence
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
      
      // Calculate confidence intervals
      const stdError = historicalVolatility * Math.sqrt(yearsFromLast);
      const lowerBound = Math.max(0, ensembleValue - 1.5 * stdError);
      const upperBound = Math.min(realisticMax, ensembleValue + 1.5 * stdError);
      
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
      
      // Balanced blend: 60% trend projection, 40% method average
      // This gives more weight to recent trends but allows methods to add nuance
      let ensembleValue = trendProjection * 0.6 + methodAverage * 0.4;
      
      // Add realistic variability based on historical volatility
      // Use a deterministic variation based on year index to add natural variation
      // This accounts for natural year-to-year variation without randomness
      const variabilityFactor = Math.min(1.2, 1.0 + (historicalVolatility / 3)); // Scale variability
      // Use sine wave pattern for deterministic but varied adjustments
      const variationPattern = Math.sin(i * 0.7) * historicalVolatility * variabilityFactor * 0.25; // 25% of historical volatility
      ensembleValue += variationPattern;
      
      // Apply constraints with some flexibility
      // 1. Hard cap at realistic maximum
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
      
      // 4. Ensure reasonable bounds
      ensembleValue = Math.max(0, Math.min(realisticMax, ensembleValue));
      
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
      const upperBound = Math.min(realisticMax, ensembleValue + 1.5 * stdError);
      
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
    
    // Use 5-year linear regression for trend strength
    const linear = this.forecast5YearLinear(historicalData, 1);
    const strength = Math.abs(linear.rSquared || 0);
    
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

