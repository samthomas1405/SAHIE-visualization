// SAHIE Map Visualization
// Setting up the map and initializing the view over the US
const map = L.map('map', {
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

let geoJsonLayer;
let animationInterval = null;
let selectedYear = 2022;
let mapLevel = null;
let ageCat = 0, sexCat = 0, iprCat = 0, raceCat = 0;
let dataStore = {};        // SAHIE map data keyed by FIPS
let placesDataStore = {};  // CDC PLACES data keyed by FIPS
let dataLayer = 'insurance'; // 'insurance', 'health', or 'combined'
let selectedHealthMeasure = 'DIABETES';
let isPlaying = false;
let relationshipWeight = 50; // 0 = health outcome only, 50 = balanced, 100 = insurance only

// View mode state: 'map' | 'scatter'
let viewMode = 'map';

// Global analytics data for sharing between scatterplot and analytics panel
let globalAnalyticsData = {
  correlation: 0,
  pointCount: 0,
  xRange: [0, 0],
  yRange: [0, 0],
  regression: { a: 0, b: 0 }
};

// DOM references used across everything
const levelSelect = document.getElementById('levelCat');
const selectPrompt = document.getElementById('selectPrompt');
const filterOptions = document.getElementById('filterOptions');
const raceWrapper = document.getElementById('raceWrapper');
const searchLabel = document.getElementById('searchLabel');
const raceNote = document.getElementById('raceNote');

const ageSelect = document.getElementById('ageCat');
const sexSelect = document.getElementById('sexCat');
const iprSelect = document.getElementById('iprCat');
const raceSelect = document.getElementById('raceCat');

const yearSlider = document.getElementById('yearSlider');
const yearValue = document.getElementById('yearValue');
const playButton = document.getElementById('playButton');

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

const layerSelection = document.getElementById('layerSelection');
const viewModeToggle = document.getElementById('viewModeToggle');
const healthMeasureWrapper = document.getElementById('healthMeasureWrapper');
const healthMeasureSelect = document.getElementById('healthMeasure');
const gradientTitle = document.getElementById('gradient-title');
const insuranceGradient = document.getElementById('insurance-gradient');
const healthGradient = document.getElementById('health-gradient');

const scatterContainer = document.getElementById('scatterContainer');
const scatterTooltip = document.getElementById('scatterTooltip');

// Relationship slider elements
const relationshipSliderWrapper = document.getElementById('relationshipSliderWrapper');
const relationshipSlider = document.getElementById('relationshipSlider');
const relationshipValue = document.getElementById('relationshipValue');
const sliderDescription = document.getElementById('sliderDescription');

// CDC PLACES Data Integration
const CDCPlaces = {
  // Key health measure field mappings
  measures: {
    DIABETES: 'diabetes_crudeprev',
    OBESITY: 'obesity_crudeprev',
    BPHIGH: 'bphigh_crudeprev',
    HEART_DISEASE: 'chd_crudeprev',
    STROKE: 'stroke_crudeprev',
    CANCER: 'cancer_crudeprev',
    ASTHMA: 'casthma_crudeprev',
    COPD: 'copd_crudeprev',
    DEPRESSION: 'mhlth_crudeprev',
    KIDNEY_DISEASE: 'kidney_crudeprev',
    ARTHRITIS: 'arthritis_crudeprev',
    // Prevention measures
    CHECKUP: 'checkup_crudeprev',
    CHOLSCREEN: 'cholscreen_crudeprev',
    DENTAL: 'dental_crudeprev',
    MAMMOUSE: 'mammouse_crudeprev',
    CERVICAL: 'cervical_crudeprev',
    // Health behaviors
    BINGE: 'binge_crudeprev',
    SMOKING: 'csmoking_crudeprev',
    PHYSICAL_INACTIVITY: 'lpa_crudeprev',
    SLEEP_LESS_7: 'sleep_crudeprev'
  },

  // Fetch county-level PLACES data
  async fetchCountyData(selectedMeasure = 'DIABETES') {
    try {
      const baseURL = 'https://data.cdc.gov/resource/swc5-untb.json';
      const measureIdMap = {
        DIABETES: 'DIABETES', OBESITY: 'OBESITY', BPHIGH: 'BPHIGH',
        HEART_DISEASE: 'CHD', STROKE: 'STROKE', CANCER: 'CANCER',
        ASTHMA: 'CASTHMA', COPD: 'COPD', DEPRESSION: 'DEPRESSION',
        KIDNEY_DISEASE: 'KIDNEY', ARTHRITIS: 'ARTHRITIS',
        CHECKUP: 'CHECKUP', CHOLSCREEN: 'CHOLSCREEN', DENTAL: 'DENTAL',
        MAMMOUSE: 'MAMMOUSE', CERVICAL: 'CERVICAL', BINGE: 'BINGE',
        SMOKING: 'CSMOKING', PHYSICAL_INACTIVITY: 'LPA', SLEEP_LESS_7: 'SLEEP'
      };
      const measureId = measureIdMap[selectedMeasure] || selectedMeasure;

      const url = `${baseURL}?$where=measureid='${measureId}'&$limit=50000`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) return {};

      const processedData = {};
      data.forEach(record => {
        if (record.data_value && record.locationid) {
          const countyFIPS = record.locationid;
          if (countyFIPS && countyFIPS.length === 5) {
            processedData[countyFIPS] = {
              value: parseFloat(record.data_value),
              measure: selectedMeasure,
              locationName: `${record.locationname || 'Unknown'}, ${record.stateabbr || 'Unknown'}`
            };
          }
        }
      });
      return processedData;
    } catch (error) {
      console.error('Error fetching CDC PLACES county data:', error);
      return {};
    }
  },

  // Fetch state-level PLACES data (aggregated)
  async fetchStateData(selectedMeasure = 'DIABETES') {
    try {
      const baseURL = 'https://data.cdc.gov/resource/swc5-untb.json';
      const measureIdMap = {
        DIABETES: 'DIABETES', OBESITY: 'OBESITY', BPHIGH: 'BPHIGH',
        HEART_DISEASE: 'CHD', STROKE: 'STROKE', CANCER: 'CANCER',
        ASTHMA: 'CASTHMA', COPD: 'COPD', DEPRESSION: 'DEPRESSION',
        KIDNEY_DISEASE: 'KIDNEY', ARTHRITIS: 'ARTHRITIS',
        CHECKUP: 'CHECKUP', CHOLSCREEN: 'CHOLSCREEN', DENTAL: 'DENTAL',
        MAMMOUSE: 'MAMMOUSE', CERVICAL: 'CERVICAL', BINGE: 'BINGE',
        SMOKING: 'CSMOKING', PHYSICAL_INACTIVITY: 'LPA', SLEEP_LESS_7: 'SLEEP'
      };
      const measureId = measureIdMap[selectedMeasure] || selectedMeasure;

      const url = `${baseURL}?$where=measureid='${measureId}'&$limit=50000`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) return {};

      // State FIPS mapping
      const abbrToFIPS = {
        AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
        GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
        MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
        NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
        SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56'
      };

      // Aggregate by state (simple average of county values)
      const stateData = {};
      data.forEach(record => {
        if (record.stateabbr && record.data_value) {
          const stateAbbr = record.stateabbr;
          if (!stateData[stateAbbr]) stateData[stateAbbr] = [];
          stateData[stateAbbr].push(parseFloat(record.data_value));
        }
      });

      const processedData = {};
      for (const [stateAbbr, values] of Object.entries(stateData)) {
        const stateFIPS = abbrToFIPS[stateAbbr];
        if (stateFIPS && values.length > 0) {
          const avgValue = values.reduce((s, v) => s + v, 0) / values.length;
          processedData[stateFIPS] = {
            value: avgValue,
            measure: selectedMeasure,
            locationName: stateAbbr
          };
        }
      }
      return processedData;
    } catch (error) {
      console.error('Error fetching CDC PLACES state data:', error);
      return {};
    }
  },

  // Get gradient color for health outcome percentage with dynamic scaling
  getHealthOutcomeColor(value, minVal = 0, maxVal = 100) {
    if (!value || isNaN(value)) return '#ddd';
    const range = maxVal - minVal;
    const normalizedValue = (value - minVal) / range;
    if (normalizedValue < 0.14) return '#fee5d9';
    if (normalizedValue < 0.29) return '#fcbba1';
    if (normalizedValue < 0.43) return '#fc9272';
    if (normalizedValue < 0.57) return '#fb6a4a';
    if (normalizedValue < 0.71) return '#ef3b2c';
    if (normalizedValue < 0.86) return '#cb181d';
    return '#99000d';
  },

  updateHealthLegend(data, measureName) {
    if (!data || Object.keys(data).length === 0) return;
    const values = Object.values(data).map(d => d.value).filter(v => !isNaN(v));
    if (values.length === 0) return;

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const range = dataMax - dataMin;

    let minVal, maxVal, step;
    if (range <= 4) {
      step = range <= 2 ? 0.5 : 1;
      minVal = Math.floor(dataMin * 2) / 2;
      maxVal = Math.ceil(dataMax * 2) / 2;
    } else if (range <= 10) {
      step = range <= 6 ? 1 : 2;
      minVal = Math.floor(dataMin);
      maxVal = Math.ceil(dataMax);
    } else if (range <= 25) {
      step = 5;
      minVal = Math.floor(dataMin / 5) * 5;
      maxVal = Math.ceil(dataMax / 5) * 5;
    } else if (range <= 50) {
      step = 10;
      minVal = Math.floor(dataMin / 10) * 10;
      maxVal = Math.ceil(dataMax / 10) * 10;
    } else {
      step = range <= 75 ? 15 : 20;
      minVal = Math.floor(dataMin / step) * step;
      maxVal = Math.ceil(dataMax / step) * step;
    }

    const thresholds = [];
    let current = minVal;
    while (thresholds.length <= 6 && current <= maxVal + step) {
      thresholds.push(current);
      current += step;
    }
    while (thresholds.length < 7) thresholds.push(thresholds[thresholds.length - 1] + step);

    const gradientTitle = document.getElementById('gradient-title');
    gradientTitle.textContent = `${measureName} %`;

    const healthGradient = document.getElementById('health-gradient');
    const colors = ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'];
    healthGradient.innerHTML = '';
    for (let i = 0; i < colors.length; i++) {
      const div = document.createElement('div');
      div.className = 'gradient-item';
      const colorBox = document.createElement('div');
      colorBox.className = 'color-box';
      colorBox.style.backgroundColor = colors[i];

      const formatNum = (num) => num % 1 === 0 ? num.toString() : num.toFixed(1);
      let label;
      if (i === 0) label = `< ${formatNum(thresholds[1])}%`;
      else if (i === colors.length - 1) label = `> ${formatNum(thresholds[i])}%`;
      else label = `${formatNum(thresholds[i])} - ${formatNum(thresholds[i + 1])}%`;

      div.appendChild(colorBox);
      div.appendChild(document.createTextNode(' ' + label));
      healthGradient.appendChild(div);
    }
  },

  // Enhanced color blending for better combined view visualization
  blendColors(color1, color2, ratio = 0.5) {
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    const rgbToHex = (r, g, b) =>
      "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return color1;

    const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio);
    const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio);
    const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio);
    return rgbToHex(r, g, b);
  },

  // New method: Get combined view color based on data relationship with weight control
  getCombinedColor(insuranceValue, healthValue, healthMin, healthMax) {
    if (!insuranceValue || !healthValue || isNaN(insuranceValue) || isNaN(healthValue)) {
      return '#f0f0f0'; // Light gray for missing data
    }

    // Normalize values to 0-1 scale
    const insuranceNorm = Math.max(0, Math.min(1, (insuranceValue - 50) / 50)); // 50-100% maps to 0-1
    const healthNorm = Math.max(0, Math.min(1, (healthValue - healthMin) / (healthMax - healthMin)));

    // Check if this is a prevention measure (high values are good)
    const isPreventionMeasure = this.isPreventionMeasure(selectedHealthMeasure);
    
    // Apply relationship weight (0-100, where 50 is balanced)
    const weightFactor = relationshipWeight / 100; // 0 to 1
    const insuranceWeight = weightFactor;
    const healthWeight = 1 - weightFactor;
    
    // Calculate weighted scores
    let goodnessScore;
    if (isPreventionMeasure) {
      // For prevention: high insurance + high prevention = good
      const insuranceScore = insuranceNorm * insuranceWeight;
      const healthScore = healthNorm * healthWeight;
      goodnessScore = (insuranceScore + healthScore) - 0.5; // Range from -0.5 to +0.5
    } else {
      // For health issues: high insurance + low health issues = good
      const insuranceScore = insuranceNorm * insuranceWeight;
      const healthScore = (1 - healthNorm) * healthWeight; // Invert health for issues (low is good)
      goodnessScore = (insuranceScore + healthScore) - 0.5; // Range from -0.5 to +0.5
    }
    
    // Simple binary decision: positive score = green, negative score = red
    return goodnessScore >= 0 ? '#22c55e' : '#dc2626';
  },

  // Helper method to check if a measure is a prevention measure
  isPreventionMeasure(measure) {
    const preventionMeasures = [
      'CHECKUP', 'CHOLSCREEN', 'DENTAL', 'MAMMOUSE', 'CERVICAL'
    ];
    return preventionMeasures.includes(measure);
  },

  // Helper method for color interpolation
  interpolateColor(color1, color2, factor) {
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    const rgbToHex = (r, g, b) =>
      "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return color1;

    const r = Math.round(rgb1.r * (1 - factor) + rgb2.r * factor);
    const g = Math.round(rgb1.g * (1 - factor) + rgb2.g * factor);
    const b = Math.round(rgb1.b * (1 - factor) + rgb2.b * factor);
    return rgbToHex(r, g, b);
  },

  updateCombinedLegend(measureName) {
    const healthGradient = document.getElementById('health-gradient');
    
    // Clear existing content and replace with combined legend
    healthGradient.innerHTML = '';

    // Check if this is a prevention measure
    const isPrevention = this.isPreventionMeasure(selectedHealthMeasure);
    
    // Get weight description
    let weightDescription = '';
    if (relationshipWeight < 25) {
      weightDescription = 'Health-focused view';
    } else if (relationshipWeight < 40) {
      weightDescription = 'Health-leaning view';
    } else if (relationshipWeight < 60) {
      weightDescription = 'Balanced view';
    } else if (relationshipWeight < 75) {
      weightDescription = 'Insurance-leaning view';
    } else {
      weightDescription = 'Insurance-focused view';
    }
    
    // Simple binary color scheme
    const examples = [
      { 
        color: '#22c55e', 
        desc: 'Good', 
        short: 'Favorable combination' 
      },
      { 
        color: '#dc2626', 
        desc: 'Concerning', 
        short: 'Unfavorable combination' 
      }
    ];

    let examplesHTML = '';
    examples.forEach(example => {
      examplesHTML += `
        <div class="gradient-item" style="display:flex; align-items:center; margin:3px 0; font-size:10px;">
          <div class="color-box" style="background:${example.color}; width:16px; height:16px; border-radius:3px; border:1px solid #ccc; margin-right:8px; display:inline-block;"></div>
          <span style="font-weight:600; margin-right:4px;">${example.desc}:</span>
          <span style="color:#64748b; font-size:9px;">${example.short}</span>
        </div>`;
    });

    const combinedLegendDiv = document.createElement('div');
    combinedLegendDiv.className = 'combined-legend';
    combinedLegendDiv.innerHTML = `
      <div style="font-weight:600; font-size:11px; color:#374151; margin-bottom:6px;">
        📊 Combined: Insurance & ${measureName}
      </div>
      <div style="font-size:10px; color:#64748b; margin-bottom:8px; font-style:italic;">
        ${weightDescription} (${relationshipWeight}% insurance weight)
      </div>
      ${examplesHTML}
      <div style="margin-top:6px; padding:4px; background:rgba(59, 130, 246, 0.1); border-radius:3px; font-size:9px; color:#1e40af;">
        💡 Adjust the relationship slider to change the weighting
      </div>
    `;

    healthGradient.appendChild(combinedLegendDiv);
  },

  formatCombinedPopup(insuranceData, healthData, locationName) {
    let content = `<b>${locationName}</b><br>`;
    if (insuranceData) {
      content += `<div style="margin:5px 0;"><strong>Insurance Coverage:</strong> ${insuranceData.toFixed(1)}%</div>`;
    }
    if (healthData) {
      const measureName = healthMeasureSelect.options[healthMeasureSelect.selectedIndex].text;
      content += `<div style="margin:5px 0; border-top:1px solid #ddd; padding-top:5px;"><strong>${measureName}:</strong> ${healthData.value.toFixed(1)}%</div>`;
    }
    return content;
  }
};

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

