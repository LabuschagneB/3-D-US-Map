# 3D US Map (South Carolina focus)

Interactive Google Earth–style **3D satellite map**, focused on **South Carolina**, built with [Vite](https://vitejs.dev/) and [CesiumJS](https://cesium.com/platform/cesiumjs/).

**Repository:** https://github.com/LabuschagneB/3-D-US-Map

## Features

- Defaults to a South Carolina fit view
- Satellite imagery with road overlay
- Find nearby places: restaurants, gas stations, shops, beaches, cafés, hotels
- Place card with name + **Directions** from your location
- Street View mode (Google Street View panel)
- Red US state borders and labels (map still covers the USA)

## How to use

1. `npm install` && `npm run dev`
2. Tap **Restaurant**, **Gas station**, **Shop**, etc.
3. Review the place name on the card
4. Tap **Directions** (allow location when prompted)

## Run locally

```bash
npm install
npm run dev
```

App opens at http://localhost:5173

```bash
npm run build
npm run preview
```

## Tech stack

- Vite + CesiumJS
- ArcGIS imagery
- OpenStreetMap / Overpass (live places when available)
- OSRM routing
- Google Street View embed

## License

MIT
