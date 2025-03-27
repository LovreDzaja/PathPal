<template>
  <div class="explorer-container">
    <div class="map-controls">
      <div class="search-box">
        <input
          v-model="searchQuery"
          placeholder="Search for a place to explore..."
          @keyup.enter="searchLocation"
        />
        <button @click="searchLocation">Search</button>
      </div>
      <button @click="centerOnUser" :disabled="!userLocation">
        <i class="fas fa-location-arrow"></i> My Location
      </button>
      <button @click="toggleTracking">
        {{ isTracking ? 'Stop Tracking' : 'Start Tracking' }}
      </button>
      <button @click="findOptimalPath" :disabled="!startPoint || !endPoint || isLoadingPaths">
        {{ isLoadingPaths ? 'Loading Path...' : 'Find Walking Path' }}
      </button>
      <div v-if="isLoadingPaths" class="loading-message">
        Finding best walking route... (zoom in if this takes too long)
      </div>
      <div class="stats" v-if="trackingStats.distance > 0">
        <p>Distance: {{ (trackingStats.distance / 1000).toFixed(2) }} km</p>
        <p>Elevation Gain: {{ trackingStats.elevationGain }} m</p>
      </div>
    </div>

    <div class="map-container">
      <l-map ref="map" :zoom="zoom" :center="center" @click="handleMapClick" @ready="onMapReady">
        <l-tile-layer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        ></l-tile-layer>

        <l-marker v-if="userLocation" :lat-lng="userLocation" :icon="userLocationIcon">
          <l-tooltip>Your Location</l-tooltip>
        </l-marker>

        <l-geo-json v-if="walkingPaths" :geojson="walkingPaths" :options-style="walkingPathStyle" />

        <l-polyline
          v-if="currentRoute"
          :lat-lngs="currentRoute"
          color="#4285F4"
          :weight="5"
          :dash-array="isDirectRoute ? '5, 10' : null"
        >
          <l-tooltip>{{
            isDirectRoute ? 'Direct Path (no trails found)' : 'Walking Path'
          }}</l-tooltip>
        </l-polyline>

        <l-polyline v-if="trackedPath.length > 1" :lat-lngs="trackedPath" color="red" />

        <l-marker v-if="startPoint" :lat-lng="startPoint">
          <l-icon :icon-url="startIcon" :icon-size="[32, 32]" />
          <l-tooltip>Start Point</l-tooltip>
        </l-marker>
        <l-marker v-if="endPoint" :lat-lng="endPoint">
          <l-icon :icon-url="endIcon" :icon-size="[32, 32]" />
          <l-tooltip>Destination</l-tooltip>
        </l-marker>

        <l-marker
          v-for="(result, index) in searchResults"
          :key="index"
          :lat-lng="[result.lat, result.lon]"
          @click="setSearchResultAsDestination(result)"
        >
          <l-icon :icon-url="resultIcon" :icon-size="[24, 24]" />
          <l-tooltip>{{ result.display_name }}</l-tooltip>
        </l-marker>
      </l-map>
    </div>

    <div class="elevation-chart" v-if="elevationProfile.length > 0">
      <h3>Elevation Profile</h3>
      <canvas ref="elevationChart"></canvas>
      <div class="elevation-stats">
        <p>Max Elevation: {{ maxElevation }} m</p>
        <p>Min Elevation: {{ minElevation }} m</p>
        <p>Total Ascent: {{ totalAscent }} m</p>
      </div>
    </div>

    <button class="mobile-recenter" @click="centerOnUser" v-if="userLocation">
      <i class="fas fa-location-arrow"></i>
    </button>
  </div>
</template>

<script>
import {
  LMap,
  LTileLayer,
  LGeoJson,
  LPolyline,
  LMarker,
  LIcon,
  LTooltip,
} from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { Icon, latLngBounds, latLng } from 'leaflet'
import axios from 'axios'
import Chart from 'chart.js/auto'

import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const userIconUrl =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234285F4"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
const resultIconUrl =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF5722"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>'

delete Icon.Default.prototype._getIconUrl
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

