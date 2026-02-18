// ---- Helpers ----
const $ = (id) => document.getElementById(id);

function fmtTemp(v, units) {
  const u = units === "imperial" ? "°F" : "°C";
  return `${Math.round(v)}${u}`;
}

function fmtWind(v, units) {
  const u = units === "imperial" ? "mph" : "km/h";
  return `${Math.round(v)} ${u}`;
}

function dayName(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function hourLabel(isoDateTime) {
  const d = new Date(isoDateTime);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Open-Meteo WMO weather codes
const WMO = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ slight hail",
  99: "Thunderstorm w/ heavy hail"
};

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status muted " + (kind === "error" ? "error" : (kind === "ok" ? "ok" : ""));
}

// ---- Geocoding (city -> lat/lon) using Nominatim ----
async function geocodeCity(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data.length) throw new Error("City not found");
  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    name: data[0].display_name
  };
}

// ---- Weather fetch from Open-Meteo ----
async function fetchWeather(lat, lon, units) {
  const tempUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("temperature_unit", tempUnit);
  url.searchParams.set("wind_speed_unit", windUnit);
  url.searchParams.set("timezone", "auto");

  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
  url.searchParams.set("hourly", "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Weather request failed");
  return await res.json();
}

// ---- Render ----
function render(placeLabel, data, units) {
  $("result").style.display = "block";
  $("place").textContent = placeLabel;

  const cur = data.current;
  $("temp").textContent = fmtTemp(cur.temperature_2m, units);
  $("summary").textContent = WMO[cur.weather_code] ?? `Code ${cur.weather_code}`;
  $("wind").textContent = `Wind: ${fmtWind(cur.wind_speed_10m, units)}`;
  $("humid").textContent = `Humidity: ${Math.round(cur.relative_humidity_2m)}%`;
  $("updated").textContent = `Updated: ${new Date(cur.time).toLocaleString()}`;

  // Hourly: next 12 hours
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const codes = data.hourly.weather_code;

  const now = new Date(data.current.time);
  let startIndex = times.findIndex(t => new Date(t) >= now);
  if (startIndex < 0) startIndex = 0;

  const hourlyEl = $("hourly");
  hourlyEl.innerHTML = "";
  for (let i = startIndex; i < Math.min(startIndex + 12, times.length); i++) {
    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="muted">${hourLabel(times[i])}</div>
      <div class="hourTemp">${fmtTemp(temps[i], units)}</div>
      <div class="muted">${WMO[codes[i]] ?? `Code ${codes[i]}`}</div>
    `;
    hourlyEl.appendChild(div);
  }

  // Daily: 7 days
  const dTimes = data.daily.time;
  const tMax = data.daily.temperature_2m_max;
  const tMin = data.daily.temperature_2m_min;
  const dCode = data.daily.weather_code;

  const dailyEl = $("daily");
  dailyEl.innerHTML = "";
  for (let i = 0; i < Math.min(7, dTimes.length); i++) {
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <b>${dayName(dTimes[i])}</b>
      <div class="muted">${dTimes[i]}</div>
      <div class="dayTemps">${fmtTemp(tMax[i], units)} / ${fmtTemp(tMin[i], units)}</div>
      <div class="muted">${WMO[dCode[i]] ?? `Code ${dCode[i]}`}</div>
    `;
    dailyEl.appendChild(div);
  }
}

// ---- App actions ----
let last = null; // { lat, lon, label }

async function runWithCoords(lat, lon, label) {
  const units = $("units").value;
  try {
    setStatus("Loading weather…");
    const data = await fetchWeather(lat, lon, units);
    render(label, data, units);
    setStatus("Done.", "ok");
    last = { lat, lon, label };
  } catch (e) {
    setStatus(e.message || "Something went wrong.", "error");
  }
}

async function searchCity() {
  const query = $("q").value.trim();
  if (!query) return setStatus("Type a city name first.", "error");
  try {
    setStatus("Searching…");
    const g = await geocodeCity(query);
    await runWithCoords(g.lat, g.lon, g.name);
  } catch (e) {
    setStatus(e.message || "Search failed.", "error");
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported in this browser.", "error");
    return;
  }
  setStatus("Requesting location permission…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      await runWithCoords(latitude, longitude, "My location");
    },
    () => setStatus("Couldn’t get location. Allow permission or search a city instead.", "error"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---- Events ----
$("searchBtn").addEventListener("click", searchCity);
$("locBtn").addEventListener("click", useMyLocation);
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") searchCity(); });

$("units").addEventListener("change", async () => {
  if (last) await runWithCoords(last.lat, last.lon, last.label);
});

// Optional: auto-load a default city
// (Uncomment to load London at startup)
// runWithCoords(51.5072, -0.1276, "London, UK");
