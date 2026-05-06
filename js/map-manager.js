// Map Management Module
// =====================

let map = null;
let h3Layer = null;
let stateOverlayLayer = null;
let useH3View = false;
let h3SliderValue = 50; // 0 = smallest hexagons, 100 = largest (slider 0-100)
let h3GridMode = false; // false = centroid (1 per area), true = full grid (hexagons cover polygons)
let h3GridCache = null; // precomputed cell data for viewport culling { cells: [{h3Index, boundary, bbox, fillColor, popupContent}], sharedPopup }
let h3GridMoveHandler = null;
let h3GridRenderTimer = null;

// Initialize the map
function initializeMap() {
  // Setting up the map and initializing the view over the US
  map = L.map('map', {
    maxBounds: [[-10, -180], [72, 90]], // Covers Hawaii to Maine, Alaska to Florida
    maxBoundsViscosity: 1.0,
    preferCanvas: true
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

async function renderH3GridVisible() {
  if (!h3GridCache || !h3Layer || !map) return;
  const { cells, sharedPopup } = h3GridCache;
  const bounds = map.getBounds().pad(0.15);
  const visible = cells.filter(c =>
    c.bbox.minLng < bounds.getEast() && c.bbox.maxLng > bounds.getWest() &&
    c.bbox.minLat < bounds.getNorth() && c.bbox.maxLat > bounds.getSouth()
  );
  h3Layer.clearLayers();
  const BATCH = 500;
  for (let i = 0; i < visible.length; i += BATCH) {
    const batch = visible.slice(i, i + BATCH);
    for (const c of batch) {
      const poly = L.polygon(c.boundary, { fillColor: c.fillColor, fillOpacity: 0.7, weight: 1, color: '#fff', opacity: 0.9 });
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        sharedPopup.setContent(c.popupContent).setLatLng(e.latlng).openOn(map);
      });
      h3Layer.addLayer(poly);
    }
    if (i + BATCH < visible.length) await new Promise(r => setTimeout(r, 0));
  }
}

// Render H3 hexagons (one per county/state at centroid - keeps count low and performant)
async function renderH3Map() {
  if (!H3SpatialIndexing?.isAvailable?.()) {
    console.warn('H3 library not loaded');
    useH3View = false;
    if (DOMRefs?.regularBoundariesBtn) DOMRefs.regularBoundariesBtn.classList.add('active');
    if (DOMRefs?.h3HexagonsBtn) DOMRefs.h3HexagonsBtn.classList.remove('active');
    await renderMap(); // fallback to regular
    return;
  }

  const geojson = await DataManager.loadGeoJSON();
  DataManager.buildFipsNameCache(geojson);

  if (AppConfig.geoJsonLayer) map.removeLayer(AppConfig.geoJsonLayer);
  if (stateOverlayLayer) {
    map.removeLayer(stateOverlayLayer);
    stateOverlayLayer = null;
  }
  if (h3Layer) {
    map.removeLayer(h3Layer);
    h3Layer = null;
  }
  if (h3GridRenderTimer) clearTimeout(h3GridRenderTimer);
  h3GridRenderTimer = null;
  if (h3GridMoveHandler) {
    map.off('moveend', h3GridMoveHandler);
    map.off('zoomend', h3GridMoveHandler);
    h3GridMoveHandler = null;
  }
  h3GridCache = null;

  const maxRes = AppConfig.mapLevel === 'state' ? 5 : 6;
  const minRes = AppConfig.mapLevel === 'state' ? 3 : 2;
  let resolution = Math.max(minRes, Math.min(maxRes, Math.round(maxRes - (h3SliderValue / 100) * (maxRes - minRes))));
  let healthMinMax = { min: 0, max: 100 };
  if ((AppConfig.dataLayer === 'health' || AppConfig.dataLayer === 'combined') && AppConfig.getPlacesDataStore()) {
    const vals = Object.values(AppConfig.getPlacesDataStore()).map(d => d.value).filter(v => !isNaN(v));
    if (vals.length) healthMinMax = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  const dataStore = AppConfig.getDataStore();
  const placesStore = AppConfig.getPlacesDataStore() || {};
  h3Layer = L.featureGroup();

  const features = geojson.features || [];
  const useCoarse = resolution < maxRes;

  if (h3GridMode) {
    const cellData = {};
    const BATCH = 25;
    for (let i = 0; i < features.length; i += BATCH) {
      const batch = features.slice(i, i + BATCH);
      for (const feature of batch) {
        const fips = AppConfig.mapLevel === 'state'
          ? (feature.id || '').toString().padStart(2, '0')
          : (feature.properties?.GEO_ID || '').replace('0500000US', '') || feature.id || '';
        if (!fips) continue;
        try {
          const cells = H3SpatialIndexing.polygonToCells(feature, resolution);
          if (!cells.length) continue;
          const percentInsured = dataStore[fips];
          const healthData = placesStore[fips];
          const label = DataManager.nameForFIPS(fips);
          for (const h3Index of cells) {
            if (!cellData[h3Index]) {
              cellData[h3Index] = { insurance: [], health: [], names: [], fipsSet: new Set() };
            }
            if (!cellData[h3Index].fipsSet.has(fips)) {
              cellData[h3Index].fipsSet.add(fips);
              if (percentInsured != null && !isNaN(percentInsured)) cellData[h3Index].insurance.push(percentInsured);
              if (healthData?.value != null && !isNaN(healthData.value)) cellData[h3Index].health.push(healthData.value);
              cellData[h3Index].names.push(label);
            }
          }
        } catch (_) {}
      }
      if (i + BATCH < features.length) await new Promise(r => setTimeout(r, 0));
    }
    if (resolution <= 4) {
      const featuresWithBbox = features.map(f => {
        const fips = AppConfig.mapLevel === 'state' ? (f.id || '').toString().padStart(2, '0') : (f.properties?.GEO_ID || '').replace('0500000US', '') || f.id || '';
        const rings = H3SpatialIndexing.getRings(f);
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        for (const ring of rings) {
          for (const c of ring) {
            minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
            minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
          }
        }
        return { fips, rings, bbox: { minLng, maxLng, minLat, maxLat }, percentInsured: dataStore[fips], healthData: placesStore[fips], label: DataManager.nameForFIPS(fips) };
      }).filter(x => x.fips);
      const resToChildRes = { 2: 4, 3: 5, 4: 6 };
      const childRes = resToChildRes[resolution] || resolution + 2;
      for (const h3Index of Object.keys(cellData)) {
        const boundary = H3SpatialIndexing.getCellBoundary(h3Index);
        if (boundary.length < 3) continue;
        let points = boundary.map(b => [b[0], b[1]]);
        if (h3.cellToChildren && h3.cellToLatLng && childRes > resolution) {
          try {
            const children = h3.cellToChildren(h3Index, childRes);
            if (Array.isArray(children) && children.length > 0) {
              points = children.slice(0, 49).map(c => {
                const latLng = h3.cellToLatLng(c);
                return [latLng[0], latLng[1]];
              });
            }
          } catch (_) {}
        } else if (h3.cellToLatLng) {
          const center = h3.cellToLatLng(h3Index);
          points = [[center[0], center[1]], ...points];
        }
        const added = cellData[h3Index].fipsSet;
        for (const [lat, lng] of points) {
          for (const fc of featuresWithBbox) {
            if (added.has(fc.fips)) continue;
            if (lng < fc.bbox.minLng || lng > fc.bbox.maxLng || lat < fc.bbox.minLat || lat > fc.bbox.maxLat) continue;
            for (const ring of fc.rings) {
              if (H3SpatialIndexing.pointInPolygon(lng, lat, ring)) {
                added.add(fc.fips);
                if (fc.percentInsured != null && !isNaN(fc.percentInsured)) cellData[h3Index].insurance.push(fc.percentInsured);
                if (fc.healthData?.value != null && !isNaN(fc.healthData.value)) cellData[h3Index].health.push(fc.healthData.value);
                cellData[h3Index].names.push(fc.label);
                break;
              }
            }
          }
        }
      }
    }
    for (const d of Object.values(cellData)) delete d.fipsSet;
    const unit = AppConfig.mapLevel === 'state' ? 'states' : 'counties';
    const cells = [];
    for (const [h3Index, data] of Object.entries(cellData)) {
      const boundary = H3SpatialIndexing.getCellBoundary(h3Index);
      if (boundary.length < 3) continue;
      const avgIns = data.insurance.length ? data.insurance.reduce((a, b) => a + b, 0) / data.insurance.length : null;
      const avgHealth = data.health.length ? data.health.reduce((a, b) => a + b, 0) / data.health.length : null;
      const healthVal = data.health.length ? { value: avgHealth } : null;
      let fillColor;
      if (AppConfig.dataLayer === 'insurance') {
        fillColor = handleGradientColor(avgIns);
      } else if (AppConfig.dataLayer === 'health') {
        fillColor = healthVal ? DataManager.CDCPlaces.getHealthOutcomeColor(healthVal.value, healthMinMax.min, healthMinMax.max) : '#ddd';
      } else {
        fillColor = DataManager.CDCPlaces.getCombinedColor(avgIns, healthVal?.value, healthMinMax.min, healthMinMax.max);
      }
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const namesList = data.names.length <= 12
        ? data.names.map(esc).join(', ')
        : data.names.slice(0, 10).map(esc).join(', ') + ` (+${data.names.length - 10} more)`;
      let popupContent;
      if (AppConfig.dataLayer === 'insurance') {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg insurance: ${avgIns != null ? avgIns.toFixed(1) + '%' : 'N/A'}`;
      } else if (AppConfig.dataLayer === 'health') {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg: ${healthVal ? healthVal.value.toFixed(1) + '%' : 'N/A'}`;
      } else {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg insurance: ${avgIns != null ? avgIns.toFixed(1) + '%' : 'N/A'}<br>Avg health: ${healthVal ? healthVal.value.toFixed(1) + '%' : 'N/A'}`;
      }
      const lats = boundary.map(b => b[0]);
      const lngs = boundary.map(b => b[1]);
      cells.push({
        h3Index,
        boundary,
        bbox: { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) },
        fillColor,
        popupContent
      });
    }
    h3GridCache = { cells, sharedPopup: L.popup() };
    if (h3GridMoveHandler) {
      map.off('moveend', h3GridMoveHandler);
      map.off('zoomend', h3GridMoveHandler);
    }
    h3GridMoveHandler = () => {
      if (h3GridRenderTimer) clearTimeout(h3GridRenderTimer);
      h3GridRenderTimer = setTimeout(() => { if (h3GridCache && h3Layer) renderH3GridVisible(); }, 80);
    };
    map.on('moveend', h3GridMoveHandler);
    map.on('zoomend', h3GridMoveHandler);
    renderH3GridVisible();
  } else if (useCoarse) {
    const cellData = {};
    for (const feature of features) {
      const fips = AppConfig.mapLevel === 'state'
        ? (feature.id || '').toString().padStart(2, '0')
        : (feature.properties?.GEO_ID || '').replace('0500000US', '') || feature.id || '';
      if (!fips) continue;
      const centroid = H3SpatialIndexing.getFeatureCentroid(feature);
      if (!centroid) continue;
      const h3Index = H3SpatialIndexing.latLngToCell(centroid.lat, centroid.lng, resolution);
      if (!h3Index) continue;
      if (!cellData[h3Index]) {
        cellData[h3Index] = { insurance: [], health: [], names: [] };
      }
      const percentInsured = dataStore[fips];
      const healthData = placesStore[fips];
      const label = DataManager.nameForFIPS(fips);
      if (percentInsured != null && !isNaN(percentInsured)) cellData[h3Index].insurance.push(percentInsured);
      if (healthData?.value != null && !isNaN(healthData.value)) cellData[h3Index].health.push(healthData.value);
      cellData[h3Index].names.push(label);
    }
    for (const [h3Index, data] of Object.entries(cellData)) {
      const boundary = H3SpatialIndexing.getCellBoundary(h3Index);
      if (boundary.length < 3) continue;
      const avgIns = data.insurance.length ? data.insurance.reduce((a, b) => a + b, 0) / data.insurance.length : null;
      const avgHealth = data.health.length ? data.health.reduce((a, b) => a + b, 0) / data.health.length : null;
      const healthVal = data.health.length ? { value: avgHealth } : null;
      let fillColor;
      if (AppConfig.dataLayer === 'insurance') {
        fillColor = handleGradientColor(avgIns);
      } else if (AppConfig.dataLayer === 'health') {
        fillColor = healthVal ? DataManager.CDCPlaces.getHealthOutcomeColor(healthVal.value, healthMinMax.min, healthMinMax.max) : '#ddd';
      } else {
        fillColor = DataManager.CDCPlaces.getCombinedColor(avgIns, healthVal?.value, healthMinMax.min, healthMinMax.max);
      }
      const poly = L.polygon(boundary, { fillColor, fillOpacity: 0.7, weight: 1, color: '#fff', opacity: 0.9 });
      const unit = AppConfig.mapLevel === 'state' ? 'states' : 'counties';
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const namesList = data.names.length <= 12
        ? data.names.map(esc).join(', ')
        : data.names.slice(0, 10).map(esc).join(', ') + ` (+${data.names.length - 10} more)`;
      let popupContent;
      if (AppConfig.dataLayer === 'insurance') {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg insurance: ${avgIns != null ? avgIns.toFixed(1) + '%' : 'N/A'}`;
      } else if (AppConfig.dataLayer === 'health') {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg: ${healthVal ? healthVal.value.toFixed(1) + '%' : 'N/A'}`;
      } else {
        popupContent = `<b>${data.names.length} ${unit}</b><br><span style="font-size:11px">${namesList}</span><br>Avg insurance: ${avgIns != null ? avgIns.toFixed(1) + '%' : 'N/A'}<br>Avg health: ${healthVal ? healthVal.value.toFixed(1) + '%' : 'N/A'}`;
      }
      poly.bindPopup(popupContent);
      h3Layer.addLayer(poly);
    }
  } else {
    for (const feature of features) {
      const fips = AppConfig.mapLevel === 'state'
        ? (feature.id || '').toString().padStart(2, '0')
        : (feature.properties?.GEO_ID || '').replace('0500000US', '') || feature.id || '';
      if (!fips) continue;
      const centroid = H3SpatialIndexing.getFeatureCentroid(feature);
      if (!centroid) continue;
      const h3Index = H3SpatialIndexing.latLngToCell(centroid.lat, centroid.lng, resolution);
      if (!h3Index) continue;
      const boundary = H3SpatialIndexing.getCellBoundary(h3Index);
      if (boundary.length < 3) continue;

      const percentInsured = dataStore[fips];
      const healthData = placesStore[fips];
      let fillColor;
      if (AppConfig.dataLayer === 'insurance') {
        fillColor = handleGradientColor(percentInsured);
      } else if (AppConfig.dataLayer === 'health') {
        fillColor = healthData ? DataManager.CDCPlaces.getHealthOutcomeColor(healthData.value, healthMinMax.min, healthMinMax.max) : '#ddd';
      } else {
        fillColor = DataManager.CDCPlaces.getCombinedColor(percentInsured, healthData?.value, healthMinMax.min, healthMinMax.max);
      }
      const poly = L.polygon(boundary, { fillColor, fillOpacity: 0.7, weight: 1, color: '#fff', opacity: 0.9 });
      const label = DataManager.nameForFIPS(fips);
      let popupContent;
      if (AppConfig.dataLayer === 'insurance') {
        popupContent = `<b>${label}</b><br>Insurance: ${percentInsured != null ? percentInsured + '%' : 'N/A'}`;
      } else if (AppConfig.dataLayer === 'health' && healthData) {
        popupContent = DataManager.CDCPlaces.formatCombinedPopup(null, healthData, label);
      } else if (AppConfig.dataLayer === 'combined') {
        popupContent = DataManager.CDCPlaces.formatCombinedPopup(percentInsured != null ? parseFloat(percentInsured) : null, healthData, label);
      } else {
        popupContent = `<b>${label}</b><br>No data`;
      }
      poly.bindPopup(popupContent);
      poly.on('click', () => highlightScatterPoint(fips));
      h3Layer.addLayer(poly);
    }
  }

  const layerCount = h3Layer.getLayers().length;
  if (layerCount === 0) {
    console.warn('H3: No hexagons rendered - check GeoJSON and data');
    useH3View = false;
    if (DOMRefs?.regularBoundariesBtn) DOMRefs.regularBoundariesBtn.classList.add('active');
    if (DOMRefs?.h3HexagonsBtn) DOMRefs.h3HexagonsBtn.classList.remove('active');
    await renderMap();
    return;
  }
  h3Layer.addTo(map);
  try {
    map.invalidateSize();
    h3Layer.bringToFront();
  } catch (_) {}

  // Add state boundaries overlay for orientation when hexes are small
  try {
    const stateGeojson = await DataManager.loadStateBoundariesGeoJSON();
    stateOverlayLayer = L.geoJSON(stateGeojson, {
      style: {
        fillColor: 'transparent',
        fillOpacity: 0,
        weight: 1.5,
        color: '#444',
        opacity: 0.85
      },
      interactive: false
    }).addTo(map);
    stateOverlayLayer.bringToFront();
  } catch (e) {
    console.warn('Could not load state overlay:', e);
  }
}

// Render the map with current data
async function renderMap() {
  if (useH3View) {
    await renderH3Map();
    return;
  }

  const geojson = await DataManager.loadGeoJSON();
  DataManager.buildFipsNameCache(geojson);

  if (h3Layer) {
    map.removeLayer(h3Layer);
    h3Layer = null;
  }
  if (stateOverlayLayer) {
    map.removeLayer(stateOverlayLayer);
    stateOverlayLayer = null;
  }
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

function toggleH3View(enabled) {
  useH3View = !!enabled;
  renderMap();
}

function setH3Size(value) {
  h3SliderValue = Math.max(0, Math.min(100, value));
  if (useH3View) renderMap();
}

function setH3GridMode(grid) {
  h3GridMode = !!grid;
  if (useH3View) renderMap();
}

// Export for use in other modules
window.MapManager = {
  map,
  initializeMap,
  renderMap,
  renderH3Map,
  toggleH3View,
  setH3Size,
  setH3GridMode,
  handleGradientColor,
  get useH3View() { return useH3View; },
  get h3SizeValue() { return h3SliderValue; },
  get h3GridMode() { return h3GridMode; }
};
