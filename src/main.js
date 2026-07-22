import './style.css';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Contiguous US framing for the default camera
const USA_RECTANGLE = Cesium.Rectangle.fromDegrees(-125.0, 24.0, -66.0, 49.5);
// Full US clip (lower 48 + Alaska + Hawaii + Puerto Rico) — hides the rest of the world
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

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('q', query);

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
    select.appendChild(opt);

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

let roadLayer = null;
let placesLayer = null;
let streetViewPicking = false;
let streetViewMarker = null;

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
  document.getElementById('resetBtn').addEventListener('click', () => {
    closeStreetView();
    flyToUsa();
  });

  document.getElementById('stateSelect').addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) {
      flyToUsa();
      return;
    }
    const entry = stateIndex.get(name);
    if (entry) {
      viewer.camera.flyTo({ destination: entry.rect, duration: 1.4 });
    }
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
      setStatus(`Searching “${q}”…`);
      const hit = await geocode(q);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(hit.lon, hit.lat, 1200),
        duration: 1.8,
      });
      setStatus(hit.label);
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
    if (!streetViewPicking) return;
    const point = pickLatLonFromClick(movement.position);
    if (!point) {
      setStatus('Could not read that point — try clicking on land.');
      return;
    }
    setStreetViewPicking(false);
    openStreetView(point.lat, point.lon);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // If the embed is blocked, show fallback after a short wait when frame stays blank-ish
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
    flyToUsa();
    setStatus('Loading state borders…');
    await loadStates();
    loadCities();
    setStatus('Ready — use Street View, then click a road for ground-level photos.');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Failed to start map');
  }
}

main();
