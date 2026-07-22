# 3D US Map

Interactive Google Earth–style **3D satellite map of the United States**, built with [Vite](https://vitejs.dev/) and [CesiumJS](https://cesium.com/platform/cesiumjs/).

**Live demo:** https://labuschagneb.github.io/3-D-US-Map/

**Repository:** https://github.com/LabuschagneB/3-D-US-Map

## Features

- Satellite imagery (ArcGIS World Imagery)
- Globe clipped to the United States (including Alaska, Hawaii, Puerto Rico)
- Zoom from country overview down toward street level
- Red state borders with full state names
- City and town labels
- Road / transportation overlay
- Place search (OpenStreetMap Nominatim)
- **Street View** — click a road to open Google Street View in a split panel (with fullscreen toggle)

## Controls

| Action | How |
|--------|-----|
| Zoom | Scroll / pinch |
| Pan | Left-drag |
| Tilt / rotate | Right-drag |
| Jump to a state | Use the state dropdown |
| Street View | Click **Street View**, then click a road on the map |

## Run locally

```bash
npm install
npm run dev
```

App opens at http://localhost:5173

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Deploy (GitHub Pages)

This repo deploys automatically to GitHub Pages via GitHub Actions on pushes to `main`.

Manual build for Pages:

```bash
npm run build
```

The Vite `base` path is set to `/3-D-US-Map/` for GitHub Pages.

## Tech stack

- Vite
- CesiumJS
- ArcGIS imagery & reference layers
- OpenStreetMap Nominatim (search)
- Google Street View embed (street-level panoramas)

## Notes

- Imagery and search use public services; heavy use may hit rate limits.
- Street View coverage depends on Google; if the embed is blank, use **Open in Google Maps**.
- Optional: add a free [Cesium ion](https://cesium.com/ion/) token later for higher-quality terrain.

## License

MIT
