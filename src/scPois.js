/** South Carolina POI helpers - OpenStreetMap / Overpass */

export const SC_BBOX = {
  south: 32.034,
  west: -83.354,
  north: 35.216,
  east: -78.499,
};

export const POI_CATEGORIES = {
  restaurant: {
    label: 'Restaurant',
    color: '#e74c3c',
    letter: 'R',
    filters: ['node["amenity"="restaurant"]', 'node["amenity"="fast_food"]'],
  },
  fuel: {
    label: 'Gas station',
    color: '#f39c12',
    letter: 'G',
    filters: ['node["amenity"="fuel"]'],
  },
  shop: {
    label: 'Shop',
    color: '#9b59b6',
    letter: 'S',
    filters: [
      'node["shop"="supermarket"]',
      'node["shop"="convenience"]',
      'node["shop"="mall"]',
      'node["shop"="department_store"]',
    ],
  },
  beach: {
    label: 'Beach',
    color: '#3498db',
    letter: 'B',
    filters: [
      'node["natural"="beach"]',
      'way["natural"="beach"]',
      'node["leisure"="beach_resort"]',
    ],
  },
  cafe: {
    label: 'Cafe',
    color: '#1abc9c',
    letter: 'C',
    filters: ['node["amenity"="cafe"]'],
  },
  hotel: {
    label: 'Hotel',
    color: '#2ecc71',
    letter: 'H',
    filters: ['node["tourism"="hotel"]', 'node["tourism"="motel"]'],
  },
};

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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

function buildAroundQuery(categories, lat, lon, radiusMeters, limit) {
  const lines = [];
  for (const key of categories) {
    const cat = POI_CATEGORIES[key];
    if (!cat) continue;
    for (const f of cat.filters) {
      const tagged = f.replace(/^(node|way)/, '$1(around:' + radiusMeters + ',' + lat + ',' + lon + ')');
      lines.push('  ' + tagged + ';');
    }
  }
  return '[out:json][timeout:50];\n(\n' + lines.join('\n') + '\n);\nout center ' + limit + ';';
}

function buildBboxQuery(categories, bbox, limit) {
  const { south, west, north, east } = bbox;
  const lines = [];
  for (const key of categories) {
    const cat = POI_CATEGORIES[key];
    if (!cat) continue;
    for (const f of cat.filters) {
      const tagged = f.replace(/^(node|way)/, '$1(' + south + ',' + west + ',' + north + ',' + east + ')');
      lines.push('  ' + tagged + ';');
    }
  }
  return '[out:json][timeout:60];\n(\n' + lines.join('\n') + '\n);\nout center ' + limit + ';';
}

async function postOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Overpass ' + res.status);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Overpass failed');
}

function elementToPoi(el, category) {
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lon == null) return null;
  if (!isInSouthCarolina(lat, lon)) return null;
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

export async function fetchPoisInSouthCarolina(categories, limit = 150) {
  if (!categories.length) return [];
  const query = buildBboxQuery(categories, SC_BBOX, limit);
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