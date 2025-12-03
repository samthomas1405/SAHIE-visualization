# Project Development Log

## 09/03/2025

**Went over last year's work**

**Discussed plans for this year**

**HW:**
Research different APIs to integrate for this semester

**What I did:**
Looked at CDC Places datasets. Attempted integration of different chronic health measures into the dataset. However, I am receiving errors with the API with the key values not being found.

---

## 09/10/2025

**Continued API integration work**

**Focused on fixing CDC PLACES data retrieval issues**

**HW:**
Continue troubleshooting API integration and improve data visualization

**What I did:**
Successfully resolved CDC PLACES API integration issues. Fixed the API query syntax that was causing 400 errors when fetching health outcome data. Updated the measure ID mapping to correctly retrieve data for all health measures (diabetes, stroke, COPD, etc.). Implemented dynamic legend system that scales based on actual data min/max values with clean whole number intervals. All health measures now successfully load county-level data instead of showing 0 counties.

---

## 09/17/2025

**Did not attend class due to illness**

**HW:**
Enhance combined data visualization approach

**What I did:**
Improved the combined view functionality to better display both insurance coverage and health outcome data simultaneously. Initially tried a border-based approach but redesigned to use color blending method for clearer visualization. Implemented 50/50 color blending where each geographic area shows a unique color combining the insurance coverage color (blue scale) and health outcome color (red scale). Created a comprehensive legend system explaining the blended approach with examples and full spectrum color representation. Need to work on the color schema however.

---

## 09/24/2025

**Worked on combined view visualization**

**Improved color blending approach**

**HW:**
Enhance combined data visualization and refine color schema

**What I did:**
Refined the combined view color blending system. Improved the relationship weight slider functionality that allows users to adjust the balance between insurance coverage and health outcome visualization. Fixed color calculation to properly blend blue (insurance) and red (health) scales based on the weight setting. Updated the combined legend to dynamically reflect the current weight setting. Improved the color schema to ensure better visual distinction between different combinations of insurance and health values. The combined view now provides clearer visual representation of the relationship between insurance coverage and health outcomes.

---

## 10/01/2025

**Implemented scatterplot for combined view**

**Worked on scatterplot visualization**

**HW:**
Add scatterplot view option for combined insurance and health data

**What I did:**
Implemented scatterplot visualization for the combined view mode. Created scatterplot-manager.js module to handle scatterplot rendering and interactions. Built scatterplot that displays insurance coverage (x-axis) vs. health outcomes (y-axis) with each point representing a county or state. Implemented zoom and pan functionality for exploring the data. Added point highlighting on hover and click interactions. Integrated correlation calculation and regression line display. Created view mode toggle to switch between map view and scatterplot view. The scatterplot provides a powerful way to visualize the relationship between insurance coverage and health outcomes across all locations simultaneously.

---

## 10/08/2025

**Enhanced scatterplot features**

**Improved scatterplot interactions and analytics**

**HW:**
Add more interactive features to scatterplot and improve data exploration

**What I did:**
Enhanced scatterplot with additional interactive features. Implemented reset zoom and reset highlight buttons for better navigation. Added tooltip display on hover showing location name, insurance coverage, and health outcome values. Improved point highlighting to show selected locations clearly. Integrated scatterplot data with analytics panel to show correlation and regression statistics. Fixed issues with data synchronization between map view and scatterplot view. Ensured that scatterplot updates correctly when filters or health measures change. The scatterplot now provides comprehensive data exploration capabilities.

---

## 10/15/2025

**Worked on analytics panel improvements**

**Enhanced statistics and data display**

**HW:**
Improve analytics panel functionality and data presentation

**What I did:**
Enhanced the analytics panel with improved statistics calculations and display. Implemented separate views for single metric (insurance or health only) and combined metric views. Added comprehensive statistics including count, mean, median, standard deviation, quartiles, and range. Created top 5 and bottom 5 rankings for both insurance and health metrics. Improved the combined view to show correlation analysis and regression statistics. Added compact view layouts for better space utilization. Enhanced badge system to show current layer, scope, year, and health measure. The analytics panel now provides detailed insights into the data.

---

## 10/22/2025

**Continued analytics panel development**

**Worked on correlation and relationship analysis**

**HW:**
Add correlation analysis and improve relationship visualization

**What I did:**
Implemented correlation calculation between insurance coverage and health outcomes in the combined view. Added Pearson correlation coefficient (r) calculation and display. Created regression analysis showing the relationship equation. Enhanced the correlation box with clear visual indicators of relationship strength. Improved the analytics panel layout to better accommodate both single and combined metric views. Added proper handling of missing data in statistics calculations. The analytics panel now provides comprehensive relationship analysis between insurance and health data.

---

## 10/29/2025

**Finalized analytics panel and prepared for forecasting**

**Completed analytics features**

**HW:**
Complete analytics panel and begin planning forecasting feature

