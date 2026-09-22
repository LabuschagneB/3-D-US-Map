/** South Carolina POI helpers - OpenStreetMap / Overpass */

export const SC_BBOX = {
  south: 32.034,
  west: -83.354,
  north: 35.216,
  east: -78.499,
};

// Use `nwr` (node + way + relation) everywhere: chains in shopping plazas are
// usually mapped as building polygons, so a node-only query silently drops
// about half of them. `out center` gives ways a usable lat/lon.
export const POI_CATEGORIES = {
  restaurant: {
    label: 'Restaurant',
    color: '#e74c3c',
    letter: 'R',
    filters: ['nwr["amenity"="restaurant"]', 'nwr["amenity"="fast_food"]'],
  },
  fuel: {
    label: 'Gas station',
    color: '#f39c12',
    letter: 'G',
    filters: ['nwr["amenity"="fuel"]'],
  },
  shop: {
    label: 'Shop',
    color: '#9b59b6',
    letter: 'S',
    filters: [
      'nwr["shop"="supermarket"]',
      'nwr["shop"="convenience"]',
      'nwr["shop"="mall"]',
      'nwr["shop"="department_store"]',
    ],
  },
  beach: {
    label: 'Beach',
    color: '#3498db',
    letter: 'B',
    filters: ['nwr["natural"="beach"]', 'nwr["leisure"="beach_resort"]'],
  },
  cafe: {
    label: 'Cafe',
    color: '#1abc9c',
    letter: 'C',
    filters: ['nwr["amenity"="cafe"]'],
  },
  hotel: {
    label: 'Hotel',
    color: '#2ecc71',
    letter: 'H',
    filters: ['nwr["tourism"="hotel"]', 'nwr["tourism"="motel"]'],
  },
};

// Mirrors that answer 200 with an empty result set and a sequence number in
// place of a real timestamp are stale; skip them instead of blanking the map.
function isUsableResponse(data) {
  if (!data || !Array.isArray(data.elements)) return false;
  const base = data.osm3s && data.osm3s.timestamp_osm_base;
  return typeof base === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(base);
}

let overpassQueue = Promise.resolve();

