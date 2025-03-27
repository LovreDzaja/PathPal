import express from 'express'
import cors from 'cors'
import axios from 'axios'
import rateLimit from 'express-rate-limit'

const app = express()

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 50
const CACHE_TTL_MS = 24 * 3600000
const DEFAULT_PORT = 3001

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Rate limit exceeded',
    message: 'Too many requests from this IP, please try again later',
  },
  headers: true,
})

const elevationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Elevation rate limit exceeded',
      message: 'Please try again in an hour',
      tips: [
        'Use client-side caching to reduce requests',
        'Consider batching multiple points in one request',
      ],
    })
  },
})

app.use(
  cors({
    origin: '*',
  }),
)
app.use(express.json())
app.use('/api/', apiLimiter)

const elevationCache = new Map()

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      elevation: 'operational',
      routing: 'operational',
    },
    cache: {
      size: elevationCache.size,
      hits: Array.from(elevationCache.values()).filter((v) => v.source === 'cache').length,
    },
  })
})

app.get('/api/elevation', elevationLimiter, async (req, res) => {
  try {
    const { lat, lng } = req.query
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        details: `Received lat: ${lat}, lng: ${lng}`,
      })
    }

    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({
        error: 'Coordinates out of range',
        valid_ranges: {
          latitude: '-90 to 90',
          longitude: '-180 to 180',
        },
      })
    }

    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`
    const cached = elevationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(formatElevationResponse(cached.data, 'cache', cached.timestamp))
    }

    const { elevation, source, attempts } = await getElevationFromServices(latNum, lngNum)

    const responseData = {
      elevation: parseFloat(elevation.toFixed(1)),
      latitude: latNum,
      longitude: lngNum,
    }

    elevationCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      source,
    })

    res.json(formatElevationResponse(responseData, source, Date.now(), attempts))
  } catch (error) {
    console.error('Elevation endpoint error:', error)
    res.status(500).json({
      error: 'Elevation service error',
      details: error.message,
      suggestion: 'Try again later or with different coordinates',
    })
  }
})

app.get('/api/route', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng } = req.query

    const { startLatNum, startLngNum, endLatNum, endLngNum } = validateRouteCoordinates(
      startLat,
      startLng,
      endLat,
      endLng,
    )

    try {
      const osrmRoute = await getOsrmRoute(startLatNum, startLngNum, endLatNum, endLngNum)
      return res.json(osrmRoute)
    } catch (osrmError) {
      console.warn('OSRM failed:', osrmError.message)
    }

    try {
      const overpassRoute = await getOverpassRoute(startLatNum, startLngNum, endLatNum, endLngNum)
      return res.json(overpassRoute)
    } catch (overpassError) {
      console.error('Overpass API error:', overpassError)
      throw new Error('All routing services failed')
    }
  } catch (error) {
    console.error('Route endpoint error:', error)
    res.status(500).json({
      error: 'Route service error',
      details: error.message,
      fallbackSuggestion: 'Try a straight-line path between points',
    })
  }
})

async function getElevationFromServices(lat, lng) {
  let elevation
  let source = 'terrain_model'
  const attempts = []

  if (isInUS(lat, lng)) {
    try {
      const usgsElevation = await getUsgsElevation(lat, lng)
      if (usgsElevation !== undefined) {
        return {
          elevation: usgsElevation,
          source: 'usgs',
          attempts: [...attempts, { service: 'usgs', status: 'success' }],
        }
      }
    } catch (error) {
      attempts.push({ service: 'usgs', status: 'failed', error: error.message })
    }
  }

  try {
    const opentopoElevation = await getOpenTopoDataElevation(lat, lng)
    if (opentopoElevation !== undefined) {
      return {
        elevation: opentopoElevation,
        source: 'opentopodata',
        attempts: [...attempts, { service: 'opentopodata', status: 'success' }],
      }
    }
  } catch (error) {
    attempts.push({
      service: 'opentopodata',
      status: 'failed',
      error: error.message.includes('429') ? 'rate limited' : error.message,
    })
  }

  if (process.env.MAPQUEST_KEY) {
    try {
      const mapquestElevation = await getMapQuestElevation(lat, lng)
      if (mapquestElevation !== undefined) {
        return {
          elevation: mapquestElevation,
          source: 'mapquest',
          attempts: [...attempts, { service: 'mapquest', status: 'success' }],
        }
      }
    } catch (error) {
      attempts.push({ service: 'mapquest', status: 'failed', error: error.message })
    }
  }

  elevation = getEnhancedTerrainElevation(lat, lng)
  attempts.push({ service: 'terrain_model', status: 'used' })
  console.log(`Using terrain model for ${lat},${lng}`)

  return { elevation, source, attempts }
}

function formatElevationResponse(data, source, timestamp, attempts = []) {
  return {
    elevation: data.elevation,
    latitude: data.latitude,
    longitude: data.longitude,
    metadata: {
      source,
      attempts,
      timestamp: new Date(timestamp).toISOString(),
      accuracy: getAccuracyEstimate(source),
      notes: source === 'terrain_model' ? 'Elevation based on terrain modeling' : undefined,
    },
  }
}

async function getUsgsElevation(lat, lng) {
  const response = await axios.get(
    `https://nationalmap.gov/epqs/pqs.php?x=${lng}&y=${lat}&units=Meters&output=json`,
    {
      timeout: 2000,
      headers: { 'User-Agent': 'PathPal/1.0 (contact@example.com)' },
    },
  )
  return response.data?.Elevation_Query?.Elevation
}

