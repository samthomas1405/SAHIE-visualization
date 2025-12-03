// UI Controls Module
// ==================

// Search functionality
function initializeSearch() {
  DOMRefs.searchInput.addEventListener('input', () => {
    const query = DOMRefs.searchInput.value.trim().toLowerCase();
    DOMRefs.searchResults.innerHTML = '';

    if (!query || !AppConfig.geoJsonLayer) {
      DOMRefs.searchResults.style.display = 'none';
      return;
    }

    const matches = [];
    AppConfig.geoJsonLayer.eachLayer(layer => {
      const props = layer.feature.properties;
      const name = AppConfig.mapLevel === 'state'
        ? props.name
        : `${props.NAME}, ${AppConfig.stateFIPSMapping[props.STATE] || 'Unknown'}`;
      if (name.toLowerCase().startsWith(query)) matches.push({ name, layer });
    });

    if (matches.length > 0) {
      matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = match.name;
        div.onclick = () => {
          MapManager.map.fitBounds(match.layer.getBounds());
          match.layer.openPopup();
          DOMRefs.searchResults.style.display = 'none';
          DOMRefs.searchInput.value = match.name;
        };
        DOMRefs.searchResults.appendChild(div);
      });
      DOMRefs.searchResults.style.display = 'block';
    } else {
      DOMRefs.searchResults.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!DOMRefs.searchResults.contains(e.target) && e.target !== DOMRefs.searchInput) {
      DOMRefs.searchResults.style.display = 'none';
    }
  });

  // Clear button for search bar
  const searchClearBtn = document.getElementById('searchClear');
  if (searchClearBtn && DOMRefs.searchInput) {
    const toggleClear = () => {
      searchClearBtn.style.display = DOMRefs.searchInput.value.trim() ? 'block' : 'none';
    };
    DOMRefs.searchInput.addEventListener('input', toggleClear);
    toggleClear(); // initialize

    searchClearBtn.addEventListener('click', () => {
      DOMRefs.searchInput.value = '';
      toggleClear();
      DOMRefs.searchResults.style.display = 'none';
    });
  }
}

// View mode management
function updateViewVisibility() {
  const mapEl = document.getElementById('map');
  if (!mapEl || !DOMRefs.scatterContainer) return;
  if (AppConfig.viewMode === 'scatter') {
    DOMRefs.scatterContainer.style.display = 'block';
    mapEl.style.display = 'none';
    // Add scatter-view class to analytics panel
    if (DOMRefs.analyticsPanel) {
      DOMRefs.analyticsPanel.classList.add('scatter-view');
    }
  } else {
    DOMRefs.scatterContainer.style.display = 'none';
    mapEl.style.display = 'block';
    // Remove scatter-view class from analytics panel
    if (DOMRefs.analyticsPanel) {
      DOMRefs.analyticsPanel.classList.remove('scatter-view');
    }
  }
}

// Unified rerender so we always draw the right view
async function afterDataChangeRerender() {
  await ensureScatterDependencies();
  updateViewVisibility();
  if (AppConfig.viewMode === 'scatter') {
    console.log('Before renderScatterplot - globalAnalyticsData:', AppConfig.getGlobalAnalyticsData());
    ScatterplotManager.renderScatterplot();
    console.log('After renderScatterplot - globalAnalyticsData:', AppConfig.getGlobalAnalyticsData());
  } else {
    MapManager.renderMap();
  }
  console.log('Before updateAnalyticsPanel - globalAnalyticsData:', AppConfig.getGlobalAnalyticsData());
  await AnalyticsManager.updateAnalyticsPanel();
}

async function ensureScatterDependencies() {
  if (AppConfig.viewMode !== 'scatter') return;
  // Scatter always needs PLACES data for y-axis
  if (!AppConfig.getPlacesDataStore() || Object.keys(AppConfig.getPlacesDataStore()).length === 0) {
    await DataManager.fetchPlacesData();
  }
}

// Reset relationship weight slider to 50%
function resetRelationshipSlider() {
  AppConfig.setRelationshipWeight(50);
  if (DOMRefs.relationshipSlider) {
    DOMRefs.relationshipSlider.value = 50;
  }
  if (DOMRefs.relationshipValue) {
    DOMRefs.relationshipValue.textContent = '50%';
    // Reset to balanced yellow color
    DOMRefs.relationshipValue.style.background = 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)';
  }
  if (DOMRefs.sliderDescription) {
    DOMRefs.sliderDescription.textContent = 'Balanced view: Equal weight to both factors';
  }
}