function enqueueOverpass(task) {
  const run = overpassQueue.then(task, task);
  overpassQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function isInSouthCarolina(lat, lon) {
  return (
    lat >= SC_BBOX.south &&
    lat <= SC_BBOX.north &&
    lon >= SC_BBOX.west &&
    lon <= SC_BBOX.east
  );
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pinSvgDataUri(color, letter) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">' +
    '<path fill="' +
    color +
    '" stroke="#111" stroke-width="1.4" d="M16 1C8.3 1 2 7.3 2 15c0 10.2 14 26 14 26s14-15.8 14-26C30 7.3 23.7 1 16 1z"/>' +
    '<circle cx="16" cy="15" r="7.2" fill="#fff"/>' +
    '<text x="16" y="19" text-anchor="middle" font-size="11" font-family="Segoe UI,Arial,sans-serif" font-weight="700" fill="#111">' +
    letter +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Snap to ~1km so panning a little reuses the cached proxy response instead of
// issuing a fresh Overpass query for every pixel of movement.
function snapCoord(value) {
  return Math.round(value * 100) / 100;
}

function buildAroundQuery(categories, lat, lon, radiusMeters, limit) {
  const origin = snapCoord(lat) + ',' + snapCoord(lon);
  const lines = [];
  for (const key of categories) {
    const cat = POI_CATEGORIES[key];
    if (!cat) continue;
    for (const f of cat.filters) {
      const tagged = f.replace(/^(nwr|node|way|relation)/, '$1(around:' + radiusMeters + ',' + origin + ')');
      lines.push('  ' + tagged + ';');
    }
  }
  return '[out:json][timeout:20];\n(\n' + lines.join('\n') + '\n);\nout center ' + limit + ';';
}

function buildBboxQuery(categories, bbox, limit) {
  const { south, west, north, east } = bbox;
  const lines = [];
  for (const key of categories) {
    const cat = POI_CATEGORIES[key];
    if (!cat) continue;
    for (const f of cat.filters) {
      const tagged = f.replace(
        /^(nwr|node|way|relation)/,
        '$1(' + south + ',' + west + ',' + north + ',' + east + ')',
      );
      lines.push('  ' + tagged + ';');
    }
  }
  return '[out:json][timeout:25];\n(\n' + lines.join('\n') + '\n);\nout center ' + limit + ';';
}

async function postOverpassViaProxy(query) {
  const res = await fetch('/api/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query,
    signal: AbortSignal.timeout(22000),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  const data = await res.json();
  if (!isUsableResponse(data)) throw new Error('Overpass returned stale data');
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Overpass mirrors send no CORS headers and reject browser origins outright,
// so every request goes through the same-origin proxy. When that fails the
// caller falls back to the curated place list.
//
// Every mirror can be rate-limited at the same moment, which usually clears
// within a second or two, so one retry recovers most of those windows.
async function postOverpass(query) {
  return enqueueOverpass(async () => {
    try {
      return await postOverpassViaProxy(query);
    } catch {
      await sleep(1500);
      return postOverpassViaProxy(query);
    }
  });
}

function elementToPoi(el, category) {
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lon == null) return null;
  const tags = el.tags || {};
  const name =
    tags.name ||
    tags.brand ||
    tags['name:en'] ||
    (POI_CATEGORIES[category] && POI_CATEGORIES[category].label) ||
    'Place';
  return {
    id: el.type + '-' + el.id,
    name,
    category,
    lat,
    lon,
    tags,
  };
}

function classifyElement(el, requestedCategories) {
  const tags = el.tags || {};
  if (requestedCategories.includes('fuel') && tags.amenity === 'fuel') return 'fuel';
  if (
    requestedCategories.includes('restaurant') &&
    (tags.amenity === 'restaurant' || tags.amenity === 'fast_food')
  ) {
    return 'restaurant';
  }
  if (requestedCategories.includes('cafe') && tags.amenity === 'cafe') return 'cafe';
  if (
    requestedCategories.includes('beach') &&
    (tags.natural === 'beach' || tags.leisure === 'beach_resort')
  ) {
    return 'beach';
  }
  if (
    requestedCategories.includes('hotel') &&
    (tags.tourism === 'hotel' || tags.tourism === 'motel')
  ) {
    return 'hotel';
  }
  if (requestedCategories.includes('shop') && tags.shop) return 'shop';
  return requestedCategories[0] || 'shop';
}

export async function fetchPoisAround(lat, lon, categories, radiusMeters = 20000, limit = 120) {
  if (!categories.length) return [];
  const query = buildAroundQuery(categories, lat, lon, radiusMeters, limit);
  const data = await postOverpass(query);
  const out = [];
  const seen = new Set();
  for (const el of data.elements || []) {
    const cat = classifyElement(el, categories);
    const poi = elementToPoi(el, cat);
    if (!poi || seen.has(poi.id)) continue;
    seen.add(poi.id);
    out.push(poi);
  }
  return out;
}

/**
 * Widening search. A tight radius answers fast in dense cities and keeps
 * "nearest" meaningful; rural areas fall through to the wider, costlier query
 * only when the close-in one comes up short.
 */
export async function fetchPoisNear(lat, lon, categories, options = {}) {
  // Overpass `out N` truncates in database order, not by distance, so start
  // tight enough that the result set is usually complete and the nearest match
  // is genuinely the nearest.
  const { radii = [3000, 10000, 25000], minResults = 6, limit = 120 } = options;
  let best = [];
  let lastErr;

  for (const radius of radii) {
    try {
      const pois = await fetchPoisAround(lat, lon, categories, radius, limit);
      if (pois.length >= minResults) return pois;
      if (pois.length > best.length) best = pois;
    } catch (err) {
      lastErr = err;
    }
  }

  if (best.length || !lastErr) return best;
  throw lastErr;
}

export async function fetchPoisInBbox(categories, bbox, limit = 150) {
  if (!categories.length) return [];
  const query = buildBboxQuery(categories, bbox, limit);
  const data = await postOverpass(query);
  const out = [];
  const seen = new Set();
  for (const el of data.elements || []) {
    const cat = classifyElement(el, categories);
    const poi = elementToPoi(el, cat);
    if (!poi || seen.has(poi.id)) continue;
    seen.add(poi.id);
    out.push(poi);
  }
  return out;
}

export async function fetchRoute(from, to) {
  const url =
    'https://router.project-osrm.org/route/v1/driving/' +
    from.lon +
    ',' +
    from.lat +
    ';' +
    to.lon +
    ',' +
    to.lat +
    '?overview=full&geometries=geojson';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Routing failed');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
    throw new Error('No driving route found');
  }
  return data.routes[0];
}

export function googleDirectionsUrl(from, to) {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    '&origin=' +
    from.lat +
    ',' +
    from.lon +
    '&destination=' +
    to.lat +
    ',' +
    to.lon +
    '&travelmode=driving'
  );
}

export function formatDistance(meters) {
  const miles = meters / 1609.34;
  if (miles < 0.1) return Math.round(meters * 3.281) + ' ft';
  return miles.toFixed(miles < 10 ? 1 : 0) + ' mi';
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h + ' h ' + m + ' min';
}