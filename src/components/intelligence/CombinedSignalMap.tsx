import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GPSJammingClustersResponse, SignalLossClustersResponse } from '../../api';
import type { SignalLossLocation } from '../../types';

interface CombinedSignalMapProps {
  // GPS Jamming data with precomputed polygons
  jammingClusters: GPSJammingClustersResponse | null;
  // Signal loss data - precomputed clusters with polygons (preferred) or raw zones
  signalLossClusters: SignalLossClustersResponse | null;
  signalLossZones: SignalLossLocation[];  // Fallback if clusters not available
  height?: number;
}

// Generate a circular polygon around a point
function generateCirclePolygon(centerLon: number, centerLat: number, radiusNm: number = 15, numPoints: number = 32): [number, number][] {
  const coords: [number, number][] = [];
  const radiusDegLat = radiusNm / 60;
  const radiusDegLon = radiusNm / (60 * Math.cos(centerLat * Math.PI / 180));
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lon = centerLon + radiusDegLon * Math.cos(angle);
    const lat = centerLat + radiusDegLat * Math.sin(angle);
    coords.push([lon, lat]);
  }
  coords.push(coords[0]); // Close the polygon
  return coords;
}

export function CombinedSignalMap({ jammingClusters, signalLossClusters, signalLossZones, height = 450 }: CombinedSignalMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showJamming, setShowJamming] = useState(true);
  const [showSignalLoss, setShowSignalLoss] = useState(true);
  
  const apiKey = 'r7kaQpfNDVZdaVp23F1r';

  // Calculate summary stats
  const jammingZoneCount = (jammingClusters?.clusters?.length || 0) + (jammingClusters?.singles?.length || 0);
  const jammingEventCount = jammingClusters?.total_points || 0;
  
  // Signal loss: prefer clusters, fallback to zones
  const signalLossClusterCount = signalLossClusters?.clusters?.length || 0;
  const signalLossSinglesCount = signalLossClusters?.singles?.length || signalLossZones.length;
  const signalLossZoneCount = signalLossClusterCount + signalLossSinglesCount;
  const signalLossEventCount = signalLossClusters?.total_points || signalLossZones.reduce((sum, z) => sum + (z.count || 1), 0);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${apiKey}`,
      center: [40.0, 30.0],
      zoom: 4,
      attributionControl: false,
      renderWorldCopies: false,
      maxBounds: [[-30, -10], [100, 60]]
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

  // Update map when data or filters change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const currentMap = map.current;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    
    // Remove existing layers and sources
    const layerIds = [
      'jamming-clusters-fill', 'jamming-clusters-line',
      'jamming-singles-fill', 'jamming-singles-line',
      'signal-loss-clusters-fill', 'signal-loss-clusters-line',
      'signal-loss-singles-fill', 'signal-loss-singles-line'
    ];
    const sourceIds = ['jamming-clusters', 'jamming-singles', 'signal-loss-clusters', 'signal-loss-singles'];
    
    try {
      layerIds.forEach(id => {
        if (currentMap.getLayer(id)) currentMap.removeLayer(id);
      });
      sourceIds.forEach(id => {
        if (currentMap.getSource(id)) currentMap.removeSource(id);
      });
    } catch (e) {
      // Ignore cleanup errors
    }

    const allBoundsPoints: [number, number][] = [];

    // =========================================================================
    // GPS JAMMING - RED with dashed borders (from precomputed clusters)
    // =========================================================================
    if (showJamming && jammingClusters) {
      // Add cluster polygons
      if (jammingClusters.clusters && jammingClusters.clusters.length > 0) {
        const clusterFeatures: GeoJSON.Feature[] = jammingClusters.clusters
          .filter(c => c.polygon && c.polygon.length >= 3)
          .map((cluster, idx) => ({
            type: 'Feature' as const,
            properties: { 
              id: `jamming-cluster-${idx}`,
              total_events: cluster.total_events,
              affected_flights: cluster.affected_flights,
              point_count: cluster.point_count
            },
            geometry: { 
              type: 'Polygon' as const, 
              coordinates: [[...cluster.polygon!, cluster.polygon![0]]] // Close polygon
            }
          }));

        if (clusterFeatures.length > 0) {
          currentMap.addSource('jamming-clusters', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: clusterFeatures }
          });

          currentMap.addLayer({
            id: 'jamming-clusters-fill',
            type: 'fill',
            source: 'jamming-clusters',
            paint: {
              'fill-color': '#ef4444',
              'fill-opacity': 0.25
            }
          });

          currentMap.addLayer({
            id: 'jamming-clusters-line',
            type: 'line',
            source: 'jamming-clusters',
            paint: {
              'line-color': '#ef4444',
              'line-width': 2.5,
              'line-opacity': 0.9,
              'line-dasharray': [4, 2]
            }
          });
        }

        // Add markers for cluster centroids
        jammingClusters.clusters.forEach(cluster => {
          const el = document.createElement('div');
          const size = Math.max(36, Math.min(60, 36 + cluster.total_events / 50));
          el.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95));
            border: 3px solid rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${size > 45 ? 14 : 12}px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.6);
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.6);
            cursor: pointer;
          `;
          el.textContent = cluster.total_events.toString();

          const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 12px; background: #1f2937; border-radius: 10px; color: white; min-width: 200px; border: 2px solid #ef4444;">
              <div style="font-weight: bold; color: #ef4444; margin-bottom: 10px; font-size: 14px;">
                🔺 Dynamic Signal loss Cluster
              </div>
              <div style="display: grid; gap: 6px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Total Events:</span>
                  <span style="color: #ef4444; font-weight: bold;">${cluster.total_events}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Affected Flights:</span>
                  <span>${cluster.affected_flights}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Hotspots:</span>
                  <span>${cluster.point_count} locations</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Center:</span>
                  <span>${cluster.centroid[1].toFixed(2)}°N, ${cluster.centroid[0].toFixed(2)}°E</span>
                </div>
              </div>
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #fca5a5;">
                ⚠️ High concentration of GPS interference
              </div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(cluster.centroid as [number, number])
            .setPopup(popup)
            .addTo(currentMap);

          markersRef.current.push(marker);
          allBoundsPoints.push(cluster.centroid as [number, number]);
        });
      }

      // Add single jamming points with circle polygons
      if (jammingClusters.singles && jammingClusters.singles.length > 0) {
        const singleFeatures: GeoJSON.Feature[] = jammingClusters.singles.map((single, idx) => {
          const radius = Math.max(12, Math.min(25, 12 + (single.intensity || 50) / 8));
          const polygon = generateCirclePolygon(single.lon, single.lat, radius);
          return {
            type: 'Feature' as const,
            properties: { id: `jamming-single-${idx}`, event_count: single.event_count },
            geometry: { type: 'Polygon' as const, coordinates: [polygon] }
          };
        });

        currentMap.addSource('jamming-singles', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: singleFeatures }
        });

        currentMap.addLayer({
          id: 'jamming-singles-fill',
          type: 'fill',
          source: 'jamming-singles',
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.2
          }
        });

        currentMap.addLayer({
          id: 'jamming-singles-line',
          type: 'line',
          source: 'jamming-singles',
          paint: {
            'line-color': '#ef4444',
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [3, 2]
          }
        });

        // Add markers for singles
        jammingClusters.singles.forEach(single => {
          const el = document.createElement('div');
          const size = Math.max(28, Math.min(44, 28 + single.event_count / 3));
          el.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(185, 28, 28, 0.9));
            border: 2px solid rgba(255, 255, 255, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            box-shadow: 0 3px 10px rgba(239, 68, 68, 0.5);
            cursor: pointer;
          `;
          el.textContent = single.event_count.toString();

          const popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`
            <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 180px; border: 1px solid #ef4444;">
              <div style="font-weight: bold; color: #ef4444; margin-bottom: 8px;">🔺 Dynamic Signal loss Zone</div>
              <div style="display: grid; gap: 4px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Events:</span>
                  <span style="color: #ef4444; font-weight: bold;">${single.event_count}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Intensity:</span>
                  <span>${single.intensity || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Location:</span>
                  <span>${single.lat.toFixed(2)}°N, ${single.lon.toFixed(2)}°E</span>
                </div>
              </div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([single.lon, single.lat])
            .setPopup(popup)
            .addTo(currentMap);

          markersRef.current.push(marker);
          allBoundsPoints.push([single.lon, single.lat]);
        });
      }
    }

    // =========================================================================
    // SIGNAL LOSS - ORANGE with solid borders (from precomputed clusters or fallback to zones)
    // =========================================================================
    if (showSignalLoss) {
      // Prefer precomputed clusters with polygons
      if (signalLossClusters && signalLossClusters.clusters && signalLossClusters.clusters.length > 0) {
        const clusterFeatures: GeoJSON.Feature[] = signalLossClusters.clusters
          .filter(c => c.polygon && c.polygon.length >= 3)
          .map((cluster, idx) => ({
            type: 'Feature' as const,
            properties: { 
              id: `signal-loss-cluster-${idx}`,
              total_events: cluster.total_events,
              affected_flights: cluster.affected_flights,
              point_count: cluster.point_count
            },
            geometry: { 
              type: 'Polygon' as const, 
              coordinates: [[...cluster.polygon!, cluster.polygon![0]]] // Close polygon
            }
          }));

        if (clusterFeatures.length > 0) {
          currentMap.addSource('signal-loss-clusters', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: clusterFeatures }
          });

          currentMap.addLayer({
            id: 'signal-loss-clusters-fill',
            type: 'fill',
            source: 'signal-loss-clusters',
            paint: {
              'fill-color': '#f97316',
              'fill-opacity': 0.2
            }
          });

          currentMap.addLayer({
            id: 'signal-loss-clusters-line',
            type: 'line',
            source: 'signal-loss-clusters',
            paint: {
              'line-color': '#f97316',
              'line-width': 2,
              'line-opacity': 0.85
            }
          });
        }

        // Add markers for cluster centroids
        signalLossClusters.clusters.forEach(cluster => {
          const el = document.createElement('div');
          const size = Math.max(34, Math.min(58, 34 + cluster.total_events / 60));
          el.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(249, 115, 22, 0.95), rgba(194, 65, 12, 0.95));
            border: 3px solid rgba(255, 255, 255, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${size > 45 ? 14 : 12}px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 3px rgba(0,0,0,0.6);
            box-shadow: 0 4px 15px rgba(249, 115, 22, 0.5);
            cursor: pointer;
          `;
          el.textContent = cluster.total_events.toString();

          const avgMin = cluster.avg_duration ? Math.round(cluster.avg_duration / 60) : 'N/A';
          const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 12px; background: #1f2937; border-radius: 10px; color: white; min-width: 200px; border: 2px solid #f97316;">
              <div style="font-weight: bold; color: #f97316; margin-bottom: 10px; font-size: 14px;">
                📡 Signal Loss Cluster
              </div>
              <div style="display: grid; gap: 6px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Total Events:</span>
                  <span style="color: #f97316; font-weight: bold;">${cluster.total_events}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Affected Flights:</span>
                  <span>${cluster.affected_flights}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Avg Gap:</span>
                  <span>${avgMin} min</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Hotspots:</span>
                  <span>${cluster.point_count} locations</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Center:</span>
                  <span>${cluster.centroid[1].toFixed(2)}°N, ${cluster.centroid[0].toFixed(2)}°E</span>
                </div>
              </div>
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #fdba74;">
                Coverage gap - terrain, receiver, or passive interference
              </div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(cluster.centroid as [number, number])
            .setPopup(popup)
            .addTo(currentMap);

          markersRef.current.push(marker);
          allBoundsPoints.push(cluster.centroid as [number, number]);
        });

        // Add singles from clusters
        if (signalLossClusters.singles && signalLossClusters.singles.length > 0) {
          const singleFeatures: GeoJSON.Feature[] = signalLossClusters.singles.map((single, idx) => {
            const count = single.count || 1;
            const radius = Math.max(8, Math.min(20, 8 + count / 8));
            const polygon = generateCirclePolygon(single.lon, single.lat, radius);
            return {
              type: 'Feature' as const,
              properties: { id: `signal-loss-single-${idx}`, count },
              geometry: { type: 'Polygon' as const, coordinates: [polygon] }
            };
          });

          currentMap.addSource('signal-loss-singles', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: singleFeatures }
          });

          currentMap.addLayer({
            id: 'signal-loss-singles-fill',
            type: 'fill',
            source: 'signal-loss-singles',
            paint: {
              'fill-color': '#f97316',
              'fill-opacity': 0.15
            }
          });

          currentMap.addLayer({
            id: 'signal-loss-singles-line',
            type: 'line',
            source: 'signal-loss-singles',
            paint: {
              'line-color': '#f97316',
              'line-width': 1.5,
              'line-opacity': 0.7
            }
          });

          // Add markers for singles
          signalLossClusters.singles.forEach(single => {
            const count = single.count || 1;
            const el = document.createElement('div');
            const size = Math.max(24, Math.min(40, 24 + count / 5));
            el.style.cssText = `
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              background: linear-gradient(135deg, rgba(249, 115, 22, 0.85), rgba(194, 65, 12, 0.85));
              border: 2px solid rgba(255, 255, 255, 0.7);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              color: white;
              text-shadow: 0 1px 2px rgba(0,0,0,0.5);
              box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
              cursor: pointer;
            `;
            el.textContent = count.toString();

            const avgMin = single.avgDuration ? Math.round(single.avgDuration / 60) : 'N/A';
            const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(`
              <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 160px; border: 1px solid #f97316;">
                <div style="font-weight: bold; color: #f97316; margin-bottom: 8px;">📡 Signal Loss Zone</div>
                <div style="display: grid; gap: 4px; font-size: 12px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Events:</span>
                    <span style="color: #f97316; font-weight: bold;">${count}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Avg Gap:</span>
                    <span>${avgMin} min</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Location:</span>
                    <span>${single.lat.toFixed(2)}°N, ${single.lon.toFixed(2)}°E</span>
                  </div>
                </div>
              </div>
            `);

            const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([single.lon, single.lat])
              .setPopup(popup)
              .addTo(currentMap);

            markersRef.current.push(marker);
            allBoundsPoints.push([single.lon, single.lat]);
          });
        }
      } 
      // Fallback to signalLossZones if no clusters
      else if (signalLossZones.length > 0) {
        const zoneFeatures: GeoJSON.Feature[] = signalLossZones.map((zone, idx) => {
          const count = zone.count || 1;
          const radius = Math.max(10, Math.min(30, 10 + count / 5));
          const polygon = generateCirclePolygon(zone.lon, zone.lat, radius);
          return {
            type: 'Feature' as const,
            properties: { id: `signal-loss-zone-${idx}`, count, avgDuration: zone.avgDuration },
            geometry: { type: 'Polygon' as const, coordinates: [polygon] }
          };
        });

        currentMap.addSource('signal-loss-singles', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: zoneFeatures }
        });

        currentMap.addLayer({
          id: 'signal-loss-singles-fill',
          type: 'fill',
          source: 'signal-loss-singles',
          paint: {
            'fill-color': '#f97316',
            'fill-opacity': 0.2
          }
        });

        currentMap.addLayer({
          id: 'signal-loss-singles-line',
          type: 'line',
          source: 'signal-loss-singles',
          paint: {
            'line-color': '#f97316',
            'line-width': 2,
            'line-opacity': 0.85
          }
        });

        // Add markers for zones
        signalLossZones.forEach(zone => {
          const count = zone.count || 1;
          const el = document.createElement('div');
          const size = Math.max(26, Math.min(42, 26 + count / 4));
          el.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(194, 65, 12, 0.9));
            border: 2px solid rgba(255, 255, 255, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            box-shadow: 0 3px 10px rgba(249, 115, 22, 0.4);
            cursor: pointer;
          `;
          el.textContent = count.toString();

          const avgMin = zone.avgDuration ? Math.round(zone.avgDuration / 60) : 'N/A';
          const popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`
            <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 180px; border: 1px solid #f97316;">
              <div style="font-weight: bold; color: #f97316; margin-bottom: 8px;">📡 Signal Loss Zone</div>
              <div style="display: grid; gap: 4px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Events:</span>
                  <span style="color: #f97316; font-weight: bold;">${count}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Avg Gap:</span>
                  <span>${avgMin} min</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Location:</span>
                  <span>${zone.lat.toFixed(2)}°N, ${zone.lon.toFixed(2)}°E</span>
                </div>
              </div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([zone.lon, zone.lat])
            .setPopup(popup)
            .addTo(currentMap);

          markersRef.current.push(marker);
          allBoundsPoints.push([zone.lon, zone.lat]);
        });
      }
    }

    // Fit bounds to show all zones
    if (allBoundsPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allBoundsPoints.forEach(pt => bounds.extend(pt));
      currentMap.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 6,
        minZoom: 3
      });
    }
  }, [jammingClusters, signalLossClusters, signalLossZones, mapLoaded, showJamming, showSignalLoss]);

  // Add airport markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const airports = [
      { name: 'LLBG', lat: 32.01, lon: 34.89, label: 'Ben Gurion' },
      { name: 'LLER', lat: 29.94, lon: 35.00, label: 'Ramon' },
      { name: 'OJAI', lat: 31.72, lon: 35.99, label: 'Amman' },
      { name: 'OLBA', lat: 33.82, lon: 35.49, label: 'Beirut' },
      { name: 'LCLK', lat: 34.88, lon: 33.62, label: 'Larnaca' }
    ];

    airports.forEach(apt => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 8px;
        height: 8px;
        background: #10b981;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
      `;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
        <div style="padding: 4px 8px; background: #1f2937; border-radius: 4px; color: white; font-size: 11px;">
          <strong style="color: #10b981;">${apt.name}</strong> - ${apt.label}
        </div>
      `);

      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([apt.lon, apt.lat])
        .setPopup(popup)
        .addTo(map.current!);
    });
  }, [mapLoaded]);

  const hasData = (jammingClusters && jammingClusters.total_points > 0) || 
                  (signalLossClusters && signalLossClusters.total_points > 0) ||
                  signalLossZones.length > 0;

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10">
      {/* Filter toggles */}
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <button
          onClick={() => setShowJamming(!showJamming)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all backdrop-blur-sm ${
            showJamming 
              ? 'bg-red-500/30 text-red-300 border border-red-500/50' 
              : 'bg-black/50 text-white/40 border border-white/20 hover:bg-black/70'
          }`}
        >
          <span>🔺</span>
          Dynamic Signal loss
          {showJamming && <span className="ml-1 bg-red-500/50 px-1.5 rounded">{jammingZoneCount}</span>}
        </button>
        <button
          onClick={() => setShowSignalLoss(!showSignalLoss)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all backdrop-blur-sm ${
            showSignalLoss 
              ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50' 
              : 'bg-black/50 text-white/40 border border-white/20 hover:bg-black/70'
          }`}
        >
          <span>📡</span>
          Signal Loss
          {showSignalLoss && <span className="ml-1 bg-orange-500/50 px-1.5 rounded">{signalLossZoneCount}</span>}
        </button>
      </div>

      <div 
        ref={mapContainer} 
        style={{ height: `${height}px`, width: '100%' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs border border-white/10">
        <div className="text-white/80 font-medium mb-2">Legend</div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded bg-red-500/30 border-2 border-red-500 border-dashed" />
          <div>
            <span className="text-red-400 font-medium">Dynamic Signal loss</span>
            <p className="text-white/50 text-[10px]">Active interference zones</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded-full bg-orange-500/30 border-2 border-orange-500" />
          <div>
            <span className="text-orange-400 font-medium">Signal Loss</span>
            <p className="text-white/50 text-[10px]">Coverage gaps (5+ min)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
          <span className="text-white/60">Airport</span>
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs border border-white/10">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="text-white/50">Total Zones:</div>
          <div className="text-white font-bold">{jammingZoneCount + signalLossZoneCount}</div>
          <div className="text-red-400/80">Dynamic Signal loss Events:</div>
          <div className="text-red-400 font-bold">{jammingEventCount}</div>
          <div className="text-orange-400/80">Signal Loss Events:</div>
          <div className="text-orange-400 font-bold">{signalLossEventCount}</div>
        </div>
      </div>

      {/* No data overlay */}
      {!hasData && mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-white/60 text-center">
            <div className="text-3xl mb-2">📡🔺</div>
            <p>No signal anomalies detected</p>
            <p className="text-sm text-white/40">in selected time range</p>
          </div>
        </div>
      )}

      <style>{`
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