async function loadGeoJSON() {
  const url = mapLevel === 'state'
    ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
    : 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
  const response = await fetch(url);
  return await response.json();
}

async function fetchData() {
  try {
    const isState = mapLevel === 'state';
    const geoClause = isState ? 'for=state:*' : 'for=county:*&in=state:*';
    const raceParam = isState && raceCat !== '0' ? `&RACECAT=${raceCat}` : '';
    const getParams = isState
      ? 'get=NAME,PCTIC_PT,STATE'
      : 'get=NAME,PCTIC_PT,STATE,COUNTY';

    const url = `https://api.census.gov/data/timeseries/healthins/sahie?${getParams}&${geoClause}&AGECAT=${ageCat}&SEXCAT=${sexCat}&IPRCAT=${iprCat}${raceParam}&time=${selectedYear}`;
    const response = await fetch(url);
    const data = await response.json();

    dataStore = {};
    const rows = data.slice(1);
    rows.forEach(row => {
      const stateFIPS = row[2];
      const key = isState ? stateFIPS : `${stateFIPS}${row[3]}`.padStart(5, '0');
      const percentInsured = parseFloat(row[1]);
      if (!isNaN(percentInsured)) dataStore[key] = percentInsured;
    });

    // Fetch PLACES data if needed for the current layer or if scatter view needs it
    if (dataLayer === 'health' || dataLayer === 'combined' || viewMode === 'scatter') {
      await fetchPlacesData();
    }

    // Use unified rerender so map or scatter updates as needed
    await afterDataChangeRerender();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function renderMap() {
  const geojson = await loadGeoJSON();
  buildFipsNameCache(geojson);

  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  // Calculate min/max for health data if needed
  let healthMinMax = { min: 0, max: 100 };
  if ((dataLayer === 'health' || dataLayer === 'combined') && placesDataStore) {
    const healthValues = Object.values(placesDataStore).map(d => d.value).filter(v => !isNaN(v));
    if (healthValues.length > 0) {
      healthMinMax.min = Math.min(...healthValues);
      healthMinMax.max = Math.max(...healthValues);
    }
  }

  geoJsonLayer = L.geoJSON(geojson, {
    style: feature => {
      const fips = mapLevel === 'state'
        ? feature.id.padStart(2, '0')
        : feature.properties.GEO_ID.replace('0500000US', '');
      const percentInsured = dataStore[fips];
      const healthData = placesDataStore[fips];

      let fillColor, weight, color, dashArray;
      if (dataLayer === 'insurance') {
        fillColor = handleGradientColor(percentInsured);
        weight = 1; color = 'white'; dashArray = '3';
      } else if (dataLayer === 'health') {
        fillColor = healthData ? CDCPlaces.getHealthOutcomeColor(healthData.value, healthMinMax.min, healthMinMax.max) : '#ddd';
        weight = 1; color = 'white'; dashArray = '3';
      } else {
        // Use the new combined color scheme for better visualization
        fillColor = CDCPlaces.getCombinedColor(percentInsured, healthData?.value, healthMinMax.min, healthMinMax.max);
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
      const fips = mapLevel === 'state'
        ? feature.id.padStart(2, '0')
        : feature.properties.GEO_ID.replace('0500000US', '');

      const label = nameForFIPS(fips);            //  cached, O(1)
      const percentInsured = dataStore[fips] ?? 'N/A';
      const healthData = placesDataStore[fips];

      let popupContent;
      if (dataLayer === 'insurance') {
        popupContent = `<b>${label}</b><br>Insurance Coverage: ${percentInsured || percentInsured === 0 ? percentInsured + '%' : 'N/A'}`;
      } else if (dataLayer === 'health' && healthData) {
        popupContent = CDCPlaces.formatCombinedPopup(null, healthData, label);
      } else if (dataLayer === 'combined') {
        popupContent = CDCPlaces.formatCombinedPopup(
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
  }).addTo(map);
}

// Search helpers
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = '';

  if (!query || !geoJsonLayer) {
    searchResults.style.display = 'none';
    return;
  }

  const matches = [];
  geoJsonLayer.eachLayer(layer => {
    const props = layer.feature.properties;
    const name = mapLevel === 'state'
      ? props.name
      : `${props.NAME}, ${stateFIPSMapping[props.STATE] || 'Unknown'}`;
    if (name.toLowerCase().startsWith(query)) matches.push({ name, layer });
  });

  if (matches.length > 0) {
    matches.forEach(match => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.textContent = match.name;
      div.onclick = () => {
        map.fitBounds(match.layer.getBounds());
        match.layer.openPopup();
        searchResults.style.display = 'none';
        searchInput.value = match.name;
      };
      searchResults.appendChild(div);
    });
    searchResults.style.display = 'block';
  } else {
    searchResults.style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.style.display = 'none';
  }
});

// Clear button for search bar
const searchClearBtn = document.getElementById('searchClear');
if (searchClearBtn && searchInput) {
  const toggleClear = () => {
    searchClearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';
  };
  searchInput.addEventListener('input', toggleClear);
  toggleClear(); // initialize

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    toggleClear();
    searchResults.style.display = 'none';
    // Optional: zoom out / reset if you want
    // map.setView([37.5, -100], mapLevel === 'state' ? 4 : 4);
  });
}



healthMeasureSelect.addEventListener('change', async () => {
  selectedHealthMeasure = healthMeasureSelect.value;
  
  // Clear existing health data to force fresh fetch
  placesDataStore = {};
  
  await fetchPlacesData();

  if (placesDataStore) {
    const measureName = healthMeasureSelect.options[healthMeasureSelect.selectedIndex].text;
    CDCPlaces.updateHealthLegend(placesDataStore, measureName);
    if (dataLayer === 'combined') CDCPlaces.updateCombinedLegend(measureName);
  }

  await afterDataChangeRerender();
});

async function fetchPlacesData() {
  if (mapLevel === 'state') {
    placesDataStore = await CDCPlaces.fetchStateData(selectedHealthMeasure);
  } else if (mapLevel === 'county') {
    placesDataStore = await CDCPlaces.fetchCountyData(selectedHealthMeasure);
  } else {
    placesDataStore = {};
  }
}

// Play animation
playButton.addEventListener('click', () => {
  if (isPlaying) {
    clearInterval(animationInterval);
    playButton.textContent = '▶ Play';
    isPlaying = false;
  } else {
    isPlaying = true;
    playButton.textContent = '⏸ Pause';

    // Start from the minimum year (2006)
    let nextYear = parseInt(yearSlider.min, 10);
    yearSlider.value = nextYear;
    yearValue.textContent = nextYear;
    selectedYear = nextYear;
    fetchData();

    animationInterval = setInterval(() => {
      nextYear++;
      if (nextYear > parseInt(yearSlider.max, 10)) {
        clearInterval(animationInterval);
        playButton.textContent = '▶ Play';
        isPlaying = false;
        return;
      }
      yearSlider.value = nextYear;
      yearValue.textContent = nextYear;
      selectedYear = nextYear;
      fetchData();
    }, 500);
  }
});

// Filters
ageSelect.addEventListener('change', async () => { 
  ageCat = ageSelect.value; 
  await fetchData();
});
sexSelect.addEventListener('change', async () => { 
  sexCat = sexSelect.value; 
  await fetchData();
});
iprSelect.addEventListener('change', async () => { 
  iprCat = iprSelect.value; 
  await fetchData();
});
raceSelect.addEventListener('change', async () => { 
  raceCat = raceSelect.value; 
  await fetchData();
});

yearSlider.addEventListener('input', async () => {
  selectedYear = yearSlider.value;
  yearValue.textContent = selectedYear;
  await fetchData();
});

// Relationship slider event handler
relationshipSlider.addEventListener('input', async () => {
  relationshipWeight = parseInt(relationshipSlider.value);
  relationshipValue.textContent = relationshipWeight + '%';
  
  // Update description based on weight
  let description = '';
  if (relationshipWeight < 25) {
    description = 'Health-focused: Primarily shows health outcome patterns';
  } else if (relationshipWeight < 40) {
    description = 'Health-leaning: Emphasizes health outcomes with some insurance influence';
  } else if (relationshipWeight < 60) {
    description = 'Balanced view: Equal weight to both factors';
  } else if (relationshipWeight < 75) {
    description = 'Insurance-leaning: Emphasizes insurance with some health influence';
  } else {
    description = 'Insurance-focused: Primarily shows insurance coverage patterns';
  }
  sliderDescription.textContent = description;
  
  // Re-render the visualization with new weight
  await afterDataChangeRerender();
});

// Geography level change (single consolidated handler)
levelSelect.addEventListener('change', async () => {
  mapLevel = levelSelect.value;

  if (!mapLevel) {
    filterOptions.style.display = 'none';
    layerSelection.style.display = 'none';
    selectPrompt.style.display = 'block';
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    await updateAnalyticsPanel(); // Update analytics panel even when no level selected
    return;
  }

  selectPrompt.style.display = 'none';
  layerSelection.style.display = 'block';
  filterOptions.style.display = 'block';

  if (mapLevel === 'state') {
    raceWrapper.style.display = 'block';
    raceNote.style.display = 'block';
    searchLabel.textContent = "Search State:";
  } else {
    raceWrapper.style.display = 'none';
    raceNote.style.display = 'none';
    raceCat = 0;
    searchLabel.textContent = "Search County:";
  }

  // Clear existing data stores to force fresh data fetch
  dataStore = {};
  placesDataStore = {};
  fipsNameCache = {}; // Clear name cache too
  
  // Clear global analytics data to force recalculation
  globalAnalyticsData = {
    correlation: 0,
    pointCount: 0,
    xRange: [0, 0],
    yRange: [0, 0],
    regression: { a: 0, b: 0 }
  };
  
  // Fetch new data and re-render (afterDataChangeRerender will handle scatterplot update)
  await fetchData();
  
  // Build name cache for the new geography level
  if (viewMode === 'scatter') {
    const geojson = await loadGeoJSON();
    buildFipsNameCache(geojson);
  }
});

// Layer selection buttons
document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active state
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update data layer
    dataLayer = btn.dataset.layer;
    
    // Show/hide view mode toggle based on layer
    if (dataLayer === 'combined') {
      viewModeToggle.style.display = 'block';
    } else {
      viewModeToggle.style.display = 'none';
      viewMode = 'map'; // Force map view for single layers
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
    viewMode = btn.dataset.view;
    
    // Update visibility and render
    updateViewVisibility();
    if (viewMode === 'scatter') renderScatterplot();
    else renderMap();
  });
});