// Event handlers
function initializeEventHandlers() {
  // Health measure change
  DOMRefs.healthMeasureSelect.addEventListener('change', async () => {
    AppConfig.setSelectedHealthMeasure(DOMRefs.healthMeasureSelect.value);
    
    // Reset relationship weight slider to 50% when health measure changes
    resetRelationshipSlider();
    
    // Clear existing health data to force fresh fetch
    AppConfig.setPlacesDataStore({});
    
    await DataManager.fetchPlacesData();

    if (AppConfig.getPlacesDataStore()) {
      const measureName = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex].text;
      DataManager.CDCPlaces.updateHealthLegend(AppConfig.getPlacesDataStore(), measureName);
      if (AppConfig.dataLayer === 'combined') DataManager.CDCPlaces.updateCombinedLegend(measureName);
    }

    await afterDataChangeRerender();
  });

  // Play animation
  DOMRefs.playButton.addEventListener('click', () => {
    if (AppConfig.isPlaying) {
      clearInterval(AppConfig.animationInterval);
      DOMRefs.playButton.textContent = '▶ Play';
      AppConfig.setIsPlaying(false);
    } else {
      AppConfig.setIsPlaying(true);
      DOMRefs.playButton.textContent = '⏸ Pause';

      // Start from the minimum year (2006)
      let nextYear = parseInt(DOMRefs.yearSlider.min, 10);
      DOMRefs.yearSlider.value = nextYear;
      DOMRefs.yearValue.textContent = nextYear;
      AppConfig.setSelectedYear(nextYear);
      DataManager.fetchData();

      AppConfig.setAnimationInterval(setInterval(() => {
        nextYear++;
        // Stop at 2022 (latest available data), not the slider max
        if (nextYear > 2022) {
          clearInterval(AppConfig.animationInterval);
          DOMRefs.playButton.textContent = '▶ Play';
          AppConfig.setIsPlaying(false);
          return;
        }
        DOMRefs.yearSlider.value = nextYear;
        DOMRefs.yearValue.textContent = nextYear;
        AppConfig.setSelectedYear(nextYear);
        DataManager.fetchData();
      }, 500));
    }
  });

  // Filters
  DOMRefs.ageSelect.addEventListener('change', async () => { 
    AppConfig.setAgeCat(DOMRefs.ageSelect.value); 
    await DataManager.fetchData();
  });
  DOMRefs.sexSelect.addEventListener('change', async () => { 
    AppConfig.setSexCat(DOMRefs.sexSelect.value); 
    await DataManager.fetchData();
  });
  DOMRefs.iprSelect.addEventListener('change', async () => { 
    AppConfig.setIprCat(DOMRefs.iprSelect.value); 
    await DataManager.fetchData();
  });
  DOMRefs.raceSelect.addEventListener('change', async () => { 
    AppConfig.setRaceCat(DOMRefs.raceSelect.value); 
    await DataManager.fetchData();
  });

  DOMRefs.yearSlider.addEventListener('input', async () => {
    const sliderValue = parseInt(DOMRefs.yearSlider.value);
    // Cap at 2022 for data fetching (latest available data)
    const dataYear = Math.min(2022, sliderValue);
    AppConfig.setSelectedYear(dataYear);
    DOMRefs.yearValue.textContent = sliderValue; // Show slider value in UI
    await DataManager.fetchData();
  });

  // Relationship slider event handler
  DOMRefs.relationshipSlider.addEventListener('input', async () => {
    AppConfig.setRelationshipWeight(parseInt(DOMRefs.relationshipSlider.value));
    DOMRefs.relationshipValue.textContent = AppConfig.relationshipWeight + '%';
    
    // Update visual styling based on weight
    const weight = AppConfig.relationshipWeight;
    const valueElement = DOMRefs.relationshipValue;
    
    // Update background gradient based on weight
    if (weight < 25) {
      valueElement.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'; // Red
    } else if (weight < 40) {
      valueElement.style.background = 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)'; // Red-orange
    } else if (weight < 60) {
      valueElement.style.background = 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)'; // Yellow
    } else if (weight < 75) {
      valueElement.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'; // Green
    } else {
      valueElement.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'; // Dark green
    }
    
    // Update description based on weight
    let description = '';
    if (weight < 25) {
      description = 'Health-focused: Primarily shows health outcome patterns';
    } else if (weight < 40) {
      description = 'Health-leaning: Emphasizes health outcomes with some insurance influence';
    } else if (weight < 60) {
      description = 'Balanced view: Equal weight to both factors';
    } else if (weight < 75) {
      description = 'Insurance-leaning: Emphasizes insurance with some health influence';
    } else {
      description = 'Insurance-focused: Primarily shows insurance coverage patterns';
    }
    DOMRefs.sliderDescription.textContent = description;
    
    // Re-render the visualization with new weight
    await afterDataChangeRerender();
  });

  // Geography level change (single consolidated handler)
  DOMRefs.levelSelect.addEventListener('change', async () => {
    const selectedLevel = DOMRefs.levelSelect.value;
    AppConfig.setMapLevel(selectedLevel);

    if (!selectedLevel) {
      DOMRefs.filterOptions.style.display = 'none';
      DOMRefs.layerSelection.style.display = 'none';
      DOMRefs.selectPrompt.style.display = 'block';
      if (AppConfig.geoJsonLayer) MapManager.map.removeLayer(AppConfig.geoJsonLayer);
      await AnalyticsManager.updateAnalyticsPanel(); // Update analytics panel even when no level selected
      return;
    }

    DOMRefs.selectPrompt.style.display = 'none';
    DOMRefs.layerSelection.style.display = 'block';
    DOMRefs.filterOptions.style.display = 'block';

    if (selectedLevel === 'state') {
      DOMRefs.raceWrapper.style.display = 'block';
      DOMRefs.raceNote.style.display = 'block';
      DOMRefs.searchLabel.textContent = "Search State:";
    } else {
      DOMRefs.raceWrapper.style.display = 'none';
      DOMRefs.raceNote.style.display = 'none';
      AppConfig.setRaceCat(0);
      DOMRefs.searchLabel.textContent = "Search County:";
    }

    // Clear existing data stores to force fresh data fetch
    AppConfig.setDataStore({});
    AppConfig.setPlacesDataStore({});
    AppConfig.setFipsNameCache({}); // Clear name cache too
    
    // Clear global analytics data to force recalculation
    AppConfig.setGlobalAnalyticsData({
      correlation: 0,
      pointCount: 0,
      xRange: [0, 0],
      yRange: [0, 0],
      regression: { a: 0, b: 0 }
    });
    
    // Fetch new data and re-render (afterDataChangeRerender will handle scatterplot update)
    console.log('About to fetch data for level:', selectedLevel);
    await DataManager.fetchData();
    console.log('Data fetch completed. Data store keys:', Object.keys(AppConfig.getDataStore()).length);
    
    // Build name cache for the new geography level
    if (AppConfig.viewMode === 'scatter') {
      const geojson = await DataManager.loadGeoJSON();
      DataManager.buildFipsNameCache(geojson);
    }
  });

  // Layer selection buttons
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update data layer
      AppConfig.setDataLayer(btn.dataset.layer);
      
      // Show/hide view mode toggle based on layer
      if (AppConfig.dataLayer === 'combined') {
        DOMRefs.viewModeToggle.style.display = 'block';
        // Reset relationship slider when switching to combined view
        resetRelationshipSlider();
      } else {
        DOMRefs.viewModeToggle.style.display = 'none';
        AppConfig.setViewMode('map'); // Force map view for single layers
      }
      
      // Handle data layer change
      handleDataLayerChange();
    });
  });

  // View mode toggle buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update view mode
      AppConfig.setViewMode(btn.dataset.view);
      
      // Update visibility and render
      updateViewVisibility();
      if (AppConfig.viewMode === 'scatter') ScatterplotManager.renderScatterplot();
      else MapManager.renderMap();
    });
  });
}