export default {
  components: {
    LMap,
    LTileLayer,
    LGeoJson,
    LPolyline,
    LMarker,
    LIcon,
    LTooltip,
  },
  data() {
    return {
      zoom: 13,
      center: [0, 0],
      startPoint: null,
      endPoint: null,
      currentRoute: null,
      isTracking: false,
      isLoadingElevation: false,
      isLoadingPaths: false,
      trackedPath: [],
      trackingStats: {
        distance: 0,
        elevationGain: 0,
        startTime: null,
      },
      elevationProfile: [],
      walkingPaths: null,
      watchId: null,
      elevationChart: null,
      userLocation: null,
      userLocationIcon: null,
      resultIcon: null,
      searchQuery: '',
      searchResults: [],
      startIcon: 'https://cdn-icons-png.flaticon.com/512/149/149060.png',
      endIcon: 'https://cdn-icons-png.flaticon.com/512/149/149048.png',
      walkingPathStyle: {
        color: '#4CAF50',
        weight: 3,
        opacity: 0.8,
      },
      isDirectRoute: false,
      alternativeServers: [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ],
      currentServerIndex: 0,
    }
  },
  computed: {
    maxElevation() {
      return this.elevationProfile.length
        ? Math.max(...this.elevationProfile.map((p) => p.elevation)).toFixed(1)
        : 0
    },
    minElevation() {
      return this.elevationProfile.length
        ? Math.min(...this.elevationProfile.map((p) => p.elevation)).toFixed(1)
        : 0
    },
    totalAscent() {
      if (!this.elevationProfile.length) return 0
      let ascent = 0
      for (let i = 1; i < this.elevationProfile.length; i++) {
        const diff = this.elevationProfile[i].elevation - this.elevationProfile[i - 1].elevation
        if (diff > 0) ascent += diff
      }
      return ascent.toFixed(1)
    },
  },
  async mounted() {
    this.userLocationIcon = new Icon({
      iconUrl: userIconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    })

    this.resultIcon = new Icon({
      iconUrl: resultIconUrl,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    })

    await this.getUserLocation()

    await this.$nextTick()

    if (this.$refs.map?.leafletObject) {
      this.$refs.map.leafletObject.setZoom(14)
    }
  },
  methods: {
    async getUserLocation() {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          })
        })

        this.userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        this.center = [this.userLocation.lat, this.userLocation.lng]
        this.startPoint = { ...this.userLocation }

        return this.userLocation
      } catch (error) {
        console.error('Error getting location:', error)
        this.center = [40.7128, -74.006]
        return null
      }
    },
    handleMapClick(e) {
      const clickedPoint = { lat: e.latlng.lat, lng: e.latlng.lng }

      if (!this.startPoint) {
        this.startPoint = clickedPoint
      } else if (!this.endPoint) {
        this.endPoint = clickedPoint
      } else {
        this.startPoint = clickedPoint
        this.endPoint = null
      }

      this.currentRoute = null
      this.elevationProfile = []
      if (this.elevationChart) {
        this.elevationChart.destroy()
        this.elevationChart = null
      }
    },

    centerOnUser() {
      if (this.userLocation) {
        this.center = [this.userLocation.lat, this.userLocation.lng]
        this.zoom = 16
      }
    },

    async searchLocation() {
      if (!this.searchQuery.trim()) return

      try {
        const response = await axios.get(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}&limit=5`,
        )

        this.searchResults = response.data
        if (this.searchResults.length > 0) {
          const firstResult = this.searchResults[0]
          this.center = [firstResult.lat, firstResult.lon]
          this.zoom = 14
        }
      } catch (error) {
        console.error('Search error:', error)
        this.searchResults = []
      }
    },

    setSearchResultAsDestination(result) {
      this.endPoint = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      }
      this.searchResults = []
    },

    onMapReady() {
      this.initMap()
    },

    initMap() {
      if (this.$refs.map && this.$refs.map.leafletObject) {
        const map = this.$refs.map.leafletObject
        map.on('locationfound', this.onLocationFound)
        map.on('locationerror', this.onLocationError)

        if (this.userLocation) {
          map.flyTo([this.userLocation.lat, this.userLocation.lng], 14)
        }
      }
    },

    onLocationFound(e) {
      this.userLocation = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      }
    },

    onLocationError(e) {
      console.error('Location error:', e.message)
    },

    async loadWalkingPaths() {
      if (!this.$refs.map?.leafletObject) return

      this.isLoadingPaths = true
      try {
        const bounds = this.$refs.map.leafletObject.getBounds()

        const constrainedBounds = this.constrainBounds(bounds, 0.1) // ~11km × 11km

        const bbox = [
          Math.max(-180, constrainedBounds.getSouthWest().lng),
          Math.max(-90, constrainedBounds.getSouthWest().lat),
          Math.min(180, constrainedBounds.getNorthEast().lng),
          Math.min(90, constrainedBounds.getNorthEast().lat),
        ].join(',')

        try {
          const osrmRoute = await this.findPathWithOSRM()
          if (osrmRoute) {
            this.currentRoute = osrmRoute
            this.isDirectRoute = false
            await this.calculateElevationProfile(this.currentRoute)
            return
          }
        } catch (osrmError) {
          console.log('OSRM failed, falling back to Overpass:', osrmError)
        }

        const overpassQuery = `
            [out:json][timeout:25];
            (
              way["highway"~"path|footway|track|steps"](${bbox});
              way["foot"~"yes|designated"](${bbox});
              way["access"!~"private|no"](${bbox});
            );
            (._;>;);
            out body;
          `

        const response = await this.tryServers(overpassQuery)

        if (!response.data.elements || response.data.elements.length === 0) {
          throw new Error('No paths found in this area')
        }

        this.walkingPaths = this.processPaths(response.data.elements)
      } catch (error) {
        console.error('Error loading walking paths:', error)
        this.walkingPaths = null
        throw error
      } finally {
        this.isLoadingPaths = false
      }
    },

    constrainBounds(bounds, maxArea) {
      const latDiff = bounds.getNorthEast().lat - bounds.getSouthWest().lat
      const lngDiff = bounds.getNorthEast().lng - bounds.getSouthWest().lng

      if (latDiff <= maxArea && lngDiff <= maxArea) {
        return bounds
      }

      const center = bounds.getCenter()
      const halfSize = maxArea / 2
      return latLngBounds(
        latLng(center.lat - halfSize, center.lng - halfSize),
        latLng(center.lat + halfSize, center.lng + halfSize),
      )
    },

    async tryServers(query, retries = 3) {
      try {
        const server = this.alternativeServers[this.currentServerIndex]
        const response = await axios.get(`${server}?data=${encodeURIComponent(query)}`, {
          timeout: 30000,
        })
        return response
      } catch (error) {
        if (retries > 0) {
          this.currentServerIndex = (this.currentServerIndex + 1) % this.alternativeServers.length
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return this.tryServers(query, retries - 1)
        }
        throw error
      }
    },

    async findPathWithOSRM() {
      if (!this.startPoint || !this.endPoint) return null

      try {
        const response = await axios.get(
          `https://router.project-osrm.org/route/v1/foot/${this.startPoint.lng},${this.startPoint.lat};${this.endPoint.lng},${this.endPoint.lat}?overview=full&geometries=geojson`,
          { timeout: 5000 },
        )

        if (response.data.routes && response.data.routes.length > 0) {
          return response.data.routes[0].geometry.coordinates.map((coord) => [coord[1], coord[0]])
        }
        return null
      } catch (error) {
        console.error('OSRM error:', error)
        return null
      }
    },

    processPaths(elements) {
      return {
        type: 'FeatureCollection',
        features: elements.map((element) => ({
          type: 'Feature',
          geometry: {
            type: element.type === 'way' ? 'LineString' : 'Point',
            coordinates: element.nodes
              ? element.nodes.map((node) => [node.lon, node.lat])
              : [[element.lon, element.lat]],
          },
          properties: {
            id: element.id,
            type: element.tags?.highway || element.tags?.natural || 'path',
          },
        })),
      }
    },

    async findOptimalPath() {
      if (!this.startPoint || !this.endPoint) return

      try {
        const osrmRoute = await this.findPathWithOSRM()
        if (osrmRoute) {
          this.currentRoute = osrmRoute
          this.isDirectRoute = false
          await this.calculateElevationProfile(this.currentRoute)
          return
        }

        if (!this.walkingPaths) {
          await this.loadWalkingPaths()
        }

        if (this.walkingPaths?.features?.length) {
          const optimalPath = this.calculateWalkingPath(
            this.startPoint,
            this.endPoint,
            this.walkingPaths,
          )

          if (optimalPath) {
            this.currentRoute = optimalPath
            this.isDirectRoute = false
            await this.calculateElevationProfile(this.currentRoute)
            return
          }
        }

        this.currentRoute = [
          [this.startPoint.lat, this.startPoint.lng],
          [this.endPoint.lat, this.endPoint.lng],
        ]
        this.isDirectRoute = true
        await this.calculateElevationProfile(this.currentRoute)
        alert('No walking paths found - showing straight line path')
      } catch (error) {
        console.error('Path finding error:', error)
        alert(this.getFriendlyError(error))
      }
    },

    getFriendlyError(error) {
      if (error.response?.status === 400) return 'Map area too large - please zoom in and try again'
      if (error.message.includes('No paths found')) return 'No walking paths found in this area'
      if (error.message.includes('timeout')) return 'Service timeout - please try again'
      return 'Failed to find path - please try different locations'
    },

    calculateWalkingPath(start, end, pathsGeoJSON) {
      if (!pathsGeoJSON?.features?.length) return null

      const startPoint = [start.lng, start.lat]
      const endPoint = [end.lng, end.lat]

      let closestStart = { feature: null, index: -1, distance: Infinity }
      let closestEnd = { feature: null, index: -1, distance: Infinity }

      pathsGeoJSON.features.forEach((feature) => {
        if (feature.geometry.type !== 'LineString') return

        feature.geometry.coordinates.forEach((coord, index) => {
          const startDist = this.calculateDistance(startPoint, coord)
          const endDist = this.calculateDistance(endPoint, coord)

          if (startDist < closestStart.distance) {
            closestStart = { feature, index, distance: startDist }
          }

          if (endDist < closestEnd.distance) {
            closestEnd = { feature, index, distance: endDist }
          }
        })
      })

      if (closestStart.feature && closestEnd.feature) {
        const startSegment = closestStart.feature.geometry.coordinates.slice(closestStart.index)
        const endSegment = closestEnd.feature.geometry.coordinates.slice(0, closestEnd.index + 1)

        return [startPoint, ...startSegment, ...endSegment, endPoint].map((coord) => [
          coord[1],
          coord[0],
        ])
      }

      return null
    },

    calculateDistance(coord1, coord2) {
      const R = 6371e3
      const φ1 = (coord1[1] * Math.PI) / 180
      const φ2 = (coord2[1] * Math.PI) / 180
      const Δφ = ((coord2[1] - coord1[1]) * Math.PI) / 180
      const Δλ = ((coord2[0] - coord1[0]) * Math.PI) / 180

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      return R * c
    },

    async calculateElevationProfile(route) {
      if (!route?.length) return

      this.isLoadingElevation = true
      this.elevationProfile = []

      try {
        const sampleStep = Math.max(1, Math.floor(route.length / 100))
        const pointsToSample = []

        for (let i = 0; i < route.length; i += sampleStep) {
          pointsToSample.push(route[i])
        }
        if (
          route.length > 0 &&
          pointsToSample[pointsToSample.length - 1] !== route[route.length - 1]
        ) {
          pointsToSample.push(route[route.length - 1])
        }

        const elevationPromises = pointsToSample.map((point) =>
          axios.get(`http://localhost:3001/api/elevation?lat=${point[0]}&lng=${point[1]}`),
        )

        const responses = await Promise.all(elevationPromises)

        this.elevationProfile = responses.map((res, index) => ({
          distance: index * 50, // Approximate distance
          elevation: res.data.results[0]?.elevation || 0,
          point: pointsToSample[index],
        }))

        this.renderElevationChart()
      } catch (error) {
        console.error('Elevation error:', error)
        alert('Failed to load elevation data')
      } finally {
        this.isLoadingElevation = false
      }
    },

    renderElevationChart() {
      if (this.elevationChart) {
        this.elevationChart.destroy()
      }

      const ctx = this.$refs.elevationChart?.getContext('2d')
      if (!ctx || !this.elevationProfile.length) return

      const distances = [0]
      for (let i = 1; i < this.elevationProfile.length; i++) {
        const prev = this.elevationProfile[i - 1].point
        const curr = this.elevationProfile[i].point
        distances.push(
          distances[i - 1] + this.calculateDistance([prev[1], prev[0]], [curr[1], curr[0]]),
        )
      }

      this.elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: distances.map((d) => (d / 1000).toFixed(2) + ' km'),
          datasets: [
            {
              label: 'Elevation (meters)',
              data: this.elevationProfile.map((p) => p.elevation),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              tension: 0.1,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            tooltip: {
              callbacks: {
                label: (context) => `${context.parsed.y} meters`,
                footer: (context) => {
                  const point = this.elevationProfile[context[0].dataIndex].point
                  return `Location: ${point[0].toFixed(4)}, ${point[1].toFixed(4)}`
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: 'Distance' },
            },
            y: {
              title: { display: true, text: 'Elevation (m)' },
            },
          },
        },
      })
    },

    toggleTracking() {
      if (this.isTracking) {
        this.stopTracking()
      } else {
        this.startTracking()
      }
    },

    startTracking() {
      this.isTracking = true
      this.trackingStats = {
        distance: 0,
        elevationGain: 0,
        startTime: new Date(),
      }
      this.trackedPath = []

      this.watchId = navigator.geolocation.watchPosition(
        this.updatePosition,
        this.handleGeolocationError,
        { enableHighAccuracy: true, maximumAge: 10000 },
      )
    },

    stopTracking() {
      if (this.watchId) {
        navigator.geolocation.clearWatch(this.watchId)
      }
      this.isTracking = false
      this.saveTrackedPath()
    },

    updatePosition(position) {
      if (position.coords.accuracy > 50) {
        console.warn('Poor accuracy, skipping update')
        return
      }

      const newPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        altitude: position.coords.altitude,
        timestamp: position.timestamp || Date.now(),
      }

      if (this.trackedPath.length > 0) {
        const lastPoint = this.trackedPath[this.trackedPath.length - 1]
        this.updateTrackingStats(lastPoint, newPoint)
      }

      this.trackedPath.push([newPoint.lat, newPoint.lng])
    },

    updateTrackingStats(prevPoint, newPoint) {
      const R = 6371e3
      const φ1 = (prevPoint[0] * Math.PI) / 180
      const φ2 = (newPoint.lat * Math.PI) / 180
      const Δφ = ((newPoint.lat - prevPoint[0]) * Math.PI) / 180
      const Δλ = ((newPoint.lng - prevPoint[1]) * Math.PI) / 180

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      const distance = R * c
      this.trackingStats.distance += distance

      if (
        newPoint.altitude &&
        !isNaN(newPoint.altitude) &&
        prevPoint.altitude &&
        !isNaN(prevPoint.altitude)
      ) {
        const elevationDiff = newPoint.altitude - prevPoint.altitude
        if (elevationDiff > 0) {
          this.trackingStats.elevationGain += elevationDiff
        }
      }
    },

    saveTrackedPath() {
      if (this.trackedPath.length < 2) return

      const tracks = JSON.parse(localStorage.getItem('savedTracks') || '[]')
      tracks.push({
        path: this.trackedPath,
        stats: this.trackingStats,
        timestamp: new Date(),
      })
      localStorage.setItem('savedTracks', JSON.stringify(tracks))
    },

    handleGeolocationError(error) {
      if (error.code === error.PERMISSION_DENIED) {
        alert('Please enable location permissions to use tracking')
      } else if (error.code === error.TIMEOUT) {
        alert('Location request timed out')
      }
      console.error('Geolocation error:', error)
      this.isTracking = false
    },
  },
  beforeUnmount() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId)
    }
    if (this.elevationChart) {
      this.elevationChart.destroy()
    }
  },
}
</script>

