# Forecasting Methodology

This document explains how the time series forecasting system works in the SAHIE Map Visualization application. The forecasting module predicts future insurance coverage rates based on historical data from 2006-2022.

## Overview

The forecasting system uses a **balanced ensemble approach** that prioritizes recent trends while incorporating historical context and multiple forecasting methods. The system is designed to produce realistic, conservative forecasts that reflect recent patterns without overestimating future values.

### Key Philosophy

The forecasting approach is built on the principle that **recent trends are most predictive** for short-term forecasts, but **historical context provides stability**. The system:

1. **Analyzes Recent Patterns**: Examines the last 5 years of data to identify current trends
2. **Incorporates Historical Context**: Uses long-term trends to prevent overreaction to short-term fluctuations
3. **Combines Multiple Methods**: Blends 8 different forecasting algorithms with intelligent weighting
4. **Applies Realistic Constraints**: Prevents unrealistic predictions through saturation effects and hard caps
5. **Accounts for Natural Variation**: Incorporates historical volatility to show realistic uncertainty ranges

The result is a forecast that follows recent trends while remaining grounded in historical patterns and realistic bounds.

## Data Sources

- **Historical Data**: U.S. Census Bureau SAHIE (Small Area Health Insurance Estimates) API
- **Time Period**: 2006-2022 (17 years of historical data)
- **Forecast Base Year**: 2025 (accounts for gap between last data point and current year)
- **Geographic Levels**: States and Counties
- **Demographics**: Supports filtering by age, sex, race, and income level

## Forecasting Methods

The system implements 8 different forecasting algorithms:

### 1. Linear Regression Trend Forecasting

**Purpose**: Captures linear trends in historical data.

**How it works**:
- Fits a straight line to historical data using least squares regression
- Formula: `y = a + b*x`, where `y` is the predicted value, `x` is the year, `a` is the intercept, and `b` is the slope
- Calculates R² (coefficient of determination) to measure fit quality
- Projects the trend line forward into future years

**Best for**: Data with consistent upward or downward trends

**Strengths**:
- Simple and interpretable
- Works well with steady linear trends
- Provides confidence intervals based on standard error

**Limitations**:
- Assumes trend continues linearly (may miss acceleration/deceleration)
- Can be sensitive to outliers

---

### 2. Exponential Smoothing

**Purpose**: Emphasizes recent data points over older ones.

**How it works**:
- Uses a smoothing factor (α = 0.3) to weight recent observations more heavily
- Formula: `Smoothed[t] = α * Value[t] + (1-α) * Smoothed[t-1]`
- Calculates trend from the difference between last smoothed values
- Projects forward using the calculated trend

**Best for**: Data with changing trends where recent patterns are more relevant

**Strengths**:
- Adapts quickly to recent changes
- Less affected by old historical data

**Limitations**:
- Lower confidence metrics (typically 70%)
- May overreact to recent fluctuations

---

### 3. Compound Annual Growth Rate (CAGR)

**Purpose**: Assumes constant percentage growth over time.

**How it works**:
- Calculates the average annual growth rate between first and last data points
- Formula: `CAGR = (Ending Value / Beginning Value)^(1/periods) - 1`
- Projects future values using exponential growth: `Future = Last Value * (1 + CAGR)^years`

**Best for**: Data with exponential growth patterns

**Strengths**:
- Simple percentage-based projection
- Works well for sustained growth trends

**Limitations**:
- Assumes growth rate remains constant
- Can produce unrealistic values if growth rate is high

---

### 4. Polynomial Regression (2nd & 3rd Degree)

**Purpose**: Captures non-linear trends and curves in the data.

**How it works**:
- Fits polynomial curves to historical data (quadratic or cubic)
- Uses least squares method to find coefficients
- Can model acceleration, deceleration, or inflection points
- Projects the curved trend forward

**Best for**: Data with non-linear patterns (curved trends, acceleration/deceleration)

**Strengths**:
- Captures complex patterns that linear models miss
- Can identify trend changes over time

**Limitations**:
- Can overfit to historical data
- Predictions can become unrealistic far into the future
- More sensitive to outliers

---

### 5. Weighted Linear Regression

**Purpose**: Gives more importance to recent data while maintaining linear trend structure.