// Handle data layer change
async function handleDataLayerChange() {
  // Show/hide health measure selector
  if (AppConfig.dataLayer === 'health' || AppConfig.dataLayer === 'combined') {
    DOMRefs.healthMeasureWrapper.style.display = 'block';
    await DataManager.fetchPlacesData();
  } else {
    DOMRefs.healthMeasureWrapper.style.display = 'none';
    // Scatter view needs PLACES for y-axis, ensure we have it
    if (AppConfig.viewMode === 'scatter' && (!AppConfig.getPlacesDataStore() || Object.keys(AppConfig.getPlacesDataStore()).length === 0)) {
      await DataManager.fetchPlacesData();
    }
  }

  // Show/hide relationship slider (only for combined view)
  if (AppConfig.dataLayer === 'combined') {
    DOMRefs.relationshipSliderWrapper.style.display = 'block';
  } else {
    DOMRefs.relationshipSliderWrapper.style.display = 'none';
  }

  // Update gradient display
  if (AppConfig.dataLayer === 'health') {
    const measureName = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex].text;
    DataManager.CDCPlaces.updateHealthLegend(AppConfig.getPlacesDataStore(), measureName);
    DOMRefs.insuranceGradient.style.display = 'none';
    DOMRefs.healthGradient.style.display = 'block';
    DOMRefs.gradientTitle.textContent = `${measureName} %`;
  } else if (AppConfig.dataLayer === 'combined') {
    DOMRefs.gradientTitle.textContent = 'Combined View';
    DOMRefs.insuranceGradient.style.display = 'none'; // Hide old insurance gradient
    DOMRefs.healthGradient.style.display = 'block'; // Show only the combined legend
    if (AppConfig.getPlacesDataStore()) {
      const measureName = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex].text;
      DataManager.CDCPlaces.updateCombinedLegend(measureName);
    }
  } else {
    DOMRefs.gradientTitle.textContent = 'Insurance Coverage %';
    DOMRefs.insuranceGradient.style.display = 'block';
    DOMRefs.healthGradient.style.display = 'none';
  }

  const showYearControls = AppConfig.dataLayer === 'insurance';
  DOMRefs.yearSlider.style.display = showYearControls ? 'block' : 'none';
  DOMRefs.playButton.style.display = showYearControls ? 'inline-flex' : 'none';
  document.querySelector('label[for="yearSlider"]').style.display =
  showYearControls ? 'block' : 'none';
  await afterDataChangeRerender();
  AnalyticsManager.applyAnalyticsLayoutForLayer();
}