**What I did:**
Finalized all analytics panel features and ensured proper integration with map and scatterplot views. Fixed edge cases in statistics calculations. Improved responsive design for analytics panel on different screen sizes. Tested analytics panel with various data combinations and demographic filters. Began researching time series forecasting methods for insurance coverage prediction. Reviewed SAHIE API documentation for historical data access. Planned the forecasting feature architecture and user interface requirements.

---

## 11/05/2025

**Started implementing forecasting feature**

**Created initial forecasting module**

**HW:**
Implement basic forecasting functionality for insurance coverage

**What I did:**
Started implementing time series forecasting functionality for predicting future insurance coverage rates. Created forecasting-models.js module with basic linear regression forecasting method. Set up data fetching from SAHIE API for historical insurance data (2006-2022). Implemented fetchHistoricalInsuranceData function that retrieves data for all years. Created forecastLinearTrend method that uses least squares regression to project trends forward. Added basic forecast calculation that projects trends from historical data. Set up predictive modeling panel UI with location search and demographic filters.

---

## 11/12/2025

**Expanded forecasting with multiple methods**

**Implemented additional forecasting algorithms**

**HW:**
Add multiple forecasting methods beyond linear regression

**What I did:**
Expanded forecasting system with multiple algorithms: exponential smoothing, CAGR (Compound Annual Growth Rate), polynomial regression (2nd and 3rd degree), weighted linear regression, autoregressive (AR) models, and moving average methods. Each method captures different patterns - linear trends, exponential growth, non-linear curves, and temporal dependencies. Implemented least squares solver and Gaussian elimination for polynomial regression calculations. Created method scoring system to evaluate forecast quality using R² and confidence metrics. Added trend analysis function to classify trend direction and strength. The system now has 8 different forecasting methods to choose from.

---

## 11/19/2025

**Developed ensemble forecasting approach**

**Worked on combining multiple forecasting methods**

**HW:**
Create intelligent ensemble method that combines all forecasting algorithms

**What I did:**
Implemented ensemble forecasting method that combines all 8 individual forecasting methods using weighted averaging. Created initial weighting system based on method quality (R² and confidence). Implemented method score calculation to evaluate each method's historical fit. Added basic trend analysis to understand historical patterns. Created forecast result structure that includes predictions from all methods. The ensemble method now provides a single forecast that leverages the strengths of all individual methods.

---

## 11/26/2025

**Improved forecasting logic and UI**

**Enhanced forecast accuracy and visualization**

**HW:**
Refine forecasting approach and improve forecast result display

**What I did:**
Completely rewrote ensemble forecasting method with focus on recent trends. New approach analyzes last 5 years of data for year-over-year changes and calculates recent trend rate. Blends recent trend (70%) with long-term trend (30%) for stability. Calculates historical volatility to add realistic variability. Changed to balanced 60/40 blend (trend projection vs. method average). Added deterministic variability using sine wave patterns. Implemented confidence intervals based on historical volatility. Created forecast result display with forecast cards, trend analysis box, and interactive chart. Forecasts are now more conservative and realistic.

---

## 12/03/2025

**Updated forecasting system to recommended final model**

**Replaced forecasting methods with research-backed approach**

**HW:**


**What I did:**
Completely replaced the forecasting methods with the recommended final model set of 5 methods:

1. **5-year Linear Regression**: Uses only the last 5 years of historical data to fit a linear trend. This method focuses on recent patterns and is ideal for capturing short-term trends that may differ from long-term historical patterns. It's particularly useful when recent data shows a different trajectory than older data.

2. **Holt's Linear Exponential Smoothing**: A double exponential smoothing method that tracks both the level (current value) and trend (rate of change) components separately. It uses two smoothing parameters (alpha for level, beta for trend) to adapt to recent changes while maintaining trend information. This method is excellent for data with trends that may be changing over time.

3. **ARIMA(1,1,1)**: An autoregressive integrated moving average model with first-order differencing. The model uses AR(1) to capture how each value depends on the previous value, MA(1) to model moving average errors, and differencing to make the time series stationary. This method captures complex temporal dependencies and is particularly good for data with autocorrelation patterns.

4. **Quadratic Regression**: A polynomial regression of degree 2 that fits a curved line to the data. Unlike linear regression, this can capture acceleration or deceleration in trends. It's useful when the rate of change itself is changing over time, such as when growth is speeding up or slowing down.

5. **CAGR (Compound Annual Growth Rate)**: Calculates the average annual growth rate between the first and last historical data points, then projects this constant percentage growth forward. This method assumes exponential growth and is best for data that has shown consistent percentage-based changes over time.

Implemented weighted ensemble that combines all 5 methods intelligently based on their historical fit quality (R²) and alignment with recent trends. Updated gap year filling to work with new methods (fills in 2023-2025 between last historical data and current year). Fixed all method references throughout the codebase to use new method names. Updated explanation generation to describe the new methods accurately. The system now uses a more practical and accurate forecasting approach based on research recommendations. All methods work together in the ensemble to provide robust predictions with proper weighting.

---

