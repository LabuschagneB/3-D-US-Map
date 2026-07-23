import './style.css';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  SC_BBOX,
  POI_CATEGORIES,
  distanceMeters,
  fetchPoisAround,
  fetchPoisInSouthCarolina,
  fetchRoute,
  formatDistance,
  formatDuration,
  googleDirectionsUrl,
  isInSouthCarolina,
  pinSvgDataUri,
} from './scPois.js';
import { fallbackPoisForCategories } from './scPoiFallback.js';

// Contiguous US framing
const USA_RECTANGLE = Cesium.Rectangle.fromDegrees(-125.0, 24.0, -66.0, 49.5);
const SC_RECTANGLE = Cesium.Rectangle.fromDegrees(
  SC_BBOX.west,
  SC_BBOX.south,
  SC_BBOX.east,
  SC_BBOX.north,
);
// Full US clip — hides the rest of the world
const AMERICA_LIMIT = Cesium.Rectangle.fromDegrees(-179.2, 17.5, -64.5, 71.5);
const STATES_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

const stateMeta = {
  Alabama: { abbr: 'AL' },
  Alaska: { abbr: 'AK' },
  Arizona: { abbr: 'AZ' },
  Arkansas: { abbr: 'AR' },
  California: { abbr: 'CA' },
  Colorado: { abbr: 'CO' },
  Connecticut: { abbr: 'CT' },
  Delaware: { abbr: 'DE' },
  Florida: { abbr: 'FL' },
  Georgia: { abbr: 'GA' },
  Hawaii: { abbr: 'HI' },
  Idaho: { abbr: 'ID' },
  Illinois: { abbr: 'IL' },
  Indiana: { abbr: 'IN' },
  Iowa: { abbr: 'IA' },
  Kansas: { abbr: 'KS' },
  Kentucky: { abbr: 'KY' },
  Louisiana: { abbr: 'LA' },
  Maine: { abbr: 'ME' },
  Maryland: { abbr: 'MD' },
  Massachusetts: { abbr: 'MA' },
  Michigan: { abbr: 'MI' },
  Minnesota: { abbr: 'MN' },
  Mississippi: { abbr: 'MS' },
  Missouri: { abbr: 'MO' },
  Montana: { abbr: 'MT' },
  Nebraska: { abbr: 'NE' },
  Nevada: { abbr: 'NV' },
  'New Hampshire': { abbr: 'NH' },
  'New Jersey': { abbr: 'NJ' },
  'New Mexico': { abbr: 'NM' },
  'New York': { abbr: 'NY' },
  'North Carolina': { abbr: 'NC' },
  'North Dakota': { abbr: 'ND' },
  Ohio: { abbr: 'OH' },
  Oklahoma: { abbr: 'OK' },
  Oregon: { abbr: 'OR' },
  Pennsylvania: { abbr: 'PA' },
  'Rhode Island': { abbr: 'RI' },
  'South Carolina': { abbr: 'SC' },
  'South Dakota': { abbr: 'SD' },
  Tennessee: { abbr: 'TN' },
  Texas: { abbr: 'TX' },
  Utah: { abbr: 'UT' },
  Vermont: { abbr: 'VT' },
  Virginia: { abbr: 'VA' },
  Washington: { abbr: 'WA' },
  'West Virginia': { abbr: 'WV' },
  Wisconsin: { abbr: 'WI' },
  Wyoming: { abbr: 'WY' },
  'District of Columbia': { abbr: 'DC' },
  'Puerto Rico': { abbr: 'PR' },
};

Cesium.Ion.defaultAccessToken = undefined;

const viewer = new Cesium.Viewer('cesiumContainer', {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: true,
  infoBox: false,
  selectionIndicator: false,
  baseLayer: false,
  terrain: undefined,
  msaaSamples: 4,
});

viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.atmosphereLightIntensity = 10;
viewer.scene.globe.cartographicLimitRectangle = AMERICA_LIMIT;
viewer.scene.globe.showSkirts = true;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1220');
viewer.scene.fog.enabled = true;
viewer.scene.skyAtmosphere.show = false;
viewer.scene.skyBox.show = false;
viewer.scene.sun.show = false;
viewer.scene.moon.show = false;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b1220');
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 40;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 9_000_000;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;

