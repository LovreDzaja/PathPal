<template>
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
  </template>
  
  <script setup>
  import { defineProps } from 'vue';
  
  defineProps({
    info: Object,
  });
  
  function getDiffClass(diff) {
    switch (diff) {
      case 'Easy': return 'text-green-300 font-bold';
      case 'Moderate': return 'text-yellow-300 font-bold';
      case 'Hard': return 'text-orange-400 font-bold';
      case 'Extreme': return 'text-red-500 font-bold animate-pulse';
      default: return '';
    }
  }
  </script>
  