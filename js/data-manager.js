// Data Management Module
// ======================

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
    const isPreventionMeasure = this.isPreventionMeasure(AppConfig.selectedHealthMeasure);
    
    // Apply relationship weight (0-100, where 50 is balanced)
    const weightFactor = AppConfig.relationshipWeight / 100; // 0 to 1
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
    const isPrevention = this.isPreventionMeasure(AppConfig.selectedHealthMeasure);
    
    // Get weight description
    let weightDescription = '';
    if (AppConfig.relationshipWeight < 25) {
      weightDescription = 'Health-focused view';
    } else if (AppConfig.relationshipWeight < 40) {
      weightDescription = 'Health-leaning view';
    } else if (AppConfig.relationshipWeight < 60) {
      weightDescription = 'Balanced view';
    } else if (AppConfig.relationshipWeight < 75) {
      weightDescription = 'Insurance-leaning view';
    } else {
      weightDescription = 'Insurance-focused view';
    }
    
    // Dynamic examples based on measure type
    let examples;
    if (isPrevention) {
      // For prevention measures: high insurance + high prevention = good
      examples = [
        { 
          color: '#22c55e', 
          desc: 'Good', 
          short: 'High insurance + High prevention' 
        },
        { 
          color: '#dc2626', 
          desc: 'Concerning', 
          short: 'Low insurance + Low prevention' 
        }
      ];
    } else {
      // For health issues: high insurance + low health issues = good
      examples = [
        { 
          color: '#22c55e', 
          desc: 'Good', 
          short: 'High insurance + Low health issues' 
        },
        { 
          color: '#dc2626', 
          desc: 'Concerning', 
          short: 'Low insurance + High health issues' 
        }
      ];
    }

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
        ${weightDescription} (${AppConfig.relationshipWeight}% insurance weight)
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
      const measureName = DOMRefs.healthMeasureSelect.options[DOMRefs.healthMeasureSelect.selectedIndex].text;
      content += `<div style="margin:5px 0; border-top:1px solid #ddd; padding-top:5px;"><strong>${measureName}:</strong> ${healthData.value.toFixed(1)}%</div>`;
    }
    return content;
  }
};

// Data fetching functions
async function loadGeoJSON() {
  const url = AppConfig.mapLevel === 'state'
    ? 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
    : 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
  const response = await fetch(url);
  return await response.json();
}

async function fetchData() {
  try {
    const isState = AppConfig.mapLevel === 'state';
    console.log('fetchData called with mapLevel:', AppConfig.mapLevel, 'isState:', isState);
    const geoClause = isState ? 'for=state:*' : 'for=county:*&in=state:*';
    const raceParam = isState && AppConfig.raceCat !== '0' ? `&RACECAT=${AppConfig.raceCat}` : '';
    const getParams = isState
      ? 'get=NAME,PCTIC_PT,STATE'
      : 'get=NAME,PCTIC_PT,STATE,COUNTY';

    // Cap year at 2022 (latest available data from Census API)
    const dataYear = Math.min(2022, Math.max(2006, parseInt(AppConfig.selectedYear) || 2022));
    const url = `https://api.census.gov/data/timeseries/healthins/sahie?${getParams}&${geoClause}&AGECAT=${AppConfig.ageCat}&SEXCAT=${AppConfig.sexCat}&IPRCAT=${AppConfig.iprCat}${raceParam}&time=${dataYear}`;
    console.log('Fetching data from URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format received from API');
    }
    console.log('Data received, rows:', data.length);

    const newDataStore = {};
    const rows = data.slice(1);
    rows.forEach(row => {
      const stateFIPS = row[2];
      const key = isState ? stateFIPS : `${stateFIPS}${row[3]}`.padStart(5, '0');
      const percentInsured = parseFloat(row[1]);
      if (!isNaN(percentInsured)) newDataStore[key] = percentInsured;
    });
    AppConfig.setDataStore(newDataStore);
    console.log('Data store updated with', Object.keys(newDataStore).length, 'entries');

    // Fetch PLACES data if needed for the current layer or if scatter view needs it
    if (AppConfig.dataLayer === 'health' || AppConfig.dataLayer === 'combined' || AppConfig.viewMode === 'scatter') {
      await fetchPlacesData();
    }

    // Use unified rerender so map or scatter updates as needed
    await afterDataChangeRerender();
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

async function fetchPlacesData() {
  if (AppConfig.mapLevel === 'state') {
    AppConfig.setPlacesDataStore(await CDCPlaces.fetchStateData(AppConfig.selectedHealthMeasure));
  } else if (AppConfig.mapLevel === 'county') {
    AppConfig.setPlacesDataStore(await CDCPlaces.fetchCountyData(AppConfig.selectedHealthMeasure));
  } else {
    AppConfig.setPlacesDataStore({});
  }
}

// FIPS name cache functions
function buildFipsNameCache(geojson) {
  AppConfig.setFipsNameCache({});
  const isState = AppConfig.mapLevel === 'state';
  for (const f of geojson.features) {
    const fips = isState
      ? (f.id || '').toString().padStart(2, '0')
      : (f.properties?.GEO_ID || '').replace('0500000US', '');
    if (!fips) continue;
    const stateName = isState ? '' : (AppConfig.stateFIPSMapping[f.properties?.STATE] || '');
    const label = isState
      ? (f.properties?.name || AppConfig.stateFIPSMapping[fips] || fips)
      : `${f.properties?.NAME || ''}, ${stateName}`.trim();
    const currentCache = AppConfig.getFipsNameCache();
    currentCache[fips] = label || fips;
    AppConfig.setFipsNameCache(currentCache);
  }
}

function nameForFIPS(fips) {
  return AppConfig.getFipsNameCache()[fips] || AppConfig.getPlacesDataStore()[fips]?.locationName || fips;
}

// Export for use in other modules
window.DataManager = {
  CDCPlaces,
  loadGeoJSON,
  fetchData,
  fetchPlacesData,
  buildFipsNameCache,
  nameForFIPS
};