function clampCameraToAmerica() {
  const rect = AMERICA_LIMIT;
  const camera = viewer.camera;
  const carto = camera.positionCartographic;
  if (!carto) return;

  const lon = Cesium.Math.clamp(carto.longitude, rect.west, rect.east);
  const lat = Cesium.Math.clamp(carto.latitude, rect.south, rect.north);
  const maxHeight = viewer.scene.screenSpaceCameraController.maximumZoomDistance;
  const height = Cesium.Math.clamp(carto.height, 40, maxHeight);

  if (
    lon !== carto.longitude ||
    lat !== carto.latitude ||
    height !== carto.height
  ) {
    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(lon, lat, height),
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      },
    });
  }
}

viewer.camera.changed.addEventListener(clampCameraToAmerica);
viewer.camera.percentageChanged = 0.01;

async function setupImagery() {
  const satellite = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    { enablePickFeatures: false },
  );
  viewer.imageryLayers.addImageryProvider(satellite);

  const roads = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer',
    { enablePickFeatures: false },
  );
  const roadLayer = viewer.imageryLayers.addImageryProvider(roads);
  roadLayer.alpha = 0.75;

  // City, town, and place name labels (Esri reference layer)
  const places = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer',
    { enablePickFeatures: false },
  );
  const placesLayer = viewer.imageryLayers.addImageryProvider(places);
  placesLayer.alpha = 1.0;

  return { roadLayer, placesLayer };
}

function flyToUsa() {
  viewer.camera.flyTo({
    destination: USA_RECTANGLE,
    duration: 1.6,
  });
}

function flyToSouthCarolina(duration = 1.6) {
  const opts = {
    destination: SC_RECTANGLE,
  };
  if (duration <= 0) {
    viewer.camera.setView(opts);
  } else {
    viewer.camera.flyTo({ ...opts, duration });
  }
}

// Always start on South Carolina (instant, before async data loads)
flyToSouthCarolina(0);

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

async function geocode(query) {
  const q = /south carolina|\bsc\b/i.test(query)
    ? query
    : `${query}, South Carolina`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('q', q);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  if (!data.length) throw new Error(`No results for "${query}"`);
  return {
    lon: Number(data[0].lon),
    lat: Number(data[0].lat),
    label: data[0].display_name,
  };
}

function featureCentroid(feature) {
  const geom = feature.geometry;
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  const eat = (ring) => {
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count += 1;
    }
  };

  if (geom.type === 'Polygon') {
    eat(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) eat(poly[0]);
  }

  return count
    ? { lon: sumLon / count, lat: sumLat / count }
    : { lon: -98.5, lat: 39.8 };
}

function featureRectangle(feature) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const eat = (ring) => {
    for (const [lon, lat] of ring) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  };

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    eat(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) eat(poly[0]);
  }

  return Cesium.Rectangle.fromDegrees(west, south, east, north);
}

let stateDataSource = null;
const labelDataSource = new Cesium.CustomDataSource('state-labels');
const cityDataSource = new Cesium.CustomDataSource('city-labels');
viewer.dataSources.add(labelDataSource);
viewer.dataSources.add(cityDataSource);

const stateIndex = new Map();

