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
    DOMRefs.forecastLocation.addEventListener('input', () => {
      this.searchForecastLocation();
    });

    // Hide location results when clicking outside
    document.addEventListener('click', (e) => {
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

  // Search for location (state or county) for forecasting - same as sidebar search
  searchForecastLocation() {
    const query = DOMRefs.forecastLocation.value.trim().toLowerCase();
    DOMRefs.forecastLocationResults.innerHTML = '';

    if (!query || !AppConfig.geoJsonLayer) {
      DOMRefs.forecastLocationResults.style.display = 'none';
      return;
    }

    const matches = [];
    AppConfig.geoJsonLayer.eachLayer(layer => {
      const props = layer.feature.properties;
      const name = AppConfig.mapLevel === 'state'
        ? props.name
        : `${props.NAME}, ${AppConfig.stateFIPSMapping[props.STATE] || 'Unknown'}`;
      if (name.toLowerCase().startsWith(query)) {
        // Get FIPS from layer
        const fips = AppConfig.mapLevel === 'state'
          ? (layer.feature.id || '').toString().padStart(2, '0')
          : (props.GEO_ID || '').replace('0500000US', '');
        matches.push({ name, layer, fips });
      }
    });

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
            <strong>❌ Insufficient Data</strong>
            <p>
              Not enough historical data available for this location and demographic combination. 
              Please try a different selection.
            </p>
          </div>
        `;
        return;
      }

      // Generate forecast using ensemble method
      const forecastResult = ForecastingModels.forecastEnsemble(historicalData, yearsAhead);
      const trendAnalysis = ForecastingModels.analyzeTrend(historicalData);
      const formatted = ForecastingModels.formatForecastResult(forecastResult.forecast, trendAnalysis);

      // Display results
      this.displayTrendForecast(formatted, historicalData, forecastResult, locationName);
      
      // Render chart
      this.renderForecastChart(historicalData, forecastResult.forecast, locationName);
      
      // Generate and display detailed explanation
      const detailedExplanation = ForecastingModels.generateDetailedExplanation(forecastResult, historicalData, locationName);
      this.displayDetailedExplanation(detailedExplanation);
      
    } catch (error) {
      console.error('Error generating forecast:', error);
      DOMRefs.trendForecastResult.innerHTML = `
        <div class="pp-error">
          <strong>❌ Error</strong>
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
      <h4>${formatted.emoji} Forecast for ${locationName}</h4>
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
          (${trendStrength} confidence: ${(formatted.trendAnalysis.strength * 100).toFixed(0)}%)
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

  // Render forecast chart
  renderForecastChart(historicalData, forecast, locationName) {
    const allData = [...historicalData, ...forecast.map(f => ({ year: f.year, value: f.predicted, isForecast: true }))];
    const minYear = Math.min(...allData.map(d => d.year));
    const maxYear = Math.max(...allData.map(d => d.year));
    const minValue = Math.min(...allData.map(d => d.value));
    const maxValue = Math.max(...allData.map(d => d.value));
    
    const width = 600;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    const xScale = (year) => margin.left + ((year - minYear) / (maxYear - minYear)) * chartWidth;
    const yScale = (value) => margin.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
    
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
    
    // Draw forecast line (dashed)
    const forecastPoints = forecast.map(f => `${xScale(f.year)},${yScale(f.predicted)}`).join(' ');
    const forecastLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    forecastLine.setAttribute('points', forecastPoints);
    forecastLine.setAttribute('fill', 'none');
    forecastLine.setAttribute('stroke', '#8b5cf6');
    forecastLine.setAttribute('stroke-width', '2');
    forecastLine.setAttribute('stroke-dasharray', '5,5');
    svg.appendChild(forecastLine);
    
    // Draw forecast points (clickable)
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
      
      // Hover effect
      point.addEventListener('mouseenter', (e) => {
        point.setAttribute('r', '7');
        point.setAttribute('fill', '#7c3aed');
        this.showChartTooltip(e, f.year, f.predicted, 'Forecast', f.confidence);
      });
      
      point.addEventListener('mouseleave', () => {
        point.setAttribute('r', '5');
        point.setAttribute('fill', '#8b5cf6');
        this.hideChartTooltip();
      });
      
      // Click handler
      point.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showChartPointDetails(f.year, f.predicted, 'Forecast', locationName, f.confidence);
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
    
    // Add legend
    const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legendGroup.setAttribute('transform', `translate(${width - 150}, ${margin.top + 10})`);
    
    const histLegendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    histLegendLine.setAttribute('x1', '0');
    histLegendLine.setAttribute('y1', '0');
    histLegendLine.setAttribute('x2', '30');
    histLegendLine.setAttribute('y2', '0');
    histLegendLine.setAttribute('stroke', '#3b82f6');
    histLegendLine.setAttribute('stroke-width', '2');
    legendGroup.appendChild(histLegendLine);
    
    const histLegendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    histLegendText.setAttribute('x', '35');
    histLegendText.setAttribute('y', '4');
    histLegendText.setAttribute('font-size', '11');
    histLegendText.setAttribute('fill', '#374151');
    histLegendText.textContent = 'Historical';
    legendGroup.appendChild(histLegendText);
    
    const forecastLegendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    forecastLegendLine.setAttribute('x1', '0');
    forecastLegendLine.setAttribute('y1', '15');
    forecastLegendLine.setAttribute('x2', '30');
    forecastLegendLine.setAttribute('y2', '15');
    forecastLegendLine.setAttribute('stroke', '#8b5cf6');
    forecastLegendLine.setAttribute('stroke-width', '2');
    forecastLegendLine.setAttribute('stroke-dasharray', '5,5');
    legendGroup.appendChild(forecastLegendLine);
    
    const forecastLegendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    forecastLegendText.setAttribute('x', '35');
    forecastLegendText.setAttribute('y', '19');
    forecastLegendText.setAttribute('font-size', '11');
    forecastLegendText.setAttribute('fill', '#374151');
    forecastLegendText.textContent = 'Forecast';
    legendGroup.appendChild(forecastLegendText);
    
    svg.appendChild(legendGroup);
    
    // Clear and add SVG to DOM
    DOMRefs.trendForecastChart.innerHTML = '';
    DOMRefs.trendForecastChart.appendChild(svg);
    
    // Add instruction text
    const instruction = document.createElement('div');
    instruction.className = 'pp-chart-instruction';
    instruction.textContent = '💡 Click on any point to see detailed information';
    DOMRefs.trendForecastChart.appendChild(instruction);
    
    DOMRefs.trendForecastChart.classList.add('show');
  },

  // Show tooltip on hover
  showChartTooltip(event, year, value, type, confidence = null) {
    // Remove existing tooltip if any
    const existing = document.getElementById('chartTooltip');
    if (existing) existing.remove();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'chartTooltip';
    
    let tooltipText = `${year}: ${value.toFixed(1)}%`;
    if (type === 'Forecast' && confidence) {
      tooltipText += ` (${(confidence * 100).toFixed(0)}% confidence)`;
    } else {
      tooltipText += ` (${type})`;
    }
    
    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);
    
    // Position tooltip near cursor
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
  showChartPointDetails(year, value, type, locationName, confidence = null) {
    // Remove existing details if any
    const existing = document.getElementById('chartPointDetails');
    if (existing) existing.remove();
    
    const detailsDiv = document.createElement('div');
    detailsDiv.id = 'chartPointDetails';
    
    let detailsHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4>📍 Point Details</h4>
        <button id="closeChartDetails" class="close-btn">×</button>
      </div>
      <div style="margin-bottom: 8px;"><strong>Location:</strong> ${locationName}</div>
      <div style="margin-bottom: 8px;"><strong>Year:</strong> ${year}</div>
      <div style="margin-bottom: 8px;"><strong>Insurance Coverage:</strong> <span style="font-size: 18px; font-weight: 700; color: #3b82f6;">${value.toFixed(1)}%</span></div>
      <div style="margin-bottom: 8px;"><strong>Type:</strong> ${type === 'Historical' ? '📊 Historical Data' : '🔮 Forecasted'}</div>
    `;
    
    if (type === 'Forecast' && confidence !== null) {
      const confidencePercent = (confidence * 100).toFixed(0);
      const confidenceClass = confidence > 0.7 ? 'high' : confidence > 0.5 ? 'medium' : 'low';
      detailsHTML += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(59, 130, 246, 0.2);">
          <strong>Confidence:</strong> <span class="confidence ${confidenceClass}">${confidencePercent}%</span>
        </div>
      `;
    }
    
    detailsDiv.innerHTML = detailsHTML;
    
    // Add close button handler
    const closeBtn = detailsDiv.querySelector('#closeChartDetails');
    closeBtn.addEventListener('click', () => {
      detailsDiv.remove();
    });
    
    // Insert after chart
    const chartContainer = DOMRefs.trendForecastChart;
    const svg = chartContainer.querySelector('svg');
    if (svg && svg.nextSibling) {
      chartContainer.insertBefore(detailsDiv, svg.nextSibling);
    } else {
      chartContainer.appendChild(detailsDiv);
    }
    
    // Auto-scroll to details
    detailsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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