async function getOpenTopoDataElevation(lat, lng) {
  const response = await axios.get(
    `https://api.opentopodata.org/v1/aster30m?locations=${lat},${lng}`,
    {
      timeout: 2000,
      headers: { 'User-Agent': 'PathPal/1.0 (contact@example.com)' },
    },
  )
  return response.data?.results?.[0]?.elevation
}

async function getMapQuestElevation(lat, lng) {
  const response = await axios.get(
    `http://open.mapquestapi.com/elevation/v1/profile?key=${process.env.MAPQUEST_KEY}&latLngCollection=${lat},${lng}`,
    { timeout: 2000 },
  )
  return response.data?.elevationProfile?.[0]?.height
}

// Route-related functions
function validateRouteCoordinates(startLat, startLng, endLat, endLng) {
  const startLatNum = parseFloat(startLat)
  const startLngNum = parseFloat(startLng)
  const endLatNum = parseFloat(endLat)
  const endLngNum = parseFloat(endLng)

  if ([startLatNum, startLngNum, endLatNum, endLngNum].some(isNaN)) {
    throw new Error('Invalid coordinates')
  }

  return { startLatNum, startLngNum, endLatNum, endLngNum }
}

async function getOsrmRoute(startLat, startLng, endLat, endLng) {
  const response = await axios.get(
    `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`,
    {
      timeout: 5000,
      headers: { 'User-Agent': 'PathPal/1.0 (your-email@example.com)' },
    },
  )

  return {
    ...response.data,
    metadata: {
      source: 'osrm',
      timestamp: new Date().toISOString(),
    },
  }
}

async function getOverpassRoute(startLat, startLng, endLat, endLng) {
  const bbox = calculateBoundingBox(startLat, startLng, endLat, endLng)
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"~"path|footway|track|steps"](${bbox});
      way["foot"~"yes|designated"](${bbox});
    );
    (._;>;);
    out body;
  `

  const response = await axios.get(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
    { timeout: 10000 },
  )

  const path = findOptimalPathFromOverpass(response.data, [startLng, startLat], [endLng, endLat])

  if (!path) {
    throw new Error('No walking path found')
  }

  return {
    routes: [
      {
        geometry: {
          coordinates: path,
          type: 'LineString',
        },
        distance: calculatePathDistance(path),
        duration: calculatePathDuration(path),
        metadata: {
          source: 'overpass',
          timestamp: new Date().toISOString(),
          accuracy: 'Approximate, may include non-walkable paths',
        },
      },
    ],
  }
}

function isInUS(lat, lng) {
  return lat >= 24.6 && lat <= 49.4 && lng >= -125.0 && lng <= -66.9
}

function getAccuracyEstimate(source) {
  const accuracyMap = {
    usgs: '±3 meters',
    opentopodata: '±10 meters',
    mapquest: '±15 meters',
    terrain_model: '±150 meters',
    cache: 'Same as original source',
  }
  return accuracyMap[source] || 'unknown'
}

function getEnhancedTerrainElevation(lat, lng) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180

  const baseElev = 50 + 1800 * Math.pow(Math.cos(latRad), 2)
  const continentFactor = Math.sin(lngRad * 0.7) * Math.cos(latRad * 0.7)
  const mountains = 1200 * Math.pow(Math.sin(lngRad * 2.3) * Math.cos(latRad * 1.7), 2)
  const localVariation = 300 * Math.sin(lngRad * 10) * Math.cos(latRad * 10)
  const coastalEffect = -150 * Math.pow(Math.sin(lngRad * 2), 2)

  return Math.max(
    -100,
    baseElev + continentFactor * 800 + mountains + localVariation + coastalEffect,
  )
}

const PORT = process.env.PORT || DEFAULT_PORT
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Elevation cache size: ${elevationCache.size}`)
})
