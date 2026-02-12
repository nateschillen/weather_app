const searchForm = document.getElementById('search-form');
const locationInput = document.getElementById('location-input');
const statusText = document.getElementById('status');
const forecastTitle = document.getElementById('forecast-title');
const hourlyList = document.getElementById('hourly-list');
const dailyList = document.getElementById('daily-list');
const saveButton = document.getElementById('save-location');
const savedLocationsList = document.getElementById('saved-locations');
const savedLocationTemplate = document.getElementById('saved-location-template');
const weatherMap = document.getElementById('weather-map');
const autocompleteList = document.getElementById('autocomplete-list');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const tabPanels = {
  hourly: document.getElementById('hourly-panel'),
  daily: document.getElementById('daily-panel')
};

const STORAGE_KEY = 'us-weather-saved-locations-v1';

let currentLocation = null;
let savedLocations = loadSavedLocations();
let autocompleteTimer;

renderSavedLocations();

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = locationInput.value.trim();
  if (!query) return;

  clearAutocomplete();
  await searchAndRenderWeather(query);
});

saveButton.addEventListener('click', () => {
  if (!currentLocation) {
    updateStatus('Search for a U.S. location first.');
    return;
  }

  if (savedLocations.some((location) => location.displayName === currentLocation.displayName)) {
    updateStatus('That location is already saved.');
    return;
  }

  savedLocations.push(currentLocation);
  persistSavedLocations();
  renderSavedLocations();
  updateStatus(`Saved ${currentLocation.displayName}.`);
});

locationInput.addEventListener('input', () => {
  const query = locationInput.value.trim();

  clearTimeout(autocompleteTimer);
  if (query.length < 2) {
    clearAutocomplete();
    return;
  }

  autocompleteTimer = setTimeout(async () => {
    try {
      const suggestions = await searchLocations(query, 6);
      renderAutocomplete(suggestions);
    } catch {
      clearAutocomplete();
    }
  }, 250);
});

locationInput.addEventListener('blur', () => {
  setTimeout(clearAutocomplete, 120);
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

async function searchAndRenderWeather(query) {
  try {
    updateStatus('Finding location...');
    const location = await geocodeLocation(query);
    currentLocation = location;
    forecastTitle.textContent = `${location.displayName} Weather Map`;
    updateMap(location.lat, location.lon);

    updateStatus('Loading forecast...');
    const [hourlyPeriods, dailyPeriods] = await loadForecasts(location.lat, location.lon);

    renderHourly(hourlyPeriods);
    renderDaily(dailyPeriods);
    updateStatus(`Showing weather for ${location.displayName}.`);
  } catch (error) {
    updateStatus(error.message);
  }
}

async function geocodeLocation(query) {
  const results = await searchLocations(query, 8);
  const usResult = results[0];

  if (!usResult) {
    throw new Error('No matching U.S. location found. Try city and state.');
  }

  return usResult;
}

async function searchLocations(query, limit = 5) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Unable to search locations right now.');
  }

  const results = await response.json();

  return results
    .filter((item) => item.address && item.address.country_code === 'us')
    .map((item) => {
      const state = item.address.state || item.address.region || '';
      const city =
        item.address.city ||
        item.address.town ||
        item.address.village ||
        item.address.hamlet ||
        item.name;

      return {
        displayName: state ? `${city}, ${state}` : city,
        lat: item.lat,
        lon: item.lon
      };
    })
    .filter((item, index, arr) => arr.findIndex((entry) => entry.displayName === item.displayName) === index);
}

async function loadForecasts(lat, lon) {
  const pointResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
  if (!pointResponse.ok) {
    throw new Error('Forecast service unavailable for that location.');
  }

  const pointData = await pointResponse.json();
  const hourlyUrl = pointData.properties.forecastHourly;
  const dailyUrl = pointData.properties.forecast;

  const [hourlyResponse, dailyResponse] = await Promise.all([fetch(hourlyUrl), fetch(dailyUrl)]);

  if (!hourlyResponse.ok || !dailyResponse.ok) {
    throw new Error('Could not load forecast details. Please try another U.S. location.');
  }

  const hourlyData = await hourlyResponse.json();
  const dailyData = await dailyResponse.json();

  return [hourlyData.properties.periods.slice(0, 24), dailyData.properties.periods.slice(0, 10)];
}