// Handle data layer change
async function handleDataLayerChange() {
  // Show/hide health measure selector
  if (dataLayer === 'health' || dataLayer === 'combined') {
    healthMeasureWrapper.style.display = 'block';
    await fetchPlacesData();
  } else {
    healthMeasureWrapper.style.display = 'none';
    // Scatter view needs PLACES for y-axis, ensure we have it
    if (viewMode === 'scatter' && (!placesDataStore || Object.keys(placesDataStore).length === 0)) {
      await fetchPlacesData();
    }
  }

  // Show/hide relationship slider (only for combined view)
  if (dataLayer === 'combined') {
    relationshipSliderWrapper.style.display = 'block';
  } else {
    relationshipSliderWrapper.style.display = 'none';
  }

  // Update gradient display
  if (dataLayer === 'health') {
    const measureName = healthMeasureSelect.options[healthMeasureSelect.selectedIndex].text;
    CDCPlaces.updateHealthLegend(placesDataStore, measureName);
    insuranceGradient.style.display = 'none';
    healthGradient.style.display = 'block';
    gradientTitle.textContent = `${measureName} %`;
  } else if (dataLayer === 'combined') {
    gradientTitle.textContent = 'Combined View';
    insuranceGradient.style.display = 'none'; // Hide old insurance gradient
    healthGradient.style.display = 'block'; // Show only the combined legend
    if (placesDataStore) {
      const measureName = healthMeasureSelect.options[healthMeasureSelect.selectedIndex].text;
      CDCPlaces.updateCombinedLegend(measureName);
    }
  } else {
    gradientTitle.textContent = 'Insurance Coverage %';
    insuranceGradient.style.display = 'block';
    healthGradient.style.display = 'none';
  }

  const showYearControls = dataLayer === 'insurance';
  yearSlider.style.display = showYearControls ? 'block' : 'none';
  playButton.style.display = showYearControls ? 'inline-flex' : 'none';
  document.querySelector('label[for="yearSlider"]').style.display =
  showYearControls ? 'block' : 'none';
  await afterDataChangeRerender();
  applyAnalyticsLayoutForLayer();
}

