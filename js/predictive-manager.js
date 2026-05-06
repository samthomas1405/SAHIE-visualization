// Predictive Manager Module
// =========================

const PredictiveManager = {

  // Initialize predictive panel
  initializePredictivePanel() {
    this.setupEventHandlers();
  },

  // Setup event handlers
  setupEventHandlers() {
    // FAB click to open panel
    DOMRefs.predictiveFAB.addEventListener('click', () => {
      this.togglePredictivePanel();
    });

    // Panel controls
    DOMRefs.ppMinimize.addEventListener('click', () => {
      this.toggleMinimize();
    });

    DOMRefs.ppClose.addEventListener('click', () => {
      this.closePredictivePanel();
    });

    // Overlay click to close
    DOMRefs.predictiveOverlay.addEventListener('click', () => {
      this.closePredictivePanel();
    });

    // Time series forecasting
    DOMRefs.forecastYears.addEventListener('input', (e) => {
      const years = e.target.value;
      DOMRefs.forecastYearsValue.textContent = `${years} year${years > 1 ? 's' : ''}`;
    });

    DOMRefs.forecastTrendBtn.addEventListener('click', () => {
      this.forecastTrend();
    });

    // Location search for forecasting (same as sidebar search)
    if (DOMRefs.forecastLocation) {
      DOMRefs.forecastLocation.addEventListener('input', () => {
        this.searchForecastLocation();
      });
    }

    // Hide location results when clicking outside
    document.addEventListener('click', (e) => {
      if (!DOMRefs.forecastLocationGroup || !DOMRefs.forecastLocationResults) return;
      if (!DOMRefs.forecastLocationGroup.contains(e.target)) {
        DOMRefs.forecastLocationResults.style.display = 'none';
      }
    });
  },

  // Toggle predictive panel
  togglePredictivePanel() {
    const isOpen = DOMRefs.predictivePanel.classList.contains('open');
    if (isOpen) {
      this.closePredictivePanel();
    } else {
      DOMRefs.predictivePanel.classList.add('open');
      DOMRefs.predictiveOverlay.classList.add('show');
      DOMRefs.predictivePanel.classList.remove('minimized');
    }
  },

  // Toggle minimize
  toggleMinimize() {
    DOMRefs.predictivePanel.classList.toggle('minimized');
  },

  // Close predictive panel
  closePredictivePanel() {
    DOMRefs.predictivePanel.classList.remove('open');
    DOMRefs.predictiveOverlay.classList.remove('show');
    DOMRefs.predictivePanel.classList.remove('minimized');
  },

  // Search for location (state or county) for forecasting
  async searchForecastLocation() {
    const query = DOMRefs.forecastLocation.value.trim().toLowerCase();
    DOMRefs.forecastLocationResults.innerHTML = '';

    if (!query) {
      DOMRefs.forecastLocationResults.style.display = 'none';
      return;
    }

    let features = [];
    if (AppConfig.geoJsonLayer) {
      AppConfig.geoJsonLayer.eachLayer(layer => features.push(layer.feature));
    } else {
      const mapLevel = AppConfig.mapLevel || 'county';
      try {
        const geojson = await DataManager.loadGeoJSONForLevel(mapLevel);
        features = geojson?.features || [];
      } catch (_) {
        DOMRefs.forecastLocationResults.style.display = 'none';
        return;
      }
    }

    const matches = [];
    const isState = AppConfig.mapLevel === 'state';
    for (const feat of features) {
      const props = feat.properties || {};
      const name = isState
        ? (props.name || feat.id || '')
        : `${props.NAME || ''}, ${AppConfig.stateFIPSMapping[props.STATE] || 'Unknown'}`.trim();
      if (name.toLowerCase().startsWith(query)) {
        const fips = isState
          ? (feat.id || '').toString().padStart(2, '0')
          : (props.GEO_ID || '').replace('0500000US', '');
        if (fips) matches.push({ name, fips });
      }
    }

    if (matches.length > 0) {
      matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = match.name;
        div.onclick = () => {
          DOMRefs.forecastLocation.value = match.name;
          DOMRefs.forecastLocation.dataset.fips = match.fips;
          DOMRefs.forecastLocationResults.style.display = 'none';
        };
        DOMRefs.forecastLocationResults.appendChild(div);
      });
      DOMRefs.forecastLocationResults.style.display = 'block';
    } else {
      DOMRefs.forecastLocationResults.style.display = 'none';
    }
  },

  // Forecast trend using time series analysis
  async forecastTrend() {
    const locationFIPS = DOMRefs.forecastLocation.dataset.fips;
    const yearsAhead = parseInt(DOMRefs.forecastYears.value);

    if (!locationFIPS) {
      alert('Please select a location from the search results');
      return;
    }

    // Show loading state
    DOMRefs.trendForecastResult.innerHTML = '<div class="pp-loading">Loading historical data and generating forecast...</div>';
    DOMRefs.trendForecastResult.classList.add('show');
    DOMRefs.trendForecastChart.classList.remove('show');
    DOMRefs.trendForecastChart.innerHTML = '';
    if (DOMRefs.trendForecastBacktest) {
      DOMRefs.trendForecastBacktest.innerHTML = '';
      DOMRefs.trendForecastBacktest.classList.remove('show');
    }

    try {
      const locationName = DOMRefs.forecastLocation.value;

      // Fetch historical insurance data
      const demographics = {
        ageCat: DOMRefs.forecastTSAge.value,
        sexCat: DOMRefs.forecastTSSex.value,
        raceCat: DOMRefs.forecastTSRace.value,
        iprCat: DOMRefs.forecastTSIncome.value
      };
      
      const historicalData = await ForecastingModels.fetchHistoricalInsuranceData(locationFIPS, demographics);

      if (historicalData.length < 3) {
        DOMRefs.trendForecastResult.innerHTML = `
          <div class="pp-error">
            <strong>Insufficient data</strong>
            <p>
              Not enough historical data available for this location and demographic combination. 
              Please try a different selection.
            </p>
          </div>
        `;
        return;
      }

      const mapLevel = locationFIPS.length === 2 ? 'state' : 'county';
      const allData = await ForecastingModels.fetchAllHistoricalData(demographics, mapLevel);

      const forecastResult = await EnhancedForecastingModels.forecastEnhancedEnsemble(
        historicalData,
        locationFIPS,
        yearsAhead,
        allData,
        null
      );

      if (forecastResult.error || !forecastResult.forecast?.length) {
        const fallback = ForecastingModels.forecastEnsemble(historicalData, yearsAhead);
        forecastResult.forecast = fallback.forecast;
      }

      const trendAnalysis = ForecastingModels.analyzeTrend(historicalData);
      const fcCore = forecastResult.forecast.filter(f => !f.isGapYear);
      const formatted = ForecastingModels.formatForecastResult(fcCore.length ? fcCore : forecastResult.forecast, trendAnalysis);

      // Display results
      this.displayTrendForecast(formatted, historicalData, forecastResult, locationName);
      
      // Render chart
      this.renderForecastChart(historicalData, forecastResult.forecast, locationName);
      
      // Generate and display detailed explanation
      const explanationInput = { ...forecastResult, forecast: fcCore.length ? fcCore : forecastResult.forecast };
      const detailedExplanation = ForecastingModels.generateDetailedExplanation(explanationInput, historicalData, locationName);
      this.displayDetailedExplanation(detailedExplanation);

      // Run backtest and display accuracy metrics
      DOMRefs.trendForecastBacktest.innerHTML = '<div class="pp-loading">Validating forecast accuracy...</div>';
      DOMRefs.trendForecastBacktest.classList.add('show');
      try {
        const [ensembleBt, mcmcBt] = await Promise.all([
          EnhancedForecastingModels.backtestForecast(historicalData, locationFIPS, allData, null),
          EnhancedForecastingModels.backtestMcmcForecast(historicalData, locationFIPS, allData, null)
        ]);
        this.displayBacktestComparison(ensembleBt, mcmcBt);
      } catch (err) {
        console.warn('Backtest failed:', err);
        DOMRefs.trendForecastBacktest.innerHTML = '';
        DOMRefs.trendForecastBacktest.classList.remove('show');
      }
      
    } catch (error) {
      console.error('Error generating forecast:', error);
      DOMRefs.trendForecastResult.innerHTML = `
        <div class="pp-error">
          <strong>Error</strong>
          <p>An error occurred while generating the forecast. Please try again.</p>
        </div>
      `;
    }
  },

  // Display trend forecast results
  displayTrendForecast(formatted, historicalData, forecastResult, locationName) {
    const nextYear = formatted.forecast[0];
    const fiveYear = formatted.forecast[4] || formatted.forecast[formatted.forecast.length - 1];
    
    const trendStrength = formatted.trendAnalysis.strength > 0.7 ? 'Strong' : 
                          formatted.trendAnalysis.strength > 0.4 ? 'Moderate' : 'Weak';
    
    DOMRefs.trendForecastResult.innerHTML = `
      <h4>Forecast for ${locationName}</h4>
      <div class="pp-forecast-cards">
        <div class="pp-forecast-card">
          <div class="pp-forecast-card-label">Next Year</div>
          <div class="pp-forecast-card-value">${nextYear.predicted.toFixed(1)}%</div>
          <div class="pp-forecast-card-year">${nextYear.year}</div>
          </div>
        <div class="pp-forecast-card">
          <div class="pp-forecast-card-label">${fiveYear.year}</div>
          <div class="pp-forecast-card-value">${fiveYear.predicted.toFixed(1)}%</div>
          <div class="pp-forecast-card-year">${fiveYear.year === nextYear.year ? 'Same Year' : 'Future'}</div>
          </div>
      </div>
      <div class="pp-trend-box">
        <strong>Trend Analysis:</strong> ${formatted.trendAnalysis.direction.replace(/_/g, ' ').toUpperCase()} 
          (${trendStrength} strength: ${(formatted.trendAnalysis.strength * 100).toFixed(0)}%)
          <br>
          <strong>Historical Change:</strong> ${formatted.trendAnalysis.change > 0 ? '+' : ''}${formatted.trendAnalysis.change}% 
          (${formatted.trendAnalysis.percentChange > 0 ? '+' : ''}${formatted.trendAnalysis.percentChange}%) 
          from ${formatted.trendAnalysis.firstYear} to ${formatted.trendAnalysis.lastYear}
      </div>
      <div class="pp-summary-box">
          ${formatted.summary}
      </div>
    `;
    
    DOMRefs.trendForecastResult.classList.add('show');
  },

  // Render forecast chart (historical + ensemble forecast + ensemble uncertainty band)
  renderForecastChart(historicalData, forecast, locationName) {
    const allData = [
      ...historicalData,
      ...forecast.map(f => ({ year: f.year, value: f.predicted, isForecast: true }))
    ];
    const boundsValues = forecast.flatMap(f => [f.lowerBound, f.upperBound].filter(v => v != null));
    const minYear = Math.min(...allData.map(d => d.year));
    const maxYear = Math.max(...allData.map(d => d.year));
    const minValue = Math.min(...allData.map(d => d.value), ...boundsValues);
    const maxValue = Math.max(...allData.map(d => d.value), ...boundsValues);
    const spanYear = Math.max(1e-6, maxYear - minYear);
    const spanVal = Math.max(1e-6, maxValue - minValue);

    const width = 600;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const xScale = (year) => margin.left + ((year - minYear) / spanYear) * chartWidth;
    const yScale = (value) => margin.top + chartHeight - ((value - minValue) / spanVal) * chartHeight;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.cursor = 'default';

    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `Forecast Chart for ${locationName} - Click points to see details`;
    svg.appendChild(title);

    // Draw grid lines
    for (let year = minYear; year <= maxYear; year += 5) {
      const x = xScale(year);
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('x1', x);
      gridLine.setAttribute('y1', margin.top);
      gridLine.setAttribute('x2', x);
      gridLine.setAttribute('y2', height - margin.bottom);
      gridLine.setAttribute('stroke', '#e5e7eb');
      gridLine.setAttribute('stroke-width', '1');
      svg.appendChild(gridLine);

      const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      yearText.setAttribute('x', x);
      yearText.setAttribute('y', height - margin.bottom + 20);
      yearText.setAttribute('text-anchor', 'middle');
      yearText.setAttribute('font-size', '10');
      yearText.setAttribute('fill', '#6b7280');
      yearText.textContent = year;
      svg.appendChild(yearText);
    }

    // Draw value grid lines
    for (let val = Math.ceil(minValue / 10) * 10; val <= Math.floor(maxValue / 10) * 10; val += 10) {
      const y = yScale(val);
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('x1', margin.left);
      gridLine.setAttribute('y1', y);
      gridLine.setAttribute('x2', width - margin.right);
      gridLine.setAttribute('y2', y);
      gridLine.setAttribute('stroke', '#e5e7eb');
      gridLine.setAttribute('stroke-width', '1');
      svg.appendChild(gridLine);

      const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valueText.setAttribute('x', margin.left - 10);
      valueText.setAttribute('y', y + 4);
      valueText.setAttribute('text-anchor', 'end');
      valueText.setAttribute('font-size', '10');
      valueText.setAttribute('fill', '#6b7280');
      valueText.textContent = `${val}%`;
      svg.appendChild(valueText);
    }

    const hasBounds = forecast.some(f => f.lowerBound != null && f.upperBound != null);
    if (hasBounds && forecast.length > 0) {
      const lowerPts = forecast.map(f => `${xScale(f.year)},${yScale(f.lowerBound ?? f.predicted)}`);
      const upperPts = forecast.slice().reverse().map(f => `${xScale(f.year)},${yScale(f.upperBound ?? f.predicted)}`);
      const bandPoints = [...lowerPts, ...upperPts].join(' ');
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      band.setAttribute('points', bandPoints);
      band.setAttribute('fill', 'rgba(139, 92, 246, 0.15)');
      band.setAttribute('stroke', 'none');
      svg.appendChild(band);
    }

    // Draw historical data line
    const historicalPoints = historicalData.map(d => `${xScale(d.year)},${yScale(d.value)}`).join(' ');
    const historicalLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    historicalLine.setAttribute('points', historicalPoints);
    historicalLine.setAttribute('fill', 'none');
    historicalLine.setAttribute('stroke', '#3b82f6');
    historicalLine.setAttribute('stroke-width', '2');
    svg.appendChild(historicalLine);
    
    // Draw historical points (clickable)
    historicalData.forEach(d => {
      const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const cx = xScale(d.year);
      const cy = yScale(d.value);
      point.setAttribute('cx', cx);
      point.setAttribute('cy', cy);
      point.setAttribute('r', '5');
      point.setAttribute('fill', '#3b82f6');
      point.setAttribute('stroke', 'white');
      point.setAttribute('stroke-width', '2');
      point.setAttribute('cursor', 'pointer');
      point.setAttribute('data-year', d.year);
      point.setAttribute('data-value', d.value);
      point.setAttribute('data-type', 'historical');
      point.style.transition = 'all 0.2s';
      
      // Hover effect
      point.addEventListener('mouseenter', (e) => {
        point.setAttribute('r', '7');
        point.setAttribute('fill', '#2563eb');
        this.showChartTooltip(e, d.year, d.value, 'Historical');
      });
      
      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', '5');
        point.setAttribute('fill', '#3b82f6');
        this.hideChartTooltip();
      });
      
      // Click handler
      point.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showChartPointDetails(d.year, d.value, 'Historical', locationName);
      });
      
      svg.appendChild(point);
    });

    // Draw ensemble forecast line (dashed)
    const forecastPoints = forecast.map(f => `${xScale(f.year)},${yScale(f.predicted)}`).join(' ');
    const forecastLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    forecastLine.setAttribute('points', forecastPoints);
    forecastLine.setAttribute('fill', 'none');
    forecastLine.setAttribute('stroke', '#8b5cf6');
    forecastLine.setAttribute('stroke-width', '2');
    forecastLine.setAttribute('stroke-dasharray', '5,5');
    svg.appendChild(forecastLine);

    // Draw ensemble forecast points (clickable)
    forecast.forEach(f => {
      const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const cx = xScale(f.year);
      const cy = yScale(f.predicted);
      point.setAttribute('cx', cx);
      point.setAttribute('cy', cy);
      point.setAttribute('r', '5');
      point.setAttribute('fill', '#8b5cf6');
      point.setAttribute('stroke', 'white');
      point.setAttribute('stroke-width', '2');
      point.setAttribute('cursor', 'pointer');
      point.setAttribute('data-year', f.year);
      point.setAttribute('data-value', f.predicted);
      point.setAttribute('data-type', 'forecast');
      point.style.transition = 'all 0.2s';

      point.addEventListener('mouseenter', (e) => {
        point.setAttribute('r', '7');
        point.setAttribute('fill', '#7c3aed');
        this.showChartTooltip(e, f.year, f.predicted, 'Forecast');
      });

      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', '5');
        point.setAttribute('fill', '#8b5cf6');
        this.hideChartTooltip();
      });

      point.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showChartPointDetails(f.year, f.predicted, 'Forecast', locationName);
      });

      svg.appendChild(point);
    });
    
    // Draw axis lines
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', margin.left);
    xAxis.setAttribute('y1', height - margin.bottom);
    xAxis.setAttribute('x2', width - margin.right);
    xAxis.setAttribute('y2', height - margin.bottom);
    xAxis.setAttribute('stroke', '#374151');
    xAxis.setAttribute('stroke-width', '2');
    svg.appendChild(xAxis);
    
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', margin.left);
    yAxis.setAttribute('y1', margin.top);
    yAxis.setAttribute('x2', margin.left);
    yAxis.setAttribute('y2', height - margin.bottom);
    yAxis.setAttribute('stroke', '#374151');
    yAxis.setAttribute('stroke-width', '2');
    svg.appendChild(yAxis);
    
    // Add legend (stacked Y positions)
    const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legendGroup.setAttribute('transform', `translate(${width - 168}, ${margin.top + 8})`);

    let legY = 0;
    const histLegendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    histLegendLine.setAttribute('x1', '0');
    histLegendLine.setAttribute('y1', String(legY));
    histLegendLine.setAttribute('x2', '30');
    histLegendLine.setAttribute('y2', String(legY));
    histLegendLine.setAttribute('stroke', '#3b82f6');
    histLegendLine.setAttribute('stroke-width', '2');
    legendGroup.appendChild(histLegendLine);
    const histLegendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    histLegendText.setAttribute('x', '35');
    histLegendText.setAttribute('y', String(legY + 4));
    histLegendText.setAttribute('font-size', '10');
    histLegendText.setAttribute('fill', '#374151');
    histLegendText.textContent = 'Historical';
    legendGroup.appendChild(histLegendText);
    legY += 14;

    const forecastLegendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    forecastLegendLine.setAttribute('x1', '0');
    forecastLegendLine.setAttribute('y1', String(legY));
    forecastLegendLine.setAttribute('x2', '30');
    forecastLegendLine.setAttribute('y2', String(legY));
    forecastLegendLine.setAttribute('stroke', '#8b5cf6');
    forecastLegendLine.setAttribute('stroke-width', '2');
    forecastLegendLine.setAttribute('stroke-dasharray', '5,5');
    legendGroup.appendChild(forecastLegendLine);
    const forecastLegendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    forecastLegendText.setAttribute('x', '35');
    forecastLegendText.setAttribute('y', String(legY + 4));
    forecastLegendText.setAttribute('font-size', '10');
    forecastLegendText.setAttribute('fill', '#374151');
    forecastLegendText.textContent = 'Ensemble forecast';
    legendGroup.appendChild(forecastLegendText);
    legY += 14;

    if (hasBounds) {
      const bandLegendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bandLegendRect.setAttribute('x', '0');
      bandLegendRect.setAttribute('y', String(legY));
      bandLegendRect.setAttribute('width', '30');
      bandLegendRect.setAttribute('height', '8');
      bandLegendRect.setAttribute('fill', 'rgba(139, 92, 246, 0.25)');
      bandLegendRect.setAttribute('rx', '2');
      legendGroup.appendChild(bandLegendRect);
      const bandLegendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bandLegendText.setAttribute('x', '35');
      bandLegendText.setAttribute('y', String(legY + 7));
      bandLegendText.setAttribute('font-size', '9');
      bandLegendText.setAttribute('fill', '#6b7280');
      bandLegendText.textContent = 'Ensemble 95% interval';
      legendGroup.appendChild(bandLegendText);
      legY += 14;
    }

    svg.appendChild(legendGroup);

    // Clear and add SVG to DOM
    DOMRefs.trendForecastChart.innerHTML = '';
    DOMRefs.trendForecastChart.appendChild(svg);

    // Add instruction text
    const instruction = document.createElement('div');
    instruction.className = 'pp-chart-instruction';
    instruction.textContent = 'Click on any point to see detailed information';
    DOMRefs.trendForecastChart.appendChild(instruction);
    
    DOMRefs.trendForecastChart.classList.add('show');
  },

  // Show tooltip on hover
  showChartTooltip(event, year, value, type, bounds = null) {
    const existing = document.getElementById('chartTooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.id = 'chartTooltip';

    let tooltipText = `${year}: ${value.toFixed(1)}%`;
    if (type === 'Forecast') {
      tooltipText += ' (ensemble)';
    } else if (type === 'MCMC') {
      let extra = ' (MCMC posterior median)';
      if (bounds && bounds.lowerBound != null && bounds.upperBound != null) {
        extra += `; 95% band ${bounds.lowerBound.toFixed(1)}–${bounds.upperBound.toFixed(1)}%`;
      }
      tooltipText += extra;
    } else {
      tooltipText += ` (${type})`;
    }

    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);

    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.width / 2}px`;
    tooltip.style.top = `${event.clientY - rect.height - 10}px`;
  },

  // Hide tooltip
  hideChartTooltip() {
    const tooltip = document.getElementById('chartTooltip');
    if (tooltip) tooltip.remove();
  },

  // Show detailed point information when clicked
  showChartPointDetails(year, value, type, locationName, bounds = null) {
    const existing = document.getElementById('chartPointDetails');
    if (existing) existing.remove();

    const detailsDiv = document.createElement('div');
    detailsDiv.id = 'chartPointDetails';

    let typeLine = '';
    if (type === 'Historical') {
      typeLine = '<strong>Type:</strong> Historical data';
    } else if (type === 'Forecast') {
      typeLine = '<strong>Type:</strong> Ensemble forecast (weighted multi-method blend)';
    } else if (type === 'MCMC') {
      typeLine = '<strong>Type:</strong> MCMC — posterior median path (AR(1) + trend)';
    } else {
      typeLine = `<strong>Type:</strong> ${type}`;
    }

    let detailsHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4>Point details</h4>
        <button id="closeChartDetails" class="close-btn">×</button>
      </div>
      <div style="margin-bottom: 8px;"><strong>Location:</strong> ${locationName}</div>
      <div style="margin-bottom: 8px;"><strong>Year:</strong> ${year}</div>
      <div style="margin-bottom: 8px;"><strong>Insurance coverage:</strong> <span style="font-size: 18px; font-weight: 700; color: #3b82f6;">${value.toFixed(1)}%</span></div>
      <div style="margin-bottom: 8px;">${typeLine}</div>
    `;

    if (type === 'MCMC' && bounds && bounds.lowerBound != null && bounds.upperBound != null) {
      detailsHTML += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(59, 130, 246, 0.2);">
          <strong>Approx. 95% predictive band:</strong> ${bounds.lowerBound.toFixed(1)}% – ${bounds.upperBound.toFixed(1)}%
        </div>
      `;
    }

    detailsDiv.innerHTML = detailsHTML;

    const closeBtn = detailsDiv.querySelector('#closeChartDetails');
    closeBtn.addEventListener('click', () => {
      detailsDiv.remove();
    });

    const chartContainer = DOMRefs.trendForecastChart;
    const svg = chartContainer.querySelector('svg');
    if (svg && svg.nextSibling) {
      chartContainer.insertBefore(detailsDiv, svg.nextSibling);
    } else {
      chartContainer.appendChild(detailsDiv);
    }

    detailsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // Predicted vs actual mini chart for backtest
  renderBacktestScatterChart(pairs, maxPoints = 80, options = {}) {
    if (!pairs || pairs.length === 0) return '';
    const fill = options.fill || 'rgba(139,92,246,0.85)';
    const sample = pairs.length > maxPoints ? pairs.slice(-maxPoints) : pairs;
    const vals = sample.flatMap(p => [p.predicted, p.actual]);
    const mn = Math.max(0, Math.floor(Math.min(...vals) - 2));
    const mx = Math.min(100, Math.ceil(Math.max(...vals) + 2));
    const w = 280;
    const h = 200;
    const pad = 28;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const sx = (v) => pad + ((v - mn) / (mx - mn || 1)) * plotW;
    const sy = (v) => pad + plotH - ((v - mn) / (mx - mn || 1)) * plotH;
    const diag = `M ${sx(mn)},${sy(mn)} L ${sx(mx)},${sy(mx)}`;
    const pts = sample
      .map((p) => `<circle cx="${sx(p.predicted)}" cy="${sy(p.actual)}" r="3" fill="${fill}" stroke="#fff" stroke-width="1"/>`)
      .join('');
    const caption = options.caption || 'Quality check chart: sideways = model guess, up–down = real value. Closer to the dashed diagonal = better.';
    return `
        <div class="pp-backtest-chart-wrap">
        <div class="pp-backtest-chart-label">${caption}</div>
        <svg class="pp-backtest-scatter-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
          <line x1="${pad}" y1="${pad + plotH}" x2="${pad + plotW}" y2="${pad + plotH}" stroke="#9ca3af" stroke-width="1"/>
          <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad + plotH}" stroke="#9ca3af" stroke-width="1"/>
          <path d="${diag}" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 3"/>
          ${pts}
        </svg>
      </div>
    `;
  },

  /**
   * Side-by-side backtest: enhanced ensemble vs Bayesian AR(1) MCMC.
   */
  displayBacktestComparison(ensembleBt, mcmcBt) {
    if (!DOMRefs.trendForecastBacktest) return;
    const en = ensembleBt && ensembleBt.nTests > 0 ? ensembleBt : null;
    const mc = mcmcBt && mcmcBt.nTests > 0 ? mcmcBt : null;
    if (!en && !mc) {
      DOMRefs.trendForecastBacktest.innerHTML = '';
      DOMRefs.trendForecastBacktest.classList.remove('show');
      return;
    }
    if (!en) {
      this.displayBacktestResults(mc);
      return;
    }
    if (!mc) {
      this.displayBacktestResults(en);
      return;
    }

    const fmt = (v, d = 2) => (v != null && !Number.isNaN(v) ? Number(v).toFixed(d) : '—');
    const pp = (v) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(2)} pp`);
    const pct = (v) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(0)}%`);
    const winnerClass = (side, a, b, lowerIsBetter = true, tieEps = 0.05) => {
      if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return '';
      if (Math.abs(a - b) < tieEps) return '';
      const leftWins = lowerIsBetter ? a < b : a > b;
      if (side === 'left' && leftWins) return ' pp-backtest-winner';
      if (side === 'right' && !leftWins) return ' pp-backtest-winner';
      return '';
    };

    const maeL = en.mae;
    const maeR = mc.mae;
    const rmseL = en.rmse;
    const rmseR = mc.rmse;
    const mapeL = en.mape;
    const mapeR = mc.mape;
    const covL = en.intervalCoverage;
    const covR = mc.intervalCoverage;
    const dirL = en.directionalAccuracy;
    const dirR = mc.directionalAccuracy;
    const skillL = en.naiveSkillScore;
    const skillR = mc.naiveSkillScore;

    let headline = '';
    if (maeL != null && maeR != null) {
      if (Math.abs(maeL - maeR) < 0.06) {
        headline = `On past checks, the <strong>enhanced ensemble</strong> and <strong>Bayesian MCMC</strong> model were about equally close to reality (similar MAE).`;
      } else if (maeL < maeR) {
        headline = `On past checks, the <strong>enhanced ensemble</strong> had a lower average error (MAE) than the <strong>Bayesian MCMC</strong> model.`;
      } else {
        headline = `On past checks, the <strong>Bayesian MCMC</strong> model had a lower average error (MAE) than the <strong>enhanced ensemble</strong>.`;
      }
    }

    const rowMetric = (label, hint, leftVal, rightVal, leftNum, rightNum, lowerBetter = true, tieEps = 0.05) => {
      const lc = winnerClass('left', leftNum, rightNum, lowerBetter, tieEps);
      const rc = winnerClass('right', leftNum, rightNum, lowerBetter, tieEps);
      return `
        <tr>
          <td class="pp-backtest-compare-metric"><span class="pp-backtest-plainlabel">${label}</span><span class="pp-backtest-hint pp-backtest-hint-row">${hint}</span></td>
          <td class="pp-backtest-compare-val${lc}">${leftVal}</td>
          <td class="pp-backtest-compare-val${rc}">${rightVal}</td>
        </tr>`;
    };

    const hMEn = en.byHorizonMetrics || {};
    const hMMc = mc.byHorizonMetrics || {};
    const hzRow = (label, h) => {
      const a = hMEn[h];
      const b = hMMc[h];
      if ((!a || a.mae == null) && (!b || b.mae == null)) return '';
      const lc = winnerClass('left', a && a.mae, b && b.mae, true);
      const rc = winnerClass('right', a && a.mae, b && b.mae, true);
      return `<tr><td>${label}</td><td class="pp-backtest-compare-val${lc}">${pp(a && a.mae)} / ${pp(a && a.rmse)}</td><td class="pp-backtest-compare-val${rc}">${pp(b && b.mae)} / ${pp(b && b.rmse)}</td></tr>`;
    };

    const scatterEn = this.renderBacktestScatterChart(en.pairs || []);
    const scatterMc = this.renderBacktestScatterChart(mc.pairs || [], 80, {
      fill: 'rgba(14,165,233,0.9)',
      caption: 'MCMC model: same diagonal idea (cyan points).'
    });

    const nLine = `<p class="pp-backtest-plain-summary">${headline} Each approach ran <strong>${en.nTests}</strong> historical checks (1-, 3-, and 5-year horizons). MAE and RMSE are shown in <strong>percentage points (pp)</strong> of population covered; other rows use % where noted.</p>`;

    DOMRefs.trendForecastBacktest.innerHTML = `
      <div class="pp-backtest-box pp-backtest-compare">
        <h4 class="pp-backtest-title">How trustworthy is this forecast? — two models compared</h4>
        <p class="pp-backtest-desc">Past-based quality check (not a guarantee about the future). <strong>Left:</strong> enhanced ensemble (many methods + weights). <strong>Right:</strong> Bayesian AR(1) with trend fit by Metropolis-Hastings, with 95% predictive bands.</p>
        ${nLine}
        <table class="pp-backtest-compare-table">
          <thead>
            <tr>
              <th class="pp-backtest-compare-metric-col">Metric</th>
              <th>Enhanced ensemble</th>
              <th>Bayesian MCMC</th>
            </tr>
          </thead>
          <tbody>
            ${rowMetric('MAE — typical error', 'Lower is better.', pp(maeL), pp(maeR), maeL, maeR, true)}
            ${rowMetric('RMSE — big misses count more', 'Lower is better.', pp(rmseL), pp(rmseR), rmseL, rmseR, true)}
            ${rowMetric('MAPE — error vs level', 'Lower is better (% of actual level).', mapeL != null ? fmt(mapeL, 1) + '%' : '—', mapeR != null ? fmt(mapeR, 1) + '%' : '—', mapeL, mapeR, true)}
            ${rowMetric('Within 2 pp', 'Higher is better.', pct(en.accuracyWithin2), pct(mc.accuracyWithin2), en.accuracyWithin2, mc.accuracyWithin2, false)}
            ${rowMetric('Within 5 pp', 'Higher is better.', pct(en.accuracyWithin5), pct(mc.accuracyWithin5), en.accuracyWithin5, mc.accuracyWithin5, false)}
            ${rowMetric('Directional accuracy', 'Higher is better.', pct(dirL), pct(dirR), dirL, dirR, false)}
            ${rowMetric('Naive skill', 'vs “repeat last year”; above 0 is better.', skillL != null ? fmt(skillL, 2) : '—', skillR != null ? fmt(skillR, 2) : '—', skillL, skillR, false)}
            ${rowMetric('Interval coverage', 'Share of checks where the true value fell inside the model band.', pct(covL), pct(covR), covL, covR, false, 2)}
          </tbody>
        </table>
        <table class="pp-backtest-compare-table pp-backtest-horizon-compare">
          <caption>Error by horizon (MAE / RMSE in pts)</caption>
          <thead><tr><th>Horizon</th><th>Ensemble</th><th>MCMC</th></tr></thead>
          <tbody>
            ${hzRow('~1 year', 1)}
            ${hzRow('~3 years', 3)}
            ${hzRow('~5 years', 5)}
          </tbody>
        </table>
        <div class="pp-backtest-scatter-grid">
          ${scatterEn}
          ${scatterMc}
        </div>
        <details class="pp-backtest-technical">
          <summary>What MAE, RMSE, MAPE, … stand for</summary>
          <ul class="pp-backtest-technical-list">
            <li><strong>MAE</strong> — mean absolute error (average mistake in percentage points).</li>
            <li><strong>RMSE</strong> — root mean square error (mistakes in points, with extra weight on large errors).</li>
            <li><strong>MAPE</strong> — mean absolute percentage error (error as a percent of the actual level).</li>
            <li><strong>Naive skill</strong> — compares each model to “predict next year = last year”; above 0 means that model wins on average.</li>
            <li><strong>Interval coverage</strong> — percent of checks where the real value landed inside the forecast’s lower–upper band. MCMC bands are 95% predictive; the ensemble uses a separate uncertainty recipe.</li>
          </ul>
        </details>
      </div>
    `;
    DOMRefs.trendForecastBacktest.classList.add('show');
  },

  // Display backtest accuracy metrics
  displayBacktestResults(backtest) {
    if (!DOMRefs.trendForecastBacktest) return;
    if (backtest.nTests === 0) {
      DOMRefs.trendForecastBacktest.innerHTML = '';
      DOMRefs.trendForecastBacktest.classList.remove('show');
      return;
    }
    const mae = backtest.mae != null ? backtest.mae.toFixed(2) : '—';
    const rmse = backtest.rmse != null ? backtest.rmse.toFixed(2) : '—';
    const mape = backtest.mape != null ? backtest.mape.toFixed(1) : '—';
    const acc2 = backtest.accuracyWithin2 != null ? backtest.accuracyWithin2.toFixed(0) : '—';
    const acc5 = backtest.accuracyWithin5 != null ? backtest.accuracyWithin5.toFixed(0) : '—';
    const dirAcc = backtest.directionalAccuracy != null ? `${backtest.directionalAccuracy.toFixed(0)}%` : '—';
    const skill = backtest.naiveSkillScore != null ? backtest.naiveSkillScore.toFixed(2) : '—';
    const cov = backtest.intervalCoverage != null ? `${backtest.intervalCoverage.toFixed(0)}%` : '—';

    let skillPlain = 'Not enough information for this score.';
    if (backtest.naiveSkillScore != null && !Number.isNaN(backtest.naiveSkillScore)) {
      const s = backtest.naiveSkillScore;
      if (s > 0.05) skillPlain = 'Mostly <strong>better</strong> than simply repeating last year’s coverage number.';
      else if (s >= -0.05) skillPlain = 'About the <strong>same</strong> as repeating last year’s number.';
      else skillPlain = 'Mostly <strong>worse</strong> than repeating last year’s number.';
    }

    let atAGlance = '';
    if (backtest.mae != null) {
      const closeLine =
        acc2 !== '—'
          ? `<strong>${acc2}%</strong> of those checks landed within 2 percentage points of the actual value.`
          : '';
      atAGlance = `<p class="pp-backtest-plain-summary">We ran <strong>${backtest.nTests}</strong> historical checks: the model pretended earlier years were the “latest” data, forecasted 1, 3, and 5 years ahead, then compared to what really happened. On average it was off by about <strong>${mae} percentage points</strong> of insurance coverage.${closeLine ? ` ${closeLine}` : ''}</p>`;
    }

    const metricBlock = (plainLabel, value, hint) => `
      <div class="pp-backtest-metric-block">
        <span class="pp-backtest-plainlabel">${plainLabel}</span>
        <span class="pp-backtest-value">${value}</span>
        <span class="pp-backtest-hint">${hint}</span>
      </div>`;

    const hM = backtest.byHorizonMetrics || {};
    const row = (label, h) => {
      const m = hM[h];
      if (!m || m.mae == null) return '';
      return `<tr><td>${label}</td><td>${m.mae.toFixed(2)}</td><td>${m.rmse != null ? m.rmse.toFixed(2) : '—'}</td><td>${m.mape != null ? m.mape.toFixed(1) : '—'}</td></tr>`;
    };

    const scatterHtml = this.renderBacktestScatterChart(backtest.pairs || []);

    DOMRefs.trendForecastBacktest.innerHTML = `
      <div class="pp-backtest-box">
        <h4 class="pp-backtest-title">How trustworthy is this forecast?</h4>
        <p class="pp-backtest-desc">Past-based quality check (not a guarantee about the future). Insurance shares are in <strong>percentage points</strong> of the population covered.</p>
        ${atAGlance}
        <div class="pp-backtest-metrics pp-backtest-metrics-grid">
          ${metricBlock('MAE — typical error', `${mae} pts`, 'Mean absolute error: average gap between forecast and real past values (insurance percentage points). Lower is better.')}
          ${metricBlock('RMSE — larger misses weighted', `${rmse} pts`, 'Root mean square error: like MAE, but bigger mistakes count more.')}
          ${metricBlock('MAPE — error vs level', `${mape}%`, 'Mean absolute percentage error: error size relative to how high or low coverage already was.')}
          ${metricBlock('Within 2 pp', `${acc2}%`, 'Share of checks within 2 percentage points of the truth.')}
          ${metricBlock('Within 5 pp', `${acc5}%`, 'Share of checks within 5 percentage points of the truth.')}
          ${metricBlock('Directional accuracy', dirAcc, 'When coverage clearly rose or fell, how often the model moved the same way.')}
          ${metricBlock('Naive skill', skill, skillPlain)}
          ${metricBlock('Interval coverage', `${cov}`, 'How often the actual value fell inside the uncertainty band around the forecast.')}
        </div>
        <table class="pp-backtest-horizon-table">
          <caption>How error grows when we look further ahead</caption>
          <thead><tr><th>How far ahead</th><th>MAE (pts)</th><th>RMSE (pts)</th><th>MAPE (%)</th></tr></thead>
          <tbody>
            ${row('About 1 year', 1)}
            ${row('About 3 years', 3)}
            ${row('About 5 years', 5)}
          </tbody>
        </table>
        ${scatterHtml}
        <details class="pp-backtest-technical">
          <summary>What MAE, RMSE, MAPE, … stand for</summary>
          <ul class="pp-backtest-technical-list">
            <li><strong>MAE</strong> — mean absolute error (average mistake in percentage points).</li>
            <li><strong>RMSE</strong> — root mean square error (mistakes in points, with extra weight on large errors).</li>
            <li><strong>MAPE</strong> — mean absolute percentage error (error as a percent of the actual level).</li>
            <li><strong>Naive skill</strong> — compares this model to “predict next year = last year”; above 0 means the model wins on average.</li>
            <li><strong>Interval coverage</strong> — percent of checks where the real value landed inside the forecast’s lower–upper band.</li>
          </ul>
        </details>
      </div>
    `;
    DOMRefs.trendForecastBacktest.classList.add('show');
  },

  // Display detailed explanation of forecast
  displayDetailedExplanation(explanationHTML) {
    // Remove existing explanation if any
    const existing = document.getElementById('forecastDetailedExplanation');
    const existingToggle = document.getElementById('forecastExplanationToggle');
    if (existing) existing.remove();
    if (existingToggle) existingToggle.remove();
    
    const explanationDiv = document.createElement('div');
    explanationDiv.id = 'forecastDetailedExplanation';
    explanationDiv.className = 'pp-explanation-container';
    
    explanationDiv.innerHTML = `
      <div class="pp-explanation-header">
        <h3 class="pp-explanation-title">📚 Detailed Forecast Explanation</h3>
        <button id="closeExplanation" class="pp-explanation-close">×</button>
      </div>
      <div class="pp-explanation-content">
        ${explanationHTML}
      </div>
    `;
    
    // Add toggle for expand/collapse
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'forecastExplanationToggle';
    toggleBtn.className = 'pp-explanation-toggle';
    toggleBtn.innerHTML = '<span>▼</span> <span>Show Detailed Explanation</span>';
    
    // Add close button handler
    const closeBtn = explanationDiv.querySelector('#closeExplanation');
    closeBtn.addEventListener('click', () => {
      explanationDiv.classList.remove('show');
      toggleBtn.innerHTML = '<span>▼</span> <span>Show Detailed Explanation</span>';
    });
    
    toggleBtn.addEventListener('click', () => {
      const isVisible = explanationDiv.classList.contains('show');
      if (isVisible) {
        explanationDiv.classList.remove('show');
        toggleBtn.innerHTML = '<span>▼</span> <span>Show Detailed Explanation</span>';
      } else {
        explanationDiv.classList.add('show');
        toggleBtn.innerHTML = '<span>▲</span> <span>Hide Detailed Explanation</span>';
        explanationDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    
    // Insert after forecast result
    const resultContainer = DOMRefs.trendForecastResult;
    resultContainer.appendChild(toggleBtn);
    resultContainer.appendChild(explanationDiv);
  }
};

// Export for use in other modules
window.PredictiveManager = PredictiveManager;