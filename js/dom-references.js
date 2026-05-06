// DOM References
// ==============

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

// Analytics panel elements
const analyticsFAB = document.getElementById('analyticsFAB');
const analyticsPanel = document.getElementById('analyticsPanel');
const singleMetricView = document.getElementById('singleMetricView');
const combinedMetricView = document.getElementById('combinedMetricView');
const healthMeasureTitle = document.getElementById('healthMeasureTitle');
const apMinimize = document.getElementById('apMinimize');
const apClose = document.getElementById('apClose');

// Predictive modeling elements
const predictiveFAB = document.getElementById('predictiveFAB');
const predictivePanel = document.getElementById('predictivePanel');
const predictiveOverlay = document.getElementById('predictiveOverlay');
const ppMinimize = document.getElementById('ppMinimize');
const ppClose = document.getElementById('ppClose');


// Time series forecasting elements
const forecastLocation = document.getElementById('forecastLocation');
const forecastLocationResults = document.getElementById('forecastLocationResults');
const forecastLocationGroup = document.getElementById('forecastLocationGroup');
const forecastTSAge = document.getElementById('forecastTSAge');
const forecastTSSex = document.getElementById('forecastTSSex');
const forecastTSRace = document.getElementById('forecastTSRace');
const forecastTSIncome = document.getElementById('forecastTSIncome');
const forecastYears = document.getElementById('forecastYears');
const forecastYearsValue = document.getElementById('forecastYearsValue');
const forecastTrendBtn = document.getElementById('forecastTrendBtn');
const trendForecastResult = document.getElementById('trendForecastResult');
const trendForecastChart = document.getElementById('trendForecastChart');
const trendForecastBacktest = document.getElementById('trendForecastBacktest');

// Spatial view (Regular vs H3 hexagons)
const regularBoundariesBtn = document.getElementById('regularBoundariesBtn');
const h3HexagonsBtn = document.getElementById('h3HexagonsBtn');
const h3SizeWrapper = document.getElementById('h3SizeWrapper');
const h3SizeSlider = document.getElementById('h3SizeSlider');
const h3SizeValue = document.getElementById('h3SizeValue');
const h3CentroidBtn = document.getElementById('h3CentroidBtn');
const h3GridBtn = document.getElementById('h3GridBtn');

// Export for use in other modules
window.DOMRefs = {
  levelSelect,
  selectPrompt,
  filterOptions,
  raceWrapper,
  searchLabel,
  raceNote,
  ageSelect,
  sexSelect,
  iprSelect,
  raceSelect,
  yearSlider,
  yearValue,
  playButton,
  searchInput,
  searchResults,
  layerSelection,
  viewModeToggle,
  healthMeasureWrapper,
  healthMeasureSelect,
  gradientTitle,
  insuranceGradient,
  healthGradient,
  scatterContainer,
  scatterTooltip,
  relationshipSliderWrapper,
  relationshipSlider,
  relationshipValue,
  sliderDescription,
  analyticsFAB,
  analyticsPanel,
  singleMetricView,
  combinedMetricView,
  healthMeasureTitle,
  apMinimize,
  apClose,
  predictiveFAB,
  predictivePanel,
  predictiveOverlay,
  ppMinimize,
  ppClose,
  forecastLocation,
  forecastLocationResults,
  forecastLocationGroup,
  forecastTSAge,
  forecastTSSex,
  forecastTSRace,
  forecastTSIncome,
  forecastYears,
  forecastYearsValue,
  forecastTrendBtn,
  trendForecastResult,
  trendForecastChart,
  trendForecastBacktest,
  regularBoundariesBtn,
  h3HexagonsBtn,
  h3SizeWrapper,
  h3SizeSlider,
  h3SizeValue,
  h3CentroidBtn,
  h3GridBtn
};
