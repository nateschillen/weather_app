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
const WEATHER_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail'
};

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
    clearForecast();

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
    updateStatus(error.message || 'Something went wrong while loading weather data.');
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
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`;
  const nominatimResponse = await fetch(nominatimUrl, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!nominatimResponse.ok) {
    throw new Error('Unable to search locations right now.');
  }

  const results = await nominatimResponse.json();

  return results
    .filter((item) => item.address && item.address.country_code === 'us')
    .map((item) => {
      const state = item.address.state || item.address.region || '';
      const city =
        item.address.city ||
        item.address.town ||
        item.address.village ||
        item.address.hamlet ||
        item.address.county ||
        item.display_name.split(',')[0];

      return {
        displayName: state ? `${city}, ${state}` : city,
        lat: Number(item.lat),
        lon: Number(item.lon)
      };
    })
    .filter((item, index, arr) => arr.findIndex((entry) => entry.displayName === item.displayName) === index);
}

async function loadForecasts(lat, lon) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto' +
    '&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,windspeed_10m,winddirection_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max';

  const weatherResponse = await fetch(weatherUrl);
  if (!weatherResponse.ok) {
    throw new Error('Forecast service unavailable for that location.');
  }

  const weatherData = await weatherResponse.json();
  if (!weatherData.hourly || !weatherData.daily) {
    throw new Error('Could not load forecast details. Please try another U.S. location.');
  }

  const hourlyPeriods = weatherData.hourly.time.slice(0, 24).map((time, index) => ({
    startTime: time,
    temperature: weatherData.hourly.temperature_2m[index],
    humidity: weatherData.hourly.relative_humidity_2m[index],
    precipitationProbability: weatherData.hourly.precipitation_probability[index],
    weatherCode: weatherData.hourly.weather_code[index],
    windSpeed: weatherData.hourly.windspeed_10m[index],
    windDirection: formatWindDirection(weatherData.hourly.winddirection_10m[index])
  }));

  const dailyPeriods = weatherData.daily.time.slice(0, 10).map((time, index) => ({
    name: formatDate(time),
    weatherCode: weatherData.daily.weather_code[index],
    highTemp: weatherData.daily.temperature_2m_max[index],
    lowTemp: weatherData.daily.temperature_2m_min[index],
    precipitationProbability: weatherData.daily.precipitation_probability_max[index],
    windSpeed: weatherData.daily.windspeed_10m_max[index]
  }));

  return [hourlyPeriods, dailyPeriods];
}

function renderHourly(periods) {
  hourlyList.innerHTML = '';

  periods.forEach((period) => {
    const card = document.createElement('article');
    card.className = 'card weather-card';
    card.innerHTML = `
      <header class="card-header">
        <strong>${formatDateTime(period.startTime)}</strong>
        <span class="temp-pill">${formatTemp(period.temperature)}</span>
      </header>
      <p class="forecast-text">${describeWeather(period.weatherCode)}</p>
      <div class="metric-grid">
        <div><span>Humidity</span><strong>${formatPercent(period.humidity)}</strong></div>
        <div><span>Rain chance</span><strong>${formatPercent(period.precipitationProbability)}</strong></div>
        <div><span>Wind</span><strong>${formatNumber(period.windSpeed)} mph ${period.windDirection}</strong></div>
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
        <span class="temp-pill">H ${formatTemp(period.highTemp)} / L ${formatTemp(period.lowTemp)}</span>
      </header>
      <p class="forecast-text">${describeWeather(period.weatherCode)}</p>
      <div class="metric-grid">
        <div><span>Rain chance</span><strong>${formatPercent(period.precipitationProbability)}</strong></div>
        <div><span>Max wind</span><strong>${formatNumber(period.windSpeed)} mph</strong></div>
      </div>
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

function clearForecast() {
  hourlyList.innerHTML = '';
  dailyList.innerHTML = '';
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

function describeWeather(code) {
  return WEATHER_CODES[code] || 'Forecast unavailable';
}

function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  return `${Math.round(value)}%`;
}

function formatTemp(value) {
  if (value === null || value === undefined) return '--';
  return `${Math.round(value)}°F`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return '--';
  return Math.round(value);
}

function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
  });
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}

function formatWindDirection(degrees) {
  if (degrees === null || degrees === undefined) return '--';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(degrees / 45) % 8;
  return dirs[idx];
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