const MAJOR_CITIES = [
  ['New York', -74.006, 40.7128],
  ['Los Angeles', -118.2437, 34.0522],
  ['Chicago', -87.6298, 41.8781],
  ['Houston', -95.3698, 29.7604],
  ['Phoenix', -112.074, 33.4484],
  ['Philadelphia', -75.1652, 39.9526],
  ['San Antonio', -98.4936, 29.4241],
  ['San Diego', -117.1611, 32.7157],
  ['Dallas', -96.797, 32.7767],
  ['San Jose', -121.8863, 37.3382],
  ['Austin', -97.7431, 30.2672],
  ['Jacksonville', -81.6557, 30.3322],
  ['Fort Worth', -97.3308, 32.7555],
  ['Columbus', -82.9988, 39.9612],
  ['Charlotte', -80.8431, 35.2271],
  ['San Francisco', -122.4194, 37.7749],
  ['Indianapolis', -86.1581, 39.7684],
  ['Seattle', -122.3321, 47.6062],
  ['Denver', -104.9903, 39.7392],
  ['Washington', -77.0369, 38.9072],
  ['Boston', -71.0589, 42.3601],
  ['El Paso', -106.485, 31.7619],
  ['Nashville', -86.7816, 36.1627],
  ['Detroit', -83.0458, 42.3314],
  ['Oklahoma City', -97.5164, 35.4676],
  ['Portland', -122.6765, 45.5152],
  ['Las Vegas', -115.1398, 36.1699],
  ['Memphis', -90.049, 35.1495],
  ['Louisville', -85.7585, 38.2527],
  ['Baltimore', -76.6122, 39.2904],
  ['Milwaukee', -87.9065, 43.0389],
  ['Albuquerque', -106.6504, 35.0844],
  ['Tucson', -110.9747, 32.2226],
  ['Fresno', -119.7871, 36.7378],
  ['Sacramento', -121.4944, 38.5816],
  ['Mesa', -111.8315, 33.4152],
  ['Kansas City', -94.5786, 39.0997],
  ['Atlanta', -84.388, 33.749],
  ['Miami', -80.1918, 25.7617],
  ['Raleigh', -78.6382, 35.7796],
  ['Omaha', -95.9345, 41.2565],
  ['Colorado Springs', -104.8214, 38.8339],
  ['Minneapolis', -93.265, 44.9778],
  ['Tampa', -82.4572, 27.9506],
  ['New Orleans', -90.0715, 29.9511],
  ['Cleveland', -81.6944, 41.4993],
  ['Honolulu', -157.8583, 21.3069],
  ['Anchorage', -149.9003, 61.2181],
  ['Salt Lake City', -111.891, 40.7608],
  ['Orlando', -81.3792, 28.5383],
  ['Pittsburgh', -79.9959, 40.4406],
  ['Cincinnati', -84.512, 39.1031],
  ['St. Louis', -90.1994, 38.627],
  ['Reno', -119.8138, 39.5296],
  ['Boise', -116.2023, 43.615],
  ['Richmond', -77.436, 37.5407],
  ['Birmingham', -86.8025, 33.5207],
  ['Des Moines', -93.6091, 41.5868],
  ['Providence', -71.4128, 41.824],
  ['Buffalo', -78.8784, 42.8864],
];

function addPlaceLabel(dataSource, id, text, lon, lat, options = {}) {
  const {
    font = '600 15px Segoe UI, sans-serif',
    nearScale = 1.15,
    farScale = 0.55,
    near = 8.0e4,
    far = 4.5e6,
    fadeFar = 7.5e6,
  } = options;

  dataSource.entities.add({
    id,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    label: {
      text,
      font,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#071018').withAlpha(0.72),
      backgroundPadding: new Cesium.Cartesian2(8, 5),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(near, nearScale, far, farScale),
      translucencyByDistance: new Cesium.NearFarScalar(far * 0.85, 1.0, fadeFar, 0.0),
    },
  });
}

function geometryRings(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((poly) => poly[0]);
  return [];
}

