/** Shared Overpass fetch used by Vite (dev) and the Vercel /api/overpass proxy. */

export const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Some public mirrors answer 200 with an empty element list and a sequence
 * number instead of a real `timestamp_osm_base` date. Treat those as failures
 * so a stale instance cannot silently blank out the map.
 */
function isUsableResponse(data) {
  if (!data || !Array.isArray(data.elements)) return false;
  const base = data.osm3s && data.osm3s.timestamp_osm_base;
  return typeof base === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(base);
}

export async function queryOverpass(query, timeoutMs = 15000) {
  let lastErr;
  const body = String(query || '').trim();
  if (!body) {
    throw new Error('Missing Overpass query');
  }

  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'america-3d-map/1.0 (https://3-d-us-map.vercel.app)',
        },
        body: 'data=' + encodeURIComponent(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        lastErr = new Error('Overpass ' + res.status + ' from ' + url);
        continue;
      }
      const data = await res.json();
      if (!isUsableResponse(data)) {
        lastErr = new Error('Overpass returned stale data from ' + url);
        continue;
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Overpass failed');
}