function updateViewVisibility() {
  const mapEl = document.getElementById('map');
  if (!mapEl || !scatterContainer) return;
  if (viewMode === 'scatter') {
    scatterContainer.style.display = 'block';
    mapEl.style.display = 'none';
    // Add scatter-view class to analytics panel
    if (analyticsPanel) {
      analyticsPanel.classList.add('scatter-view');
    }
  } else {
    scatterContainer.style.display = 'none';
    mapEl.style.display = 'block';
    // Remove scatter-view class from analytics panel
    if (analyticsPanel) {
      analyticsPanel.classList.remove('scatter-view');
    }
  }
}

async function ensureScatterDependencies() {
  if (viewMode !== 'scatter') return;
  // Scatter always needs PLACES data for y-axis
  if (!placesDataStore || Object.keys(placesDataStore).length === 0) {
    await fetchPlacesData();
  }
}

// Build a unified dataset for scatter: Insurance (x) vs Health measure (y)
function buildScatterData() {
  const points = [];
  const isState = mapLevel === 'state';

  // Only build scatter data for combined view or when both datasets are available
  if (dataLayer === 'insurance' && (!placesDataStore || Object.keys(placesDataStore).length === 0)) {
    return []; // No health data available
  }
  if (dataLayer === 'health' && (!dataStore || Object.keys(dataStore).length === 0)) {
    return []; // No insurance data available
  }

  // Try to grab names from current geojson for nicer labels
  const geojson = geoJsonLayer ? geoJsonLayer.toGeoJSON() : null;
  const nameByFips = {};
  if (geojson && geojson.features) {
    for (const f of geojson.features) {
      const fips = isState
        ? (f.id || '').toString().padStart(2, '0')
        : (f.properties?.GEO_ID || '').replace('0500000US', '');
      const stateName = isState ? '' : (stateFIPSMapping[f.properties?.STATE] || '');
      const label = isState ? (f.properties?.name || '') : `${f.properties?.NAME || ''}, ${stateName}`;
      if (fips) nameByFips[fips] = label;
    }
  }

  // Debug logging to see what data we have
  console.log('Building scatter data:', {
    mapLevel,
    dataStoreKeys: Object.keys(dataStore).length,
    placesDataStoreKeys: Object.keys(placesDataStore || {}).length,
    isState
  });

  for (const [fips, insured] of Object.entries(dataStore)) {
    const health = placesDataStore?.[fips];
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
  if (!scatterContainer) return;

  const W = scatterContainer.clientWidth || 900;
  const H = scatterContainer.clientHeight || 520;
  const margin = { top: 28, right: 20, bottom: 48, left: 56 };
  const w = Math.max(320, W - margin.left - margin.right);
  const h = Math.max(220, H - margin.top - margin.bottom);

  const pts = buildScatterData();

  scatterContainer.innerHTML = '';
  if (scatterTooltip) scatterTooltip.style.display = 'none';

  if (!pts.length) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#444; font-size:14px; text-align:center; padding:20px;';
    
    let messageText = '';
    if (dataLayer === 'insurance') {
      messageText = '📊 Scatterplot requires both Insurance and Health data\n\nSwitch to "Combined View" to see the relationship between insurance coverage and health outcomes.';
    } else if (dataLayer === 'health') {
      messageText = '📊 Scatterplot requires both Insurance and Health data\n\nSwitch to "Combined View" to see the relationship between insurance coverage and health outcomes.';
    } else {
      messageText = 'No overlapping data to plot yet. Try switching layers or measures after data loads.';
    }
    
    msg.innerHTML = messageText.replace(/\n/g, '<br>');
    scatterContainer.appendChild(msg);
    return;
  }

  // Store original data for highlighting
  window.scatterData = pts;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.style.cursor = 'grab';
  scatterContainer.appendChild(svg);

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
  const measureName = healthMeasureSelect.options[healthMeasureSelect.selectedIndex].text;
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
    dot.setAttribute('r', mapLevel === 'state' ? 4.5 : 3.0);
    
    // Use the new combined color scheme for scatterplot points
    const pointColor = CDCPlaces.getCombinedColor(p.x, p.y, healthMin, healthMax);
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
      if (!scatterTooltip) return;
      scatterTooltip.style.display = 'block';
      
      // Determine category for the tooltip based on values
      const highInsurance = p.x >= 75; // Consider 75%+ as high insurance
      const isPrevention = CDCPlaces.isPreventionMeasure(selectedHealthMeasure);
      
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
      
      scatterTooltip.innerHTML = `
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
      if (!scatterTooltip) return;
      const rect = scatterContainer.getBoundingClientRect();
      scatterTooltip.style.left = `${e.clientX - rect.left + 10}px`;
      scatterTooltip.style.top = `${e.clientY - rect.top + 8}px`;
    });
    dot.addEventListener('mouseleave', (e) => {
      e.stopPropagation(); // Prevent triggering pan
      if (!scatterTooltip) return;
      scatterTooltip.style.display = 'none';
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
  globalAnalyticsData = {
    correlation: correlation,
    pointCount: pts.length,
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)],
    regression: { a: b0, b: b1 }
  };
  
  console.log('Scatterplot updated globalAnalyticsData:', globalAnalyticsData);
  
  console.log('Correlation calculated:', {
    mapLevel,
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
  if (!window.scatterData || viewMode !== 'scatter') return;
  
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
    const containerRect = scatterContainer.getBoundingClientRect();
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
  if (viewMode === 'scatter') {
    renderScatterplot();
  }
}

// Unified rerender so we always draw the right view
async function afterDataChangeRerender() {
  await ensureScatterDependencies();
  updateViewVisibility();
  if (viewMode === 'scatter') {
    console.log('Before renderScatterplot - globalAnalyticsData:', globalAnalyticsData);
    renderScatterplot();
    console.log('After renderScatterplot - globalAnalyticsData:', globalAnalyticsData);
  } else {
    renderMap();
  }
  console.log('Before updateAnalyticsPanel - globalAnalyticsData:', globalAnalyticsData);
  await updateAnalyticsPanel();
}

// Ensure we update scatter on window resize
window.addEventListener('resize', () => {
  if (viewMode === 'scatter') renderScatterplot();
});

// Override fetchPlacesData during scatter to trigger redraw after load
const _origFetchPlacesData = fetchPlacesData;
fetchPlacesData = async function () {
  const res = await _origFetchPlacesData.call(this);
  if (viewMode === 'scatter') renderScatterplot();
  return res;
};
/* ============================
   Analytics Panel Utilities
   ============================ */

/** Show panel once app is ready */
function ensureAnalyticsPanelVisible() {
  const el = document.getElementById('analyticsPanel');
  if (el) el.style.display = 'block';
}

/** Safe number formatting */
const fmt = (v, d = 1) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d) + '%');

/** Quantiles on sorted copy */
function quantiles(arr) {
  if (!arr.length) return { q1: NaN, med: NaN, q3: NaN };
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => {
    const pos = (a.length - 1) * p;
    const base = Math.floor(pos), rest = pos - base;
    if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
    return a[base];
  };
  return { q1: q(0.25), med: q(0.5), q3: q(0.75) };
}

/** Basic stats */
function summarize(values) {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v));
  const n = clean.length;
  if (n === 0) return { n: 0, missing: values.length, min: NaN, max: NaN, mean: NaN, std: NaN, q1: NaN, med: NaN, q3: NaN };
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const mean = clean.reduce((s, v) => s + v, 0) / n;
  const { q1, med, q3 } = quantiles(clean);
  const variance = clean.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  return { n, missing: values.length - n, min, max, mean, std, q1, med, q3 };
}

let fipsNameCache = {}; // FIPS -> "County, State" or "State"

function buildFipsNameCache(geojson) {
  fipsNameCache = {};
  const isState = mapLevel === 'state';
  for (const f of geojson.features) {
    const fips = isState
      ? (f.id || '').toString().padStart(2, '0')
      : (f.properties?.GEO_ID || '').replace('0500000US', '');
    if (!fips) continue;
    const stateName = isState ? '' : (stateFIPSMapping[f.properties?.STATE] || '');
    const label = isState
      ? (f.properties?.name || stateFIPSMapping[fips] || fips)
      : `${f.properties?.NAME || ''}, ${stateName}`.trim();
    fipsNameCache[fips] = label || fips;
  }
}

function nameForFIPS(fips) {
  return fipsNameCache[fips] || placesDataStore[fips]?.locationName || fips;
}


/** Build a joined dataset for Combined view and for correlation */
function buildJoinedRows() {
  const rows = [];
  for (const [fips, ins] of Object.entries(dataStore || {})) {
    const h = placesDataStore?.[fips]?.value;
    if (typeof ins === 'number' && typeof h === 'number') {
      rows.push({ fips, name: nameForFIPS(fips), insurance: ins, health: h });
    }
  }
  return rows;
}

/** Correlation and regression on x=insurance, y=health */
function corrAndReg(rows) {
  if (!rows.length) return { r: NaN, a: NaN, b: NaN };
  const xs = rows.map(r => r.insurance), ys = rows.map(r => r.health);
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < rows.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const r = sxy / Math.sqrt((sxx || 1e-9) * (syy || 1e-9));
  const b = sxy / (sxx || 1e-9);
  const a = my - b * mx;
  return { r, a, b };
}

/** Create Top/Bottom 5 for a metric */
function topBottom(items, key, take = 5) {
  const clean = items.filter(x => typeof x[key] === 'number' && !isNaN(x[key]));
  clean.sort((a, b) => b[key] - a[key]);
  return {
    top: clean.slice(0, take),
    bottom: clean.slice(-take).reverse()
  };
}

/** Update panel content based on current layer and scope */
async function updateAnalyticsPanel() {
  ensureAnalyticsPanelVisible();

  // Ensure FIPS name cache is built for current geography level
  if (Object.keys(fipsNameCache).length === 0 && mapLevel) {
    const geojson = await loadGeoJSON();
    buildFipsNameCache(geojson);
  }

  const layer = dataLayer; // 'insurance' | 'health' | 'combined'
  const scope = mapLevel || '—';
  const year = selectedYear || '—';
  const measureText = healthMeasureSelect.options[healthMeasureSelect.selectedIndex]?.text || '';

  // Badges
  document.getElementById('apLayerBadge').textContent =
    layer === 'insurance' ? 'Insurance' :
    layer === 'health' ? 'Health' : 'Combined';
  document.getElementById('apScopeBadge').textContent = scope === 'state' ? 'State' : scope === 'county' ? 'County' : '—';
  document.getElementById('apYearBadge').textContent = `Year ${year}`;

  const measBadge = document.getElementById('apMeasureBadge');
  if (layer === 'health' || layer === 'combined') {
    measBadge.style.display = 'inline-block';
    measBadge.textContent = measureText;
  } else {
    measBadge.style.display = 'none';
  }

  // Compute stats depending on layer
  let values = [];
  let minLoc = '—', maxLoc = '—';
  let rows = [];
  let insVals = []; // Declare insVals at top level

  console.log('Analytics panel data check:', {
    mapLevel,
    dataLayer,
    dataStoreKeys: Object.keys(dataStore || {}).length,
    placesDataStoreKeys: Object.keys(placesDataStore || {}).length,
    fipsNameCacheKeys: Object.keys(fipsNameCache).length
  });

  if (layer === 'insurance') {
    rows = Object.entries(dataStore || {}).map(([fips, v]) => ({ fips, name: nameForFIPS(fips), value: v }));
    values = rows.map(r => r.value);
    console.log('Insurance layer - rows:', rows.length, 'values:', values.length);
    const tb = topBottom(rows, 'value');
    if (tb.top[0]) maxLoc = `${tb.top[0].name} (${fmt(tb.top[0].value)})`;
    if (tb.bottom[0]) minLoc = `${tb.bottom[0].name} (${fmt(tb.bottom[0].value)})`;
    renderTopBottom(tb);
  } else if (layer === 'health') {
    rows = Object.entries(placesDataStore || {}).map(([fips, obj]) => ({ fips, name: nameForFIPS(fips), value: obj?.value }));
    values = rows.map(r => r.value);
    console.log('Health layer - rows:', rows.length, 'values:', values.length);
    const tb = topBottom(rows, 'value');
    if (tb.top[0]) maxLoc = `${tb.top[0].name} (${fmt(tb.top[0].value)})`;
    if (tb.bottom[0]) minLoc = `${tb.bottom[0].name} (${fmt(tb.bottom[0].value)})`;
    renderTopBottom(tb);
  } else {
    // ===== Combined: split stats (Insurance vs Health) + correlation =====
    // Use the same data source as scatterplot for consistency
    const scatterData = buildScatterData();
    console.log('Combined layer - scatterData:', scatterData.length);
    const joined = scatterData.map(p => ({
      fips: p.fips,
      name: p.name,
      insurance: p.x,
      health: p.y
    }));
    
    insVals = joined.map(x => x.insurance).filter(v => typeof v === 'number' && !isNaN(v));
    const hlthVals = joined.map(x => x.health).filter(v => typeof v === 'number' && !isNaN(v));
    console.log('Combined layer - joined:', joined.length, 'insVals:', insVals.length, 'hlthVals:', hlthVals.length);
    
    // Override values array to use scatterplot data for all statistics
    values = insVals;

    // Use global analytics data from scatterplot if available, otherwise calculate
    let r, a, b;
    if (globalAnalyticsData.pointCount > 0) {
      r = globalAnalyticsData.correlation;
      a = globalAnalyticsData.regression.a;
      b = globalAnalyticsData.regression.b;
      console.log('Analytics panel using global data:', {
        mapLevel,
        correlation: r.toFixed(3),
        pointCount: globalAnalyticsData.pointCount,
        joinedLength: joined.length
      });
    } else {
      const corrData = corrAndReg(joined);
      r = corrData.r;
      a = corrData.a;
      b = corrData.b;
      console.log('Analytics panel calculating correlation:', {
        mapLevel,
        correlation: r.toFixed(3),
        pointCount: joined.length
      });
    }
    // Correlation is always visible in combined view now
    document.getElementById('apCorr').textContent = isFinite(r) ? r.toFixed(2) : '—';
    document.getElementById('apReg').textContent = (isFinite(a) && isFinite(b)) ? `y = ${a.toFixed(2)} + ${b.toFixed(2)}·x` : '—';

    // Prepare top/bottom (Insurance)
    const insItems = joined.map(x => ({ fips: x.fips, name: x.name, value: x.insurance }));
    const tbIns = topBottom(insItems, 'value');
    // Prepare top/bottom (Health)
    const hlthItems = joined.map(x => ({ fips: x.fips, name: x.name, value: x.health }));
    const tbHlth = topBottom(hlthItems, 'value');

    // Summary cards — INSURANCE
    const sIns = summarize(insVals);
    // Count and Missing are not shown in compact view
    document.getElementById('apMeanIns').textContent = fmt(sIns.mean);
    document.getElementById('apStdIns').textContent = isNaN(sIns.std) ? '—' : sIns.std.toFixed(1) + '%';
    document.getElementById('apMedianIns').textContent = fmt(sIns.med);
    // Q1 and Q3 are not shown in compact view
    document.getElementById('apMinIns').textContent = fmt(sIns.min);
    document.getElementById('apMaxIns').textContent = fmt(sIns.max);
    renderTopBottomInto('apTopListIns', 'apBottomListIns', tbIns);

    // Summary cards — HEALTH
    const sHlth = summarize(hlthVals);
    // Count and Missing are not shown in compact view
    document.getElementById('apMeanHlth').textContent = fmt(sHlth.mean);
    document.getElementById('apStdHlth').textContent = isNaN(sHlth.std) ? '—' : sHlth.std.toFixed(1) + '%';
    document.getElementById('apMedianHlth').textContent = fmt(sHlth.med);
    // Q1 and Q3 are not shown in compact view
    document.getElementById('apMinHlth').textContent = fmt(sHlth.min);
    document.getElementById('apMaxHlth').textContent = fmt(sHlth.max);
    renderTopBottomInto('apTopListHlth', 'apBottomListHlth', tbHlth);

    // Update the single view elements when in combined mode (for consistency)
    // These are hidden but we update them to avoid errors if view switches
    const apCount = document.getElementById('apCount');
    const apMissing = document.getElementById('apMissing');
    const apMean = document.getElementById('apMean');
    const apStd = document.getElementById('apStd');
    const apMedian = document.getElementById('apMedian');
    const apQ1 = document.getElementById('apQ1');
    const apQ3 = document.getElementById('apQ3');
    const apMin = document.getElementById('apMin');
    const apMax = document.getElementById('apMax');
    
    if (apCount) apCount.textContent = sIns.n.toString();
    if (apMissing) apMissing.textContent = `Missing: ${insItems.length - sIns.n}`;
    if (apMean) apMean.textContent = fmt(sIns.mean);
    if (apStd) apStd.textContent = isNaN(sIns.std) ? '—' : sIns.std.toFixed(2) + '%';
    if (apMedian) apMedian.textContent = fmt(sIns.med);
    if (apQ1) apQ1.textContent = fmt(sIns.q1);
    if (apQ3) apQ3.textContent = fmt(sIns.q3);
    if (apMin) apMin.textContent = fmt(sIns.min);
    if (apMax) apMax.textContent = fmt(sIns.max);
    
    // Update top/bottom lists for single view (hidden in combined mode)
    const apTopList = document.getElementById('apTopList');
    const apBottomList = document.getElementById('apBottomList');
    if (apTopList && apBottomList) {
      renderTopBottom(tbIns);
    }

    applyAnalyticsLayoutForLayer();
    return;
    }


  // Single/Combined view is now handled by applyAnalyticsLayoutForLayer

  // Summary cards
  console.log('Analytics panel summary check:', {
    layer,
    mapLevel,
    globalAnalyticsDataPointCount: globalAnalyticsData.pointCount,
    valuesLength: values.length,
    insValsLength: insVals ? insVals.length : 'undefined'
  });
  
  const s = summarize(values);
  
  // Update single metric view elements with safe access
  const apCountEl = document.getElementById('apCount');
  const apMissingEl = document.getElementById('apMissing');
  const apMeanEl = document.getElementById('apMean');
  const apStdEl = document.getElementById('apStd');
  const apMedianEl = document.getElementById('apMedian');
  const apQ1El = document.getElementById('apQ1');
  const apQ3El = document.getElementById('apQ3');
  const apMinEl = document.getElementById('apMin');
  const apMaxEl = document.getElementById('apMax');
  
  // Set count - use global data for combined view, calculated data for others
  if (apCountEl) {
    if (layer === 'combined' && globalAnalyticsData.pointCount > 0) {
      apCountEl.textContent = globalAnalyticsData.pointCount.toString();
      console.log('Using global analytics data for count:', globalAnalyticsData.pointCount);
    } else {
      apCountEl.textContent = s.n.toString();
      console.log('Using calculated data for count:', s.n);
    }
  }
  
  if (apMissingEl) apMissingEl.textContent = `Missing: ${s.missing}`;
  if (apMeanEl) apMeanEl.textContent = fmt(s.mean);
  if (apStdEl) apStdEl.textContent = isNaN(s.std) ? '—' : s.std.toFixed(2) + '%';
  if (apMedianEl) apMedianEl.textContent = fmt(s.med);
  if (apQ1El) apQ1El.textContent = fmt(s.q1);
  if (apQ3El) apQ3El.textContent = fmt(s.q3);
  if (apMinEl) apMinEl.textContent = fmt(s.min);
  if (apMaxEl) apMaxEl.textContent = fmt(s.max);
  applyAnalyticsLayoutForLayer();

}
/** Legacy helper: renders Top/Bottom lists for single layer views */
function renderTopBottom(tb) {
  const topEl = document.getElementById('apTopList');
  const botEl = document.getElementById('apBottomList');
  if (!topEl || !botEl) return;
  topEl.innerHTML = ''; botEl.innerHTML = '';
  tb.top.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    topEl.appendChild(li);
  });
  tb.bottom.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    botEl.appendChild(li);
  });
}


/** Render Top/Bottom lists */
function renderTopBottomInto(topId, bottomId, tb) {
  const topEl = document.getElementById(topId);
  const botEl = document.getElementById(bottomId);
  if (!topEl || !botEl) return;
  topEl.innerHTML = ''; botEl.innerHTML = '';
  tb.top.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    topEl.appendChild(li);
  });
  tb.bottom.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name}: ${fmt(item.value)}`;
    botEl.appendChild(li);
  });
}


