import axios from 'axios'

const elevationCache = new Map()

export default async function handler(req, res) {
  const { lat, lng } = req.query
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)

  if (
    isNaN(latNum) ||
    isNaN(lngNum) ||
    latNum < -90 ||
    latNum > 90 ||
    lngNum < -180 ||
    lngNum > 180
  ) {
    return res.status(400).json({ error: 'Invalid coordinates' })
  }

  const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`
  if (elevationCache.has(cacheKey)) {
    return res.json({ elevation: elevationCache.get(cacheKey), source: 'cache' })
  }

  try {
    const topo = await getOpenTopoData(latNum, lngNum)
    if (topo !== null) {
      elevationCache.set(cacheKey, topo)
      return res.json({ elevation: topo, source: 'OpenTopoData' })
    }

    const openElev = await getOpenElevation(latNum, lngNum)
    if (openElev !== null) {
      elevationCache.set(cacheKey, openElev)
      return res.json({ elevation: openElev, source: 'Open-Elevation' })
    }

    return res.json({ elevation: 0, source: 'fallback' })
  } catch (err) {
    console.error('API Error:', err.message)
    res.status(500).json({ error: 'Server error', details: err.message })
  }
}

async function getOpenTopoData(lat, lng) {
  try {
    const res = await axios.get(`https://api.opentopodata.org/v1/aster30m?locations=${lat},${lng}`)
    return res.data?.results?.[0]?.elevation ?? null
  } catch {
    return null
  }
}

async function getOpenElevation(lat, lng) {
  try {
    const res = await axios.get(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`,
    )
    return res.data?.results?.[0]?.elevation ?? null
  } catch {
    return null
  }
}