**How it works**:
- Similar to linear regression but applies exponential weights to data points
- Recent data (last 5 years) gets 1.5x boost in weight
- Uses exponential decay: `Weight = exp((i - (n-1)) * 0.5) * recentBoost`
- Calculates weighted means, slopes, and R²

**Best for**: Data where recent trends are more predictive than historical patterns

**Strengths**:
- Balances linear simplicity with recency weighting
- Excellent for data with changing trends

**Limitations**:
- Still assumes linear continuation (may miss curves)

---

### 6. Autoregressive (AR) Model

**Purpose**: Uses previous values to predict future values.

**How it works**:
- Builds a model where each value depends on previous values
- Default order: 2 (uses last 2 years to predict next year)
- Uses least squares to find coefficients
- Iteratively predicts future values using recent predictions

**Best for**: Data with strong autocorrelation (where past values predict future values)

**Strengths**:
- Captures temporal dependencies
- Good for cyclical or seasonal patterns

**Limitations**:
- Requires sufficient historical data (order + 2 minimum)
- Predictions can decay over long horizons

---

### 7. Moving Average with Trend Detection

**Purpose**: Smooths out fluctuations to reveal underlying trends.

**How it works**:
- Calculates moving average over a window (default: 3 years)
- Computes trend from the difference between moving averages
- Projects forward using the trend rate

**Best for**: Data with high variability where you want to identify underlying trends

**Strengths**:
- Reduces noise from year-to-year fluctuations
- Simple and stable

**Limitations**:
- May lag behind actual trend changes
- Moderate confidence (typically 70%)

---

### 8. Ensemble Method (Balanced Recent-Trend Based)

**Purpose**: Combines all methods with primary focus on recent trends and historical context.

**How it works**:

1. **Recent Trend Analysis**:
   - Analyzes last 5 years of data for year-over-year changes
   - Calculates average recent change and overall recent trend rate
   - Calculates longer-term trend (all historical data) for context
   - Blends recent trend (70%) with long-term trend (30%) for stability

2. **Historical Volatility Calculation**:
   - Calculates standard deviation of all year-over-year changes
   - Uses this to determine realistic variability and confidence intervals
   - Accounts for natural year-to-year fluctuations

3. **Method Weighting**:
   - Base weight: 60% from method quality (R² or confidence)
   - Alignment weight: 40% from how well prediction aligns with recent trend
   - Prefers simpler, more stable methods (linear, weighted, moving average)
   - Penalizes extreme predictions (>95% or large declines)
   - Allows methods to contribute even if slightly off-trend

4. **Trend Projection**:
   - Projects forward using blended trend rate
   - Applies saturation effects: growth slows above 80% coverage
   - Applies time decay: trends decay 5% per year (gentle)
   - Accounts for realistic upper bounds (95% maximum)

5. **Ensemble Calculation**:
   - 60% weight: Trend projection (recent trends are most relevant)
   - 40% weight: Weighted average of all method predictions
   - Adds deterministic variability based on historical volatility
   - Uses sine wave pattern for natural variation (not random)

6. **Conservative Constraints**:
   - Hard cap at 95% realistic maximum
   - Year-over-year change limited to 1.8x recent rate or 4% per year
   - If already high (>90%), limits growth to 25% of remaining space
   - Prevents unrealistic jumps while allowing natural variation

7. **Confidence Intervals**:
   - Calculates lower and upper bounds based on historical volatility
   - Confidence based on recent trend stability and alignment with long-term trend
   - More stable trends = higher confidence

**Best for**: All scenarios - this is the default method used

**Strengths**:
- Prioritizes recent trends (most relevant for forecasting)
- Incorporates historical context for stability
- Adds realistic variability based on historical patterns
- Produces conservative, realistic forecasts
- Provides confidence intervals
- Deterministic (same input = same output)

**Limitations**:
- Requires sufficient recent data (at least 3-5 years)
- May be conservative for areas with rapidly changing trends

---

## Trend Analysis

The system analyzes trends at multiple levels to provide comprehensive context:

### Recent Trend Analysis (Primary)
- **Time Period**: Last 5 years of data
- **Year-over-Year Changes**: Calculates individual year changes
- **Average Recent Change**: Mean of year-over-year changes
- **Recent Trend Rate**: Overall slope from first to last of recent years
- **Recent Volatility**: Standard deviation of recent changes

