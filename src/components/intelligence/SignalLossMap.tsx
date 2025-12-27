import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SignalLossLocation } from '../../types';
import type { GPSJammingClustersResponse } from '../../api';

interface SignalLossMapProps {
  locations: SignalLossLocation[];
  height?: number;
  showPolygonClusters?: boolean; // Enable polygon visualization for clusters
  clusterThresholdNm?: number; // Distance threshold for clustering (in nautical miles)
  precomputedClusters?: GPSJammingClustersResponse | null; // Backend-computed clusters with polygons
}

// Haversine distance in nautical miles
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in nm
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Simple convex hull using gift wrapping algorithm
function computeConvexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  
  // Find leftmost point
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[start][0]) start = i;
  }
  
  const hull: [number, number][] = [];
  let current = start;
  
  do {
    hull.push(points[current]);
    let next = 0;
    for (let i = 1; i < points.length; i++) {
      if (next === current || crossProduct(points[current], points[next], points[i]) < 0) {
        next = i;
      }
    }
    current = next;
  } while (current !== start && hull.length < points.length);
  
  return hull;
}

function crossProduct(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Generate a circular polygon around a point (for single/pair points that can't form a convex hull)
function generateCirclePolygon(centerLon: number, centerLat: number, radiusNm: number = 15, numPoints: number = 16): [number, number][] {
  const coords: [number, number][] = [];
  // Convert radius from nm to degrees (approximate)
  const radiusDegLat = radiusNm / 60; // 1 degree lat ≈ 60 nm
  const radiusDegLon = radiusNm / (60 * Math.cos(centerLat * Math.PI / 180)); // Adjust for latitude
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lon = centerLon + radiusDegLon * Math.cos(angle);
    const lat = centerLat + radiusDegLat * Math.sin(angle);
    coords.push([lon, lat]);
  }
  coords.push(coords[0]); // Close the polygon
  return coords;
}

// Cluster points that are within threshold distance (in nm)
// Now also creates polygon-ready clusters for single and pair points using circular buffers
function clusterPoints(locations: SignalLossLocation[], thresholdNm: number = 2): {
  clusters: { points: SignalLossLocation[]; centroid: [number, number]; totalCount: number; circleBuffer?: [number, number][] }[];
  singles: SignalLossLocation[];
} {
  const used = new Set<number>();
  const clusters: { points: SignalLossLocation[]; centroid: [number, number]; totalCount: number; circleBuffer?: [number, number][] }[] = [];
  const singles: SignalLossLocation[] = [];
  
  for (let i = 0; i < locations.length; i++) {
    if (used.has(i)) continue;
    
    const cluster: SignalLossLocation[] = [locations[i]];
    used.add(i);
    
    for (let j = i + 1; j < locations.length; j++) {
      if (used.has(j)) continue;
      
      // Check if any point in cluster is within threshold
      for (const p of cluster) {
        const dist = haversineNm(p.lat, p.lon, locations[j].lat, locations[j].lon);
        if (dist <= thresholdNm) {
          cluster.push(locations[j]);
          used.add(j);
          break;
        }
      }
    }
    
    // Calculate centroid and total count for all clusters (including small ones)
    const sumLat = cluster.reduce((s, p) => s + p.lat, 0);
    const sumLon = cluster.reduce((s, p) => s + p.lon, 0);
    const totalCount = cluster.reduce((s, p) => s + p.count, 0);
    const centroidLon = sumLon / cluster.length;
    const centroidLat = sumLat / cluster.length;
    
    if (cluster.length >= 3) {
      // Large enough for convex hull
      clusters.push({
        points: cluster,
        centroid: [centroidLon, centroidLat],
        totalCount
      });
    } else if (cluster.length >= 1) {
      // 1-2 points: create a circular buffer polygon around the centroid
      // Use a smaller radius for signal coverage (operational) vs larger for jamming (security)
      const bufferRadius = Math.max(8, thresholdNm / 3); // Proportional to cluster threshold
      clusters.push({
        points: cluster,
        centroid: [centroidLon, centroidLat],
        totalCount,
        circleBuffer: generateCirclePolygon(centroidLon, centroidLat, bufferRadius)
      });
    }
  }
  
  return { clusters, singles };
}

export function SignalLossMap({ 
  locations, 
  height = 400, 
  showPolygonClusters = true,
  clusterThresholdNm = 50, // Default 50nm for GPS jamming regional clusters
  precomputedClusters = null // Backend-computed clusters with polygons
}: SignalLossMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const apiKey = 'r7kaQpfNDVZdaVp23F1r'; // Same key as main app
  
  // Define cluster type with optional polygon and circle buffer
  type ClusterWithPolygon = {
    points: { lat: number; lon: number; count: number; avgDuration?: number }[];
    centroid: [number, number];
    totalCount: number;
    polygon?: [number, number][] | null;
    circleBuffer?: [number, number][]; // For small clusters (1-2 points)
  };

  // Use precomputed clusters if available, otherwise compute client-side
  const { clusters, singles, useBackendPolygons } = useMemo((): {
    clusters: ClusterWithPolygon[];
    singles: SignalLossLocation[];
    useBackendPolygons: boolean;
  } => {
    if (precomputedClusters && precomputedClusters.clusters.length > 0) {
      // Use backend-computed clusters with polygon coordinates
      // Also handle any singles by creating circle buffers for them
      const backendClusters: ClusterWithPolygon[] = precomputedClusters.clusters.map(c => ({
        points: c.points.map(p => ({ lat: p.lat, lon: p.lon, count: p.event_count, avgDuration: 300 })),
        centroid: c.centroid as [number, number],
        totalCount: c.total_events,
        polygon: c.polygon // Backend-computed polygon coordinates
      }));
      
      // Convert singles to small clusters with circle buffers
      const singleClusters: ClusterWithPolygon[] = precomputedClusters.singles.map(s => ({
        points: [{ lat: s.lat, lon: s.lon, count: s.event_count, avgDuration: 300 }],
        centroid: [s.lon, s.lat] as [number, number],
        totalCount: s.event_count,
        polygon: null,
        circleBuffer: generateCirclePolygon(s.lon, s.lat, 12) // 12nm radius for singles
      }));
      
      return {
        clusters: [...backendClusters, ...singleClusters],
        singles: [], // All points now have polygons
        useBackendPolygons: true
      };
    }
    // Fallback to client-side clustering
    if (!showPolygonClusters) return { clusters: [], singles: locations, useBackendPolygons: false };
    const result = clusterPoints(locations, clusterThresholdNm);
    return { 
      clusters: result.clusters.map(c => ({ 
        ...c, 
        polygon: null,
        circleBuffer: c.circleBuffer 
      })), 
      singles: result.singles, 
      useBackendPolygons: false 
    };
  }, [locations, showPolygonClusters, clusterThresholdNm, precomputedClusters]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${apiKey}`,
      center: [35.0, 32.0], // Israel center
      zoom: 5,
      attributionControl: false,
      renderWorldCopies: false,  // Prevent world wrapping
      maxBounds: [[-30, -10], [100, 60]]  // Limit to Europe/Middle East/Africa region
    });

    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right'
    );

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers and polygons when locations change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const currentMap = map.current;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    
    // Remove existing polygon layers
    try {
      if (currentMap.getLayer('cluster-polygons-fill')) currentMap.removeLayer('cluster-polygons-fill');
      if (currentMap.getLayer('cluster-polygons-line')) currentMap.removeLayer('cluster-polygons-line');
      if (currentMap.getSource('cluster-polygons')) currentMap.removeSource('cluster-polygons');
    } catch (e) {
      // Ignore cleanup errors
    }

    if (locations.length === 0) return;
    
    // Collect all bounds points
    const allBoundsPoints: [number, number][] = [];

    // Add polygon clusters if enabled
    if (showPolygonClusters && clusters.length > 0) {
      const polygonFeatures: GeoJSON.Feature[] = [];
      
      clusters.forEach((cluster, idx) => {
        let coordinates: [number, number][];
        
        // Priority: backend polygon > circle buffer > computed convex hull
        if (useBackendPolygons && cluster.polygon && cluster.polygon.length >= 3) {
          coordinates = cluster.polygon as [number, number][];
        } else if (cluster.circleBuffer && cluster.circleBuffer.length >= 3) {
          // Use pre-computed circle buffer for small clusters (1-2 points)
          coordinates = cluster.circleBuffer;
        } else if (cluster.points.length >= 3) {
          // Compute convex hull for larger clusters
          const hullPoints: [number, number][] = cluster.points.map(p => [p.lon, p.lat]);
          const hull = computeConvexHull(hullPoints);
          if (hull.length < 3) return; // Skip if not enough points
          coordinates = [...hull, hull[0]]; // Close the polygon
        } else {
          // Fallback: create circle buffer for any remaining small clusters
          coordinates = generateCirclePolygon(cluster.centroid[0], cluster.centroid[1], 10);
        }
        
        if (coordinates.length >= 3) {
          // Determine if this is a circle buffer (for styling)
          const isCircleBuffer = cluster.circleBuffer || cluster.points.length < 3;
          
          polygonFeatures.push({
            type: 'Feature',
            properties: {
              id: idx,
              totalCount: cluster.totalCount,
              pointCount: cluster.points.length,
              isCircleBuffer
            },
            geometry: {
              type: 'Polygon',
              coordinates: [coordinates]
            }
          });
          
          // Add centroid marker with count
          const el = document.createElement('div');
          el.style.cssText = `
            min-width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(185, 28, 28, 0.9));
            border: 3px solid rgba(255, 255, 255, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);
            cursor: pointer;
          `;
          el.textContent = cluster.totalCount.toString();
          
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: false
          }).setHTML(`
            <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 200px;">
              <div style="font-weight: bold; color: #ef4444; margin-bottom: 8px; font-size: 14px;">
                🔺 GPS Jamming Cluster
              </div>
              <div style="display: grid; gap: 6px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Total Events:</span>
                  <span style="color: #ef4444; font-weight: bold;">${cluster.totalCount}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Hotspots:</span>
                  <span>${cluster.points.length} locations</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Area Center:</span>
                  <span>${cluster.centroid[1].toFixed(2)}°N, ${cluster.centroid[0].toFixed(2)}°E</span>
                </div>
              </div>
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #fca5a5;">
                ⚠️ High concentration of signal anomalies
              </div>
            </div>
          `);
          
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(cluster.centroid)
            .setPopup(popup)
            .addTo(currentMap);
          
          markersRef.current.push(marker);
          allBoundsPoints.push(cluster.centroid);
        }
      });
      
      // Add polygon layer
      if (polygonFeatures.length > 0) {
        currentMap.addSource('cluster-polygons', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: polygonFeatures
          }
        });
        
        currentMap.addLayer({
          id: 'cluster-polygons-fill',
          type: 'fill',
          source: 'cluster-polygons',
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.25
          }
        });
        
        currentMap.addLayer({
          id: 'cluster-polygons-line',
          type: 'line',
          source: 'cluster-polygons',
          paint: {
            'line-color': '#ef4444',
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2]
          }
        });
      }
    }

    // Filter singles to only include those within the map's maxBounds
    const validSingles = singles.filter(loc => 
      loc.lat >= -10 && loc.lat <= 60 && 
      loc.lon >= -30 && loc.lon <= 100
    );
    
    // Sort by count (most events first) and limit
    const displaySingles = validSingles
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // Calculate max count for intensity scaling
    const maxCount = Math.max(...displaySingles.map(l => l.count), 1);

    // Add markers for single points
    displaySingles.forEach(loc => {
      const intensity = loc.count / maxCount;
      const size = 20 + intensity * 40;
      
      const wrapper = document.createElement('div');
      wrapper.className = 'signal-loss-marker-wrapper';
      
      const el = document.createElement('div');
      el.className = 'signal-loss-marker';
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: radial-gradient(circle, 
          rgba(239, 68, 68, ${0.6 + intensity * 0.3}) 0%, 
          rgba(239, 68, 68, ${0.2 + intensity * 0.2}) 50%,
          rgba(239, 68, 68, 0) 100%);
        border: 2px solid rgba(239, 68, 68, ${0.5 + intensity * 0.4});
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: bold;
        color: white;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        animation: signal-pulse 2s ease-in-out infinite;
      `;
      
      wrapper.appendChild(el);
      
      if (loc.count >= 3) {
        el.textContent = loc.count.toString();
      }

      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: false,
        className: 'signal-loss-popup'
      }).setHTML(`
        <div style="padding: 8px; background: #1f2937; border-radius: 8px; color: white; min-width: 180px;">
          <div style="font-weight: bold; color: #ef4444; margin-bottom: 6px; font-size: 13px;">
            ⚠️ Signal Loss Zone
          </div>
          <div style="display: grid; gap: 4px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Location:</span>
              <span>${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Events:</span>
              <span style="color: #ef4444; font-weight: bold;">${loc.count}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Avg Gap:</span>
              <span>${Math.round(loc.avgDuration)}s</span>
            </div>
          </div>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #374151; font-size: 11px; color: #6b7280;">
            Possible causes: GPS jamming, terrain, coverage gap
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ 
        element: wrapper,
        anchor: 'center'
      })
        .setLngLat([loc.lon, loc.lat])
        .setPopup(popup)
        .addTo(currentMap);

      markersRef.current.push(marker);
      allBoundsPoints.push([loc.lon, loc.lat]);
    });

    // Fit bounds to show all markers and polygons
    if (allBoundsPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allBoundsPoints.forEach(pt => bounds.extend(pt));
      
      currentMap.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 6,
        minZoom: 3
      });
    }
  }, [locations, clusters, singles, mapLoaded, showPolygonClusters]);

  // Add airport markers for reference
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const airports = [
      { name: 'LLBG', lat: 32.01, lon: 34.89, label: 'Ben Gurion' },
      { name: 'LLER', lat: 29.94, lon: 35.00, label: 'Ramon' },
      { name: 'LLHA', lat: 32.81, lon: 35.04, label: 'Haifa' },
      { name: 'LLSD', lat: 32.11, lon: 34.78, label: 'Sde Dov' },
      { name: 'OJAI', lat: 31.72, lon: 35.99, label: 'Amman' },
      { name: 'OLBA', lat: 33.82, lon: 35.49, label: 'Beirut' },
      { name: 'LCLK', lat: 34.88, lon: 33.62, label: 'Larnaca' }
    ];

    airports.forEach(apt => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 10px;
        height: 10px;
        background: #10b981;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
      `;

      const popup = new maplibregl.Popup({
        offset: 15,
        closeButton: false
      }).setHTML(`
        <div style="padding: 4px 8px; background: #1f2937; border-radius: 4px; color: white; font-size: 12px;">
          <strong style="color: #10b981;">${apt.name}</strong> - ${apt.label}
        </div>
      `);

      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([apt.lon, apt.lat])
        .setPopup(popup)
        .addTo(map.current!);
    });
  }, [mapLoaded]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10">
      <div 
        ref={mapContainer} 
        style={{ height: `${height}px`, width: '100%' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-xs">
        {showPolygonClusters && clusters.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 bg-red-500/30 border-2 border-red-500 border-dashed" style={{ transform: 'rotate(45deg)' }} />
            <span className="text-white">Jamming Cluster</span>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded-full bg-red-500/60 border border-red-500" />
          <span className="text-white">Signal Loss Zone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
          <span className="text-white">Airport</span>
        </div>
        <div className="text-white/50 mt-2 text-[10px]">
          Circle size = event frequency
        </div>
      </div>

      {/* No data overlay */}
      {locations.length === 0 && mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-white/60 text-center">
            <div className="text-2xl mb-2">📡</div>
            <p>No signal loss zones detected</p>
            <p className="text-sm text-white/40">in selected time range</p>
          </div>
        </div>
      )}

      {/* CSS for pulse animation - uses signal-pulse to avoid conflicts with MapLibre transforms */}
      <style>{`
        @keyframes signal-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .maplibregl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .maplibregl-popup-tip {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