function renderHourly(periods) {
  hourlyList.innerHTML = '';

  periods.forEach((period) => {
    const card = document.createElement('article');
    card.className = 'card weather-card';
    card.innerHTML = `
      <header class="card-header">
        <strong>${formatDateTime(period.startTime)}</strong>
        <span class="temp-pill">${period.temperature}°${period.temperatureUnit}</span>
      </header>
      <p class="forecast-text">${period.shortForecast}</p>
      <div class="metric-grid">
        <div><span>Feels like</span><strong>${period.temperature}°${period.temperatureUnit}</strong></div>
        <div><span>Humidity</span><strong>${formatPercent(period.relativeHumidity?.value)}</strong></div>
        <div><span>Rain chance</span><strong>${formatPercent(period.probabilityOfPrecipitation?.value)}</strong></div>
        <div><span>Wind</span><strong>${period.windSpeed} ${period.windDirection}</strong></div>
      </div>
    `;
    hourlyList.appendChild(card);
  });
}

function renderDaily(periods) {
  dailyList.innerHTML = '';

  periods.forEach((period) => {
    const card = document.createElement('article');
    card.className = 'card weather-card';
    card.innerHTML = `
      <header class="card-header">
        <strong>${period.name}</strong>
        <span class="temp-pill">${period.temperature}°${period.temperatureUnit}</span>
      </header>
      <p class="forecast-text">${period.shortForecast}</p>
      <div class="metric-grid">
        <div><span>Rain chance</span><strong>${formatPercent(period.probabilityOfPrecipitation?.value)}</strong></div>
        <div><span>Wind</span><strong>${period.windSpeed} ${period.windDirection}</strong></div>
      </div>
      <small class="detail-text">${period.detailedForecast}</small>
    `;
    dailyList.appendChild(card);
  });
}

function renderAutocomplete(suggestions) {
  autocompleteList.innerHTML = '';

  if (!suggestions.length) {
    return;
  }

  suggestions.forEach((suggestion) => {
    const option = document.createElement('li');
    option.textContent = suggestion.displayName;
    option.role = 'option';
    option.addEventListener('mousedown', () => {
      locationInput.value = suggestion.displayName;
      clearAutocomplete();
      searchAndRenderWeather(suggestion.displayName);
    });
    autocompleteList.appendChild(option);
  });
}

function clearAutocomplete() {
  autocompleteList.innerHTML = '';
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  Object.entries(tabPanels).forEach(([name, panel]) => {
    const isActive = name === tabName;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}

function updateMap(lat, lon) {
  weatherMap.src = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=7&level=surface&overlay=radar&menu=&message=false&marker=false&calendar=&pressure=&type=map&location=coordinates&detail=false&metricWind=mph&metricTemp=%C2%B0F&radarRange=-1`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  return `${Math.round(value)}%`;
}

function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
  });
}

function updateStatus(message) {
  statusText.textContent = message;
}

function loadSavedLocations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function persistSavedLocations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLocations));
}

function renderSavedLocations() {
  savedLocationsList.innerHTML = '';

  if (!savedLocations.length) {
    const li = document.createElement('li');
    li.textContent = 'No saved locations yet.';
    savedLocationsList.appendChild(li);
    return;
  }

  savedLocations.forEach((location) => {
    const fragment = savedLocationTemplate.content.cloneNode(true);
    const [selectButton, removeButton] = fragment.querySelectorAll('button');

    selectButton.textContent = location.displayName;
    selectButton.addEventListener('click', () => {
      locationInput.value = location.displayName;
      searchAndRenderWeather(location.displayName);
    });

    removeButton.addEventListener('click', () => {
      savedLocations = savedLocations.filter((item) => item.displayName !== location.displayName);
      persistSavedLocations();
      renderSavedLocations();
      updateStatus(`Removed ${location.displayName} from saved locations.`);
    });

    savedLocationsList.appendChild(fragment);
  });
}