### Long-Term Trend Analysis (Context)
- **Time Period**: All historical data (2006-2022)
- **Long-Term Trend Rate**: Overall slope across entire period
- **Historical Volatility**: Standard deviation of all year-over-year changes
- **Used for**: Providing stability and context to recent trends

### Trend Blending
- **70% Recent Trend**: Most relevant for short-term forecasting
- **30% Long-Term Trend**: Provides stability and prevents overreaction
- **Result**: Balanced trend rate that respects recent patterns while maintaining historical context

### Trend Direction Classification
- **Strong Increasing**: Large upward trend with high R² (>0.7)
- **Moderate Increasing**: Moderate upward trend with medium R² (0.4-0.7)
- **Weak Increasing**: Small upward trend
- **Stable**: Minimal change (<1% variation)
- **Weak/Moderate/Strong Decreasing**: Corresponding downward trends

### Trend Metrics
- **Change**: Absolute change in percentage points
- **Percent Change**: Relative change percentage
- **Strength**: R² value indicating how well the trend fits the data
- **Confidence**: Based on recent trend stability and alignment with long-term trend
- **Volatility**: Historical standard deviation of year-over-year changes

---

## Confidence Intervals and Uncertainty

### Ensemble Method Confidence Intervals
- **Lower Bound**: `predicted - 1.5 * historicalVolatility * sqrt(yearsAhead)`
- **Upper Bound**: `predicted + 1.5 * historicalVolatility * sqrt(yearsAhead)`
- Based on historical volatility scaled by forecast horizon
- Accounts for increasing uncertainty over time

### Confidence Score
- **Calculation**: Based on recent trend stability and alignment
- **Stability Factor**: Coefficient of variation of recent year-over-year changes
- **Alignment Factor**: How well recent trend matches long-term trend
- **Range**: 0.5 (low confidence) to 0.9 (high confidence)
- **Higher confidence when**:
  - Recent trends are consistent (low variation)
  - Recent trends align with long-term patterns
  - Sufficient historical data available

### Linear Regression (Individual Method)
- Uses standard error and t-distribution (95% CI)
- Accounts for uncertainty in both intercept and slope
- Formula accounts for distance from historical mean

### Other Methods
- Confidence based on R² or historical fit quality
- Ranges from 0.0 (low confidence) to 1.0 (high confidence)

---

## Usage Example

```javascript
// Fetch historical data
const historicalData = await ForecastingModels.fetchHistoricalInsuranceData(
  '06037', // FIPS code (Los Angeles County)
  {
    ageCat: '1',    // 18-64 years
    sexCat: '0',    // Both sexes
    raceCat: '0',   // All races
    iprCat: '0'     // All incomes
  }
);

// Generate ensemble forecast (5 years ahead)
const forecastResult = ForecastingModels.forecastEnsemble(historicalData, 5);

// Analyze trend
const trendAnalysis = ForecastingModels.analyzeTrend(historicalData);

// Format for display
const formatted = ForecastingModels.formatForecastResult(
  forecastResult.forecast,
  trendAnalysis
);

// Get detailed explanation
const explanation = ForecastingModels.generateDetailedExplanation(
  forecastResult,
  historicalData,
  'Los Angeles County, California'
);
```

---

## Output Format

### Forecast Result Structure
```javascript
{
  forecast: [
    {
      year: 2026,
      predicted: 85.3,        // Percentage (rounded to 1 decimal)
      confidence: 0.82,       // 0.5-0.9 scale (based on trend stability)
      lowerBound: 82.1,       // Lower confidence bound
      upperBound: 88.5,       // Upper confidence bound
      method: 'ensemble',     // Method identifier
      methods: {              // Individual method predictions (for reference)
        linear: 85.1,
        exponential: 85.5,
        cagr: 85.8,
        // ... other methods
      }
    },
    // ... more years
  ],
  methods: {
    linear: { intercept, slope, rSquared },
    exponential: { lastValue, trend },
    cagr: 2.5,  // Percentage
    // ... other methods
  },
  weights: {
    recentTrendRate: 1.2  // The blended trend rate used (percentage points per year)
  }
}
```

---

## Best Practices

1. **Data Requirements**: 
   - Need at least 3 years of historical data for most methods
   - 5+ years recommended for reliable recent trend analysis
   - More data = better volatility estimates and confidence intervals

