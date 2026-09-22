/** Shared Overpass fetch used by Vite (dev) and the Vercel /api/overpass proxy. */

// Public Overpass instances rate-limit aggressively, and datacenter IPs get hit
// hardest, so the proxy walks a list rather than trusting any single mirror.
export const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Some mirrors answer 200 with an empty element list and a sequence number in
 * place of a real `timestamp_osm_base` date. Treat those as failures so a stale
 * instance cannot silently blank out the map.
 */
function isUsableResponse(data) {
  if (!data || !Array.isArray(data.elements)) return false;
  const base = data.osm3s && data.osm3s.timestamp_osm_base;
  return typeof base === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(base);
}

async function tryMirror(url, body, timeoutMs) {
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
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!isUsableResponse(data)) throw new Error('stale response');
  return data;
}

/**
 * @param {string} query Overpass QL.
 * @param {object} [options]
 * @param {number} [options.budgetMs] Total wall-clock budget for all mirrors.
 * @param {number} [options.perMirrorMs] Timeout for a single mirror.
 * @param {string[]} [options.attempts] Collects per-mirror outcomes for logging.
 */
export async function queryOverpass(query, options = {}) {
  const { budgetMs = 24000, perMirrorMs = 9000, attempts = [] } = options;
  const body = String(query || '').trim();
  if (!body) throw new Error('Missing Overpass query');

  const deadline = Date.now() + budgetMs;
  let lastErr;

  for (const url of OVERPASS_MIRRORS) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) {
      attempts.push('budget exhausted');
      break;
    }

    const host = new URL(url).host;
    try {
      const data = await tryMirror(url, body, Math.min(perMirrorMs, remaining));
      attempts.push(host + ': ok');
      return data;
    } catch (err) {
      attempts.push(host + ': ' + (err && err.message ? err.message : 'error'));
      lastErr = err;
    }
  }

  throw lastErr || new Error('Overpass failed');
}