async function loadStates() {
  const res = await fetch(STATES_URL);
  if (!res.ok) throw new Error('Could not load state boundaries');
  const geojson = await res.json();
  const select = document.getElementById('stateSelect');

  // Polygon outlines are unreliable in Cesium on many GPUs — use red polylines instead
  stateDataSource = new Cesium.CustomDataSource('states');
  viewer.dataSources.add(stateDataSource);

  const sorted = [...geojson.features].sort((a, b) =>
    String(a.properties.name).localeCompare(String(b.properties.name)),
  );

  for (const feature of sorted) {
    const name = feature.properties.name;
    const meta = stateMeta[name] || { abbr: name.slice(0, 2).toUpperCase() };
    const rect = featureRectangle(feature);
    const center = featureCentroid(feature);
    stateIndex.set(name, { rect, center, feature });

    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name} (${meta.abbr})`;
    if (select) select.appendChild(opt);

    const rings = geometryRings(feature.geometry);
    rings.forEach((ring, ringIndex) => {
      const positions = ring.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat),
      );
      stateDataSource.entities.add({
        id: `border-${meta.abbr}-${ringIndex}`,
        name,
        polyline: {
          positions,
          width: 4,
          material: Cesium.Color.RED,
          clampToGround: true,
          arcType: Cesium.ArcType.GEODESIC,
          zIndex: 20,
        },
      });
    });

    addPlaceLabel(labelDataSource, `label-${meta.abbr}-${name}`, name, center.lon, center.lat, {
      font: '700 18px Segoe UI, sans-serif',
      nearScale: 1.35,
      farScale: 0.7,
      near: 2.0e5,
      far: 6.0e6,
      fadeFar: 1.2e7,
    });
  }
}

function loadCities() {
  for (const [name, lon, lat] of MAJOR_CITIES) {
    addPlaceLabel(cityDataSource, `city-${name}`, name, lon, lat, {
      font: '600 14px Segoe UI, sans-serif',
      nearScale: 1.2,
      farScale: 0.45,
      near: 2.0e4,
      far: 2.2e6,
      fadeFar: 3.8e6,
    });
  }
}

const poiDataSource = new Cesium.CustomDataSource('sc-pois');
viewer.dataSources.add(poiDataSource);

let roadLayer = null;
let placesLayer = null;
let streetViewPicking = false;
let streetViewMarker = null;
let userLocation = null;
let userLocationEntity = null;
let selectedPoi = null;
let routeEntity = null;
let poiLoading = false;

const pinImageCache = {};

function getPinImage(category) {
  if (!pinImageCache[category]) {
    const meta = POI_CATEGORIES[category] || { color: '#888', letter: '?' };
    pinImageCache[category] = pinSvgDataUri(meta.color, meta.letter);
  }
  return pinImageCache[category];
}

let activeFindCategory = null;

function getEnabledCategories() {
  if (activeFindCategory) return [activeFindCategory];
  return ['restaurant', 'fuel', 'shop', 'beach', 'cafe', 'hotel'];
}

function getOriginForRouting() {
  if (userLocation) return userLocation;
  const carto = viewer.camera.positionCartographic;
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
  };
}

function findNearestPoi(pois, origin) {
  let best = null;
  let bestDist = Infinity;
  for (const poi of pois) {
    const d = distanceMeters(origin, poi);
    if (d < bestDist) {
      bestDist = d;
      best = poi;
    }
  }
  return best;
}

async function collectCategoryPois(category, origin) {
  const fallback = fallbackPoisForCategories([category]);
  let live = [];
  try {
    live = await fetchPoisAround(origin.lat, origin.lon, [category], 35000, 100);
  } catch (err) {
    console.warn('Live places unavailable for', category, err);
  }
  const byId = new Map();
  for (const p of [...fallback, ...live]) byId.set(p.id, p);
  return [...byId.values()];
}

function clearPois() {
  poiDataSource.entities.removeAll();
}

function addPoiPins(pois) {
  for (const poi of pois) {
    if (poiDataSource.entities.getById(`poi-${poi.id}`)) continue;
    const entity = poiDataSource.entities.add({
      id: `poi-${poi.id}`,
      name: poi.name,
      position: Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat, 40),
      billboard: {
        image: getPinImage(poi.category),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 1.35,
        scaleByDistance: new Cesium.NearFarScalar(800, 1.6, 900000, 0.55),
        translucencyByDistance: new Cesium.NearFarScalar(600000, 1.0, 2.5e6, 0.15),
        heightReference: Cesium.HeightReference.NONE,
      },
      label: {
        text: poi.name,
        font: '600 12px Segoe UI, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, -42),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.0, 1.2e5, 0.0),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#071018').withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
      },
    });
    entity.poi = poi;
  }
}

async function loadPoisNear(lat, lon, radiusMeters = 22000) {
  const categories = getEnabledCategories();
  if (!categories.length) {
    clearPois();
    setStatus('Turn on at least one place type.');
    return;
  }
  if (poiLoading) return;
  poiLoading = true;
  setStatus('Loading places near you in South Carolina…');
  try {
    clearPois();
    const fallback = fallbackPoisForCategories(categories).filter(
      (p) => distanceMeters({ lat, lon }, p) <= Math.max(radiusMeters, 80000),
    );
    addPoiPins(fallback);

    try {
      const pois = await fetchPoisAround(lat, lon, categories, radiusMeters, 140);
      addPoiPins(pois);
    } catch (liveErr) {
      console.warn('Live POI fetch failed, using curated places', liveErr);
    }

    const count = poiDataSource.entities.values.length;
    setStatus(
      count
        ? `Showing ${count} places. Click a pin for directions.`
        : 'No places found nearby for the selected types.',
    );
  } catch (err) {
    console.error(err);
    setStatus('Could not load places. Try again in a moment.');
  } finally {
    poiLoading = false;
  }
}

async function loadPoisForMapCenter() {
  const carto = viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  if (!isInSouthCarolina(lat, lon)) {
    setStatus('Pan into South Carolina, then load places.');
    flyToSouthCarolina();
    return;
  }
  await loadPoisNear(lat, lon, 28000);
}

async function loadStatewideSample() {
  const categories = getEnabledCategories();
  if (!categories.length) {
    clearPois();
    return;
  }
  setStatus('Loading South Carolina places…');
  try {
    clearPois();
    addPoiPins(fallbackPoisForCategories(categories));
    const baseCount = poiDataSource.entities.values.length;
    setStatus(`Showing ${baseCount} South Carolina places. Zoom in or use my location for more.`);

    try {
      const beachOnly = categories.filter((c) => c === 'beach');
      const others = categories.filter((c) => c !== 'beach');
      if (beachOnly.length) {
        addPoiPins(await fetchPoisInSouthCarolina(beachOnly, 60));
      }
      if (others.length) {
        addPoiPins(await fetchPoisInSouthCarolina(others, 80));
      }
      const total = poiDataSource.entities.values.length;
      setStatus(`Showing ${total} places in SC. Click a pin for details & directions.`);
    } catch (liveErr) {
      console.warn('Overpass enrichment skipped', liveErr);
    }
  } catch (err) {
    console.error(err);
    addPoiPins(fallbackPoisForCategories(categories));
    setStatus(`Showing ${poiDataSource.entities.values.length} curated SC places.`);
  }
}

function setUserLocation(lat, lon) {
  userLocation = { lat, lon };
  if (userLocationEntity) viewer.entities.remove(userLocationEntity);
  userLocationEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString('#4285F4'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: 'You',
      font: '600 13px Segoe UI, sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function locateUser() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported in this browser.');
    return;
  }
  setStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setUserLocation(lat, lon);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 12000),
        duration: 1.5,
      });
      if (!isInSouthCarolina(lat, lon)) {
        setStatus('You appear outside SC — still showing nearby pins if any fall in SC.');
      }
      await loadPoisNear(lat, lon, 25000);
    },
    (err) => {
      setStatus(`Location denied or unavailable (${err.message}).`);
    },
    { enableHighAccuracy: true, timeout: 15000 },
  );
}

function hidePlaceCard() {
  document.getElementById('placeCard').hidden = true;
  document.getElementById('nearbyListWrap').hidden = true;
  document.getElementById('nearbyList').innerHTML = '';
  selectedPoi = null;
}

function showPlaceCard(poi, nearbyPois = []) {
  selectedPoi = poi;
  const card = document.getElementById('placeCard');
  const meta = POI_CATEGORIES[poi.category];
  document.getElementById('placeCardType').textContent = meta?.label || poi.category;
  document.getElementById('placeCardType').style.color = meta?.color || '#fff';
  document.getElementById('placeCardName').textContent = poi.name;

  const origin = getOriginForRouting();
  let metaText = `${poi.lat.toFixed(4)}, ${poi.lon.toFixed(4)}`;
  if (origin) {
    const d = distanceMeters(origin, poi);
    metaText = `${formatDistance(d)} away`;
    if (userLocation) metaText += ' from you';
  }
  document.getElementById('placeCardMeta').textContent = metaText;

  const gLink = document.getElementById('placeGoogleLink');
  if (userLocation) {
    gLink.href = googleDirectionsUrl(userLocation, poi);
    gLink.textContent = 'Open directions in Google Maps';
  } else {
    gLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(poi.name + ' South Carolina')}`;
    gLink.textContent = 'Open in Google Maps';
  }

  const wrap = document.getElementById('nearbyListWrap');
  const list = document.getElementById('nearbyList');
  list.innerHTML = '';
  const options = (nearbyPois.length ? nearbyPois : [poi])
    .map((p) => ({ poi: p, dist: distanceMeters(origin, p) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  if (options.length > 1) {
    wrap.hidden = false;
    for (const { poi: option, dist } of options) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = option.id === poi.id ? 'active' : '';
      btn.innerHTML =
        `<span class="nearby-name">${option.name}</span>` +
        `<span class="nearby-dist">${formatDistance(dist)} · ${POI_CATEGORIES[option.category]?.label || ''}</span>`;
      btn.addEventListener('click', () => {
        clearRoute();
        showPlaceCard(option, nearbyPois);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(option.lon, option.lat, 2200),
          duration: 1.1,
        });
        setStatus(`Selected: ${option.name}. Tap Directions when ready.`);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  } else {
    wrap.hidden = true;
  }

  card.hidden = false;
}

async function findCategoryAndRoute(category) {
  activeFindCategory = category;
  document.body.classList.add('finding-place');
  const backBtn = document.getElementById('findPlaceBackBtn');
  if (backBtn) backBtn.hidden = false;

  for (const btn of document.querySelectorAll('[data-find]')) {
    btn.classList.toggle('active', btn.dataset.find === category);
  }

  const label = POI_CATEGORIES[category]?.label || category;
  setStatus(`Finding ${label.toLowerCase()}s in South Carolina…`);

  if (!userLocation && navigator.geolocation) {
    await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation(pos.coords.latitude, pos.coords.longitude);
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  const origin = getOriginForRouting();
  const pois = await collectCategoryPois(category, origin);
  clearPois();
  clearRoute();
  addPoiPins(pois);

  const ranked = [...pois]
    .map((p) => ({ poi: p, dist: distanceMeters(origin, p) }))
    .sort((a, b) => a.dist - b.dist);
  const nearest = ranked[0]?.poi;

  if (!nearest) {
    hidePlaceCard();
    setStatus(`No ${label.toLowerCase()} found nearby in South Carolina.`);
    return;
  }

  showPlaceCard(nearest, pois);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(nearest.lon, nearest.lat, 2500),
    duration: 1.4,
  });
  setStatus(
    `${label}: ${nearest.name} (${formatDistance(ranked[0].dist)}). Tap Directions for the route.`,
  );
}

function exitFindPlaceMode() {
  document.body.classList.remove('finding-place');
  const backBtn = document.getElementById('findPlaceBackBtn');
  if (backBtn) backBtn.hidden = true;
  activeFindCategory = null;
  for (const btn of document.querySelectorAll('[data-find]')) {
    btn.classList.remove('active');
  }
  hidePlaceCard();
  clearRoute();
  setStatus('Choose a place type, or browse the map.');
}

function clearRoute() {
  if (routeEntity) {
    viewer.entities.remove(routeEntity);
    routeEntity = null;
  }
}

async function directionsToSelected() {
  if (!selectedPoi) return;
  if (!userLocation) {
    setStatus('Tap “Use my location” first, then Directions.');
    locateUser();
    return;
  }
  setStatus(`Routing to ${selectedPoi.name}…`);
  try {
    clearRoute();
    const route = await fetchRoute(userLocation, selectedPoi);
    const coords = route.geometry.coordinates;
    routeEntity = viewer.entities.add({
      polyline: {
        positions: coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
        width: 5,
        material: Cesium.Color.fromCssColorString('#4285F4'),
        clampToGround: true,
      },
    });
    viewer.flyTo(routeEntity, { duration: 1.4 });
    const summary = `${formatDistance(route.distance)} · ${formatDuration(route.duration)}`;
    document.getElementById('placeCardMeta').textContent = summary;
    setStatus(`Route to ${selectedPoi.name}: ${summary}`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Could not build route');
  }
}

function googleStreetViewEmbedUrl(lat, lon, heading = 0) {
  return (
    `https://www.google.com/maps?layer=c&cbll=${lat},${lon}` +
    `&cbp=12,${heading},0,0,0&hl=en&output=svembed`
  );
}

function googleStreetViewMapsUrl(lat, lon) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}

function closeStreetView() {
  exitStreetViewFullscreen();
  document.body.classList.remove('streetview-open', 'streetview-expanded');
  const panel = document.getElementById('streetViewPanel');
  panel.hidden = true;
  const frame = document.getElementById('streetViewFrame');
  frame.src = 'about:blank';
  frame.hidden = false;
  document.getElementById('svFallback').hidden = true;
  updateStreetViewFullscreenIcons(false);
  viewer.resize();
}

function updateStreetViewFullscreenIcons(expanded) {
  const expand = document.getElementById('svExpandIcon');
  const compress = document.getElementById('svCompressIcon');
  const btn = document.getElementById('svFullscreenBtn');
  if (!expand || !compress || !btn) return;
  expand.hidden = expanded;
  compress.hidden = !expanded;
  btn.title = expanded ? 'Exit full screen' : 'Full screen';
  btn.setAttribute('aria-label', expanded ? 'Exit full screen Street View' : 'Full screen Street View');
}

function isStreetViewFullscreen() {
  const panel = document.getElementById('streetViewPanel');
  return (
    document.fullscreenElement === panel ||
    document.body.classList.contains('streetview-expanded')
  );
}

async function enterStreetViewFullscreen() {
  const panel = document.getElementById('streetViewPanel');
  try {
    if (panel.requestFullscreen) {
      await panel.requestFullscreen();
    } else {
      document.body.classList.add('streetview-expanded');
    }
  } catch {
    document.body.classList.add('streetview-expanded');
  }
  updateStreetViewFullscreenIcons(true);
  requestAnimationFrame(() => viewer.resize());
}

async function exitStreetViewFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* ignore */
  }
  document.body.classList.remove('streetview-expanded');
  updateStreetViewFullscreenIcons(false);
  requestAnimationFrame(() => viewer.resize());
}

