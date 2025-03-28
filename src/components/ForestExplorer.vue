<template>
  <div id="map" class="w-screen h-screen"></div>

  <!-- Info Card -->
  <div
    v-if="info"
    class="absolute bottom-10 left-10 bg-gradient-to-br from-green-500/60 via-green-700/70 
    to-green-900/80 border border-green-400/50 text-white rounded-3xl
     p-6 z-50 w-96 animate-fade-in space-y-3 backdrop-blur-md"
  >
    <h3 class="font-extrabold text-3xl mb-4 flex items-center gap-2">🌲 Explorer Info</h3>
    <div class="space-y-2 text-lg leading-relaxed">
      <p>📍 <strong>Lat:</strong> {{ info.lat.toFixed(5) }}, <strong>Lng:</strong> {{ info.lng.toFixed(5) }}</p>
      <p>⛰️ <strong>Elevation:</strong> {{ info.elevation }} m <span class="italic">({{ info.elevationType }})</span></p>
      <p>🌦️ <strong>Weather:</strong> {{ info.weather }}</p>
      <p>🔥 <strong>Difficulty:</strong> <span :class="getDiffClass(info.difficulty)">{{ info.difficulty }}</span></p>
      <p>🟣 <strong>Source:</strong> {{ info.source }}</p>
    </div>
  </div>

  <!-- Elevation Graph -->
  <div
    v-if="elevationProfile.length"
    class="absolute bottom-10 right-10 bg-gradient-to-tr from-white/20 via-white/30 to-white/10 backdrop-blur-3xl rounded-3xl p-6 z-50 w-80 h-36 animate-fade-in border border-white/40"
  >
    <h4 class="font-semibold mb-2 text-white text-base animate-pulse">📈 Elevation Profile</h4>
    <div class="rounded-xl overflow-hidden bg-white/20 p-3 border border-white/50">
      <canvas ref="elevationChart" class="h-28"></canvas>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, nextTick, computed } from 'vue'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'
import 'leaflet-control-geocoder'
import Chart from 'chart.js/auto'

const info = ref(null)
const elevationProfile = ref([])
const elevationChart = ref(null)
let map, userMarker, destinationMarker, routingControl, chartInstance

function getDiffClass(diff) {
  switch (diff) {
    case 'Easy':
      return 'text-green-300 font-bold'
    case 'Moderate':
      return 'text-yellow-300 font-bold'
    case 'Hard':
      return 'text-orange-400 font-bold'
    case 'Extreme':
      return 'text-red-500 font-bold animate-pulse'
    default:
      return ''
  }
}

onMounted(() => {
  map = L.map('map', {
    zoomControl: false,
    fullscreenControl: true,
    gestureHandling: true
  }).setView([0, 0], 15)

  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  locateUser()

  map.on('click', async (e) => {
    const { lat, lng } = e.latlng
    if (destinationMarker) destinationMarker.remove()
    destinationMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41],
      }),
    }).addTo(map)

    const [elevationData, weatherData] = await Promise.all([
      fetchElevation(lat, lng),
      fetchWeather(lat, lng),
    ])

    if (!userMarker) return alert('User location not found yet!')
    if (routingControl) map.removeControl(routingControl)

    routingControl = L.Routing.control({
      waypoints: [userMarker.getLatLng(), L.latLng(lat, lng)],
      routeWhileDragging: false,
      geocoder: L.Control.Geocoder.nominatim(),
      showAlternatives: false,
      lineOptions: { styles: [{ color: '#ff0b03', weight: 2, opacity: 0.9 }] },
      createMarker: () => null,
    }).addTo(map)

    routingControl.on('routesfound', async function (e) {
      const route = e.routes[0]
      const coordinates = route.coordinates
      const samples = await Promise.all(
        coordinates.filter((_, i) => i % 10 === 0).map((pt) => fetchElevation(pt.lat, pt.lng)),
      )
      elevationProfile.value = samples.map((s, i) => ({
        distance: (i * route.summary.totalDistance) / (samples.length - 1) / 1000,
        elevation: s.elevation,
      }))
      await nextTick()
      drawElevationChart()
    })

    info.value = {
      lat,
      lng,
      elevation: elevationData.elevation,
      source: elevationData.source,
      elevationType: getElevationType(elevationData.elevation),
      weather: `${weatherData.temperature}°C, ${weatherData.condition}`,
      difficulty: getDifficulty(elevationData.elevation, weatherData),
    }
  })
})

function locateUser() {
  if (!navigator.geolocation) return alert('Geolocation is not supported by your browser')
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords
      const userLatLng = [latitude, longitude]
      if (userMarker) userMarker.setLatLng(userLatLng)
      else
        userMarker = L.marker(userLatLng, {
          icon: L.icon({
            iconUrl: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            shadowUrl:
              'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            shadowSize: [41, 41],
            shadowAnchor: [12, 41],
          }),
        }).addTo(map)
      map.setView(userLatLng, 15)
    },
    (error) => {
      console.error('Geolocation error:', error)
      alert('Unable to retrieve your location')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

async function fetchElevation(lat, lng) {
  const { data } = await axios.get(`http://localhost:3001/api/elevation?lat=${lat}&lng=${lng}`)
  return data
}

async function fetchWeather(lat, lng) {
  const { data } = await axios.get(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`,
  )
  const weather = data.current_weather
  return {
    temperature: weather.temperature,
    windspeed: weather.windspeed,
    condition: getWeatherCondition(weather.weathercode),
  }
}

function getWeatherCondition(code) {
  if (code < 3) return 'Clear'
  if (code < 45) return 'Cloudy'
  if (code < 56) return 'Foggy'
  if (code < 67) return 'Drizzle'
  if (code < 78) return 'Rainy'
  if (code < 87) return 'Snowy'
  return 'Stormy'
}

function getElevationType(elevation) {
  if (elevation <= 0) return 'Below Sea Level'
  if (elevation < 500) return 'Lowland'
  if (elevation < 1500) return 'Hill'
  return 'Mountain'
}

function getDifficulty(elevation, weather) {
  const base = elevation < 500 ? 1 : elevation < 1500 ? 2 : 3
  const windFactor = weather.windspeed > 20 ? 2 : 1
  const tempFactor = weather.temperature > 30 || weather.temperature < 0 ? 2 : 1
  const total = base * windFactor * tempFactor
  return ['Easy', 'Moderate', 'Hard', 'Extreme'][Math.min(total - 1, 3)]
}

function drawElevationChart() {
  if (chartInstance) chartInstance.destroy()
  chartInstance = new Chart(elevationChart.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: elevationProfile.value.map((p) => p.distance.toFixed(2) + ' km'),
      datasets: [
        {
          label: 'Elevation (m)',
          data: elevationProfile.value.map((p) => p.elevation),
          fill: true,
          backgroundColor: 'rgba(34,197,94,0.2)',
          borderColor: '#22c55e',
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: 'Distance' } },
        y: { title: { display: true, text: 'Elevation (m)' } },
      },
    },
  })
}
</script>



<style>
#map {
  height: 100vh;
  width: 100vw;
  z-index: 0;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fade-in 1.2s ease-out;
}
</style>