<style>
.explorer-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: 'Arial', sans-serif;
}

.map-controls {
  padding: 12px;
  background: #f8f9fa;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.search-box {
  display: flex;
  gap: 8px;
  flex-grow: 1;
  max-width: 500px;
}

.search-box input {
  flex-grow: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.map-container {
  flex: 1;
  height: 100%;
  width: 100%;
}

.elevation-chart {
  height: 250px;
  padding: 15px;
  background: white;
  border-top: 1px solid #eee;
}

.elevation-chart h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.elevation-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
  font-size: 14px;
  color: #555;
}

.stats {
  margin-left: auto;
  padding: 0 15px;
  font-size: 14px;
  color: #333;
}

button {
  padding: 10px 16px;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  transition: background 0.2s;
}

button:hover {
  background: #3367d6;
}

button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.loading-message {
  padding: 8px 12px;
  background: #fff3cd;
  color: #856404;
  border-radius: 4px;
  margin-top: 5px;
  font-size: 14px;
  width: 100%;
}

.mobile-recenter {
  position: fixed;
  bottom: 25px;
  right: 25px;
  z-index: 1000;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: none;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  border: none;
  color: #4285f4;
  font-size: 20px;
  justify-content: center;
  align-items: center;
}

@media (max-width: 768px) {
  .mobile-recenter {
    display: flex;
  }

  .map-controls {
    padding: 8px;
  }

  button {
    padding: 8px 12px;
    font-size: 13px;
  }
}

/* Leaflet fixes */
.leaflet-container {
  background: #d4d4d4;
}

.leaflet-tile {
  filter: none !important;
}

.leaflet-control-attribution {
  font-size: 11px !important;
}
</style>
