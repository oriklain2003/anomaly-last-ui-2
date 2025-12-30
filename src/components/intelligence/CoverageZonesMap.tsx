import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CoverageGapZonesResponse, GPSJammingZonesResponse } from '../../api';

// type ZoneType = 'coverage' | 'jamming';

interface CoverageZonesMapProps {
  coverageZones?: CoverageGapZonesResponse | null;
  jammingZones?: GPSJammingZonesResponse | null;
  height?: number;
  showCoverage?: boolean;
  showJamming?: boolean;
}

// Color schemes for different zone types
const ZONE_COLORS = {
  coverage: {
    fill: 'rgba(59, 130, 246, 0.25)',      // Blue
    stroke: '#3b82f6',
    highRisk: 'rgba(239, 68, 68, 0.35)',   // Red for high risk
    highRiskStroke: '#ef4444'
  },
  jamming: {
    fill: 'rgba(239, 68, 68, 0.3)',        // Red
    stroke: '#ef4444',
    spoofing: 'rgba(249, 115, 22, 0.35)',  // Orange for spoofing
    spoofingStroke: '#f97316',
    denial: 'rgba(168, 85, 247, 0.35)',    // Purple for denial
    denialStroke: '#a855f7'
  }
};

export function CoverageZonesMap({ 
  coverageZones, 
  jammingZones,
  height = 450,
  showCoverage = true,
  showJamming = true
}: CoverageZonesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  const apiKey = 'r7kaQpfNDVZdaVp23F1r';

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${apiKey}`,
      center: [35.0, 32.5],
      zoom: 5.5,
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

  // Update zones when data changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const currentMap = map.current;
    
    // Clean up existing layers
    const layerIds = [
      'coverage-zones-fill', 'coverage-zones-stroke', 'coverage-zones-labels',
      'jamming-zones-fill', 'jamming-zones-stroke', 'jamming-zones-labels'
    ];
    const sourceIds = ['coverage-zones', 'jamming-zones'];
    
    try {
      layerIds.forEach(id => {
        if (currentMap.getLayer(id)) currentMap.removeLayer(id);
      });
      sourceIds.forEach(id => {
        if (currentMap.getSource(id)) currentMap.removeSource(id);
      });
    } catch (e) {
      console.debug('Map cleanup:', e);
    }

    const allBoundsPoints: [number, number][] = [];

    // Add Coverage Gap Zones
    if (showCoverage && coverageZones && coverageZones.zones.length > 0) {
      const coverageFeatures: GeoJSON.Feature[] = coverageZones.zones.map(zone => {
        allBoundsPoints.push(zone.centroid as [number, number]);
        
        const isHighRisk = zone.risk_score >= 60;
        
        return {
          type: 'Feature' as const,
          properties: {
            id: zone.id,
            type: 'coverage',
            riskScore: zone.risk_score,
            eventCount: zone.event_count,
            affectedFlights: zone.affected_flights,
            avgGapDuration: zone.avg_gap_duration_sec,
            gapType: zone.gap_type,
            areaSqNm: zone.area_sq_nm,
            isHighRisk
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [zone.polygon]
          }
        };
      });

      currentMap.addSource('coverage-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: coverageFeatures }
      });

      // Fill layer with risk-based coloring
      currentMap.addLayer({
        id: 'coverage-zones-fill',
        type: 'fill',
        source: 'coverage-zones',
        paint: {
          'fill-color': [
            'case',
            ['get', 'isHighRisk'], ZONE_COLORS.coverage.highRisk,
            ZONE_COLORS.coverage.fill
          ],
          'fill-opacity': 0.6
        }
      });

      // Stroke layer
      currentMap.addLayer({
        id: 'coverage-zones-stroke',
        type: 'line',
        source: 'coverage-zones',
        paint: {
          'line-color': [
            'case',
            ['get', 'isHighRisk'], ZONE_COLORS.coverage.highRiskStroke,
            ZONE_COLORS.coverage.stroke
          ],
          'line-width': 2,
          'line-opacity': 0.9
        }
      });

      // Click handler for coverage zones
      currentMap.on('click', 'coverage-zones-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const avgMin = Math.round((props?.avgGapDuration || 0) / 60);
          
          new maplibregl.Popup({ offset: 15 })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 12px; background: #1f2937; border-radius: 8px; color: white; min-width: 220px; font-family: system-ui;">
                <div style="font-weight: bold; color: #3b82f6; margin-bottom: 10px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                  📡 Coverage Gap Zone
                  ${props?.isHighRisk ? '<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">HIGH RISK</span>' : ''}
                </div>
                <div style="display: grid; gap: 8px; font-size: 12px;">
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #374151;">
                    <span style="color: #9ca3af;">Risk Score:</span>
                    <span style="color: ${props?.riskScore >= 60 ? '#ef4444' : props?.riskScore >= 40 ? '#f59e0b' : '#10b981'}; font-weight: bold;">
                      ${props?.riskScore}/100
                    </span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Signal Loss Events:</span>
                    <span style="color: #3b82f6; font-weight: bold;">${props?.eventCount}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Affected Flights:</span>
                    <span>${props?.affectedFlights}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Avg Gap Duration:</span>
                    <span>${avgMin} min</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Gap Type:</span>
                    <span style="text-transform: capitalize;">${props?.gapType}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Est. Area:</span>
                    <span>${props?.areaSqNm} sq nm</span>
                  </div>
                </div>
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #60a5fa;">
                  ⚠️ Flights entering this zone may lose tracking signal
                </div>
              </div>
            `)
            .addTo(currentMap);
        }
      });

      currentMap.on('mouseenter', 'coverage-zones-fill', () => {
        currentMap.getCanvas().style.cursor = 'pointer';
      });
      currentMap.on('mouseleave', 'coverage-zones-fill', () => {
        currentMap.getCanvas().style.cursor = '';
      });
    }

    // Add GPS Jamming Zones
    if (showJamming && jammingZones && jammingZones.zones.length > 0) {
      const jammingFeatures: GeoJSON.Feature[] = jammingZones.zones.map(zone => {
        allBoundsPoints.push(zone.centroid as [number, number]);
        
        return {
          type: 'Feature' as const,
          properties: {
            id: zone.id,
            type: 'jamming',
            jammingScore: zone.jamming_score,
            jammingType: zone.jamming_type,
            eventCount: zone.event_count,
            affectedFlights: zone.affected_flights,
            confidence: zone.confidence,
            areaSqNm: zone.area_sq_nm,
            altitudeSpikes: zone.indicators.altitude_spikes,
            positionTeleports: zone.indicators.position_teleports,
            headingAnomalies: zone.indicators.heading_anomalies,
            mlatOnly: zone.indicators.mlat_only
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [zone.polygon]
          }
        };
      });

      currentMap.addSource('jamming-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: jammingFeatures }
      });

      // Fill layer with type-based coloring
      currentMap.addLayer({
        id: 'jamming-zones-fill',
        type: 'fill',
        source: 'jamming-zones',
        paint: {
          'fill-color': [
            'match', ['get', 'jammingType'],
            'spoofing', ZONE_COLORS.jamming.spoofing,
            'denial', ZONE_COLORS.jamming.denial,
            ZONE_COLORS.jamming.fill
          ],
          'fill-opacity': 0.6
        }
      });

      // Stroke layer with dashed line for jamming
      currentMap.addLayer({
        id: 'jamming-zones-stroke',
        type: 'line',
        source: 'jamming-zones',
        paint: {
          'line-color': [
            'match', ['get', 'jammingType'],
            'spoofing', ZONE_COLORS.jamming.spoofingStroke,
            'denial', ZONE_COLORS.jamming.denialStroke,
            ZONE_COLORS.jamming.stroke
          ],
          'line-width': 2.5,
          'line-opacity': 0.9,
          'line-dasharray': [3, 2]
        }
      });

      // Click handler for jamming zones
      currentMap.on('click', 'jamming-zones-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const typeLabel = props?.jammingType === 'spoofing' ? '🎯 GPS Spoofing' : 
                           props?.jammingType === 'denial' ? '🚫 GPS Denial' : '⚡ Mixed Jamming';
          const typeColor = props?.jammingType === 'spoofing' ? '#f97316' : 
                           props?.jammingType === 'denial' ? '#a855f7' : '#ef4444';
          
          new maplibregl.Popup({ offset: 15 })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 12px; background: #1f2937; border-radius: 8px; color: white; min-width: 240px; font-family: system-ui;">
                <div style="font-weight: bold; color: ${typeColor}; margin-bottom: 10px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                  ${typeLabel}
                  <span style="background: ${props?.confidence === 'HIGH' ? '#ef4444' : props?.confidence === 'MEDIUM' ? '#f59e0b' : '#6b7280'}; 
                        color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: auto;">
                    ${props?.confidence}
                  </span>
                </div>
                <div style="display: grid; gap: 8px; font-size: 12px;">
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #374151;">
                    <span style="color: #9ca3af;">Jamming Score:</span>
                    <span style="color: ${props?.jammingScore >= 60 ? '#ef4444' : props?.jammingScore >= 40 ? '#f59e0b' : '#10b981'}; font-weight: bold;">
                      ${props?.jammingScore}/100
                    </span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Jamming Events:</span>
                    <span style="color: #ef4444; font-weight: bold;">${props?.eventCount}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Affected Flights:</span>
                    <span>${props?.affectedFlights}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #9ca3af;">Est. Area:</span>
                    <span>${props?.areaSqNm} sq nm</span>
                  </div>
                </div>
                <div style="margin-top: 10px; padding: 8px; background: #111827; border-radius: 6px;">
                  <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">Jamming Indicators:</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
                    <div style="color: #fbbf24;">🔺 Alt Spikes: ${props?.altitudeSpikes}</div>
                    <div style="color: #f87171;">🔀 Teleports: ${props?.positionTeleports}</div>
                    <div style="color: #a78bfa;">🔄 Heading: ${props?.headingAnomalies}</div>
                    <div style="color: #60a5fa;">📶 MLAT Only: ${props?.mlatOnly}</div>
                  </div>
                </div>
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #fca5a5;">
                  ⚠️ GPS navigation may be compromised in this zone
                </div>
              </div>
            `)
            .addTo(currentMap);
        }
      });

      currentMap.on('mouseenter', 'jamming-zones-fill', () => {
        currentMap.getCanvas().style.cursor = 'pointer';
      });
      currentMap.on('mouseleave', 'jamming-zones-fill', () => {
        currentMap.getCanvas().style.cursor = '';
      });
    }

    // Fit bounds to show all zones
    if (allBoundsPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allBoundsPoints.forEach(pt => bounds.extend(pt));
      
      currentMap.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 7,
        minZoom: 4
      });
    }
  }, [coverageZones, jammingZones, mapLoaded, showCoverage, showJamming]);

  // Add airport markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const airports = [
      { name: 'LLBG', lat: 32.01, lon: 34.89, label: 'Ben Gurion' },
      { name: 'LLER', lat: 29.94, lon: 35.00, label: 'Ramon' },
      { name: 'LLHA', lat: 32.81, lon: 35.04, label: 'Haifa' },
      { name: 'OJAI', lat: 31.72, lon: 35.99, label: 'Amman' },
      { name: 'OLBA', lat: 33.82, lon: 35.49, label: 'Beirut' },
      { name: 'LCLK', lat: 34.88, lon: 33.62, label: 'Larnaca' },
      { name: 'OSDI', lat: 33.41, lon: 36.52, label: 'Damascus' }
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
        offset: 12,
        closeButton: false
      }).setHTML(`
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

  const hasData = (coverageZones?.zones.length || 0) > 0 || (jammingZones?.zones.length || 0) > 0;

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10">
      <div 
        ref={mapContainer} 
        style={{ height: `${height}px`, width: '100%' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-xs space-y-2">
        {showCoverage && (
          <>
            <div className="text-white/80 font-medium mb-1">Coverage Gaps</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: ZONE_COLORS.coverage.fill, border: `2px solid ${ZONE_COLORS.coverage.stroke}` }} />
              <span className="text-white/70">Signal Loss Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: ZONE_COLORS.coverage.highRisk, border: `2px solid ${ZONE_COLORS.coverage.highRiskStroke}` }} />
              <span className="text-white/70">High Risk (60+)</span>
            </div>
          </>
        )}
        {showJamming && (
          <>
            <div className="text-white/80 font-medium mb-1 mt-2">GPS Jamming</div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: ZONE_COLORS.jamming.spoofing, border: `2px dashed ${ZONE_COLORS.jamming.spoofingStroke}` }} />
              <span className="text-white/70">Spoofing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: ZONE_COLORS.jamming.denial, border: `2px dashed ${ZONE_COLORS.jamming.denialStroke}` }} />
              <span className="text-white/70">Denial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: ZONE_COLORS.jamming.fill, border: `2px dashed ${ZONE_COLORS.jamming.stroke}` }} />
              <span className="text-white/70">Mixed</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
          <div className="w-2 h-2 rounded-full bg-emerald-500 border border-white" />
          <span className="text-white/60">Airport</span>
        </div>
      </div>

      {/* No data overlay */}
      {!hasData && mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-white/60 text-center">
            <div className="text-3xl mb-2">🗺️</div>
            <p>No coverage gap zones detected</p>
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