async function toggleStreetViewFullscreen() {
  if (isStreetViewFullscreen()) {
    await exitStreetViewFullscreen();
  } else {
    await enterStreetViewFullscreen();
  }
}

function openStreetView(lat, lon) {
  const panel = document.getElementById('streetViewPanel');
  const frame = document.getElementById('streetViewFrame');
  const fallback = document.getElementById('svFallback');
  const external = document.getElementById('svOpenExternal');
  const fallbackLink = document.getElementById('svFallbackLink');
  const mapsUrl = googleStreetViewMapsUrl(lat, lon);

  external.href = mapsUrl;
  fallbackLink.href = mapsUrl;
  document.getElementById('svTitle').textContent =
    `Street View · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  fallback.hidden = true;
  frame.hidden = false;
  frame.src = googleStreetViewEmbedUrl(lat, lon);

  panel.hidden = false;
  document.body.classList.add('streetview-open');
  // Cesium needs a resize after the map pane shrinks
  requestAnimationFrame(() => viewer.resize());

  if (streetViewMarker) {
    viewer.entities.remove(streetViewMarker);
  }
  streetViewMarker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    billboard: {
      image:
        'data:image/svg+xml,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
            <path fill="#fbbc04" stroke="#202124" stroke-width="1.5"
              d="M14 1c-6 0-11 5-11 11 0 8.5 11 26 11 26s11-17.5 11-26c0-6-5-11-11-11z"/>
            <circle cx="14" cy="12" r="4.5" fill="#202124"/>
          </svg>`,
        ),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 1,
    },
  });

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, 450),
    orientation: {
      heading: viewer.camera.heading,
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 1.1,
  });

  setStatus('Street View open — drag inside the panorama to look around.');
}

