# CustomMaps Folder

This is the dedicated folder for your OpenStreetMap export files (`.osm` / `.xml`).

## How to Use:
1. **Drop your `.osm` files here**:
   - You can name it `map.osm`, `lagangilang.osm`, or have multiple area files (e.g. `lagangilang-poblacion.osm`, `lagangilang-campus.osm`).
2. **Automatic Compilation**:
   - Whenever you run `npm run build` or `npm run convert-osm`, all `.osm` files in this folder are automatically parsed, flattened, and merged into `public/data/lagangilang-custom.geojson` for the map.
3. **In-App Upload**:
   - You can also upload or merge `.osm` files directly inside the web app in **Admin Tools → Custom OSM Overlay → ⚙️ Import / Merge**.
