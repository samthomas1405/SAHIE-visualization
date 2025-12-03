// Scatterplot Management Module
// =============================

// Build a unified dataset for scatter: Insurance (x) vs Health measure (y)
function buildScatterData() {
  const points = [];
  const isState = AppConfig.mapLevel === 'state';

  // Only build scatter data for combined view or when both datasets are available
  if (AppConfig.dataLayer === 'insurance' && (!AppConfig.getPlacesDataStore() || Object.keys(AppConfig.getPlacesDataStore()).length === 0)) {
    return []; // No health data available
  }
  if (AppConfig.dataLayer === 'health' && (!AppConfig.getDataStore() || Object.keys(AppConfig.getDataStore()).length === 0)) {
    return []; // No insurance data available
  }

  // Try to grab names from current geojson for nicer labels
  const geojson = AppConfig.geoJsonLayer ? AppConfig.geoJsonLayer.toGeoJSON() : null;
  const nameByFips = {};
  if (geojson && geojson.features) {
    for (const f of geojson.features) {
      const fips = isState
        ? (f.id || '').toString().padStart(2, '0')
        : (f.properties?.GEO_ID || '').replace('0500000US', '');
      const stateName = isState ? '' : (AppConfig.stateFIPSMapping[f.properties?.STATE] || '');
      const label = isState ? (f.properties?.name || '') : `${f.properties?.NAME || ''}, ${stateName}`;
      if (fips) nameByFips[fips] = label;
    }
  }

  // Debug logging to see what data we have
  console.log('Building scatter data:', {
    mapLevel: AppConfig.mapLevel,
    dataStoreKeys: Object.keys(AppConfig.getDataStore()).length,
    placesDataStoreKeys: Object.keys(AppConfig.getPlacesDataStore() || {}).length,
    isState
  });

  for (const [fips, insured] of Object.entries(AppConfig.getDataStore())) {
    const health = AppConfig.getPlacesDataStore()?.[fips];
    if (typeof insured === 'number' && health && typeof health.value === 'number') {
      points.push({
        fips,
        x: insured,
        y: health.value,
        name: nameByFips[fips] || health.locationName || fips
      });
    }
  }
  
  console.log('Scatter points built:', points.length);
  return points;
}

