
<template>
    <canvas ref="elevationChart"></canvas>
  </template>
  
<script setup>
import { defineProps, ref, watch, nextTick, onMounted } from 'vue';
import Chart from 'chart.js/auto';
import axios from 'axios';

const props = defineProps({ elevationProfile: Array });
const elevationProfile = ref([]);
const elevationChart = ref(null);
let chartInstance = null;

const [elevationData] = await Promise.all([
      fetchElevation(lat, lng),
]);

watch(
  () => props.elevationProfile,
  async (newProfile) => {
    if (newProfile && newProfile.length) {
      elevationProfile.value = newProfile;
      await nextTick();
      drawElevationChart();
    }
  },
  { deep: true }
);

async function fetchElevation(lat, lng) {
  const { data } = await axios.get(`http://localhost:3001/api/elevation?lat=${lat}&lng=${lng}`);
  return data;
}

function drawElevationChart() {
  if (chartInstance) chartInstance.destroy();
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
  });
}
</script>