/** Collapse/Expand */
(function wireAnalyticsToggle() {
  const btn = document.getElementById('apToggle');
  const body = document.getElementById('apBody');
  if (!btn || !body) return;
  btn.addEventListener('click', () => {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? '−' : '+';
  });
})();
// Analytics panel reference
const analyticsPanel = document.getElementById('analyticsPanel');
// View mode elements
const singleMetricView = document.getElementById('singleMetricView');
const combinedMetricView = document.getElementById('combinedMetricView');
const healthMeasureTitle = document.getElementById('healthMeasureTitle');

// Update views based on data layer
function applyAnalyticsLayoutForLayer() {
  if (!singleMetricView || !combinedMetricView) return;
  
  if (dataLayer === 'combined') {
    // Show combined view, hide single view
    singleMetricView.style.display = 'none';
    combinedMetricView.style.display = 'block';
    
    // Update health measure title
    if (healthMeasureTitle) {
      healthMeasureTitle.textContent = healthMeasureSelect.options[healthMeasureSelect.selectedIndex]?.text || 'Health Measure';
    }
  } else {
    // Show single view, hide combined view
    singleMetricView.style.display = 'block';
    combinedMetricView.style.display = 'none';
  }
}


// State FIPS mapping code to state
const stateFIPSMapping = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California",
  "08": "Colorado", "09": "Connecticut", "10": "Delaware", "11": "District of Columbia",
  "12": "Florida", "13": "Georgia", "15": "Hawaii", "16": "Idaho", "17": "Illinois",
  "18": "Indiana", "19": "Iowa", "20": "Kansas", "21": "Kentucky", "22": "Louisiana",
  "23": "Maine", "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota",
  "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada",
  "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico", "36": "New York", "37": "North Carolina",
  "38": "North Dakota", "39": "Ohio", "40": "Oklahoma", "41": "Oregon", "42": "Pennsylvania",
  "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota", "47": "Tennessee",
  "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
  "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming"
};

// Initial state
updateViewVisibility();
ensureAnalyticsPanelVisible();

// Set initial active state for layer buttons
document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.classList.remove('active');
  if (btn.dataset.layer === dataLayer) {
    btn.classList.add('active');
  }
});

// Initialize relationship slider
if (relationshipSlider && relationshipValue && sliderDescription) {
  relationshipValue.textContent = relationshipWeight + '%';
  let description = '';
  if (relationshipWeight < 25) {
    description = 'Health-focused: Primarily shows health outcome patterns';
  } else if (relationshipWeight < 40) {
    description = 'Health-leaning: Emphasizes health outcomes with some insurance influence';
  } else if (relationshipWeight < 60) {
    description = 'Balanced view: Equal weight to both factors';
  } else if (relationshipWeight < 75) {
    description = 'Insurance-leaning: Emphasizes insurance with some health influence';
  } else {
    description = 'Insurance-focused: Primarily shows insurance coverage patterns';
  }
  sliderDescription.textContent = description;
}

// Don't await initial panel update since it's at page load
updateAnalyticsPanel();