// Enhanced scatterplot with interactive features
function renderScatterplot() {
  if (!DOMRefs.scatterContainer) return;

  const W = DOMRefs.scatterContainer.clientWidth || 900;
  const H = DOMRefs.scatterContainer.clientHeight || 520;
  const margin = { top: 28, right: 20, bottom: 48, left: 56 };
  const w = Math.max(320, W - margin.left - margin.right);
  const h = Math.max(220, H - margin.top - margin.bottom);

  const pts = buildScatterData();

  DOMRefs.scatterContainer.innerHTML = '';
  if (DOMRefs.scatterTooltip) DOMRefs.scatterTooltip.style.display = 'none';

  if (!pts.length) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#444; font-size:14px; text-align:center; padding:20px;';
    
    let messageText = '';
    if (AppConfig.dataLayer === 'insurance') {
      messageText = '📊 Scatterplot requires both Insurance and Health data\n\nSwitch to "Combined View" to see the relationship between insurance coverage and health outcomes.';
    } else if (AppConfig.dataLayer === 'health') {
      messageText = '📊 Scatterplot requires both Insurance and Health data\n\nSwitch to "Combined View" to see the relationship between insurance coverage and health outcomes.';
    } else {
      messageText = 'No overlapping data to plot yet. Try switching layers or measures after data loads.';
    }
    
    msg.innerHTML = messageText.replace(/\n/g, '<br>');
    DOMRefs.scatterContainer.appendChild(msg);
    return;
  }

  // Store original data for highlighting
  window.scatterData = pts;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.style.cursor = 'grab';
  DOMRefs.scatterContainer.appendChild(svg);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
  svg.appendChild(g);

  // Zoom and pan state
  let currentTransform = { x: 0, y: 0, scale: 1 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  // Add zoom/pan event listeners
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - margin.left;
    const mouseY = e.clientY - rect.top - margin.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    // Don't allow zooming out beyond the initial view (scale = 1)
    const newScale = Math.max(1, Math.min(5, currentTransform.scale * zoomFactor));
    
    // Calculate the point in the original coordinate system
    const originalX = (mouseX - currentTransform.x) / currentTransform.scale;
    const originalY = (mouseY - currentTransform.y) / currentTransform.scale;
    
    // Update scale
    currentTransform.scale = newScale;
    
    // Adjust translation to zoom towards the mouse position
    currentTransform.x = mouseX - originalX * newScale;
    currentTransform.y = mouseY - originalY * newScale;
    
    updateScatterTransform();
  });

  svg.addEventListener('mousedown', (e) => {
    // Only start dragging if not clicking on a circle and not on text elements
    if (e.target.tagName !== 'circle' && e.target.tagName !== 'text') {
      isDragging = true;
      svg.style.cursor = 'grabbing';
      dragStart = { 
        x: e.clientX - currentTransform.x, 
        y: e.clientY - currentTransform.y 
      };
      e.preventDefault();
    }
  });

  svg.addEventListener('mousemove', (e) => {
    if (isDragging) {
      currentTransform.x = e.clientX - dragStart.x;
      currentTransform.y = e.clientY - dragStart.y;
      updateScatterTransform();
    }
  });

  svg.addEventListener('mouseup', (e) => {
    if (isDragging) {
      isDragging = false;
      svg.style.cursor = 'grab';
    }
  });

  // Prevent context menu on right click
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Handle mouse leave to stop dragging
  svg.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      svg.style.cursor = 'grab';
    }
  });

  function updateScatterTransform() {
    g.setAttribute('transform', `translate(${margin.left + currentTransform.x},${margin.top + currentTransform.y}) scale(${currentTransform.scale})`);
  }

  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMin = Math.min(...pts.map(p => p.y));
  const yMax = Math.max(...pts.map(p => p.y));

  const xScale = (v) => {
    const a = 0, b = w;
    const t = (v - xMin) / Math.max(1e-6, (xMax - xMin));
    return a + t * (b - a);
  };
  const yScale = (v) => {
    const a = h, b = 0;
    const t = (v - yMin) / Math.max(1e-6, (yMax - yMin));
    return a + t * (b - a);
  };

  const niceTicks = (min, max, count = 6) => {
    const span = max - min || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = (count * step) / span;
    const adj = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
    const niceStep = step * adj;
    const niceMin = Math.floor(min / niceStep) * niceStep;
    const niceMax = Math.ceil(max / niceStep) * niceStep;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + 1e-9; v += niceStep) ticks.push(+v.toFixed(6));
    return { ticks, niceMin, niceMax };
  };

  const xAxis = niceTicks(xMin, xMax, 6);
  const yAxis = niceTicks(yMin, yMax, 6);

  const axisPath = (x1, y1, x2, y2) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    p.setAttribute('x1', x1);
    p.setAttribute('y1', y1);
    p.setAttribute('x2', x2);
    p.setAttribute('y2', y2);
    p.setAttribute('stroke', '#999');
    p.setAttribute('stroke-width', '1');
    g.appendChild(p);
  };

  axisPath(0, h, w, h); // x axis
  axisPath(0, 0, 0, h); // y axis

  const drawXTicks = () => {
    for (const t of xAxis.ticks) {
      const x = xScale(t);
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', x);
      tick.setAttribute('y1', h);
      tick.setAttribute('x2', x);
      tick.setAttribute('y2', h + 6);
      tick.setAttribute('stroke', '#999');
      g.appendChild(tick);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', x);
      lbl.setAttribute('y', h + 20);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('fill', '#333');
      lbl.setAttribute('font-size', '12');
      lbl.textContent = `${t.toFixed(0)}%`;
      g.appendChild(lbl);

      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      grid.setAttribute('x1', x);
      grid.setAttribute('y1', 0);
      grid.setAttribute('x2', x);
      grid.setAttribute('y2', h);
      grid.setAttribute('stroke', '#eee');
      g.appendChild(grid);
    }
  };

  const drawYTicks = () => {
    for (const t of yAxis.ticks) {
      const y = yScale(t);
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', -6);
      tick.setAttribute('y1', y);
      tick.setAttribute('x2', 0);
      tick.setAttribute('y2', y);
      tick.setAttribute('stroke', '#999');
      g.appendChild(tick);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', -10);
      lbl.setAttribute('y', y + 4);
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('fill', '#333');
      lbl.setAttribute('font-size', '12');
      lbl.textContent = `${t.toFixed(0)}%`;
      g.appendChild(lbl);

      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      grid.setAttribute('x1', 0);
      grid.setAttribute('y1', y);
      grid.setAttribute('x2', w);
      grid.setAttribute('y2', y);
      grid.setAttribute('stroke', '#eee');
      g.appendChild(grid);
    }
  };

  drawXTicks();
  drawYTicks();

  const xTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  xTitle.setAttribute('x', w / 2);
  xTitle.setAttribute('y', h + 38);
  xTitle.setAttribute('text-anchor', 'middle');
  xTitle.setAttribute('fill', '#111');
  xTitle.setAttribute('font-size', '13');
  xTitle.setAttribute('font-weight', '600');
  xTitle.textContent = 'Insurance Coverage (%)';
  g.appendChild(xTitle);

  const yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  yTitle.setAttribute('transform', `translate(${-40},${h / 2}) rotate(-90)`);
  yTitle.setAttribute('text-anchor', 'middle');
  yTitle.setAttribute('fill', '#111');
  yTitle.setAttribute('font-size', '13');
  yTitle.setAttribute('font-weight', '600');
  const measureName = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex].text;
  yTitle.textContent = `${measureName} (%)`;
  g.appendChild(yTitle);

  // Calculate health data range for color coding
  const healthValues = pts.map(p => p.y);
  const healthMin = Math.min(...healthValues);
  const healthMax = Math.max(...healthValues);

  for (const p of pts) {
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', AppConfig.mapLevel === 'state' ? 4.5 : 3.0);
    
    // Use the new combined color scheme for scatterplot points
    const pointColor = DataManager.CDCPlaces.getCombinedColor(p.x, p.y, healthMin, healthMax);
    dot.setAttribute('fill', pointColor);
    dot.setAttribute('fill-opacity', '0.8');
    dot.setAttribute('stroke', 'white');
    dot.setAttribute('stroke-width', '1.2');
    dot.setAttribute('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))');
    dot.setAttribute('data-fips', p.fips);
    dot.setAttribute('class', 'scatter-dot');

    // Add hover effect
    dot.addEventListener('mouseenter', (e) => {
      e.stopPropagation(); // Prevent triggering pan
      if (!DOMRefs.scatterTooltip) return;
      DOMRefs.scatterTooltip.style.display = 'block';
      
      // Determine category for the tooltip based on values
      const highInsurance = p.x >= 75; // Consider 75%+ as high insurance
      const isPrevention = DataManager.CDCPlaces.isPreventionMeasure(AppConfig.selectedHealthMeasure);
      
      // For prevention measures, high values are good; for health issues, low values are good
      const goodHealthSituation = isPrevention ? p.y >= 70 : p.y < 15;
      
      let category = '';
      let categoryColor = '';
      if (highInsurance && goodHealthSituation) {
        const healthDesc = isPrevention ? 'High' : 'Low';
        category = `🟢 Good: High Insurance & ${healthDesc} ${measureName}`;
        categoryColor = '#22c55e';
      } else if (!highInsurance && !goodHealthSituation) {
        const healthDesc = isPrevention ? 'Low' : 'High';
        category = `🔴 Concerning: Low Insurance & ${healthDesc} ${measureName}`;
        categoryColor = '#dc2626';
      } else {
        const insuranceDesc = highInsurance ? 'High' : 'Low';
        const healthDesc = goodHealthSituation ? (isPrevention ? 'High' : 'Low') : (isPrevention ? 'Low' : 'High');
        category = `🟡 Mixed: ${insuranceDesc} Insurance & ${healthDesc} ${measureName}`;
        categoryColor = '#f59e0b';
      }
      
      DOMRefs.scatterTooltip.innerHTML = `
        <div style="font-weight:600; margin-bottom:4px;">${p.name}</div>
        <div style="color:${categoryColor}; font-size:11px; margin-bottom:6px; font-weight:500;">${category}</div>
        <div style="border-top:1px solid #e5e7eb; padding-top:4px;">
          <div style="margin:2px 0;"><strong>Insurance:</strong> ${p.x.toFixed(1)}%</div>
          <div style="margin:2px 0;"><strong>${measureName}:</strong> ${p.y.toFixed(1)}%</div>
        </div>
      `;
    });
    dot.addEventListener('mousemove', (e) => {
      e.stopPropagation(); // Prevent triggering pan
      if (!DOMRefs.scatterTooltip) return;
      const rect = DOMRefs.scatterContainer.getBoundingClientRect();
      DOMRefs.scatterTooltip.style.left = `${e.clientX - rect.left + 10}px`;
      DOMRefs.scatterTooltip.style.top = `${e.clientY - rect.top + 8}px`;
    });
    dot.addEventListener('mouseleave', (e) => {
      e.stopPropagation(); // Prevent triggering pan
      if (!DOMRefs.scatterTooltip) return;
      DOMRefs.scatterTooltip.style.display = 'none';
    });
    dot.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering pan
    });

    g.appendChild(dot);
  }

  // Add reset zoom button
  const resetButton = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  resetButton.setAttribute('x', W - 100);
  resetButton.setAttribute('y', 10);
  resetButton.setAttribute('width', 80);
  resetButton.setAttribute('height', 25);
  resetButton.setAttribute('fill', 'rgba(255, 255, 255, 0.9)');
  resetButton.setAttribute('stroke', 'rgba(0, 0, 0, 0.2)');
  resetButton.setAttribute('stroke-width', '1');
  resetButton.setAttribute('rx', '4');
  resetButton.setAttribute('cursor', 'pointer');
  resetButton.setAttribute('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))');
  svg.appendChild(resetButton);

  const resetText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  resetText.setAttribute('x', W - 60);
  resetText.setAttribute('y', 26);
  resetText.setAttribute('text-anchor', 'middle');
  resetText.setAttribute('fill', '#374151');
  resetText.setAttribute('font-size', '11');
  resetText.setAttribute('font-weight', '600');
  resetText.textContent = 'Reset Zoom';
  svg.appendChild(resetText);

  // Add click handler for reset button
  resetButton.addEventListener('click', () => {
    currentTransform = { x: 0, y: 0, scale: 1 };
    updateScatterTransform();
  });

  // Calculate correlation coefficient
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const xBar = mean(xs);
  const yBar = mean(ys);
  const Sxy = pts.reduce((s, p) => s + (p.x - xBar) * (p.y - yBar), 0);
  const Sxx = pts.reduce((s, p) => s + (p.x - xBar) ** 2, 0) || 1e-6;
  const Syy = pts.reduce((s, p) => s + (p.y - yBar) ** 2, 0) || 1e-6;
  const correlation = Sxy / Math.sqrt(Sxx * Syy);
  const b1 = Sxy / Sxx;
  const b0 = yBar - b1 * xBar;
  
  // Store analytics data globally for analytics panel
  AppConfig.setGlobalAnalyticsData({
    correlation: correlation,
    pointCount: pts.length,
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)],
    regression: { a: b0, b: b1 }
  });
  
  console.log('Scatterplot updated globalAnalyticsData:', AppConfig.getGlobalAnalyticsData());
  
  console.log('Correlation calculated:', {
    mapLevel: AppConfig.mapLevel,
    pointCount: pts.length,
    correlation: correlation.toFixed(3),
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)]
  });
  const x1 = xAxis.niceMin;
  const x2 = xAxis.niceMax;
  const y1 = b0 + b1 * x1;
  const y2 = b0 + b1 * x2;

  // Regression line with correlation-based styling
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', xScale(x1));
  line.setAttribute('y1', yScale(y1));
  line.setAttribute('x2', xScale(x2));
  line.setAttribute('y2', yScale(y2));
  
  // Color the line based on correlation strength and direction
  let lineColor = '#6b7280'; // neutral gray
  if (Math.abs(correlation) > 0.7) {
    lineColor = correlation > 0 ? '#dc2626' : '#059669'; // strong positive/negative
  } else if (Math.abs(correlation) > 0.4) {
    lineColor = correlation > 0 ? '#ea580c' : '#0891b2'; // moderate positive/negative
  }
  
  line.setAttribute('stroke', lineColor);
  line.setAttribute('stroke-width', Math.abs(correlation) > 0.5 ? '2' : '1');
  line.setAttribute('stroke-dasharray', Math.abs(correlation) > 0.7 ? 'none' : '4,3');
  line.setAttribute('opacity', '0.8');
  g.appendChild(line);

  // Add correlation info box
  const correlationBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  correlationBox.setAttribute('x', 10);
  correlationBox.setAttribute('y', 10);
  correlationBox.setAttribute('width', 140);
  correlationBox.setAttribute('height', 60);
  correlationBox.setAttribute('fill', 'rgba(255, 255, 255, 0.95)');
  correlationBox.setAttribute('stroke', 'rgba(0, 0, 0, 0.1)');
  correlationBox.setAttribute('stroke-width', '1');
  correlationBox.setAttribute('rx', '6');
  correlationBox.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
  g.appendChild(correlationBox);

  const correlationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  correlationText.setAttribute('x', 20);
  correlationText.setAttribute('y', 28);
  correlationText.setAttribute('fill', '#374151');
  correlationText.setAttribute('font-size', '11');
  correlationText.setAttribute('font-weight', '600');
  correlationText.textContent = 'Relationship Strength:';
  g.appendChild(correlationText);

  const correlationValue = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  correlationValue.setAttribute('x', 20);
  correlationValue.setAttribute('y', 45);
  correlationValue.setAttribute('fill', lineColor);
  correlationValue.setAttribute('font-size', '12');
  correlationValue.setAttribute('font-weight', '700');
  const strength = Math.abs(correlation) > 0.7 ? 'Strong' : Math.abs(correlation) > 0.4 ? 'Moderate' : 'Weak';
  const direction = correlation > 0 ? 'Positive' : correlation < 0 ? 'Negative' : 'None';
  correlationValue.textContent = `${strength} ${direction} (r=${correlation.toFixed(2)})`;
  g.appendChild(correlationValue);

  const interpretationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  interpretationText.setAttribute('x', 20);
  interpretationText.setAttribute('y', 58);
  interpretationText.setAttribute('fill', '#6b7280');
  interpretationText.setAttribute('font-size', '9');
  interpretationText.textContent = correlation > 0 ? 'Higher insurance → Higher health issues' : 
                                   correlation < 0 ? 'Higher insurance → Lower health issues' : 'No clear relationship';
  g.appendChild(interpretationText);
}