// Initialize the application
function initializeApp() {
  // Initialize search
  initializeSearch();
  
  // Initialize event handlers
  initializeEventHandlers();
  
  // Initial state
  updateViewVisibility();
  AnalyticsManager.ensureAnalyticsPanelVisible();

  // Set initial active state for layer buttons
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.layer === AppConfig.dataLayer) {
      btn.classList.add('active');
    }
  });

  // Initialize relationship slider
  if (DOMRefs.relationshipSlider && DOMRefs.relationshipValue && DOMRefs.sliderDescription) {
    const weight = AppConfig.relationshipWeight;
    DOMRefs.relationshipValue.textContent = weight + '%';
    
    // Set initial visual styling
    const valueElement = DOMRefs.relationshipValue;
    if (weight < 25) {
      valueElement.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'; // Red
    } else if (weight < 40) {
      valueElement.style.background = 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)'; // Red-orange
    } else if (weight < 60) {
      valueElement.style.background = 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)'; // Yellow
    } else if (weight < 75) {
      valueElement.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'; // Green
    } else {
      valueElement.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'; // Dark green
    }
    
    let description = '';
    if (weight < 25) {
      description = 'Health-focused: Primarily shows health outcome patterns';
    } else if (weight < 40) {
      description = 'Health-leaning: Emphasizes health outcomes with some insurance influence';
    } else if (weight < 60) {
      description = 'Balanced view: Equal weight to both factors';
    } else if (weight < 75) {
      description = 'Insurance-leaning: Emphasizes insurance with some health influence';
    } else {
      description = 'Insurance-focused: Primarily shows insurance coverage patterns';
    }
    DOMRefs.sliderDescription.textContent = description;
  }

  // Don't await initial panel update since it's at page load
  AnalyticsManager.updateAnalyticsPanel();
}

// Ensure we update scatter on window resize
window.addEventListener('resize', () => {
  if (AppConfig.viewMode === 'scatter') ScatterplotManager.renderScatterplot();
});

// Override fetchPlacesData during scatter to trigger redraw after load
const _origFetchPlacesData = DataManager.fetchPlacesData;
DataManager.fetchPlacesData = async function () {
  const res = await _origFetchPlacesData.call(this);
  if (AppConfig.viewMode === 'scatter') ScatterplotManager.renderScatterplot();
  return res;
};

// Export for use in other modules
window.UIControls = {
  initializeSearch,
  updateViewVisibility,
  afterDataChangeRerender,
  ensureScatterDependencies,
  initializeEventHandlers,
  handleDataLayerChange,
  initializeApp
};
