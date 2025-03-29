<template>
  <div id="app">
    <header class="animate-fade-in">
      <div class="header-text">
        <h1>Welcome to PathPal</h1>
        <p><b>Find the safest and shortest paths for you to explore</b></p>
      </div>
      <img src="./assets/header-logo.jpg" alt="PathPal Logo" class="header-logo" />
    </header>
    <ForestExplorer />
  </div>
</template>

<script>
import ForestExplorer from './components/ForestExplorer.vue'

export default {
  name: 'App',
  components: {
    ForestExplorer,
  },
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}

header {
  text-align: center;
  padding: 20px;
  background: #BD8E22;
  color: white;
}

.header-logo {
  position: relative;
  top: 10%;
  left: 35%;
  width: 22.5%;
  height: auto;
  border-radius: 100%;
  z-index: 1;
}

.header-text {
  position: absolute;
  top: 0;
  left: 10%;
  width: 80%;
  color: #E9E3B1;
  text-align: center;
  z-index: 2;
}

body {
  margin: 0;
  padding: 0;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fade-in 1.2s ease-out;
}

@media (min-width: 768px) {
  header {
    flex-direction: row;
    justify-content: space-between;
    padding: 40px;
  }
  .header-text {
    text-align: left;
  }
  .header-logo {
    width: 30%;
    max-width: 150px;
  }
}
</style>
