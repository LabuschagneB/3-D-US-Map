/** Shared Overpass fetch used by Vite (dev) and the Vercel /api/overpass proxy. */

export const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

export async function queryOverpass(query, timeoutMs = 18000) {
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
          'Content-Type': 'text/plain;charset=UTF-8',
          Accept: 'application/json',
          'User-Agent': 'america-3d-map/1.0 (https://3-d-us-map.vercel.app)',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        lastErr = new Error('Overpass ' + res.status);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Overpass failed');
}