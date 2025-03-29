<template>
  <div id="map" class="w-screen h-screen animate-fade-in-map"></div>
  <hr>
  <ExplorerInfo :info="info" />
  <hr>
  <ElevationGraph :elevationProfile="elevationProfile" />
  
</template>

<script setup>
import { onMounted, ref, nextTick } from 'vue'
import ExplorerInfo from './ExplorerInfo.vue'
import ElevationGraph from './ElevationGraph.vue'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'
import 'leaflet-control-geocoder'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'

import Chart from 'chart.js/auto'

const info = ref(null)
const elevationProfile = ref([])
const elevationChart = ref(null)
let map, userMarker, destinationMarker, routingControl, chartInstance

onMounted(() => {
  let routingControl = null;
  let alternativeRoutingControl = null;

  map = L.map('map', {
    zoomControl: false,
    fullscreenControl: true,
    gestureHandling: true,
  }).setView([0, 0], 15);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  locateUser();

  map.on('click', async (e) => {
    const { lat, lng } = e.latlng;

    // Remove existing destination marker
    if (destinationMarker) destinationMarker.remove();

    destinationMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41],
      }),
    }).addTo(map);

    const [elevationData, weatherData] = await Promise.all([
      fetchElevation(lat, lng),
      fetchWeather(lat, lng),
    ]);

    if (!userMarker) return alert('User location not found yet!');

    // Remove existing routing controls
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    if (alternativeRoutingControl) {
      map.removeControl(alternativeRoutingControl);
      alternativeRoutingControl = null;
    }

    const router = L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1',
      profile: 'foot',
      polylinePrecision: 5,
      alternatives: 1,
    });

    // Main Routing Control
    routingControl = L.Routing.control({
      waypoints: [userMarker.getLatLng(), L.latLng(lat, lng)],
      routeWhileDragging: true,
      alternativeClassName: 'data',
      collapseBtnClass: 'leaflet-routing-collapse-btn',
      geocoder: L.Control.Geocoder.nominatim(),
      showAlternatives: true,
      altLineOptions: { styles: [{ color: '#00bfff', weight: 5, opacity: 0.7 }] },
      lineOptions: { styles: [{ color: '#ff0b03', weight: 6, opacity: 0.9 }] },
      createMarker: () => null,
      router,
    }).addTo(map);

    routingControl.on('routesfound', async function (e) {
      const routes = e.routes;

      // Update main route info
     
      const mainRoute = routes[0];
      updateRouteInfo(mainRoute.summary.totalDistance, mainRoute.summary.totalTime, 'Main Route 🗺️');
      

      // Handle alternative route if only one route exists
      if (routes.length === 1) {
        const altWaypoint = L.latLng(
          (userMarker.getLatLng().lat + lat) / 2 + 0.002,
          (userMarker.getLatLng().lng + lng) / 2 + 0.002
        );

        alternativeRoutingControl = L.Routing.control({
          waypoints: [userMarker.getLatLng(), altWaypoint, L.latLng(lat, lng)],
          routeWhileDragging: true,
          alternativeClassName: 'data',
          collapseBtnClass: 'leaflet-routing-collapse-btn',
          lineOptions: { styles: [{ color: '#0000FF', weight: 4, opacity: 0.6 }] },
          createMarker: () => null,
          router,
        }).addTo(map);

       
        alternativeRoutingControl.on('routesfound', async function (altEvent) {
          const altRoute = routes[0];
          updateRouteInfo(altRoute.summary.totalDistance, altRoute.summary.totalTime, 'Alternative Route 🗺️');
        });
      }

      // Fetch elevation data for the main route
      const coordinates = mainRoute.coordinates;
      const samples = await Promise.all(
        coordinates.filter((_, i) => i % 10 === 0).map((pt) => fetchElevation(pt.lat, pt.lng))
      );

      elevationProfile.value = samples.map((s, i) => ({
        distance:
          ((i * mainRoute.summary.totalDistance) / (samples.length - 1)) / 1000,
        elevation: s.elevation,
      }));

      await nextTick();
      drawElevationChart();
    });

    info.value = {
      lat,
      lng,
      elevation: elevationData.elevation,
      source: elevationData.source,
      elevationType: getElevationType(elevationData.elevation),
      weather:
        `${weatherData.temperature}°C, ${weatherData.condition}`,
      difficulty:
        getDifficulty(elevationData.elevation, weatherData),
    };

routingControl.on('routesfound', function (e) {
    const routes = e.routes;
    const mainRoute = routes[0];
    const altRoute = routes[1];
    // Update the route information using the refactored helper function
    setTimeout(() => {
      updateRouteInfo(mainRoute.summary.totalDistance, mainRoute.summary.totalTime, 'Main Route 🗺️', 0); // Update first element
    }, 100);

    setTimeout(() => {
      updateRouteInfo(altRoute.summary.totalDistance, altRoute.summary.totalTime, 'Alternative Route 🗺️', 1); // Update second element
    }, 100);

    
    const plan = routingControl.getPlan();
    if (plan && plan._routes) {
      plan._routes.forEach(function(route) {
        const routeContainer = route._container;  // Get the route's container

        if (routeContainer) {
          // Safely modify the content inside the route container
          const iconElement = routeContainer.querySelector('.leaflet-routing-icon');
          if (iconElement) {
            iconElement.innerHTML = 'Custom Text';  // Change the inner HTML as needed
          }
        } else {
          console.error('Route container not found:', route);
        }
      });
    } else {
      console.error('Routing control plan or routes are not available yet');
    }
});

// Helper function to update route information
function updateRouteInfo(distanceMeters, totalTimeSeconds, label, index) {
  const walkingTimeMinutes = Math.ceil(totalTimeSeconds / 60);
  console.log(index);
  if(index === undefined){
    index = 1;
  }

  setTimeout(() => {
    // Select all elements with the class 'leaflet-routing-alt'
    const infoElements = document.querySelectorAll('.leaflet-routing-alt');

    // Ensure the index is within bounds
    if (index >= infoElements.length) {
      console.error(`Element at index ${index} does not exist.`);
      return;
    }

    // Select the specific element based on the index
    const infoBox = infoElements[index].getElementsByTagName('h3').item(0);

    if (infoBox) {
      // Update the content of the selected infoBox
      infoBox.innerHTML = `
        <span>${label}: ${(distanceMeters / 1000).toFixed(2)} km , 🚶 ${(walkingTimeMinutes * 2.8).toFixed(1)} min</span>
      `;
    } else {
      console.error('No <h3> element found in the selected container.');
    }
  }, 1000);
}


});
});

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

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.animate-fade-in-map {
  animation: fade-in 2.6s ease-out;
}

</style>
