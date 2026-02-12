import { useState, useEffect, useRef } from 'react';
import { Shield, Radar, TrendingUp, Info, MapPin, AlertTriangle, Clock, Plane, Target, MinusCircle, Cloud, CloudRain, Calendar, Activity, Building2, Signal, Radio } from 'lucide-react';
import { StatCard } from './StatCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import { CombinedSignalMap } from './CombinedSignalMap';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  fetchIntelligenceBatch,
  fetchSafetyBatch,
  fetchRouteEfficiency,
  fetchAvailableRoutes
} from '../../api';
import type { 
  RouteEfficiencyComparison, 
  RoutesSummary,
  GPSJammingTemporal,
  GPSJammingClustersResponse,
  GPSJammingZonesResponse,
  WeatherImpactAnalysis,
  SeasonalYearComparison,
  SpecialEventsImpact,
  AlternateAirport,
  MilitaryByCountryResponse,
  BilateralProximityResponse,
  MilitaryByDestinationResponse,
  ThreatAssessmentResponse,
  JammingTriangulationResponse,
  SpecialEvent,
  MilitaryFlightsWithTracksResponse,
  SignalLossClustersResponse
} from '../../api';
import type { SignalLossLocation } from '../../types';
import type { AirlineEfficiency, GPSJammingPoint, MilitaryPattern, PatternCluster } from '../../types';
import type { AirlineActivityTrends, MilitaryRoutes } from '../../api';
import type { SharedDashboardData } from '../../IntelligencePage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface IntelligenceTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
  sharedData?: SharedDashboardData;  // OPTIMIZATION: Use shared traffic data from parent
}

