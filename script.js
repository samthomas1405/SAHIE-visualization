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

let geoJsonLayer;
let animationInterval = null;
let selectedYear = 2022;
let mapLevel = null;
let ageCat = 0, sexCat = 0, iprCat = 0, raceCat = 0;
let dataStore = {};  // stores either county or state data

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
        console.log(url);
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        console.log(data);

        dataStore = {};
        const rows = data.slice(1);

        rows.forEach(row => {
            const stateFIPS = row[2];
            const key = isState ? stateFIPS : `${stateFIPS}${row[3]}`.padStart(5, '0');
            const percentInsured = parseFloat(row[1]);
            if (!isNaN(percentInsured)) {
                dataStore[key] = percentInsured;
            }
        });
        console.log(dataStore);

        renderMap();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function renderMap() {
    console.log(dataStore);
    const geojson = await loadGeoJSON();

    if (geoJsonLayer) {
        map.removeLayer(geoJsonLayer);
    }

    geoJsonLayer = L.geoJSON(geojson, {
        style: feature => {
            const fips = mapLevel === 'state'
              ? feature.id.padStart(2, '0')
              : feature.properties.GEO_ID.replace('0500000US', '');
            const percentInsured = dataStore[fips];
            return {
                fillColor: handleGradientColor(percentInsured),
                weight: 1,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.7
            };
        },
        onEachFeature: (feature, layer) => {
            const fips = mapLevel === 'state'
                ? feature.id.padStart(2, '0')
                : feature.properties.GEO_ID.replace('0500000US', '');
        
            const percentInsured = dataStore[fips] || 'N/A';
        
            const name = mapLevel === 'state'
                ? feature.properties.name // from state GeoJSON
                : feature.properties.NAME; // from county GeoJSON
        
            const stateName = mapLevel === 'state'
                ? stateFIPSMapping[fips] || 'Unknown'
                : stateFIPSMapping[feature.properties.STATE] || 'Unknown';
        
            const label = mapLevel === 'state'
                ? `${name}`
                : `${name}, ${stateName}`;
        
            layer.bindPopup(`${label}<br>Percent Insured: ${percentInsured}%`);
        }        
    }).addTo(map);
}


const levelSelect = document.getElementById('levelCat');
const selectPrompt = document.getElementById('selectPrompt');
const filterOptions = document.getElementById('filterOptions');
const raceWrapper = document.getElementById('raceWrapper');
const searchLabel = document.getElementById('searchLabel');
const raceNote = document.getElementById('raceNote');

levelSelect.addEventListener('change', () => {
    mapLevel = levelSelect.value;
    selectPrompt.style.display = 'none';
    filterOptions.style.display = 'block';

    if (mapLevel === 'state') {
        raceWrapper.style.display = 'block';
        searchLabel.textContent = "Search State:";
        raceNote.style.display = 'block';
    } else if (mapLevel === 'county') {
        raceWrapper.style.display = 'none';
        raceCat = 0;
        searchLabel.textContent = "Search County:";
        raceNote.style.display = 'none';
    }

    if (mapLevel) {
        fetchData();
    } else {
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    }
});


levelSelect.addEventListener('change', () => {
    mapLevel = levelSelect.value;

    
    // Hide or show filters
    if (mapLevel === "") {
        filterOptions.style.display = 'none';
        selectPrompt.style.display = 'block';
        if (geoJsonLayer) map.removeLayer(geoJsonLayer);
        return;
    }

    selectPrompt.style.display = 'none';
    filterOptions.style.display = 'block';

    if (mapLevel === 'state') {
        raceWrapper.style.display = 'block';
        searchLabel.textContent = "Search State:";
    } else {
        raceWrapper.style.display = 'none';
        searchLabel.textContent = "Search County:";
        raceCat = 0;
    }

    fetchData();
});




const ageSelect = document.getElementById('ageCat');
ageSelect.addEventListener('change', () => {
    ageCat = ageSelect.value;
    fetchData();
});

const sexSelect = document.getElementById('sexCat');
sexSelect.addEventListener('change', () => {
    sexCat = sexSelect.value;
    fetchData();
});

const iprSelect = document.getElementById('iprCat');
iprSelect.addEventListener('change', () => {
    iprCat = iprSelect.value;
    fetchData();
});

const raceSelect = document.getElementById('raceCat');
raceSelect.addEventListener('change', () => {
    raceCat = raceSelect.value;
    fetchData();
});

const yearSlider = document.getElementById('yearSlider');
const yearValue = document.getElementById('yearValue');

yearSlider.addEventListener('input', () => {
    selectedYear = yearSlider.value;
    yearValue.textContent = selectedYear;
    fetchData();
});

const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = '';

    if (!query || !geoJsonLayer) {
        searchResults.style.display = 'none';
        return;
    }

    // search matches that start with search input
    let matches = [];
    geoJsonLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        const name = mapLevel === 'state'
            ? props.name
            : `${props.NAME}, ${stateFIPSMapping[props.STATE] || 'Unknown'}`;
            if (name.toLowerCase().startsWith(query)){
            matches.push({ name, layer });
        }
    });

    if (matches.length > 0) {

        // Create div for each match and when clicked open popup to the matching county or state
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

// If search not found return nothing
document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.style.display = 'none';
    }
});

const playButton = document.getElementById('playButton');
let isPlaying = false;

// Event listender for play button
playButton.addEventListener('click', () => {
    if (isPlaying) {
        clearInterval(animationInterval);
        playButton.textContent = '▶ Play';
        isPlaying = false;
    } else {
        isPlaying = true;
        playButton.textContent = '⏸ Pause';

        // Start from the minimum year (2006)
        let nextYear = parseInt(yearSlider.min);
        yearSlider.value = nextYear;
        yearValue.textContent = nextYear;
        selectedYear = nextYear;
        fetchData();

        animationInterval = setInterval(() => {
            nextYear++;

            // Reset animation if 2022 is reached
            if (nextYear > parseInt(yearSlider.max)) {
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

