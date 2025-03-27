<template>
  <div id="app">
    <header>
      <h1>Forest Pathfinder</h1>
      <p>Find the safest and shortest paths through forests</p>
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
  background: #2e8b57;
  color: white;
}

body {
  margin: 0;
  padding: 0;
}
</style>
