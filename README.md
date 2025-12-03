# SAHIE Health Insurance Visualization & Forecasting

An interactive web-based application built with Leaflet.js and the U.S. Census Bureau's SAHIE API to visualize health insurance coverage rates across U.S. counties and states, with advanced analytics and predictive forecasting capabilities.

## Features

### 🗺️ Interactive Map Visualization
- **Geographic Granularity**: Toggle between county-level and state-level views
- **Year Selector**: Visualize data from 2006 to 2022 using an interactive slider
- **Animated Time Playback**: Automatically cycle through each year to see trends over time
- **Search Functionality**: Search for counties or states by name with autocomplete suggestions
- **Dynamic Color Scaling**: Color-coded map with dynamic legends that scale based on data ranges

### 📊 Analytics Panel
- **Comprehensive Statistics**: View count, mean, median, standard deviation, quartiles, and range
- **Top/Bottom Rankings**: See the top 5 and bottom 5 locations for insurance coverage and health outcomes
- **Correlation Analysis**: Analyze relationships between insurance coverage and health outcomes
- **Regression Analysis**: View regression equations and correlation coefficients
- **Dual View Modes**: Switch between single metric (insurance or health) and combined metric views

### 📈 Scatterplot Visualization
- **Interactive Scatterplot**: Visualize insurance coverage (x-axis) vs. health outcomes (y-axis)
- **Zoom & Pan**: Explore data with interactive zoom and pan controls
- **Point Highlighting**: Hover and click on points to see detailed information
- **Correlation Display**: View correlation coefficient and regression line
- **Synchronized Views**: Scatterplot and map views stay synchronized

### 🔮 Predictive Forecasting
- **Time Series Forecasting**: Predict future insurance coverage rates using multiple forecasting methods
- **5 Forecasting Methods**:
  - **5-Year Linear Regression**: Focuses on recent trends from the last 5 years
  - **Holt's Linear Exponential Smoothing**: Tracks level and trend components separately
  - **ARIMA(1,1,1)**: Captures complex temporal dependencies with differencing
  - **Quadratic Regression**: Models curved trends and acceleration/deceleration
  - **CAGR**: Assumes constant percentage growth over time
- **Ensemble Forecasting**: Weighted combination of all methods for robust predictions
- **Confidence Intervals**: View upper and lower bounds for forecast uncertainty
- **Gap Year Filling**: Automatically fills in missing years (2023-2025) between historical data and forecasts
- **Trend Analysis**: Detailed trend direction, strength, and historical change analysis

### 🏥 Health Outcome Integration
- **CDC PLACES Data**: Integrates chronic health measures from CDC PLACES dataset
- **Multiple Health Measures**: 
  - Diabetes, Obesity, High Blood Pressure
  - Heart Disease, Stroke, Cancer
  - Asthma, COPD, Depression
  - Kidney Disease, Arthritis
  - Preventive Care Measures
- **Combined View**: Visualize both insurance coverage and health outcomes simultaneously using color blending
- **Relationship Analysis**: Explore correlations between insurance coverage and health outcomes

### 🎛️ Demographic Filters
- **Age Categories**: Filter by age groups (0-64, 18-64, etc.)
- **Sex**: Filter by male, female, or both sexes
- **Income Poverty Ratio (IPR)**: Filter by income levels
- **Race**: Filter by race categories (available for state-level data)

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Mapping Library**: [Leaflet.js](https://leafletjs.com/)
- **Data Sources**:
  - [U.S. Census Bureau SAHIE API](https://www.census.gov/data/developers/data-sets/health-insurance.html) - Health insurance coverage estimates
  - [CDC PLACES API](https://www.cdc.gov/places/) - Chronic health outcome data
- **Map Tiles**: OpenStreetMap

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for API calls and map tiles)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/samthomas1405/SAHIE-visualization.git
   cd SAHIE-visualization
   ```

2. **Open the application**:
   - Simply open `index.html` in your web browser
   - Or use a local web server:
     ```bash
     # Using Python 3
     python -m http.server 8000
     
     # Using Node.js (if you have http-server installed)
     npx http-server
     ```
   - Then navigate to `http://localhost:8000` in your browser

### Usage

1. **View Insurance Coverage**:
   - Select a year using the slider
   - Toggle between county and state views
   - Use the search bar to find specific locations
   - Click on map regions to see detailed information

2. **Explore Health Outcomes**:
   - Switch to "Health" layer in the layer selector
   - Select a health measure from the dropdown
   - View statistics in the analytics panel

3. **Analyze Relationships**:
   - Switch to "Combined" view
   - Adjust the relationship weight slider to balance insurance and health visualization
   - View correlation analysis in the analytics panel
   - Switch to scatterplot view for visual correlation analysis

4. **Generate Forecasts**:
   - Click the "Predictive Modeling" button
   - Search for a location (state or county)
   - Select demographics (optional)
   - Choose years to forecast (1-10 years)
   - Click "Generate Forecast" to see predictions
   - View detailed explanations and confidence intervals

## Project Structure

```
SAHIE-visualization/
├── index.html              # Main HTML file
├── styles.css              # All styling
├── script.js               # Legacy script (backup)
├── js/
│   ├── app.js              # Main application entry point
│   ├── config.js           # Configuration and constants
│   ├── data-manager.js     # Data fetching and management
│   ├── map-manager.js      # Map rendering and interactions
│   ├── analytics-manager.js # Analytics panel logic
│   ├── scatterplot-manager.js # Scatterplot visualization
│   ├── predictive-manager.js  # Forecasting UI management
│   ├── forecasting-models.js  # Forecasting algorithms
│   ├── ui-controls.js      # UI control handlers
│   └── dom-references.js   # DOM element references
```

## Forecasting Methodology

The forecasting system uses an ensemble approach combining 5 different methods:

1. **5-Year Linear Regression**: Uses only recent data (last 5 years) to capture current trends
2. **Holt's Linear**: Double exponential smoothing that tracks level and trend separately
3. **ARIMA(1,1,1)**: Autoregressive Integrated Moving Average with first-order differencing
4. **Quadratic Regression**: Polynomial regression that captures acceleration/deceleration
5. **CAGR**: Compound Annual Growth Rate assuming constant percentage growth

The ensemble method intelligently weights each method based on:
- Historical fit quality (R²)
- Alignment with recent trends
- Method stability and reliability

For detailed information, see [FORECASTING.md](FORECASTING.md).

## Data Sources

- **SAHIE (Small Area Health Insurance Estimates)**: Provides health insurance coverage estimates for states and counties from 2006-2022
- **CDC PLACES**: Provides model-based estimates of chronic disease prevalence and preventive health behaviors

---

**Note**: This application is for visualization and analysis purposes. Forecasts are predictions based on historical data and should not be used as definitive future values.

