import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BottleneckZone } from '../../api';

interface BottleneckMapProps {
  zones: BottleneckZone[];
  height?: number;
}

export function BottleneckMap({ zones, height = 400 }: BottleneckMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const apiKey = 'r7kaQpfNDVZdaVp23F1r'; // Same key as main app

  // Color configuration for congestion levels
  const colors = {
    critical: { fill: 'rgba(239, 68, 68, 0.4)', stroke: 'rgba(239, 68, 68, 0.9)' },
    high: { fill: 'rgba(249, 115, 22, 0.35)', stroke: 'rgba(249, 115, 22, 0.9)' },
    moderate: { fill: 'rgba(234, 179, 8, 0.3)', stroke: 'rgba(234, 179, 8, 0.9)' },
    low: { fill: 'rgba(34, 197, 94, 0.25)', stroke: 'rgba(34, 197, 94, 0.9)' }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${apiKey}`,
      center: [35.0, 32.0], // Israel center
      zoom: 5,
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
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Helper: Generate default polygon from grid cell center
  const generateGridPolygon = (lat: number, lon: number, gridSize = 0.25): [number, number][] => {
    const half = gridSize / 2;
    return [
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half]  // Close the polygon
    ];
  };

  // Update polygon layers when zones change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing layers and sources
    ['bottleneck-fill', 'bottleneck-outline', 'bottleneck-labels'].forEach(id => {
      if (map.current?.getLayer(id)) {
        map.current.removeLayer(id);
      }
    });
    if (map.current?.getSource('bottlenecks')) {
      map.current.removeSource('bottlenecks');
    }

    if (zones.length === 0) return;

    // Filter zones by geographic bounds (accept zones with or without polygon)
    const validZones = zones.filter(z => 
      z.lat >= -10 && z.lat <= 60 && 
      z.lon >= -30 && z.lon <= 100
    );
    
    const displayZones = validZones
      .sort((a, b) => b.density_score - a.density_score)
      .slice(0, 15);

    // Convert zones to GeoJSON
    const features = displayZones.map((zone, idx) => {
      const colorConfig = colors[zone.congestion_level as keyof typeof colors] || colors.moderate;
      
      // Use existing polygon or generate from grid cell
      const polygon = (zone.polygon && zone.polygon.length >= 3) 
        ? zone.polygon 
        : generateGridPolygon(zone.lat, zone.lon);
      
      return {
        type: 'Feature' as const,
        properties: {
          id: idx,
          lat: zone.lat,
          lon: zone.lon,
          density_score: zone.density_score,
          flight_count: zone.flight_count,
          holding_count: zone.holding_count,
          avg_altitude: zone.avg_altitude,
          flights_per_hour: zone.flights_per_hour,
          congestion_level: zone.congestion_level,
          fill_color: colorConfig.fill,
          stroke_color: colorConfig.stroke,
          rank: idx + 1
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [polygon]
        }
      };
    });

    const geojson = {
      type: 'FeatureCollection' as const,
      features
    };

    // Add source
    map.current.addSource('bottlenecks', {
      type: 'geojson',
      data: geojson as GeoJSON.FeatureCollection
    });

    // Add fill layer
    map.current.addLayer({
      id: 'bottleneck-fill',
      type: 'fill',
      source: 'bottlenecks',
      paint: {
        'fill-color': ['get', 'fill_color'],
        'fill-opacity': 0.7
      }
    });

    // Add outline layer
    map.current.addLayer({
      id: 'bottleneck-outline',
      type: 'line',
      source: 'bottlenecks',
      paint: {
        'line-color': ['get', 'stroke_color'],
        'line-width': 2.5,
        'line-opacity': 1
      }
    });

    // Add popups on click
    map.current.on('click', 'bottleneck-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const props = e.features[0].properties;
      if (!props) return;

      const levelColors: Record<string, string> = {
        critical: 'rgb(239, 68, 68)',
        high: 'rgb(249, 115, 22)',
        moderate: 'rgb(234, 179, 8)',
        low: 'rgb(34, 197, 94)'
      };
      const color = levelColors[props.congestion_level] || levelColors.moderate;

      new maplibregl.Popup({ closeButton: true, className: 'bottleneck-popup' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="padding: 12px; background: #1f2937; border-radius: 8px; color: white; min-width: 220px; border: 2px solid ${color};">
            <div style="font-weight: bold; color: ${color}; margin-bottom: 10px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 16px;">⚠️</span>
              #${props.rank} ${(props.congestion_level || 'unknown').toUpperCase()} Zone
            </div>
            <div style="display: grid; gap: 8px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Center:</span>
                <span>${Number(props.lat).toFixed(2)}°N, ${Number(props.lon).toFixed(2)}°E</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Density Score:</span>
                <span style="color: ${color}; font-weight: bold;">${props.density_score}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Flights:</span>
                <span style="font-weight: bold;">${props.flight_count?.toLocaleString() || 0}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Holding Patterns:</span>
                <span style="color: #a855f7; font-weight: bold;">${props.holding_count || 0}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Avg Altitude:</span>
                <span>${Number(props.avg_altitude || 0).toLocaleString()} ft</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af;">Flights/Hour:</span>
                <span>${props.flights_per_hour || 0}</span>
              </div>
            </div>
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #374151; font-size: 11px; color: #6b7280;">
              High density = potential delays & controller workload
            </div>
          </div>
        `)
        .addTo(map.current!);
    });

    // Change cursor on hover
    map.current.on('mouseenter', 'bottleneck-fill', () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', 'bottleneck-fill', () => {
      if (map.current) map.current.getCanvas().style.cursor = '';
    });

    // Fit bounds to show all polygons
    if (displayZones.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      displayZones.forEach(zone => {
        if (zone.polygon && zone.polygon.length >= 3) {
          zone.polygon.forEach(([lon, lat]) => bounds.extend([lon, lat]));
        } else {
          // Fallback to center point with padding
          const half = 0.125; // Half of grid size
          bounds.extend([zone.lon - half, zone.lat - half]);
          bounds.extend([zone.lon + half, zone.lat + half]);
        }
      });
      
      map.current.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 8,
        minZoom: 4
      });
    }
  }, [zones, mapLoaded]);

  // Add airport markers for reference
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const airports = [
      { name: 'LLBG', lat: 32.01, lon: 34.89, label: 'Ben Gurion' },
      { name: 'LLER', lat: 29.94, lon: 35.00, label: 'Ramon' },
      { name: 'LLHA', lat: 32.81, lon: 35.04, label: 'Haifa' },
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
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;

      const popup = new maplibregl.Popup({
        offset: 15,
        closeButton: false
      }).setHTML(`
        <div style="padding: 6px 10px; background: #1f2937; border-radius: 4px; color: white; font-size: 12px;">
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
      <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs">
        <div className="text-white/80 font-medium mb-2">Congestion Level</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/50 border-2 border-red-500" />
            <span className="text-white">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500/50 border-2 border-orange-500" />
            <span className="text-white">High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500/50 border-2 border-yellow-500" />
            <span className="text-white">Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/50 border-2 border-green-500" />
            <span className="text-white">Low</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/20">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
          <span className="text-white">Airport</span>
        </div>
        <div className="text-white/50 mt-2 text-[10px]">
          Click zone for details
        </div>
      </div>

      {/* No data overlay */}
      {zones.length === 0 && mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-white/60 text-center">
            <div className="text-2xl mb-2">✈️</div>
            <p>No bottleneck zones detected</p>
            <p className="text-sm text-white/40">in selected time range</p>
          </div>
        </div>
      )}

      {/* CSS for popup styling */}
      <style>{`
        .maplibregl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .maplibregl-popup-tip {
          display: none !important;
        }
        .maplibregl-popup-close-button {
          color: white !important;
          font-size: 18px !important;
          padding: 4px 8px !important;
        }
      `}</style>
    </div>
  );
}