function setStreetViewPicking(on) {
  streetViewPicking = on;
  document.body.classList.toggle('sv-picking', on);
  document.getElementById('streetViewBtn').classList.toggle('active', on);
  document.getElementById('streetViewHint').textContent = on
    ? 'Click a road or place on the map…'
    : 'Click the button, then click a road on the map.';
  setStatus(on ? 'Street View: click anywhere on the map' : '');
}

function pickLatLonFromClick(position) {
  const ray = viewer.camera.getPickRay(position);
  if (!ray) return null;
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (!cartesian) {
    const ellipsoidHit = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
    if (!ellipsoidHit) return null;
    const carto = Cesium.Cartographic.fromCartesian(ellipsoidHit);
    return {
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude),
    };
  }
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
  };
}

function wireUi(layers) {
  roadLayer = layers.roadLayer;
  placesLayer = layers.placesLayer;

  document.getElementById('usaBtn').addEventListener('click', flyToUsa);
  document.getElementById('scBtn').addEventListener('click', () => {
    closeStreetView();
    flyToSouthCarolina();
  });
  document.getElementById('locateBtn').addEventListener('click', locateUser);
  document.getElementById('reloadPoisBtn')?.addEventListener?.('click', () => {
    loadPoisForMapCenter();
  });

  for (const btn of document.querySelectorAll('[data-find]')) {
    btn.addEventListener('click', () => {
      findCategoryAndRoute(btn.dataset.find);
    });
  }

  document.getElementById('findPlaceBackBtn')?.addEventListener('click', () => {
    exitFindPlaceMode();
    flyToSouthCarolina();
    loadStatewideSample();
  });

  document.getElementById('placeCardClose').addEventListener('click', () => {
    hidePlaceCard();
  });
  document.getElementById('placeDirectionsBtn').addEventListener('click', directionsToSelected);
  document.getElementById('placeStreetViewBtn').addEventListener('click', () => {
    if (!selectedPoi) return;
    openStreetView(selectedPoi.lat, selectedPoi.lon);
  });

  document.getElementById('statesToggle').addEventListener('change', (e) => {
    if (stateDataSource) stateDataSource.show = e.target.checked;
  });
  document.getElementById('labelsToggle').addEventListener('change', (e) => {
    labelDataSource.show = e.target.checked;
  });
  document.getElementById('citiesToggle').addEventListener('change', (e) => {
    const on = e.target.checked;
    cityDataSource.show = on;
    if (placesLayer) placesLayer.show = on;
  });
  document.getElementById('roadsToggle').addEventListener('change', (e) => {
    if (roadLayer) roadLayer.show = e.target.checked;
  });

  const doSearch = async () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    try {
      setStatus(`Searching “${q}” in South Carolina…`);
      const hit = await geocode(q);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(hit.lon, hit.lat, 2500),
        duration: 1.8,
      });
      setStatus(hit.label);
      await loadPoisNear(hit.lat, hit.lon, 18000);
    } catch (err) {
      setStatus(err.message);
    }
  };

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  document.getElementById('streetViewBtn').addEventListener('click', () => {
    setStreetViewPicking(!streetViewPicking);
  });

  document.getElementById('svCloseBtn').addEventListener('click', () => {
    closeStreetView();
    setStreetViewPicking(false);
    setStatus('Street View closed.');
  });

  document.getElementById('svFullscreenBtn').addEventListener('click', () => {
    toggleStreetViewFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    const panel = document.getElementById('streetViewPanel');
    const nativeFs = document.fullscreenElement === panel;
    if (!nativeFs) {
      document.body.classList.remove('streetview-expanded');
    }
    updateStreetViewFullscreenIcons(nativeFs || document.body.classList.contains('streetview-expanded'));
    requestAnimationFrame(() => viewer.resize());
  });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    if (streetViewPicking) {
      const point = pickLatLonFromClick(movement.position);
      if (!point) {
        setStatus('Could not read that point — try clicking on land.');
        return;
      }
      setStreetViewPicking(false);
      openStreetView(point.lat, point.lon);
      return;
    }

    const picked = viewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id && picked.id.poi) {
      const all = poiDataSource.entities.values
        .map((e) => e.poi)
        .filter(Boolean);
      showPlaceCard(picked.id.poi, all);
      return;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.getElementById('streetViewFrame').addEventListener('error', () => {
    document.getElementById('streetViewFrame').hidden = true;
    document.getElementById('svFallback').hidden = false;
  });

  window.addEventListener('resize', () => viewer.resize());
}

async function main() {
  try {
    const layers = await setupImagery();
    wireUi(layers);
    flyToSouthCarolina(0);
    setStatus('Loading South Carolina…');
    await loadStates();
    loadCities();
    await loadStatewideSample();
    setStatus('Ready — tap Gas station, Restaurant, Beach, etc. for directions to the nearest one.');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Failed to start map');
  }
}

main();
