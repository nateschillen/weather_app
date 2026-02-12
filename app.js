const searchForm = document.getElementById('search-form');
const locationInput = document.getElementById('location-input');
const statusText = document.getElementById('status');
const forecastTitle = document.getElementById('forecast-title');
const hourlyList = document.getElementById('hourly-list');
const dailyList = document.getElementById('daily-list');
const saveButton = document.getElementById('save-location');
const savedLocationsList = document.getElementById('saved-locations');
const savedLocationTemplate = document.getElementById('saved-location-template');

const STORAGE_KEY = 'us-weather-saved-locations-v1';

let currentLocation = null;
let savedLocations = loadSavedLocations();

renderSavedLocations();

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = locationInput.value.trim();
  if (!query) return;

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

async function searchAndRenderWeather(query) {
  try {
    updateStatus('Finding location...');
    const location = await geocodeLocation(query);
    currentLocation = location;
    forecastTitle.textContent = location.displayName;

    updateStatus('Loading weather forecast...');
    const [hourlyPeriods, dailyPeriods] = await loadForecasts(location.lat, location.lon);

    renderHourly(hourlyPeriods);
    renderDaily(dailyPeriods);
    updateStatus(`Showing forecast for ${location.displayName}.`);
  } catch (error) {
    updateStatus(error.message);
  }
}

async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Unable to search locations right now.');
  }

  const results = await response.json();
  const usResult = results.find((item) => item.address && item.address.country_code === 'us');

  if (!usResult) {
    throw new Error('No matching U.S. location found. Try city and state.');
  }

  const state = usResult.address.state || usResult.address.region || '';
  const city = usResult.address.city || usResult.address.town || usResult.address.village || usResult.address.hamlet || usResult.name;

  return {
    displayName: state ? `${city}, ${state}` : city,
    lat: usResult.lat,
    lon: usResult.lon
  };
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
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>${formatDateTime(period.startTime)}</strong>
      <div>${period.temperature}°${period.temperatureUnit} - ${period.shortForecast}</div>
      <small>Wind: ${period.windSpeed} ${period.windDirection}</small>
    `;
    hourlyList.appendChild(card);
  });
}

function renderDaily(periods) {
  dailyList.innerHTML = '';

  periods.forEach((period) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>${period.name}</strong>
      <div>${period.temperature}°${period.temperatureUnit} - ${period.shortForecast}</div>
      <small>${period.detailedForecast}</small>
    `;
    dailyList.appendChild(card);
  });
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
