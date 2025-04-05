<template>
  <div class="chart-container">
    <canvas ref="elevationChart"></canvas>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue';
import Chart from 'chart.js/auto';

const props = defineProps({ elevationProfile: Array });
const elevationChart = ref(null);
let chartInstance = null;
let previousProfile = null;

// Ensure the chart only updates when new data is available
watch(
  () => props.elevationProfile,
  async (newProfile) => {
    if (!newProfile || newProfile.length === 0) return;

    // Prevent unnecessary redraws
    if (JSON.stringify(previousProfile) === JSON.stringify(newProfile)) return;
    
    previousProfile = JSON.parse(JSON.stringify(newProfile)); // Store current data
    await nextTick();
    drawElevationChart(newProfile);
  },
  { deep: true }
);

onMounted(() => {
  if (props.elevationProfile?.length) {
    drawElevationChart(props.elevationProfile);
  }
});

function drawElevationChart(profile) {
  if (!elevationChart.value) return;

  // Destroy existing chart to avoid duplication
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = new Chart(elevationChart.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: profile.map((p) => `${p.distance.toFixed(2)} km`),
      datasets: [
        {
          label: 'Elevation (m)',
          data: profile.map((p) => p.elevation),
          fill: true,
          backgroundColor: 'rgba(34,197,94,0.2)',
          borderColor: '#22c55e',
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Distance (km)' },
        },
        y: {
          title: { display: true, text: 'Elevation (m)' },
        },
      },
    },
  });
}
</script>

<style scoped>
.chart-container {
  width: 100%;
  max-width: 600px;
  margin: auto;
}
canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
