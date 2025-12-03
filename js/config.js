// Configuration and Constants
// ===========================

// Global state variables
let geoJsonLayer;
let animationInterval = null;
let selectedYear = 2022; // Default to 2022 (latest available data), but UI allows up to 2025 for forecasting context
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

// FIPS name cache for performance
let fipsNameCache = {};

// Export for use in other modules
window.AppConfig = {
  // Direct property access (for backward compatibility)
  get geoJsonLayer() { return geoJsonLayer; },
  get animationInterval() { return animationInterval; },
  get selectedYear() { return selectedYear; },
  get mapLevel() { return mapLevel; },
  get ageCat() { return ageCat; },
  get sexCat() { return sexCat; },
  get iprCat() { return iprCat; },
  get raceCat() { return raceCat; },
  get dataStore() { return dataStore; },
  get placesDataStore() { return placesDataStore; },
  get dataLayer() { return dataLayer; },
  get selectedHealthMeasure() { return selectedHealthMeasure; },
  get isPlaying() { return isPlaying; },
  get relationshipWeight() { return relationshipWeight; },
  get viewMode() { return viewMode; },
  get globalAnalyticsData() { return globalAnalyticsData; },
  get stateFIPSMapping() { return stateFIPSMapping; },
  get fipsNameCache() { return fipsNameCache; },
  
  // Setters for state updates
  setGeoJsonLayer: (layer) => { geoJsonLayer = layer; },
  setAnimationInterval: (interval) => { animationInterval = interval; },
  setSelectedYear: (year) => { selectedYear = year; },
  setMapLevel: (level) => { mapLevel = level; },
  setAgeCat: (cat) => { ageCat = cat; },
  setSexCat: (cat) => { sexCat = cat; },
  setIprCat: (cat) => { iprCat = cat; },
  setRaceCat: (cat) => { raceCat = cat; },
  setDataStore: (store) => { dataStore = store; },
  setPlacesDataStore: (store) => { placesDataStore = store; },
  setDataLayer: (layer) => { dataLayer = layer; },
  setSelectedHealthMeasure: (measure) => { selectedHealthMeasure = measure; },
  setIsPlaying: (playing) => { isPlaying = playing; },
  setRelationshipWeight: (weight) => { relationshipWeight = weight; },
  setViewMode: (mode) => { viewMode = mode; },
  setGlobalAnalyticsData: (data) => { globalAnalyticsData = data; },
  setFipsNameCache: (cache) => { fipsNameCache = cache; },
  
  // Getters for accessing current values
  getDataStore: () => dataStore,
  getPlacesDataStore: () => placesDataStore,
  getFipsNameCache: () => fipsNameCache,
  getGeoJsonLayer: () => geoJsonLayer,
  getGlobalAnalyticsData: () => globalAnalyticsData
};
