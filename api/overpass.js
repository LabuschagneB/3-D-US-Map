import { queryOverpass } from '../overpass-proxy.mjs';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

async function readBody(req) {
  if (typeof req.body === 'string') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const query = (await readBody(req)).trim();
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  const attempts = [];
  try {
    const data = await queryOverpass(query, { attempts });
    // Overpass data changes slowly; a long shared cache keeps repeat lookups
    // off the rate-limited mirrors entirely.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=604800');
    res.status(200).json(data);
  } catch (err) {
    console.error('Overpass proxy failed', attempts);
    res.status(504).json({
      error: err && err.message ? err.message : 'Overpass unavailable',
      attempts,
    });
  }
}