// Function to highlight scatterplot point when map area is clicked
function highlightScatterPoint(fips) {
  if (!window.scatterData || AppConfig.viewMode !== 'scatter') return;
  
  // Remove previous highlights
  document.querySelectorAll('.scatter-dot').forEach(dot => {
    dot.setAttribute('stroke', 'white');
    dot.setAttribute('stroke-opacity', '1');
    dot.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))';
    // Remove highlight class
    dot.classList.remove('highlighted');
  });
  
  // Highlight the corresponding scatter point
  const targetDot = document.querySelector(`.scatter-dot[data-fips="${fips}"]`);
  if (targetDot) {
    // Use visual effects that don't change size
    targetDot.setAttribute('stroke', '#ffd700');
    targetDot.setAttribute('stroke-opacity', '1');
    targetDot.style.filter = 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.8))';
    targetDot.classList.add('highlighted');
    
    // Bring to front by moving to end of parent
    targetDot.parentNode.appendChild(targetDot);
    
    // Scroll the point into view if needed
    const rect = targetDot.getBoundingClientRect();
    const containerRect = DOMRefs.scatterContainer.getBoundingClientRect();
    if (rect.left < containerRect.left || rect.right > containerRect.right || 
        rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
      targetDot.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }
}

// Function to reset scatterplot highlighting
function resetScatterHighlight() {
  document.querySelectorAll('.scatter-dot').forEach(dot => {
    dot.setAttribute('stroke', 'white');
    dot.setAttribute('stroke-opacity', '1');
    dot.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))';
    dot.classList.remove('highlighted');
  });
}

// Function to reset scatterplot zoom
function resetScatterZoom() {
  // Re-render the scatterplot to reset zoom/pan
  if (AppConfig.viewMode === 'scatter') {
    renderScatterplot();
  }
}

// Export for use in other modules
window.ScatterplotManager = {
  buildScatterData,
  renderScatterplot,
  highlightScatterPoint,
  resetScatterHighlight,
  resetScatterZoom
};
