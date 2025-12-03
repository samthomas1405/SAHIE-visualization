// Map Management Module
// =====================

let map = null;

// Initialize the map
function initializeMap() {
  // Setting up the map and initializing the view over the US
  map = L.map('map', {
    maxBounds: [[-10, -180], [72, 90]], // Covers Hawaii to Maine, Alaska to Florida
    maxBoundsViscosity: 1.0
  }).setView([37.5, -100], 2.8); // Lower zoom level to fit all

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 10,
    minZoom: 4
  }).addTo(map);

  // Custom zoom controls with better styling
  const customZoomControl = L.control({position: 'topright'});
  customZoomControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'custom-zoom-control');
    div.innerHTML = `
      <button class="zoom-btn zoom-in" title="Zoom In">+</button>
      <button class="zoom-btn zoom-out" title="Zoom Out">−</button>
      <button class="zoom-btn zoom-fit" title="Fit to US">⌂</button>
    `;
    
    // Prevent map zoom when clicking buttons
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(div, 'click', L.DomEvent.stopPropagation);
    
    // Add click handlers
    div.querySelector('.zoom-in').addEventListener('click', () => map.zoomIn());
    div.querySelector('.zoom-out').addEventListener('click', () => map.zoomOut());
    div.querySelector('.zoom-fit').addEventListener('click', () => {
      map.setView([37.5, -100], 4);
    });
    
    return div;
  };
  customZoomControl.addTo(map);
}

// Insurance gradient color function
function handleGradientColor(percent) {
  if (!percent || isNaN(percent)) return '#ddd';
  const value = parseFloat(percent);
  if (value < 50) return '#e0f7ff';
  if (value < 60) return '#b3e5fc';
  if (value < 70) return '#81d4fa';
  if (value < 80) return '#1565c0';
  if (value < 90) return '#1e3d7b';
  if (value < 95) return '#002171';
  return '#000033';
}

// Render the map with current data
async function renderMap() {
  const geojson = await DataManager.loadGeoJSON();
  DataManager.buildFipsNameCache(geojson);

  if (AppConfig.geoJsonLayer) {
    map.removeLayer(AppConfig.geoJsonLayer);
  }

  // Calculate min/max for health data if needed
  let healthMinMax = { min: 0, max: 100 };
  if ((AppConfig.dataLayer === 'health' || AppConfig.dataLayer === 'combined') && AppConfig.getPlacesDataStore()) {
    const healthValues = Object.values(AppConfig.getPlacesDataStore()).map(d => d.value).filter(v => !isNaN(v));
    if (healthValues.length > 0) {
      healthMinMax.min = Math.min(...healthValues);
      healthMinMax.max = Math.max(...healthValues);
    }
  }

  AppConfig.setGeoJsonLayer(L.geoJSON(geojson, {
    style: feature => {
      const fips = AppConfig.mapLevel === 'state'
        ? feature.id.padStart(2, '0')
        : feature.properties.GEO_ID.replace('0500000US', '');
      const percentInsured = AppConfig.getDataStore()[fips];
      const healthData = AppConfig.getPlacesDataStore()[fips];

      let fillColor, weight, color, dashArray;
      if (AppConfig.dataLayer === 'insurance') {
        fillColor = handleGradientColor(percentInsured);
        weight = 1; color = 'white'; dashArray = '3';
      } else if (AppConfig.dataLayer === 'health') {
        fillColor = healthData ? DataManager.CDCPlaces.getHealthOutcomeColor(healthData.value, healthMinMax.min, healthMinMax.max) : '#ddd';
        weight = 1; color = 'white'; dashArray = '3';
      } else {
        // Use the new combined color scheme for better visualization
        fillColor = DataManager.CDCPlaces.getCombinedColor(percentInsured, healthData?.value, healthMinMax.min, healthMinMax.max);
        weight = 1; color = 'white'; dashArray = '3';
      }

      return {
        fillColor,
        weight,
        opacity: 1,
        color,
        dashArray,
        fillOpacity: 0.7
      };
    },
    onEachFeature: (feature, layer) => {
      const fips = AppConfig.mapLevel === 'state'
        ? feature.id.padStart(2, '0')
        : feature.properties.GEO_ID.replace('0500000US', '');

      const label = DataManager.nameForFIPS(fips);            //  cached, O(1)
      const percentInsured = AppConfig.getDataStore()[fips] ?? 'N/A';
      const healthData = AppConfig.getPlacesDataStore()[fips];

      let popupContent;
      if (AppConfig.dataLayer === 'insurance') {
        popupContent = `<b>${label}</b><br>Insurance Coverage: ${percentInsured || percentInsured === 0 ? percentInsured + '%' : 'N/A'}`;
      } else if (AppConfig.dataLayer === 'health' && healthData) {
        popupContent = DataManager.CDCPlaces.formatCombinedPopup(null, healthData, label);
      } else if (AppConfig.dataLayer === 'combined') {
        popupContent = DataManager.CDCPlaces.formatCombinedPopup(
          percentInsured || percentInsured === 0 ? parseFloat(percentInsured) : null,
          healthData,
          label
        );
      } else {
        popupContent = `<b>${label}</b><br>No data available`;
      }

      layer.bindPopup(popupContent);
      
      // Add click handler for scatterplot highlighting
      layer.on('click', () => {
        highlightScatterPoint(fips);
      });
    }
  }).addTo(map));
}

// Export for use in other modules
window.MapManager = {
  map,
  initializeMap,
  renderMap,
  handleGradientColor
};