export function IntelligenceTab({ startTs, endTs, cacheKey = 0, sharedData }: IntelligenceTabProps) {
  const [, setAirlineEfficiency] = useState<AirlineEfficiency[]>([]);
  const [gpsJamming, setGpsJamming] = useState<GPSJammingPoint[]>([]);
  // Military patterns used by other sections - keeping for compatibility
  const [, setMilitaryPatterns] = useState<MilitaryPattern[]>([]);
  const [, setPatternClusters] = useState<PatternCluster[]>([]);
  const [, setAirlineActivity] = useState<AirlineActivityTrends | null>(null);
  const [militaryRoutes, setMilitaryRoutes] = useState<MilitaryRoutes | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Route efficiency state
  const [, setAvailableRoutes] = useState<string[]>([]);
  const [, setRouteEfficiency] = useState<RouteEfficiencyComparison | RoutesSummary | null>(null);
  
  
  // GPS Jamming Temporal state
  const [gpsJammingTemporal, setGpsJammingTemporal] = useState<GPSJammingTemporal | null>(null);
  
  // GPS Jamming Clusters (backend-computed polygons)
  const [gpsJammingClusters, setGpsJammingClusters] = useState<GPSJammingClustersResponse | null>(null);
  
  // NEW: GPS Jamming Zones (predictive expanded polygons)
  const [, setGpsJammingZones] = useState<GPSJammingZonesResponse | null>(null);
  
  // Level 2 Operational Insights (moved from Traffic/Safety)
  const [weatherImpact, setWeatherImpact] = useState<WeatherImpactAnalysis | null>(null);
  const [, setSeasonalTrends] = useState<SeasonalYearComparison | null>(null);
  const [specialEvents, setSpecialEvents] = useState<SpecialEventsImpact | null>(null);
  const [alternateAirports, setAlternateAirports] = useState<AlternateAirport[]>([]);
  const [signalLossZones, setSignalLossZones] = useState<SignalLossLocation[]>([]);
  
  // Signal Loss data from Safety batch (same as TrafficTab uses)
  const [signalLoss, setSignalLoss] = useState<SignalLossLocation[]>([]);
  const [signalLossClusters, setSignalLossClusters] = useState<SignalLossClustersResponse | null>(null);
  
  // Military by Country breakdown
  const [militaryByCountry, setMilitaryByCountry] = useState<MilitaryByCountryResponse | null>(null);
  
  // Bilateral Proximity Detection
  const [bilateralProximity, setBilateralProximity] = useState<BilateralProximityResponse | null>(null);
  
  // Military by Destination (Syria filter)
  const [militaryByDestination, setMilitaryByDestination] = useState<MilitaryByDestinationResponse | null>(null);
  
  // Combined Threat Assessment
  const [, setThreatAssessment] = useState<ThreatAssessmentResponse | null>(null);
  
  // Jamming Source Triangulation
  const [, setJammingTriangulation] = useState<JammingTriangulationResponse | null>(null);
  
  // Military flights with tracks for map visualization
  const [militaryFlightsWithTracks, setMilitaryFlightsWithTracks] = useState<MilitaryFlightsWithTracksResponse | null>(null);
  
  // Military map ref
  const militaryMapContainer = useRef<HTMLDivElement>(null);
  const militaryMap = useRef<maplibregl.Map | null>(null);
  const [mapContainerReady, setMapContainerReady] = useState(false);
  
  // Military map filters
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [showHeatmap, setShowHeatmap] = useState(true);
  
  // Callback ref to detect when container is mounted
  const setMilitaryMapRef = (node: HTMLDivElement | null) => {
    militaryMapContainer.current = node;
    if (node) {
      setMapContainerReady(true);
    }
  };

  useEffect(() => {
    loadData();
    loadAvailableRoutes();
  }, [startTs, endTs, cacheKey]);

  const loadAvailableRoutes = async () => {
    try {
      const routes = await fetchAvailableRoutes(startTs, endTs, 5);
      setAvailableRoutes(routes);
      // Load initial summary (without specific route)
      const summary = await fetchRouteEfficiency(startTs, endTs);
      setRouteEfficiency(summary);
    } catch (error) {
      console.error('Failed to load available routes:', error);
    }
  };

  // OPTIMIZATION: Use shared traffic data from parent when available
  useEffect(() => {
    if (sharedData && sharedData.trafficBatch) {
      const tb = sharedData.trafficBatch;
      setSeasonalTrends(tb.seasonal_year_comparison || null);
      setSpecialEvents(tb.special_events_impact || null);
      setAlternateAirports(tb.alternate_airports || []);
    }
  }, [sharedData]);

  const loadData = async () => {
    setLoading(true);
    try {
      // OPTIMIZATION: Only fetch intelligence and safety data
      // Traffic data now comes from sharedData (parent-level fetch)
      const [intelData, safetyData] = await Promise.all([
        fetchIntelligenceBatch(startTs, endTs),
        fetchSafetyBatch(startTs, endTs)
      ]);
      
      // Core intelligence data
      setAirlineEfficiency(intelData.airline_efficiency || []);
      setGpsJamming(intelData.gps_jamming || []);
      setMilitaryPatterns(intelData.military_patterns || []);
      setPatternClusters(intelData.pattern_clusters || []);
      setMilitaryRoutes(intelData.military_routes || null);
      setAirlineActivity(intelData.airline_activity || null);
      setGpsJammingTemporal(intelData.gps_jamming_temporal || null);
      setGpsJammingClusters(intelData.gps_jamming_clusters || null);
      // NEW: GPS Jamming Zones (predictive expanded polygons)
      setGpsJammingZones(intelData.gps_jamming_zones || null);
      // Signal loss zones (backend computes but was not displayed)
      setSignalLossZones(intelData.signal_loss_zones || []);
      
      // Military by Country (Level 3 deep intelligence)
      setMilitaryByCountry(intelData.military_by_country || null);
      
      // Bilateral Proximity Detection (Level 3 - Russian-American, etc.)
      setBilateralProximity(intelData.bilateral_proximity || null);
      
      // Military by Destination (Level 3 - Syria filter)
      setMilitaryByDestination(intelData.military_by_destination || null);
      
      // Combined Threat Assessment (WOW Widget)
      setThreatAssessment(intelData.threat_assessment || null);
      
      // Jamming Source Triangulation
      setJammingTriangulation(intelData.jamming_triangulation || null);
      
      // Military flights with tracks for map visualization
      setMilitaryFlightsWithTracks(intelData.military_flights_with_tracks || null);
      
      // NOTE: Traffic data now comes from sharedData (parent-level fetch)
      // This eliminates the redundant fetchTrafficBatch call
      // Fallback to direct fetch if sharedData not available
      if (sharedData?.trafficBatch) {
        // Use shared traffic data
        setSignalLoss(sharedData.trafficBatch.signal_loss || []);
        setSignalLossClusters(sharedData.trafficBatch.signal_loss_clusters || null);
      } else {
        const { fetchTrafficBatch } = await import('../../api');
        const trafficData = await fetchTrafficBatch(startTs, endTs);
        setSeasonalTrends(trafficData.seasonal_year_comparison || null);
        setSpecialEvents(trafficData.special_events_impact || null);
        setAlternateAirports(trafficData.alternate_airports || []);
        // Signal Loss data from Traffic batch (same as TrafficTab - full data with clusters!)
        setSignalLoss(trafficData.signal_loss || []);
        setSignalLossClusters(trafficData.signal_loss_clusters || null);
      }
      
      // Weather Impact (from Safety batch - Level 2 analysis)
      setWeatherImpact(safetyData.weather_impact || null);
    } catch (error) {
      console.error('Failed to load intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize military map with flight tracks by country
  useEffect(() => {
    if (!militaryMapContainer.current) return;
    
    const flights = militaryFlightsWithTracks?.flights || [];
    if (flights.length === 0) return;
    
    // Get valid flights with tracks
    const validFlights = flights.filter(f => f.track && f.track.length >= 2);
    
    // All layer and source IDs we might create
    const allLayerIds = ['military-heatmap', 'military-tracks', 'military-tracks-glow'];
    const allSourceIds = ['military-heatmap', 'military-tracks'];
    
    // Helper function to safely remove layers and sources
    const cleanupMap = (map: maplibregl.Map) => {
      try {
        allLayerIds.forEach(layerId => {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        });
        allSourceIds.forEach(sourceId => {
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        });
      } catch (e) {
        console.debug('Map cleanup:', e);
      }
    };
    
    // Initialize map if not exists
    if (!militaryMap.current) {
      militaryMap.current = new maplibregl.Map({
        container: militaryMapContainer.current,
        style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=r7kaQpfNDVZdaVp23F1r',
        center: [35.0, 31.5],
        zoom: 5
      });
      militaryMap.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const currentMap = militaryMap.current;
    
    // Filter flights by selected countries (if any selected)
    const filteredFlights = selectedCountries.size > 0
      ? validFlights.filter(f => selectedCountries.has(f.country || 'UNKNOWN'))
      : validFlights;
    
    // Add tracks to map
    const addTracks = () => {
      try {
        cleanupMap(currentMap);
        
        if (filteredFlights.length === 0) return;
        
        // 1. HEATMAP LAYER - Show activity density
        if (showHeatmap) {
          const heatmapPoints: GeoJSON.Feature[] = [];
          filteredFlights.forEach(flight => {
            // Sample points along the track (every 5th point)
            for (let i = 0; i < flight.track.length; i += 5) {
              heatmapPoints.push({
                type: 'Feature' as const,
                properties: { country: flight.country },
                geometry: { type: 'Point' as const, coordinates: flight.track[i] }
              });
            }
          });
          
          if (heatmapPoints.length > 0) {
            currentMap.addSource('military-heatmap', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: heatmapPoints }
            });
            
            currentMap.addLayer({
              id: 'military-heatmap',
              type: 'heatmap',
              source: 'military-heatmap',
              paint: {
                'heatmap-weight': 1,
                'heatmap-intensity': 0.6,
                'heatmap-radius': 20,
                'heatmap-opacity': 0.5,
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0, 'rgba(0,0,0,0)',
                  0.2, 'rgba(103,58,183,0.4)',
                  0.4, 'rgba(33,150,243,0.5)',
                  0.6, 'rgba(0,188,212,0.6)',
                  0.8, 'rgba(255,193,7,0.7)',
                  1, 'rgba(244,67,54,0.8)'
                ]
              }
            });
          }
        }
        
        // 2. ALL TRACKS - Color-coded by country
        const trackFeatures: GeoJSON.Feature[] = filteredFlights.map(flight => ({
          type: 'Feature' as const,
          properties: {
            callsign: flight.callsign,
            country: flight.country,
            type: flight.type,
            type_name: flight.type_name
          },
          geometry: { type: 'LineString' as const, coordinates: flight.track }
        }));
        
        currentMap.addSource('military-tracks', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: trackFeatures }
        });
        
        // Glow effect
        currentMap.addLayer({
          id: 'military-tracks-glow',
          type: 'line',
          source: 'military-tracks',
          paint: {
            'line-color': ['match', ['get', 'country'],
              'US', '#3b82f6', 'GB', '#ef4444', 'RU', '#f59e0b',
              'IL', '#10b981', 'NATO', '#8b5cf6', 'DE', '#facc15',
              'FR', '#ec4899', 'PL', '#06b6d4', 'ES', '#fb923c',
              'AU', '#84cc16', 'CA', '#f43f5e', 'JO', '#f59e0b',
              'UNKNOWN', '#64748b', '#6366f1'
            ],
            'line-width': 4,
            'line-opacity': 0.3,
            'line-blur': 2
          }
        });
        
        // Main tracks
        currentMap.addLayer({
          id: 'military-tracks',
          type: 'line',
          source: 'military-tracks',
          paint: {
            'line-color': ['match', ['get', 'country'],
              'US', '#3b82f6', 'GB', '#ef4444', 'RU', '#f59e0b',
              'IL', '#10b981', 'NATO', '#8b5cf6', 'DE', '#facc15',
              'FR', '#ec4899', 'PL', '#06b6d4', 'ES', '#fb923c',
              'AU', '#84cc16', 'CA', '#f43f5e', 'JO', '#f59e0b',
              'UNKNOWN', '#64748b', '#6366f1'
            ],
            'line-width': 2,
            'line-opacity': 0.8
          }
        });
        
        // Click handler for popups
        currentMap.on('click', 'military-tracks', (e) => {
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties;
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px; color: #333; font-family: system-ui;">
                  <div style="font-weight: bold; margin-bottom: 4px;">${props?.callsign || 'Unknown'}</div>
                  <div style="font-size: 12px;">
                    <div>Country: ${props?.country || 'Unknown'}</div>
                    <div>Type: ${props?.type || 'Unknown'}</div>
                    ${props?.type_name ? `<div>${props.type_name}</div>` : ''}
                  </div>
                </div>
              `)
              .addTo(currentMap);
          }
        });
        
        currentMap.on('mouseenter', 'military-tracks', () => {
          currentMap.getCanvas().style.cursor = 'pointer';
        });
        currentMap.on('mouseleave', 'military-tracks', () => {
          currentMap.getCanvas().style.cursor = '';
        });
        
      } catch (e) {
        console.error('Error adding military tracks:', e);
      }
    };

    // Add tracks when map is ready
    if (currentMap.isStyleLoaded()) {
      addTracks();
    } else {
      currentMap.once('load', addTracks);
    }

    return () => {
      currentMap.off('load', addTracks);
    };
  }, [militaryFlightsWithTracks, selectedCountries, showHeatmap, mapContainerReady]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading intelligence data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Combined Threat Assessment Widget - TOP PRIORITY - WOW Feature */}

      {/* Weather Impact Analysis - Level 2 */}
      {weatherImpact && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <CloudRain className="w-5 h-5 text-blue-400" />
              Weather Impact Analysis
              <QuestionTooltip 
                question={"כמה מטוסים סטו מנתיב הטיסה שלהם עקב סופת 'ביירון' / מז\"א בתאריך X"}
                questionEn="How many planes deviated from route due to storm 'Byron' / weather on date X?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Separating "real problems" from "weather problems"
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Weather-Related Events"
              value={weatherImpact.weather_correlated_anomalies}
              subtitle="Total weather-correlated"
              icon={<Cloud className="w-6 h-6" />}
            />
            <StatCard
              title="Weather Diversions"
              value={weatherImpact.total_diversions}
              subtitle="Destination changes"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Weather Go-Arounds"
              value={weatherImpact.total_go_arounds}
              subtitle="Aborted landings"
              icon={<Activity className="w-6 h-6" />}
            />
            <StatCard
              title="Route Deviations"
              value={weatherImpact.total_deviations}
              subtitle="Storm avoidance"
              icon={<TrendingUp className="w-6 h-6" />}
            />
          </div>

          {weatherImpact.insights && weatherImpact.insights.length > 0 && (
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-4">
              <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                Weather Impact Insights
              </h3>
              <ul className="space-y-2">
                {weatherImpact.insights.map((insight, idx) => (
                  <li key={idx} className="text-white/80 text-sm flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}




      {/* Special Events Impact - Level 2 */}
      {specialEvents && specialEvents.events && specialEvents.events.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              Special Events Impact
              <QuestionTooltip 
                question="זיהוי דפוסי תנועה חריגים סביב חגים/אירועים מיוחדים"
                questionEn="Identifying unusual traffic patterns around holidays/special events"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              How holidays and special days affect flight patterns
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {specialEvents.events!.slice(0, 6).map((event: SpecialEvent, idx: number) => (
              <div key={idx} className="bg-surface rounded-xl border border-white/10 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-bold">{event.event_name}</span>
                  <span className="text-amber-400 text-sm">{event.date}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-surface-highlight rounded p-2 text-center">
                    <div className="text-white font-bold">{event.flight_count}</div>
                    <div className="text-white/50 text-xs">Flights</div>
                  </div>
                  <div className="bg-surface-highlight rounded p-2 text-center">
                    <div className={`font-bold ${event.change_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {event.change_percent >= 0 ? '+' : ''}{event.change_percent.toFixed(0)}%
                    </div>
                    <div className="text-white/50 text-xs">vs Normal</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Alternate Airport Behavior - Level 2 */}
      {alternateAirports.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyan-400" />
              Alternate Airport Behavior
              <QuestionTooltip 
                question={"כשנתב\"ג נסגר בגלל ירי, לאן כולם בורחים?"}
                questionEn="When Ben Gurion closes due to shooting, where does everyone go?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              When Ben Gurion closes, where do aircraft go? Wide-body vs narrow-body preferences
            </p>
          </div>

          {/* Body Type Preference Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatCard
              title="Wide-Body Preferred"
              value={alternateAirports.filter(a => a.body_type_preference === 'wide_body_preferred').length}
              subtitle="Airports (747, 777, A350...)"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Narrow-Body Preferred"
              value={alternateAirports.filter(a => a.body_type_preference === 'narrow_body_preferred').length}
              subtitle="Airports (737, A320, E190...)"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Mixed Usage"
              value={alternateAirports.filter(a => a.body_type_preference === 'mixed').length}
              subtitle="Both types equally"
              icon={<Building2 className="w-6 h-6" />}
            />
          </div>

          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airport</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Diversions</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Wide-Body</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Narrow-Body</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Preference</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Aircraft Types</th>
                  </tr>
                </thead>
                <tbody>
                  {alternateAirports.slice(0, 10).map((airport, idx) => {
                    const preferenceColor = airport.body_type_preference === 'wide_body_preferred' 
                      ? 'text-purple-400' 
                      : airport.body_type_preference === 'narrow_body_preferred' 
                        ? 'text-green-400' 
                        : 'text-yellow-400';
                    const preferenceLabel = airport.body_type_preference === 'wide_body_preferred'
                      ? 'Wide-Body'
                      : airport.body_type_preference === 'narrow_body_preferred'
                        ? 'Narrow-Body'
                        : airport.body_type_preference === 'mixed'
                          ? 'Mixed'
                          : 'Unknown';
                    return (
                      <tr key={airport.airport || idx} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <span className="text-white font-medium">{airport.airport}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-cyan-400 font-bold">{airport.count}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-purple-400 font-medium">{airport.wide_body_count || 0}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-green-400 font-medium">{airport.narrow_body_count || 0}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${preferenceColor}`}>{preferenceLabel}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(airport.aircraft_types || []).slice(0, 3).map((type, i) => (
                              <span key={i} className="px-2 py-0.5 bg-surface-highlight rounded text-xs text-white/70">
                                {type}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Signal Loss Zones - Level 3 */}
      {signalLossZones.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Signal className="w-5 h-5 text-red-400" />
              Signal Loss Zones (5+ Minute Gaps)
              <QuestionTooltip 
                question="איפה רמת קליטת האות של מטוס יורדת?"
                questionEn="Where does aircraft signal reception drop?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Areas with extended signal loss - potential Dynamic Signal loss or coverage gaps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatCard
              title="Signal Loss Zones"
              value={signalLossZones.length}
              subtitle="Areas detected"
              icon={<Signal className="w-6 h-6" />}
            />
            <StatCard
              title="Total Events"
              value={signalLossZones.reduce((sum, z) => sum + (z.count || 0), 0)}
              subtitle="Signal loss events"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Avg Gap Duration"
              value={`${(signalLossZones.reduce((sum, z) => sum + (z.avgDuration || 0), 0) / signalLossZones.length / 60).toFixed(1)} min`}
              subtitle="Signal interruption"
              icon={<Clock className="w-6 h-6" />}
            />
          </div>

        </>
      )}

      {/* NEW: Combined Signal Map - Dynamic Signal loss + Signal Loss on same map */}
      {(gpsJammingClusters || signalLossClusters || signalLoss.length > 0 || signalLossZones.length > 0) && (
        <div className="bg-surface rounded-xl border border-gradient-to-r from-red-500/30 to-orange-500/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-red-500/10 via-orange-500/10 to-yellow-500/5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-orange-400" />
                  Combined Signal Analysis Map
                  <span className="px-2 py-0.5 bg-gradient-to-r from-red-500/20 to-orange-500/20 text-orange-400 text-xs font-bold rounded-full border border-orange-500/30">NEW</span>
                </h3>
                <p className="text-white/60 text-sm mt-1">
                  Dynamic Signal loss + Signal Loss (coverage gaps) on the same map
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-2 py-1 bg-red-500/20 rounded text-xs text-red-300 border border-red-500/30">
                    <span>🔺</span>
                    <span>Red = Dynamic Signal loss (active)</span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-2 py-1 bg-orange-500/20 rounded text-xs text-orange-300 border border-orange-500/30">
                    <span>📡</span>
                    <span>Orange = Signal Loss (passive)</span>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-white/10 rounded-lg p-3 max-w-xs">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-white/70">
                    <strong className="text-orange-300">Unified View:</strong> See both types of signal anomalies 
                    together to identify patterns and distinguish between intentional Dynamic Signal loss vs coverage gaps.
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <CombinedSignalMap 
              jammingClusters={gpsJammingClusters} 
              signalLossClusters={signalLossClusters}
              signalLossZones={signalLoss.length > 0 ? signalLoss : signalLossZones} 
              height={500} 
            />
          </div>
        </div>
      )}


      {/* Level 3: Deep Intelligence - THE MOST IMPORTANT SECTION */}
      <div className="border-b-2 border-purple-500/50 pb-4 pt-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-white text-2xl font-bold"> Deep Intelligence</h2>
          <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-full">INTEL</span>
          <QuestionTooltip 
            question="לבדוק איפה היו הפרעות קליטה בזמן טיסת המטוסים – אזורים חשודים / תמפה לי את כלל האזורים שיש להם הפרעות GPS"
            questionEn="Check where there were reception disruptions during flights - suspicious areas / map all GPS interference zones"
            level="L3"
          />
        </div>
        <p className="text-white/60 text-sm ml-12">
          Turning DATA into INTEL - The nation with the highest arial activity in the region mapping, foreign military presence, suspicious patterns
        </p>
      </div>


      {/* GPS Jamming Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Dynamic Signal loss Zones"
          value={gpsJamming.length}
          subtitle="Detected interference areas"
          icon={<Radar className="w-6 h-6" />}
        />
        <StatCard
          title="Military Aircraft Tracked"
          value={militaryFlightsWithTracks?.total_flights || 0}
          subtitle="Foreign military presence"
          icon={<Shield className="w-6 h-6" />}
        />
      </div>





      {/* GPS Jamming Temporal Analysis */}
      {gpsJammingTemporal && gpsJammingTemporal.total_events > 0 && (
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Dynamic Signal loss Temporal Patterns
          </h3>
          <p className="text-white/60 text-sm mb-4">
            When does Dynamic Signal loss occur most frequently?
          </p>
          
          {/* Calculation Explanation */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="text-amber-300 font-medium mb-2">How This is Calculated:</p>
                <ul className="text-white/60 space-y-1">
                  <li><span className="text-amber-400">1.</span> Each flight is analyzed for Dynamic Signal loss signatures (altitude jumps, impossible speeds, signal loss, etc.)</li>
                  <li><span className="text-amber-400">2.</span> Events with Dynamic Signal loss score ≥15 are tagged with their timestamp</li>
                  <li><span className="text-amber-400">3.</span> We count how many events occur in each hour (0-23) and day of week</li>
                  <li><span className="text-amber-400">4.</span> Peak hours/days show when Dynamic Signal loss activity is most intense</li>
                </ul>
                <p className="text-white/50 mt-2 italic">
                  Pattern: If Dynamic Signal loss spikes at specific hours/days consistently, it may indicate coordinated interference activity rather than random equipment failures.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Distribution */}
            <div>
              <h4 className="text-white/80 text-sm font-medium mb-3">By Hour of Day</h4>
              <ChartCard title="">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={gpsJammingTemporal.by_hour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="hour" 
                      stroke="#ffffff60"
                      tick={{ fill: '#ffffff60', fontSize: 9 }}
                      tickFormatter={(h) => `${h}`}
                    />
                    <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [value, 'Events']}
                      labelFormatter={(h) => `${h}:00 - ${h}:59`}
                    />
                    <Bar dataKey="count" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              {gpsJammingTemporal.peak_hours.length > 0 && (
                <div className="mt-2 text-sm text-white/60">
                  Peak hours: {gpsJammingTemporal.peak_hours.map(h => `${h}:00`).join(', ')}
                </div>
              )}
            </div>

            {/* Day of Week Distribution */}
            <div>
              <h4 className="text-white/80 text-sm font-medium mb-3">By Day of Week</h4>
              <ChartCard title="">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={gpsJammingTemporal.by_day_of_week}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="day_name" 
                      stroke="#ffffff60"
                      tick={{ fill: '#ffffff60', fontSize: 10 }}
                      tickFormatter={(name) => name.slice(0, 3)}
                    />
                    <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [value, 'Events']}
                    />
                    <Bar dataKey="count" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              {gpsJammingTemporal.peak_days.length > 0 && (
                <div className="mt-2 text-sm text-white/60">
                  Peak days: {gpsJammingTemporal.peak_days.join(', ')}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-4 bg-surface-highlight rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-amber-400">{gpsJammingTemporal.total_events}</div>
                <div className="text-white/50 text-xs">Total Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {gpsJammingTemporal.peak_hours[0] !== undefined ? `${gpsJammingTemporal.peak_hours[0]}:00` : '-'}
                </div>
                <div className="text-white/50 text-xs">Peak Hour</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {gpsJammingTemporal.peak_days[0] || '-'}
                </div>
                <div className="text-white/50 text-xs">Peak Day</div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Military Flight Tracks Map */}
      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-500" />
                Military Flight Tracks Map
              </h3>
              <p className="text-white/60 text-sm mt-1">
                All tracks color-coded by country • Heatmap shows activity density
              </p>
            </div>
            {/* Toggle controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  showHeatmap 
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' 
                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Heatmap
              </button>
            </div>
          </div>
        </div>
        
        {/* Country filter chips + Legend */}
        {militaryFlightsWithTracks && militaryFlightsWithTracks.total_flights > 0 && (
          <div className="px-6 py-3 border-b border-white/10 bg-surface-highlight/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/40 text-xs mr-2">Filter by country:</span>
              {/* Calculate country counts from actual flights with tracks, not from by_country */}
              {Object.entries(
                militaryFlightsWithTracks.flights.reduce((acc, f) => {
                  const country = f.country || 'UNKNOWN';
                  acc[country] = (acc[country] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort(([,a], [,b]) => b - a)
                .map(([country, count]) => {
                  const isSelected = selectedCountries.has(country);
                  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
                    'US': { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400' },
                    'GB': { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400' },
                    'RU': { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400' },
                    'IL': { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400' },
                    'NATO': { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400' },
                    'DE': { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400' },
                    'FR': { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400' },
                    'JO': { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400' },
                    'PL': { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400' },
                    'ES': { bg: 'bg-orange-400/20', border: 'border-orange-400/50', text: 'text-orange-300' },
                    'AU': { bg: 'bg-lime-500/20', border: 'border-lime-500/50', text: 'text-lime-400' },
                    'CA': { bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'text-rose-400' },
                    'UNKNOWN': { bg: 'bg-slate-600/20', border: 'border-slate-600/50', text: 'text-slate-400' },
                  };
                  const colors = colorMap[country] || { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-400' };
                  
                  // Country code to full name mapping
                  const countryNames: Record<string, string> = {
                    'US': 'United States',
                    'GB': 'United Kingdom',
                    'RU': 'Russia',
                    'IL': 'Israel',
                    'NATO': 'NATO Alliance',
                    'DE': 'Germany',
                    'FR': 'France',
                    'PL': 'Poland',
                    'ES': 'Spain',
                    'AU': 'Australia',
                    'CA': 'Canada',
                    'IT': 'Italy',
                    'NL': 'Netherlands',
                    'BE': 'Belgium',
                    'TR': 'Turkey',
                    'GR': 'Greece',
                    'NO': 'Norway',
                    'DK': 'Denmark',
                    'SE': 'Sweden',
                    'FI': 'Finland',
                    'PT': 'Portugal',
                    'CZ': 'Czech Republic',
                    'HU': 'Hungary',
                    'RO': 'Romania',
                    'BG': 'Bulgaria',
                    'SK': 'Slovakia',
                    'HR': 'Croatia',
                    'SI': 'Slovenia',
                    'LT': 'Lithuania',
                    'LV': 'Latvia',
                    'EE': 'Estonia',
                    'JO': 'Jordan',
                    'UNKNOWN': 'Unknown Country',
                  };
                  const fullName = countryNames[country] || country;
                  
                  return (
                    <button
                      key={country}
                      title={fullName}
                      onClick={() => {
                        const newSelected = new Set(selectedCountries);
                        if (isSelected) {
                          newSelected.delete(country);
                        } else {
                          newSelected.add(country);
                        }
                        setSelectedCountries(newSelected);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        isSelected || selectedCountries.size === 0
                          ? `${colors.bg} ${colors.border} ${colors.text}`
                          : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        country === 'US' ? 'bg-blue-400' :
                        country === 'GB' ? 'bg-red-400' :
                        country === 'RU' ? 'bg-orange-400' :
                        country === 'IL' ? 'bg-green-400' :
                        country === 'NATO' ? 'bg-purple-400' :
                        country === 'DE' ? 'bg-yellow-400' :
                        country === 'FR' ? 'bg-pink-400' :
                        country === 'JO' ? 'bg-amber-400' :
                        country === 'PL' ? 'bg-cyan-400' :
                        country === 'ES' ? 'bg-orange-300' :
                        country === 'AU' ? 'bg-lime-400' :
                        country === 'CA' ? 'bg-rose-400' :
                        country === 'UNKNOWN' ? 'bg-slate-400' :
                        'bg-indigo-400'
                      }`} />
                      {country}
                      <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}
              {selectedCountries.size > 0 && (
                <button
                  onClick={() => setSelectedCountries(new Set())}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                >
                  <MinusCircle className="w-3 h-3" />
                  Clear
                </button>
              )}
              <div className="ml-auto text-white/60 text-xs">
                <span className="font-bold text-white">{militaryFlightsWithTracks.total_flights}</span> flights with tracks
              </div>
            </div>
          </div>
        )}
        
        {/* Map container - always render to ensure ref is available */}
        <div className="relative h-[500px] w-full">
          <div 
            ref={setMilitaryMapRef} 
            className="absolute inset-0"
          />
          {/* Overlay when no data */}
          {(!militaryFlightsWithTracks || militaryFlightsWithTracks.total_flights === 0) && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-highlight z-10">
              <div className="text-white/40 text-center">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No military flights detected in this period</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Military Routes Analysis */}
      {militaryRoutes && militaryRoutes.total_military_flights > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h3 className="text-white text-lg font-bold mb-2 flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              Military Route Analysis
              <QuestionTooltip 
                question="מה הנתיב המועדף על מטוסי תדלוק אמריקאיים"
                questionEn="What is the preferred route for American refueling aircraft?"
                level="L3"
              />
            </h3>
            <p className="text-white/60 text-sm">
              Preferred routes and common areas for military aircraft
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Routes by Country */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Routes by Country
              </h4>
              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {Object.entries(militaryRoutes.by_country)
                  .sort(([,a], [,b]) => b.total_flights - a.total_flights)
                  .map(([country, data]) => (
                    <div key={country} className="bg-surface-highlight rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium">{country}</span>
                        <span className="text-cyan-400 font-bold">{data.total_flights} flights</span>
                      </div>
                      {data.routes.length > 0 && (
                        <div className="space-y-1">
                          {data.routes.slice(0, 3).map((route, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-white/60">{route.route}</span>
                              <span className="text-white/80">{route.count}x</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Common Areas by Type */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <Plane className="w-4 h-4 text-purple-400" />
                Common Areas by Aircraft Type
              </h4>
              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {Object.entries(militaryRoutes.by_type)
                  .sort(([,a], [,b]) => b.total_flights - a.total_flights)
                  .map(([type, data]) => (
                    <div key={type} className="bg-surface-highlight rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium capitalize">{type.replace('_', ' ')}</span>
                        <span className="text-purple-400 font-bold">{data.total_flights} flights</span>
                      </div>
                      {data.common_areas.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {data.common_areas.slice(0, 4).map((area, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-black/30 rounded text-xs text-white/70">
                              {area.area} ({area.count})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Route Hotspots */}
          {militaryRoutes.route_segments.length > 0 && (
            <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl p-4">
              <h4 className="text-cyan-400 font-medium mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Military Activity Hotspots
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {militaryRoutes.route_segments.slice(0, 10).map((segment, idx) => (
                  <div key={idx} className="bg-black/20 rounded-lg p-3 text-center">
                    <div className="text-white/60 text-xs mb-1">
                      {segment.lat.toFixed(1)}°N, {segment.lon.toFixed(1)}°E
                    </div>
                    <div className="text-cyan-400 font-bold">{segment.count}</div>
                    <div className="text-white/40 text-xs">
                      {segment.countries.slice(0, 2).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Military Activity by Country - Level 3 Deep Intelligence */}
      {militaryByCountry && militaryByCountry.summary.total_military_flights > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-400" />
              Military Activity by Country
              <QuestionTooltip 
                question="איזה מדינה זרה טסה הכי הרבה טיסות צבאיות באזורינו / כמה מטוסים בריטיים צבאיים חצו החודש"
                questionEn="Which foreign country flies the most military flights in our area? How many British military aircraft crossed this month?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Country-specific military intelligence breakdown with anomaly detection
            </p>
          </div>

          {/* Alerts Section */}
          {militaryByCountry.summary.alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {militaryByCountry.summary.alerts.map((alert, idx) => (
                <div 
                  key={idx}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${
                    alert.severity === 'high' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : alert.severity === 'medium'
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-blue-500/10 border-blue-500/30'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    alert.severity === 'high' ? 'text-red-400' : 
                    alert.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'
                  }`} />
                  <div>
                    <div className={`font-medium ${
                      alert.severity === 'high' ? 'text-red-400' : 
                      alert.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                      {alert.severity.toUpperCase()} ALERT
                    </div>
                    <div className="text-white/80 text-sm">{alert.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard
              title="Total Military Flights"
              value={militaryByCountry.summary.total_military_flights}
              subtitle="All countries"
              icon={<Shield className="w-6 h-6" />}
            />
            <StatCard
              title="Countries Detected"
              value={militaryByCountry.summary.countries_detected}
              subtitle="Military presence"
              icon={<MapPin className="w-6 h-6" />}
            />
            <StatCard
              title="Top Country"
              value={militaryByCountry.summary.top_countries.find(c => c.country !== 'UNKNOWN')?.country || 'N/A'}
              subtitle={`${militaryByCountry.summary.top_countries.find(c => c.country !== 'UNKNOWN')?.flights || 0} flights`}
              icon={<TrendingUp className="w-6 h-6" />}
            />
            <StatCard
              title="Analysis Period"
              value={`${Math.round(militaryByCountry.summary.analysis_period_days)} days`}
              subtitle="Coverage"
              icon={<Clock className="w-6 h-6" />}
            />
          </div>

          {/* Country Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(militaryByCountry.countries)
              .sort(([,a], [,b]) => b.total_flights - a.total_flights)
              .map(([code, data]) => {
                const isRussia = code === 'RU';
                const cardBorderColor = isRussia ? 'border-orange-500/50' : 'border-white/10';
                const headerBg = isRussia ? 'bg-orange-500/10' : 'bg-surface-highlight/30';
                
                return (
                  <div 
                    key={code} 
                    className={`bg-surface rounded-xl border ${cardBorderColor} overflow-hidden`}
                  >
                    {/* Country Header */}
                    <div className={`px-4 py-3 ${headerBg} border-b border-white/10`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            code === 'US' ? 'bg-blue-500/20 text-blue-400' :
                            code === 'RU' ? 'bg-orange-500/20 text-orange-400' :
                            code === 'GB' ? 'bg-red-500/20 text-red-400' :
                            code === 'IL' ? 'bg-green-500/20 text-green-400' :
                            code === 'NATO' ? 'bg-purple-500/20 text-purple-400' :
                            code === 'JO' ? 'bg-amber-500/20 text-amber-400' :
                            code === 'DE' ? 'bg-yellow-500/20 text-yellow-400' :
                            code === 'FR' ? 'bg-pink-500/20 text-pink-400' :
                            code === 'PL' ? 'bg-cyan-500/20 text-cyan-400' :
                            code === 'ES' ? 'bg-orange-400/20 text-orange-300' :
                            code === 'AU' ? 'bg-lime-500/20 text-lime-400' :
                            code === 'CA' ? 'bg-rose-500/20 text-rose-400' :
                            code === 'UNKNOWN' ? 'bg-slate-600/20 text-slate-400' :
                            'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {code}
                          </span>
                          <span className="text-white font-medium">{data.country_name}</span>
                        </div>
                        <span className="text-cyan-400 font-bold text-lg">{data.total_flights}</span>
                      </div>
                      {isRussia && data.anomaly_count > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-orange-400 text-xs">
                          <AlertTriangle className="w-3 h-3" />
                          {data.anomaly_count} anomalies detected
                        </div>
                      )}
                    </div>
                    
                    {/* Country Stats */}
                    <div className="p-4 space-y-4">
                      {/* Type Breakdown */}
                      <div>
                        <div className="text-white/50 text-xs mb-2">Aircraft Types</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(data.by_type).map(([type, count]) => (
                            <span 
                              key={type}
                              className={`px-2 py-0.5 rounded text-xs ${
                                type === 'tanker' ? 'bg-amber-500/20 text-amber-400' :
                                type === 'ISR' ? 'bg-cyan-500/20 text-cyan-400' :
                                type === 'fighter' ? 'bg-red-500/20 text-red-400' :
                                type === 'transport' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}
                            >
                              {type}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {/* Stats Row */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-surface-highlight rounded p-2">
                          <div className="text-white/50">Avg Duration</div>
                          <div className="text-white font-medium">{data.avg_duration_hours}h</div>
                        </div>
                        <div className="bg-surface-highlight rounded p-2">
                          <div className="text-white/50">Border Crossings</div>
                          <div className="text-white font-medium">{data.crossed_borders}</div>
                        </div>
                      </div>
                      
                      {/* Recent Flights */}
                      {data.recent_flights.length > 0 && (
                        <div>
                          <div className="text-white/50 text-xs mb-2">Recent Flights</div>
                          <div className="space-y-1">
                            {data.recent_flights.slice(0, 3).map((flight, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="text-white/70 font-mono">{flight.callsign}</span>
                                <span className="text-white/50">{flight.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Anomalies for Russia */}
                      {isRussia && data.anomalies.length > 0 && (
                        <div className="bg-orange-500/10 rounded p-2 border border-orange-500/30">
                          <div className="text-orange-400 text-xs font-medium mb-1">⚠️ Anomalous Activity</div>
                          {data.anomalies.slice(0, 2).map((anomaly, idx) => (
                            <div key={idx} className="text-xs text-white/70">
                              {anomaly.callsign} - {anomaly.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* Bilateral Proximity Detection - Level 3 Deep Intelligence */}
      {bilateralProximity && bilateralProximity.total_events > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Bilateral Military Proximity Events
              <QuestionTooltip 
                question="האם היו התקרבויות בין מטוסים רוסים לאמריקאיים?"
                questionEn="Were there approaches between Russian and American aircraft?"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Close approaches between military aircraft from different nations (within {bilateralProximity.proximity_threshold_nm}nm)
            </p>
          </div>

          {/* Proximity Alerts */}
          {bilateralProximity.alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {bilateralProximity.alerts.map((alert, idx) => (
                <div 
                  key={idx}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${
                    alert.severity === 'critical' 
                      ? 'bg-red-500/20 border-red-500/50 animate-pulse' 
                      : alert.severity === 'high'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    alert.severity === 'critical' ? 'text-red-500' : 
                    alert.severity === 'high' ? 'text-red-400' : 'text-yellow-400'
                  }`} />
                  <div>
                    <div className={`font-bold ${
                      alert.severity === 'critical' ? 'text-red-500' : 
                      alert.severity === 'high' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      ⚠️ {alert.severity.toUpperCase()} PROXIMITY ALERT
                    </div>
                    <div className="text-white/80 text-sm">{alert.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard
              title="Total Proximity Events"
              value={bilateralProximity.total_events}
              subtitle={`Within ${bilateralProximity.proximity_threshold_nm}nm`}
              icon={<Target className="w-6 h-6" />}
            />
            <StatCard
              title="High Risk Events"
              value={bilateralProximity.high_risk_events}
              subtitle="Severity ≥75"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
            <StatCard
              title="Country Pairs"
              value={Object.keys(bilateralProximity.by_pair).length}
              subtitle="Different combinations"
              icon={<Shield className="w-6 h-6" />}
            />
            <StatCard
              title="Top Pair"
              value={Object.entries(bilateralProximity.by_pair)[0]?.[0] || 'N/A'}
              subtitle={`${Object.entries(bilateralProximity.by_pair)[0]?.[1] || 0} events`}
              icon={<Radar className="w-6 h-6" />}
            />
          </div>

          {/* Proximity by Country Pair */}
          {Object.keys(bilateralProximity.by_pair).length > 0 && (
            <div className="bg-surface rounded-xl border border-white/10 p-5 mb-4">
              <h4 className="text-white font-bold mb-4">Proximity Events by Country Pair</h4>
              <div className="flex flex-wrap gap-3">
                {Object.entries(bilateralProximity.by_pair).map(([pair, count]) => {
                  const isHighInterest = pair.includes('RU-US') || pair.includes('US-RU') || 
                                         pair.includes('RU-') || pair.includes('-RU');
                  return (
                    <div 
                      key={pair}
                      className={`px-4 py-2 rounded-lg ${
                        isHighInterest 
                          ? 'bg-red-500/20 border border-red-500/30' 
                          : 'bg-surface-highlight'
                      }`}
                    >
                      <div className={`font-bold ${isHighInterest ? 'text-red-400' : 'text-white'}`}>
                        {pair}
                      </div>
                      <div className="text-white/60 text-sm">{count} events</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Events Table */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Proximity Event Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Pair</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Aircraft 1</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Aircraft 2</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Distance</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Severity</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {bilateralProximity.events.slice(0, 15).map((event, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          event.is_high_interest 
                            ? 'bg-red-500/20 text-red-400' 
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {event.pair_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-mono text-sm">{event.callsign1}</div>
                        <div className="text-white/50 text-xs">{event.country1} - {event.type1}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-mono text-sm">{event.callsign2}</div>
                        <div className="text-white/50 text-xs">{event.country2} - {event.type2}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${
                          event.min_distance_nm < 10 ? 'text-red-400' :
                          event.min_distance_nm < 25 ? 'text-orange-400' :
                          'text-yellow-400'
                        }`}>
                          {event.min_distance_nm}nm
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          event.severity === 'critical' ? 'bg-red-500/30 text-red-400' :
                          event.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          event.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {event.severity.toUpperCase()} ({event.severity_score})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">
                        {event.location.lat.toFixed(2)}°N, {event.location.lon.toFixed(2)}°E
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bilateralProximity.events.length === 0 && (
                <div className="py-8 text-center text-white/40">
                  No bilateral proximity events detected in this period
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Military by Destination - Syria Filter */}
      {militaryByDestination && militaryByDestination.total_flights > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400" />
              Military Flights by Destination
              <QuestionTooltip 
                question="כמה טיסות צבאיות נחתנו בסוריה שהגיעו ממדינות ממזרח?"
                questionEn="How many military flights landed in Syria that came from eastern countries?"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Track military flights heading to conflict zones (Syria, Gaza, Lebanon)
            </p>
          </div>

          {/* Syria Flights Alert */}
          {militaryByDestination.syria_from_east_count > 0 && (
            <div className="p-4 rounded-lg border bg-orange-500/20 border-orange-500/50 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-orange-400">
                    ⚠️ Syria-Bound Military Traffic from East
                  </div>
                  <div className="text-white/80 text-sm">
                    {militaryByDestination.syria_from_east_count} military flights detected heading to Syria from Russia/Iran
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard
              title="Total Military Flights"
              value={militaryByDestination.total_flights}
              subtitle="To conflict zones"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Syria-Bound"
              value={militaryByDestination.syria_flights.length}
              subtitle={`${militaryByDestination.syria_from_east_count} from east`}
              icon={<Target className="w-6 h-6" />}
            />
            <StatCard
              title="Destinations"
              value={Object.keys(militaryByDestination.by_destination).length}
              subtitle="Regions tracked"
              icon={<MapPin className="w-6 h-6" />}
            />
            <StatCard
              title="Origin Regions"
              value={Object.keys(militaryByDestination.by_origin).length}
              subtitle="Source areas"
              icon={<Radar className="w-6 h-6" />}
            />
          </div>

          {/* Destination Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* By Destination */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-bold mb-4">By Destination Region</h4>
              <div className="space-y-2">
                {Object.entries(militaryByDestination.by_destination)
                  .sort(([,a], [,b]) => b - a)
                  .map(([region, count]) => {
                    const isHighRisk = ['syria', 'gaza', 'lebanon'].includes(region);
                    return (
                      <div key={region} className="flex items-center justify-between">
                        <span className={`capitalize ${isHighRisk ? 'text-red-400' : 'text-white/70'}`}>
                          {region.replace('_', ' ')}
                          {isHighRisk && ' ⚠️'}
                        </span>
                        <span className={`font-bold ${isHighRisk ? 'text-red-400' : 'text-cyan-400'}`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* By Origin */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-bold mb-4">By Origin Region</h4>
              <div className="space-y-2">
                {Object.entries(militaryByDestination.by_origin)
                  .sort(([,a], [,b]) => b - a)
                  .map(([region, count]) => {
                    const isEastern = ['russia', 'iran'].includes(region);
                    return (
                      <div key={region} className="flex items-center justify-between">
                        <span className={`capitalize ${isEastern ? 'text-orange-400' : 'text-white/70'}`}>
                          {region.replace('_', ' ')}
                          {isEastern && ' 🔶'}
                        </span>
                        <span className={`font-bold ${isEastern ? 'text-orange-400' : 'text-cyan-400'}`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>


        </>
      )}

    </div>
  );
}