2. **Demographic Selection**: 
   - More specific demographics may have less data
   - "All Races" and "All Incomes" typically have most complete data
   - State-level data has more granular race categories than county-level

3. **Forecast Horizon**: 
   - Shorter forecasts (1-5 years) are most reliable
   - Longer forecasts (10+ years) have increasing uncertainty
   - Confidence intervals widen with forecast horizon

4. **Recent Trends**: 
   - Recent trends (last 5 years) are weighted 60% in final forecast
   - Recent year-over-year changes are most predictive
   - Long-term trends provide stability and context

5. **Understanding Results**:
   - Check confidence intervals to understand uncertainty
   - Higher confidence = more stable recent trends
   - Lower confidence = more volatile historical patterns
   - Use confidence bounds to assess forecast reliability

---

## Limitations and Considerations

1. **Assumptions**: 
   - Assumes recent trends will continue (with decay)
   - Assumes no major policy changes or external shocks
   - Historical patterns provide best estimate of future

2. **External Factors**: 
   - Cannot account for future policy changes (e.g., Medicaid expansion)
   - Cannot predict economic shocks or recessions
   - Cannot account for demographic shifts or migration
   - Major events (pandemics, disasters) not reflected

3. **Data Quality**: 
   - Forecast accuracy depends on historical data quality
   - Missing years in historical data reduce reliability
   - Data collection methods may have changed over time

4. **Geographic Variations**: 
   - Some areas may have insufficient historical data
   - Small counties may have less reliable estimates
   - Rural areas may have higher data uncertainty

5. **Demographic Combinations**: 
   - Some demographic combinations may lack sufficient data
   - Race categories have limited historical data (some start 2021)
   - More specific demographics = less data = lower confidence

6. **Conservative Nature**:
   - System is designed to be conservative and realistic
   - May underestimate if trends accelerate
   - May overestimate if trends reverse
   - Confidence intervals help assess uncertainty

7. **Upper Bounds**:
   - Hard cap at 95% (realistic maximum)
   - Growth slows as coverage approaches high percentages
   - Reflects practical limits of insurance coverage

---

## Technical Implementation

### Algorithm Complexity
- **Time Complexity**: O(n) for each method, where n is number of historical data points
- **Space Complexity**: O(n) for storing historical data and predictions

### Numerical Stability
- Polynomial regression uses centered years to improve numerical stability
- Gaussian elimination with pivoting for solving linear systems
- All calculations handle edge cases (division by zero, insufficient data)

### Error Handling
- Returns empty forecasts if insufficient data
- Handles missing years gracefully
- Provides error messages for invalid inputs

---

## Key Design Principles

The current forecasting system is built on these principles:

1. **Recent Trends First**: Recent patterns (last 5 years) are most predictive
2. **Historical Context**: Long-term trends provide stability and prevent overreaction
3. **Realistic Constraints**: Hard caps and saturation effects prevent unrealistic predictions
4. **Natural Variability**: Incorporates historical volatility for realistic variation
5. **Conservative Approach**: Designed to avoid overestimation while following trends
6. **Transparency**: Provides confidence intervals and method breakdowns
7. **Deterministic**: Same inputs always produce same outputs (no randomness)

## Future Enhancements

Potential improvements to the forecasting system:

1. **Scenario Analysis**: Provide optimistic/pessimistic scenarios based on different trend assumptions
2. **External Variables**: Incorporate economic indicators, policy changes, or demographic projections
3. **Machine Learning**: Add neural networks or other advanced ML methods for pattern recognition
4. **Validation**: Cross-validation to assess forecast accuracy and tune parameters
5. **Backtesting**: Test forecasts against known future values to improve methods
6. **Regional Models**: Adjust parameters based on regional characteristics (urban vs. rural, expansion vs. non-expansion states)
7. **Interactive Sensitivity**: Allow users to adjust trend assumptions and see impact

---

## References

- **SAHIE API**: U.S. Census Bureau Small Area Health Insurance Estimates
- **Linear Regression**: Standard least squares method
- **Exponential Smoothing**: Holt-Winters method variant
- **CAGR**: Standard financial growth rate calculation
- **Polynomial Regression**: Least squares polynomial fitting
- **AR Models**: Autoregressive time series models

---

## Contact

For questions or issues with the forecasting system, please refer to the main application documentation or contact the development team.



