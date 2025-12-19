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
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const apiKey = 'r7kaQpfNDVZdaVp23F1r'; // Same key as main app

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
      markersRef.current.forEach(m => m.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers when zones change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (zones.length === 0) return;

    // Filter and sort zones
    const validZones = zones.filter(z => 
      z.lat >= -10 && z.lat <= 60 && 
      z.lon >= -30 && z.lon <= 100
    );
    
    const displayZones = validZones
      .sort((a, b) => b.density_score - a.density_score)
      .slice(0, 10);

    // Calculate max score for intensity scaling
    const maxScore = Math.max(...displayZones.map(z => z.density_score), 1);

    // Add markers for each bottleneck zone
    displayZones.forEach((zone, idx) => {
      const intensity = zone.density_score / maxScore;
      const size = 25 + intensity * 45; // 25-70px based on intensity
      
      // Color based on congestion level
      const colors = {
        critical: { main: '239, 68, 68', border: 'rgba(239, 68, 68, 0.8)' },    // red
        high: { main: '249, 115, 22', border: 'rgba(249, 115, 22, 0.8)' },      // orange
        moderate: { main: '234, 179, 8', border: 'rgba(234, 179, 8, 0.8)' },    // yellow
        low: { main: '34, 197, 94', border: 'rgba(34, 197, 94, 0.8)' }          // green
      };
      const color = colors[zone.congestion_level as keyof typeof colors] || colors.moderate;
      
      const wrapper = document.createElement('div');
      wrapper.className = 'bottleneck-marker-wrapper';
      
      const el = document.createElement('div');
      el.className = 'bottleneck-marker';
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: radial-gradient(circle, 
          rgba(${color.main}, ${0.7 + intensity * 0.2}) 0%, 
          rgba(${color.main}, ${0.3 + intensity * 0.2}) 50%,
          rgba(${color.main}, 0) 100%);
        border: 3px solid ${color.border};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        color: white;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9);
        animation: bottleneck-pulse 3s ease-in-out infinite;
        animation-delay: ${idx * 0.2}s;
      `;
      
      wrapper.appendChild(el);
      
      // Show rank for top zones
      if (idx < 5) {
        el.textContent = `#${idx + 1}`;
      } else if ((zone.flight_count ?? 0) >= 10) {
        el.textContent = (zone.flight_count ?? 0).toString();
      }

      // Create popup with details
      const popup = new maplibregl.Popup({
        offset: 25,
        closeButton: false,
        className: 'bottleneck-popup'
      }).setHTML(`
        <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 200px; border: 1px solid ${color.border};">
          <div style="font-weight: bold; color: rgb(${color.main}); margin-bottom: 8px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">⚠️</span>
            ${(zone.congestion_level || 'unknown').toUpperCase()} Congestion
          </div>
          <div style="display: grid; gap: 6px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Location:</span>
              <span>${(zone.lat ?? 0).toFixed(2)}°N, ${(zone.lon ?? 0).toFixed(2)}°E</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Density Score:</span>
              <span style="color: rgb(${color.main}); font-weight: bold;">${zone.density_score ?? 0}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Flights:</span>
              <span style="font-weight: bold;">${zone.flight_count ?? 0}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Holding Patterns:</span>
              <span style="color: #a855f7; font-weight: bold;">${zone.holding_count ?? 0}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Avg Altitude:</span>
              <span>${(zone.avg_altitude ?? 0).toLocaleString()} ft</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #9ca3af;">Flights/Hour:</span>
              <span>${zone.flights_per_hour ?? 0}</span>
            </div>
          </div>
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #6b7280;">
            High density = potential delays & increased workload
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ 
        element: wrapper,
        anchor: 'center'
      })
        .setLngLat([zone.lon, zone.lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Fit bounds to show all markers
    if (displayZones.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      displayZones.forEach(zone => bounds.extend([zone.lon, zone.lat]));
      
      map.current.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 7,
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
        width: 8px;
        height: 8px;
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
      <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs">
        <div className="text-white/80 font-medium mb-2">Congestion Level</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500/70 border-2 border-red-500" />
            <span className="text-white">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500/70 border-2 border-orange-500" />
            <span className="text-white">High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500/70 border-2 border-yellow-500" />
            <span className="text-white">Moderate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500/70 border-2 border-green-500" />
            <span className="text-white">Low</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/20">
          <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
          <span className="text-white">Airport</span>
        </div>
        <div className="text-white/50 mt-2 text-[10px]">
          Circle size = density score
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

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes bottleneck-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
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

