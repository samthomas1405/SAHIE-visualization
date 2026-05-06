// Uber H3 Spatial Indexing - Minimal Module
// =========================================
// Centroid-based approach: one hexagon per county/state at its centroid.
// Keeps cell count manageable (~3K county, ~51 state) and avoids performance issues.

const H3SpatialIndexing = {
  /**
   * Check if h3-js library is loaded
   */
  isAvailable() {
    return typeof h3 !== 'undefined' && h3 !== null;
  },

  /**
   * Convert lat/lng to H3 cell index
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} resolution - H3 resolution (5 for state, 6 for county)
   */
  latLngToCell(lat, lng, resolution = 6) {
    if (!this.isAvailable()) return null;
    try {
      return h3.latLngToCell ? h3.latLngToCell(lat, lng, resolution)
        : h3.geoToH3 ? h3.geoToH3(lat, lng, resolution) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get hexagon boundary as [[lat,lng], ...] for Leaflet
   * @param {string} h3Index - H3 cell index
   */
  getCellBoundary(h3Index) {
    if (!this.isAvailable() || !h3Index) return [];
    try {
      const boundary = h3.cellToBoundary
        ? h3.cellToBoundary(h3Index)
        : h3.h3ToGeoBoundary
          ? h3.h3ToGeoBoundary(h3Index)
          : null;
      if (!Array.isArray(boundary) || boundary.length < 3) return [];
      // Leaflet expects [lat, lng]. h3-js v4 returns [lat, lng]; some versions use [lng, lat]
      const first = boundary[0];
      const a = Array.isArray(first) ? first[0] : first.lat;
      const b = Array.isArray(first) ? first[1] : first.lng;
      const isLatLng = Math.abs(a) <= 90 && Math.abs(b) <= 180; // lat in [-90,90], lng in [-180,180]
      return boundary.map(c => {
        const x = Array.isArray(c) ? c[0] : c.lat;
        const y = Array.isArray(c) ? c[1] : c.lng;
        return isLatLng ? [x, y] : [y, x]; // swap if we got [lng, lat]
      });
    } catch (e) {
      return [];
    }
  },

  /**
   * Get all H3 cells whose centers fall inside a GeoJSON polygon.
   * Full grid approach: each hex gets data from the county/state it overlaps.
   * @param {Object} feature - GeoJSON feature (Polygon or MultiPolygon)
   * @param {number} resolution - H3 resolution
   * @returns {string[]} Array of H3 cell indices
   */
  polygonToCells(feature, resolution = 6) {
    if (!this.isAvailable() || !feature?.geometry) return [];
    try {
      const geom = feature.geometry;
      const fn = h3.polygonToCells;
      if (!fn) return [];
      const cells = new Set();
      if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
        const result = fn(geom.coordinates, resolution, true);
        if (Array.isArray(result)) result.forEach(c => cells.add(c));
      } else if (geom.type === 'MultiPolygon' && geom.coordinates) {
        for (const polygon of geom.coordinates) {
          if (polygon?.[0]) {
            const result = fn(polygon, resolution, true);
            if (Array.isArray(result)) result.forEach(c => cells.add(c));
          }
        }
      }
      return Array.from(cells);
    } catch (e) {
      return [];
    }
  },

  /**
   * Point-in-polygon (ray casting). Coords: GeoJSON ring [[lng,lat], ...]
   */
  pointInPolygon(lng, lat, coords) {
    if (!Array.isArray(coords) || coords.length < 3) return false;
    let inside = false;
    const n = coords.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = coords[i][0], yi = coords[i][1];
      const xj = coords[j][0], yj = coords[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  },

  /**
   * Get rings from GeoJSON geometry (Polygon or MultiPolygon)
   */
  getRings(feature) {
    if (!feature?.geometry) return [];
    const g = feature.geometry;
    if (g.type === 'Polygon' && g.coordinates?.[0]) return [g.coordinates[0]];
    if (g.type === 'MultiPolygon' && g.coordinates) {
      return g.coordinates.flatMap(p => p?.[0] ? [p[0]] : []);
    }
    return [];
  },

  /**
   * Get FIPS codes of geographically neighboring locations using H3 grid.
   * Uses gridDisk to find cells around the target's centroid, then maps those cells
   * to FIPS by checking which features contain each cell center.
   * @param {string} fips - Target FIPS code (2-digit state or 5-digit county)
   * @param {Object[]} geojsonFeatures - GeoJSON features array (from geojson.features)
   * @param {Object} options - { resolution, k, getFips }
   * @param {number} options.resolution - H3 resolution (5 for state, 6 for county)
   * @param {number} options.k - Disk radius (1 = immediate neighbors, 2 = 2 rings out)
   * @param {function} options.getFips - (feature) => fips string. Default: state id or GEO_ID
   * @returns {string[]} Neighbor FIPS codes (excludes target)
   */
  findNeighborFIPS(fips, geojsonFeatures, options = {}) {
    if (!this.isAvailable() || !geojsonFeatures?.length) return [];
    const resolution = options.resolution ?? (fips.length === 2 ? 5 : 6);
    const k = options.k ?? 1;
    const getFips = options.getFips || (f => {
      if (f.id != null) return String(f.id).padStart(fips.length, '0');
      const geoId = f.properties?.GEO_ID || '';
      return geoId.replace('0500000US', '') || '';
    });

    const fipsToFeature = {};
    for (const feat of geojsonFeatures) {
      const key = getFips(feat);
      if (key) fipsToFeature[key] = feat;
    }
    const targetFeature = fipsToFeature[fips];
    if (!targetFeature) return [];

    const centroid = this.getFeatureCentroid(targetFeature);
    if (!centroid) return [];

    const gridDisk = h3.gridDisk || h3.kRing;
    if (!gridDisk) return [];
    const originCell = this.latLngToCell(centroid.lat, centroid.lng, resolution);
    if (!originCell) return [];

    let neighborCells;
    try {
      neighborCells = gridDisk(originCell, k);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(neighborCells)) return [];

    const cellToLatLng = h3.cellToLatLng || h3.h3ToGeo;
    const neighborFIPS = new Set();
    for (const cell of neighborCells) {
      if (cell === originCell) continue;
      let lat, lng;
      try {
        const ll = cellToLatLng(cell);
        lat = Array.isArray(ll) ? ll[0] : ll.lat;
        lng = Array.isArray(ll) ? ll[1] : ll.lng;
      } catch (_) {
        continue;
      }
      for (const feat of geojsonFeatures) {
        const key = getFips(feat);
        if (!key || key === fips) continue;
        const rings = this.getRings(feat);
        for (const ring of rings) {
          if (this.pointInPolygon(lng, lat, ring)) {
            neighborFIPS.add(key);
            break;
          }
        }
      }
    }
    return Array.from(neighborFIPS);
  },

  /**
   * Compute centroid of a GeoJSON feature (Polygon or MultiPolygon)
   * @param {Object} feature - GeoJSON feature
   * @returns {{lat: number, lng: number} | null}
   */
  getFeatureCentroid(feature) {
    if (!feature?.geometry) return null;
    let coords = [];
    const geom = feature.geometry;
    if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
      coords = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
      coords = geom.coordinates[0][0];
    }
    if (coords.length < 3) return null;
    // GeoJSON is [lng, lat]
    const sumLat = coords.reduce((s, c) => s + c[1], 0);
    const sumLng = coords.reduce((s, c) => s + c[0], 0);
    return { lat: sumLat / coords.length, lng: sumLng / coords.length };
  }
};

window.H3SpatialIndexing = H3SpatialIndexing;
