import { useState, useEffect, useRef } from 'react';
import { Shield, Radar, TrendingUp, Info, MapPin, AlertTriangle, Clock, Search, Dna, Plane, Target, ArrowUp, ArrowDown, MinusCircle, PlusCircle, Cloud, CloudRain, Calendar, Activity, Building2, Signal } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import { SignalLossMap } from './SignalLossMap';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  fetchIntelligenceBatch,
  fetchTrafficBatch,
  fetchSafetyBatch,
  fetchAnomalyDNAEnhanced,
  fetchRouteEfficiency,
  fetchAvailableRoutes
} from '../../api';
import type { 
  RouteEfficiencyComparison, 
  RoutesSummary,
  GPSJammingTemporal,
  GPSJammingClustersResponse,
  WeatherImpactAnalysis,
  SeasonalYearComparison,
  TrafficSafetyCorrelation,
  SpecialEventsImpact,
  AlternateAirport,
  MilitaryByCountryResponse,
  BilateralProximityResponse,
  MilitaryByDestinationResponse,
  ThreatAssessmentResponse,
  JammingTriangulationResponse,
  HourlyCorrelation,
  SpecialEvent
} from '../../api';
import type { SignalLossLocation } from '../../types';
import type { AirlineEfficiency, HoldingPatternAnalysis, GPSJammingPoint, MilitaryPattern, PatternCluster, AnomalyDNA } from '../../types';
import type { AirlineActivityTrends, MilitaryRoutes } from '../../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface IntelligenceTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

export function IntelligenceTab({ startTs, endTs, cacheKey = 0 }: IntelligenceTabProps) {
  const [airlineEfficiency, setAirlineEfficiency] = useState<AirlineEfficiency[]>([]);
  const [holdingPatterns, setHoldingPatterns] = useState<HoldingPatternAnalysis | null>(null);
  const [gpsJamming, setGpsJamming] = useState<GPSJammingPoint[]>([]);
  const [militaryPatterns, setMilitaryPatterns] = useState<MilitaryPattern[]>([]);
  const [patternClusters, setPatternClusters] = useState<PatternCluster[]>([]);
  const [airlineActivity, setAirlineActivity] = useState<AirlineActivityTrends | null>(null);
  const [militaryRoutes, setMilitaryRoutes] = useState<MilitaryRoutes | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Anomaly DNA state
  const [dnaFlightId, setDnaFlightId] = useState('');
  const [anomalyDNA, setAnomalyDNA] = useState<AnomalyDNA | null>(null);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [dnaError, setDnaError] = useState<string | null>(null);
  
  // Route efficiency state
  const [availableRoutes, setAvailableRoutes] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [routeEfficiency, setRouteEfficiency] = useState<RouteEfficiencyComparison | RoutesSummary | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  
  // Military filter state
  const [militaryTypeFilter, setMilitaryTypeFilter] = useState<string>('all');
  
  // GPS Jamming Temporal state
  const [gpsJammingTemporal, setGpsJammingTemporal] = useState<GPSJammingTemporal | null>(null);
  
  // GPS Jamming Clusters (backend-computed polygons)
  const [gpsJammingClusters, setGpsJammingClusters] = useState<GPSJammingClustersResponse | null>(null);
  
  // Level 2 Operational Insights (moved from Traffic/Safety)
  const [weatherImpact, setWeatherImpact] = useState<WeatherImpactAnalysis | null>(null);
  const [seasonalTrends, setSeasonalTrends] = useState<SeasonalYearComparison | null>(null);
  const [trafficSafetyCorr, setTrafficSafetyCorr] = useState<TrafficSafetyCorrelation | null>(null);
  const [specialEvents, setSpecialEvents] = useState<SpecialEventsImpact | null>(null);
  const [alternateAirports, setAlternateAirports] = useState<AlternateAirport[]>([]);
  const [signalLossZones, setSignalLossZones] = useState<SignalLossLocation[]>([]);
  
  // Military by Country breakdown
  const [militaryByCountry, setMilitaryByCountry] = useState<MilitaryByCountryResponse | null>(null);
  
  // Bilateral Proximity Detection
  const [bilateralProximity, setBilateralProximity] = useState<BilateralProximityResponse | null>(null);
  
  // Military by Destination (Syria filter)
  const [militaryByDestination, setMilitaryByDestination] = useState<MilitaryByDestinationResponse | null>(null);
  
  // Combined Threat Assessment
  const [threatAssessment, setThreatAssessment] = useState<ThreatAssessmentResponse | null>(null);
  
  // Jamming Source Triangulation
  const [jammingTriangulation, setJammingTriangulation] = useState<JammingTriangulationResponse | null>(null);
  
  // Military map ref
  const militaryMapContainer = useRef<HTMLDivElement>(null);
  const militaryMap = useRef<maplibregl.Map | null>(null);
  const militaryMarkers = useRef<maplibregl.Marker[]>([]);

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

  const loadRouteEfficiency = async (route: string) => {
    setRouteLoading(true);
    try {
      const data = await fetchRouteEfficiency(startTs, endTs, route);
      setRouteEfficiency(data);
    } catch (error) {
      console.error('Failed to load route efficiency:', error);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleRouteSelect = (route: string) => {
    setSelectedRoute(route);
    if (route) {
      loadRouteEfficiency(route);
    } else {
      // Clear selection and reload summary
      loadAvailableRoutes();
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Use batch APIs - fetch intelligence, traffic, and safety data
      const [intelData, trafficData, safetyData] = await Promise.all([
        fetchIntelligenceBatch(startTs, endTs),
        fetchTrafficBatch(startTs, endTs),
        fetchSafetyBatch(startTs, endTs)
      ]);
      
      // Core intelligence data
      setAirlineEfficiency(intelData.airline_efficiency || []);
      setHoldingPatterns(intelData.holding_patterns || null);
      setGpsJamming(intelData.gps_jamming || []);
      setMilitaryPatterns(intelData.military_patterns || []);
      setPatternClusters(intelData.pattern_clusters || []);
      setMilitaryRoutes(intelData.military_routes || null);
      setAirlineActivity(intelData.airline_activity || null);
      setGpsJammingTemporal(intelData.gps_jamming_temporal || null);
      setGpsJammingClusters(intelData.gps_jamming_clusters || null);
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
      
      // Level 2 Operational Insights (from Traffic batch)
      setSeasonalTrends(trafficData.seasonal_year_comparison || null);
      setTrafficSafetyCorr(trafficData.traffic_safety_correlation || null);
      setSpecialEvents(trafficData.special_events_impact || null);
      setAlternateAirports(trafficData.alternate_airports || []);
      
      // Weather Impact (from Safety batch - Level 2 analysis)
      setWeatherImpact(safetyData.weather_impact || null);
    } catch (error) {
      console.error('Failed to load intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize military map with clustering and flight paths
  useEffect(() => {
    if (!militaryMapContainer.current || militaryPatterns.length === 0) return;
    
    // Filter patterns based on current type filter
    const filteredPatterns = militaryTypeFilter === 'all' 
      ? militaryPatterns 
      : militaryPatterns.filter(p => p.type?.toLowerCase() === militaryTypeFilter.toLowerCase());
    
    // Clear existing markers first
    militaryMarkers.current.forEach(m => m.remove());
    militaryMarkers.current = [];
    
    // Clean up existing map layers/sources
    if (militaryMap.current) {
      try {
        if (militaryMap.current.getLayer('military-paths-line')) {
          militaryMap.current.removeLayer('military-paths-line');
        }
        if (militaryMap.current.getSource('military-paths')) {
          militaryMap.current.removeSource('military-paths');
        }
      } catch (e) {
        // Ignore errors during cleanup
        console.debug('Map cleanup:', e);
      }
    }
    
    // Initialize map if not exists
    if (!militaryMap.current) {
      militaryMap.current = new maplibregl.Map({
        container: militaryMapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [35.0, 31.5],
        zoom: 6
      });
      militaryMap.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const currentMap = militaryMap.current;
    
    // Expanded color palette by country/alliance
    const countryColors: Record<string, string> = {
      'US': '#3b82f6',     // Blue
      'USA': '#3b82f6',    // Blue
      'GB': '#ef4444',     // Red
      'UK': '#ef4444',     // Red
      'RU': '#f59e0b',     // Orange/Amber
      'RUS': '#f59e0b',    // Orange/Amber
      'IL': '#10b981',     // Green
      'ISR': '#10b981',    // Green
      'NATO': '#8b5cf6',   // Purple
      'FR': '#ec4899',     // Pink
      'FRA': '#ec4899',    // Pink
      'DE': '#facc15',     // Yellow
      'GER': '#facc15',    // Yellow
      'TR': '#06b6d4',     // Cyan
      'TUR': '#06b6d4',    // Cyan
      'SA': '#22c55e',     // Green
      'SAU': '#22c55e',    // Green
      'EG': '#a855f7',     // Purple
      'EGY': '#a855f7',    // Purple
      'JO': '#14b8a6',     // Teal
      'JOR': '#14b8a6',    // Teal
    };
    
    // Type colors for additional visual differentiation
    const typeColors: Record<string, string> = {
      'tanker': '#f59e0b',
      'isr': '#06b6d4',
      'fighter': '#ef4444',
      'transport': '#3b82f6',
    };

    // Group markers by grid cell for clustering (0.5 degree cells)
    const gridSize = 0.5;
    const clusters: Map<string, typeof filteredPatterns> = new Map();
    
    filteredPatterns.forEach(pattern => {
      if (pattern.locations && pattern.locations.length > 0) {
        const loc = pattern.locations[0];
        if (loc && typeof loc.lat === 'number' && typeof loc.lon === 'number') {
          const gridKey = `${Math.floor(loc.lat / gridSize)}_${Math.floor(loc.lon / gridSize)}`;
          if (!clusters.has(gridKey)) {
            clusters.set(gridKey, []);
          }
          clusters.get(gridKey)!.push(pattern);
        }
      }
    });

    // Add flight path lines as GeoJSON
    const pathFeatures: GeoJSON.Feature[] = [];
    
    filteredPatterns.forEach(pattern => {
      if (pattern.locations && pattern.locations.length > 1) {
        const coordinates = pattern.locations
          .filter(loc => typeof loc.lat === 'number' && typeof loc.lon === 'number')
          .map(loc => [loc.lon, loc.lat]);
        
        if (coordinates.length > 1) {
          // Use type color if available, otherwise country color
          const patternType = pattern.type?.toLowerCase() || '';
          const color = typeColors[patternType] || countryColors[pattern.country] || '#6b7280';
          
          pathFeatures.push({
            type: 'Feature',
            properties: {
              callsign: pattern.callsign,
              country: pattern.country,
              type: pattern.type,
              color: color
            },
            geometry: {
              type: 'LineString',
              coordinates
            }
          });
        }
      }
    });

    // Add flight paths to map when loaded
    const addPathsAndMarkers = () => {
      try {
        // Remove existing layers/sources first
        if (currentMap.getLayer('military-paths-line')) {
          currentMap.removeLayer('military-paths-line');
        }
        if (currentMap.getSource('military-paths')) {
          currentMap.removeSource('military-paths');
        }
        
        // Add new flight paths
        if (pathFeatures.length > 0) {
          currentMap.addSource('military-paths', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: pathFeatures
            }
          });

          currentMap.addLayer({
            id: 'military-paths-line',
            type: 'line',
            source: 'military-paths',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 2,
              'line-opacity': 0.6,
              'line-dasharray': [2, 2]
            }
          });
        }
      } catch (e) {
        console.error('Error adding military paths:', e);
      }

      // Add markers (clustered or individual)
      clusters.forEach((patterns, _gridKey) => {
        if (patterns.length === 0) return;
        
        // Calculate cluster center
        let sumLat = 0, sumLon = 0;
        patterns.forEach(p => {
          const loc = p.locations![0];
          sumLat += loc.lat;
          sumLon += loc.lon;
        });
        const centerLat = sumLat / patterns.length;
        const centerLon = sumLon / patterns.length;
        
        if (patterns.length > 1) {
          // Create cluster marker
          const el = document.createElement('div');
          el.className = 'military-cluster-marker';
          el.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border: 3px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
            color: white;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          `;
          el.textContent = patterns.length.toString();
          
          // Build cluster popup
          const popupContent = patterns.slice(0, 5).map(p => 
            `<div style="padding: 4px 0; border-bottom: 1px solid #eee;">
              <span style="font-weight: bold;">${p.callsign}</span>
              <span style="color: #666; margin-left: 8px;">${p.country} - ${p.type}</span>
            </div>`
          ).join('') + (patterns.length > 5 ? `<div style="color: #666; padding-top: 4px;">+${patterns.length - 5} more...</div>` : '');
          
          const popup = new maplibregl.Popup({ offset: 25, maxWidth: '300px' }).setHTML(`
            <div style="padding: 8px;">
              <div style="font-weight: bold; margin-bottom: 8px; color: #3b82f6;">${patterns.length} Military Aircraft</div>
              ${popupContent}
            </div>
          `);
          
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([centerLon, centerLat])
            .setPopup(popup)
            .addTo(currentMap);
          
          militaryMarkers.current.push(marker);
        } else {
          // Single marker
          const pattern = patterns[0];
          const loc = pattern.locations![0];
          const el = document.createElement('div');
          el.className = 'military-marker';
          
          const color = countryColors[pattern.country] || '#6b7280';
          const patternShapes: Record<string, string> = {
            'orbit': '●',
            'racetrack': '◆',
            'transit': '▶'
          };
          const shape = patternShapes[pattern.pattern_type] || '■';
          
          el.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: ${pattern.pattern_type === 'orbit' ? '50%' : '4px'};
            background: ${color};
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: white;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          `;
          el.textContent = shape;

          const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px; max-width: 200px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${pattern.callsign}</div>
              <div style="font-size: 12px; color: #666;">
                <div>Country: ${pattern.country}</div>
                <div>Type: ${pattern.type}</div>
                <div>Pattern: ${pattern.pattern_type}</div>
                ${pattern.locations!.length > 1 ? `<div>Track points: ${pattern.locations!.length}</div>` : ''}
              </div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([loc.lon, loc.lat])
            .setPopup(popup)
            .addTo(currentMap);
          
          militaryMarkers.current.push(marker);
        }
      });
    };

    if (currentMap.loaded()) {
      addPathsAndMarkers();
    } else {
      currentMap.on('load', addPathsAndMarkers);
    }

    return () => {
      // Clean up markers
      militaryMarkers.current.forEach(m => m.remove());
      militaryMarkers.current = [];
      
      // Clean up layers/sources
      if (militaryMap.current) {
        try {
          if (militaryMap.current.getLayer('military-paths-line')) {
            militaryMap.current.removeLayer('military-paths-line');
          }
          if (militaryMap.current.getSource('military-paths')) {
            militaryMap.current.removeSource('military-paths');
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [militaryPatterns, militaryTypeFilter]);

  // Fetch Anomaly DNA
  const fetchDNA = async () => {
    if (!dnaFlightId.trim()) {
      setDnaError('Please enter a flight ID');
      return;
    }
    
    setDnaLoading(true);
    setDnaError(null);
    setAnomalyDNA(null);
    
    try {
      const data = await fetchAnomalyDNAEnhanced(dnaFlightId.trim());
      setAnomalyDNA(data);
    } catch (error) {
      setDnaError(error instanceof Error ? error.message : 'Failed to fetch anomaly DNA');
    } finally {
      setDnaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading intelligence data...</div>
      </div>
    );
  }

  const airlineColumns: Column[] = [
    { key: 'airline', title: 'Airline' },
    { key: 'avg_duration_hours', title: 'Avg Duration (hrs)', render: (val: number) => val?.toFixed(2) || '0' },
    { key: 'avg_distance_nm', title: 'Avg Distance (nm)', render: (val: number) => val?.toFixed(0) || '0' },
    { key: 'avg_speed_kts', title: 'Avg Speed (kts)', render: (val: number) => val?.toFixed(0) || '0' },
    { key: 'flight_count', title: 'Flights' }
  ];

  const patternClusterColumns: Column[] = [
    { key: 'pattern_id', title: 'Pattern ID' },
    { key: 'description', title: 'Description' },
    { key: 'occurrence_count', title: 'Occurrences' },
    { key: 'risk_level', title: 'Risk Level' },
    { 
      key: 'first_seen', 
      title: 'First Seen',
      render: (value: number) => value ? new Date(value * 1000).toLocaleDateString() : 'N/A'
    }
  ];

  const jammingColumns: Column[] = [
    { key: 'lat', title: 'Latitude', render: (val: number) => val.toFixed(3) },
    { key: 'lon', title: 'Longitude', render: (val: number) => val.toFixed(3) },
    { key: 'jamming_score', title: 'Score', render: (val: number, row: GPSJammingPoint) => {
      const score = val ?? row.intensity ?? 0;
      return (
        <span className={score >= 60 ? 'text-red-500 font-bold' : score >= 35 ? 'text-orange-400 font-medium' : score >= 15 ? 'text-yellow-400' : 'text-green-400'}>
          {score}/100
        </span>
      );
    }},
    { key: 'jamming_confidence', title: 'Confidence', render: (val: string) => {
      if (!val) return <span className="text-white/40">-</span>;
      const colors: Record<string, string> = {
        'HIGH': 'bg-red-500/20 text-red-400',
        'MEDIUM': 'bg-orange-500/20 text-orange-400',
        'LOW': 'bg-yellow-500/20 text-yellow-400',
        'UNLIKELY': 'bg-green-500/20 text-green-400'
      };
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[val] || 'text-white/60'}`}>{val}</span>;
    }},
    { key: 'affected_flights', title: 'Flights' },
    { key: 'altitude_anomalies', title: 'Alt Anom', render: (val: number) => val || '-' },
    { key: 'motion_anomalies', title: 'Motion Anom', render: (val: number) => val || '-' },
    { key: 'mlat_only_flights', title: 'MLAT Only', render: (val: number) => val || '-' }
  ];

  return (
    <div className="space-y-6">
      {/* Combined Threat Assessment Widget - TOP PRIORITY - WOW Feature */}
      {threatAssessment && (
        <div className={`rounded-xl border-2 overflow-hidden ${
          threatAssessment.threat_level === 'CRITICAL' ? 'border-red-500 bg-red-500/10' :
          threatAssessment.threat_level === 'HIGH' ? 'border-orange-500 bg-orange-500/10' :
          threatAssessment.threat_level === 'ELEVATED' ? 'border-yellow-500 bg-yellow-500/10' :
          threatAssessment.threat_level === 'MODERATE' ? 'border-blue-500 bg-blue-500/10' :
          'border-green-500 bg-green-500/10'
        }`}>
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <AlertTriangle className={`w-6 h-6 ${
                  threatAssessment.threat_level === 'CRITICAL' ? 'text-red-500 animate-pulse' :
                  threatAssessment.threat_level === 'HIGH' ? 'text-orange-500' :
                  threatAssessment.threat_level === 'ELEVATED' ? 'text-yellow-500' :
                  threatAssessment.threat_level === 'MODERATE' ? 'text-blue-500' :
                  'text-green-500'
                }`} />
                Intelligence Summary - Threat Assessment
                <QuestionTooltip 
                  question="מה הסיכון הכולל באוויר? מה התובנות המודיעיניות העיקריות?"
                  questionEn="What is the overall airspace risk? What are the key intelligence insights?"
                  level="L3"
                />
              </h3>
              <div className={`px-4 py-2 rounded-lg text-xl font-bold ${
                threatAssessment.threat_level === 'CRITICAL' ? 'bg-red-500 text-white' :
                threatAssessment.threat_level === 'HIGH' ? 'bg-orange-500 text-white' :
                threatAssessment.threat_level === 'ELEVATED' ? 'bg-yellow-500 text-black' :
                threatAssessment.threat_level === 'MODERATE' ? 'bg-blue-500 text-white' :
                'bg-green-500 text-white'
              }`}>
                {threatAssessment.threat_level}
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Main Score Gauge */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50" cy="50" r="45"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-white/10"
                    />
                    <circle
                      cx="50" cy="50" r="45"
                      fill="none"
                      stroke={threatAssessment.threat_color}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${threatAssessment.overall_score * 2.83} 283`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-white">{threatAssessment.overall_score}</span>
                    <span className="text-white/50 text-xs">/ 100</span>
                  </div>
                </div>
                <div className="text-white/60 text-sm mt-2">Overall Risk Score</div>
              </div>
              
              {/* Component Breakdown - 3 columns with tooltips */}
              <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {threatAssessment.components.gps_jamming && (
                  <div className="bg-black/20 rounded-lg p-3 group relative">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-white/50 text-xs">GPS Jamming</span>
                      <span className="text-white/30 text-[10px]">(30%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-500 rounded-full"
                          style={{ width: `${threatAssessment.components.gps_jamming.score}%` }}
                        />
                      </div>
                      <span className="text-white font-bold text-sm">{threatAssessment.components.gps_jamming.score}</span>
                    </div>
                    <div className="text-white/40 text-[10px] mt-1">
                      {threatAssessment.components.gps_jamming.raw_count || 0} events detected
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/90 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 w-48 pointer-events-none">
                      <p className="text-white/80">GPS/EW interference events. High scores indicate active electronic warfare affecting navigation.</p>
                    </div>
                  </div>
                )}
                {threatAssessment.components.military_activity && (
                  <div className="bg-black/20 rounded-lg p-3 group relative">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-white/50 text-xs">Military Activity</span>
                      <span className="text-white/30 text-[10px]">(25%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${threatAssessment.components.military_activity.score}%` }}
                        />
                      </div>
                      <span className="text-white font-bold text-sm">{threatAssessment.components.military_activity.score}</span>
                    </div>
                    <div className="text-white/40 text-[10px] mt-1">
                      {threatAssessment.components.military_activity.total_flights || 0} mil flights
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/90 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 w-48 pointer-events-none">
                      <p className="text-white/80">Foreign military aircraft presence. Higher weight given to Russian/Iranian activity near Israeli airspace.</p>
                    </div>
                  </div>
                )}
                {threatAssessment.components.unusual_patterns && (
                  <div className="bg-black/20 rounded-lg p-3 group relative">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-white/50 text-xs">Unusual Patterns</span>
                      <span className="text-white/30 text-[10px]">(20%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-yellow-500 rounded-full"
                          style={{ width: `${threatAssessment.components.unusual_patterns.score}%` }}
                        />
                      </div>
                      <span className="text-white font-bold text-sm">{threatAssessment.components.unusual_patterns.score}</span>
                    </div>
                    <div className="text-white/40 text-[10px] mt-1">
                      {threatAssessment.components.unusual_patterns.cluster_count || 0} pattern clusters
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/90 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 w-48 pointer-events-none">
                      <p className="text-white/80">Detected anomalous flight behavior clusters - unusual holding, route deviations, or suspicious patterns.</p>
                    </div>
                  </div>
                )}
                {threatAssessment.components.conflict_zone_activity && (
                  <div className="bg-black/20 rounded-lg p-3 group relative">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-white/50 text-xs">Conflict Zones</span>
                      <span className="text-white/30 text-[10px]">(25%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${threatAssessment.components.conflict_zone_activity.score}%` }}
                        />
                      </div>
                      <span className="text-white font-bold text-sm">{threatAssessment.components.conflict_zone_activity.score}</span>
                    </div>
                    <div className="text-white/40 text-[10px] mt-1">
                      {threatAssessment.components.conflict_zone_activity.syria_flights || 0} Syria-bound
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/90 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 w-48 pointer-events-none">
                      <p className="text-white/80">Military flights to/from conflict zones (Syria, Gaza, Lebanon). Extra weight for Russia/Iran origin flights.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Score Explanation Banner */}
            <div className="mt-4 bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-white/60">
                  <span className="text-white/80 font-medium">How this score is calculated: </span>
                  The overall risk is a weighted average of 4 components. GPS Jamming (30%) measures electronic warfare activity. 
                  Military Activity (25%) tracks foreign military presence. Unusual Patterns (20%) detects anomalous flight behavior. 
                  Conflict Zones (25%) monitors Syria/Gaza/Lebanon activity. 
                  <span className="text-white/80"> Levels: </span>
                  <span className="text-green-400">LOW 0-19</span> • <span className="text-blue-400">MODERATE 20-39</span> • <span className="text-yellow-400">ELEVATED 40-59</span> • <span className="text-orange-400">HIGH 60-79</span> • <span className="text-red-400">CRITICAL 80-100</span>
                </div>
              </div>
            </div>
            
            {/* Quick Insights Row */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Concerns */}
              {threatAssessment.top_concerns.length > 0 && (
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-white/60 text-xs mb-2">Top Concerns:</div>
                  <div className="flex flex-wrap gap-2">
                    {threatAssessment.top_concerns.slice(0, 4).map((concern, idx) => (
                      <div key={idx} className="px-2 py-1 bg-white/10 rounded-full text-xs">
                        <span className="text-white font-medium">{concern.name}</span>
                        <span className="text-white/50 ml-1">({concern.score})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Recommendations */}
              {threatAssessment.recommendations.length > 0 && (
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="text-white font-medium text-xs mb-2 flex items-center gap-2">
                    <Info className="w-3 h-3 text-cyan-400" />
                    Key Recommendation
                  </div>
                  <div className="text-white/70 text-sm">
                    {threatAssessment.recommendations[0]}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Level 2: Operational Insights */}
      <div className="border-b border-white/10 pb-4 pt-4">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Level 2: Operational Insights
          <QuestionTooltip 
            question="כמה מטוסים ביצעו המתנות באוויר של 360 לפני נחיתה? / באיזה שדה תעופה מבצעים הכי הרבה המתנות לפני נחיתה?"
            questionEn="How many planes performed 360 holds before landing? Which airport has most holds?"
            level="L2"
          />
        </h2>
        <p className="text-white/60 text-sm">
          Efficiency and economics analysis, seasonal trends, and pressure hours
        </p>
      </div>

      {/* Holding Pattern Analysis */}
      {holdingPatterns && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Total Holding Time"
              value={`${holdingPatterns.total_time_hours}h`}
              subtitle="Wasted fuel time"
              icon={<Clock className="w-6 h-6" />}
            />
            <StatCard
              title="Estimated Fuel Cost"
              value={`$${holdingPatterns.estimated_fuel_cost_usd.toLocaleString()}`}
              subtitle="Approximate cost"
            />
            <StatCard
              title="Peak Holding Hours"
              value={holdingPatterns.peak_hours.slice(0, 3).map(h => `${h}:00`).join(', ')}
              subtitle="Busiest times"
            />
          </div>

          {/* Events by Airport Breakdown */}
          {holdingPatterns.events_by_airport && Object.keys(holdingPatterns.events_by_airport).length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bar Chart */}
              <ChartCard title="Holding Events by Airport">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart 
                    data={Object.entries(holdingPatterns.events_by_airport)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 8)
                      .map(([airport, count]) => ({ airport, count }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis type="number" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                    <YAxis 
                      type="category" 
                      dataKey="airport" 
                      stroke="#ffffff60" 
                      tick={{ fill: '#ffffff60' }}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Pie Chart */}
              <ChartCard title="Distribution">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={Object.entries(holdingPatterns.events_by_airport)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5)
                        .map(([airport, count]) => ({ name: airport, value: count }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {Object.entries(holdingPatterns.events_by_airport)
                        .slice(0, 5)
                        .map((_, index) => (
                          <Cell key={`cell-${index}`} fill={[
                            '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'
                          ][index]} />
                        ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </div>
      )}

      {/* Airline Efficiency Comparison */}
      <ChartCard 
        title="Airline Efficiency Comparison"
        question={{ he: "למה חברה A טסה בממוצע 15 דקות יותר מחברה B? / מי החברת טיסה הכי יעילה?", en: "Why does airline A fly 15 min longer than B on average? Most efficient airline?", level: "L2" }}
      >
        {airlineEfficiency.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={airlineEfficiency}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis dataKey="airline" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
              <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #ffffff20',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="avg_flight_time_min" fill="#3b82f6" name="Avg Flight Time (min)" />
              <Bar dataKey="avg_holding_time_min" fill="#ef4444" name="Avg Holding Time (min)" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-white/40">
            No airline efficiency data available
          </div>
        )}
      </ChartCard>

      {/* Airline Activity Trends - Started/Stopped Flying */}
      {airlineActivity && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Airline Activity Trends
              <QuestionTooltip 
                question="האם זיהינו מגמות של חברות טיסות שונות? (חברה שהפסיקה לטוס מעל ישראל?)"
                questionEn="Did we identify trends in different airlines? (Airline that stopped flying over Israel?)"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Airlines that started or stopped flying over Israel in the selected period
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Airlines That Stopped Flying */}
            <div className="bg-gradient-to-br from-red-500/10 to-red-900/10 border border-red-500/30 rounded-xl p-6">
              <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                <MinusCircle className="w-5 h-5" />
                Airlines That Stopped Flying
              </h3>
              {airlineActivity.stopped_flying && airlineActivity.stopped_flying.length > 0 ? (
                <div className="space-y-3">
                  {airlineActivity.stopped_flying.slice(0, 8).map((airline, idx) => (
                    <div key={idx} className="bg-black/20 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="text-white font-bold">{airline.airline}</div>
                        <div className="text-white/50 text-xs">
                          Last seen: {airline.last_seen_date}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-red-400 font-bold flex items-center gap-1">
                          <ArrowDown className="w-4 h-4" />
                          {airline.flight_count_before} flights
                        </div>
                        <div className="text-white/40 text-xs">before stopping</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-white/40">
                  <MinusCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No airlines stopped flying in this period</p>
                </div>
              )}
            </div>

            {/* Airlines That Started Flying */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 border border-emerald-500/30 rounded-xl p-6">
              <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5" />
                Airlines That Started Flying
              </h3>
              {airlineActivity.started_flying && airlineActivity.started_flying.length > 0 ? (
                <div className="space-y-3">
                  {airlineActivity.started_flying.slice(0, 8).map((airline, idx) => (
                    <div key={idx} className="bg-black/20 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="text-white font-bold">{airline.airline}</div>
                        <div className="text-white/50 text-xs">
                          First seen: {airline.first_seen_date}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-bold flex items-center gap-1">
                          <ArrowUp className="w-4 h-4" />
                          {airline.flight_count} flights
                        </div>
                        <div className="text-white/40 text-xs">since starting</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-white/40">
                  <PlusCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No new airlines started flying in this period</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Changes */}
          {airlineActivity.activity_changes && airlineActivity.activity_changes.length > 0 && (
            <div className="bg-surface rounded-xl border border-white/10 p-6 mt-4">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Significant Activity Changes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {airlineActivity.activity_changes.slice(0, 9).map((change, idx) => (
                  <div key={idx} className="bg-surface-highlight rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-bold">{change.airline}</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        change.trend === 'increasing' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {change.trend === 'increasing' ? '↑' : '↓'} {Math.abs(change.change_percent).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/50">Before: {change.before_count}</span>
                      <span className="text-white/50">After: {change.after_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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

      {/* Seasonal Trends - Level 2 */}
      {seasonalTrends && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              Seasonal Trends
              <QuestionTooltip 
                question="אפקט 'יום כיפור' / חגים - השינוי הדרסטי בתבנית הטיסות בימים מיוחדים"
                questionEn="'Yom Kippur' effect / holidays - drastic change in flight patterns on special days"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              The Yom Kippur effect and holiday patterns
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Average Daily Flights"
              value={seasonalTrends.avg_daily_flights || 0}
              subtitle="Current period"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Peak Day"
              value={seasonalTrends.peak_day?.date || 'N/A'}
              subtitle={`${seasonalTrends.peak_day?.flight_count || 0} flights`}
              icon={<TrendingUp className="w-6 h-6" />}
            />
            <StatCard
              title="Lowest Day"
              value={seasonalTrends.lowest_day?.date || 'N/A'}
              subtitle={`${seasonalTrends.lowest_day?.flight_count || 0} flights`}
              icon={<ArrowDown className="w-6 h-6" />}
            />
          </div>

          {seasonalTrends.insights && seasonalTrends.insights.length > 0 && (
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
              <h3 className="text-purple-400 font-medium mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Seasonal Insights
              </h3>
              <ul className="space-y-2">
                {seasonalTrends.insights.map((insight, idx) => (
                  <li key={idx} className="text-white/80 text-sm flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Traffic-Safety Correlation (Pressure Hours) - Level 2 */}
      {trafficSafetyCorr && trafficSafetyCorr.hourly_correlation && trafficSafetyCorr.hourly_correlation.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-400" />
              Pressure Hours Analysis
              <QuestionTooltip 
                question="מתי הכי מסוכן בשמיים בטיחותית?"
                questionEn="When is it most dangerous in the sky safety-wise?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              When is it most dangerous in the sky? Rush hours correlate with safety incidents
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Correlation"
              value={`${((trafficSafetyCorr.correlation_score || 0) * 100).toFixed(0)}%`}
              subtitle="Traffic ↔ Safety events"
              icon={<TrendingUp className="w-6 h-6" />}
            />
            <StatCard
              title="Peak Risk Hour"
              value={trafficSafetyCorr.peak_risk_hours?.length > 0 ? `${trafficSafetyCorr.peak_risk_hours[0]}:00` : 'N/A'}
              subtitle="Highest incident rate"
              icon={<Clock className="w-6 h-6" />}
            />
            <StatCard
              title="Total Safety Events"
              value={trafficSafetyCorr.hourly_correlation.reduce((sum: number, h: { safety_count?: number }) => sum + (h.safety_count || 0), 0).toLocaleString()}
              subtitle="In period"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
            <StatCard
              title="Safest Hour"
              value={(() => {
                const withTraffic = trafficSafetyCorr.hourly_correlation.filter((h: HourlyCorrelation) => h.traffic_count > 0);
                if (withTraffic.length === 0) return 'N/A';
                const safest = withTraffic.reduce((min: HourlyCorrelation, h: HourlyCorrelation) => 
                  h.safety_per_1000 < min.safety_per_1000 ? h : min);
                return `${safest.hour}:00`;
              })()}
              subtitle="Lowest risk"
              icon={<Shield className="w-6 h-6" />}
            />
          </div>

          {/* Hourly Chart */}
          <ChartCard title="Safety Events by Hour">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trafficSafetyCorr.hourly_correlation}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="hour" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} tickFormatter={(h) => `${h}:00`} />
                <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number, name: string) => [value, name === 'safety_count' ? 'Safety Events' : name === 'traffic_count' ? 'Flights' : name]}
                  labelFormatter={(hour) => `Hour: ${hour}:00`}
                />
                <Bar dataKey="safety_count" fill="#f97316" name="Safety Events" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {trafficSafetyCorr.insights && trafficSafetyCorr.insights.length > 0 && (
            <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl p-4">
              <h3 className="text-orange-400 font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Pressure Hours Insights
              </h3>
              <ul className="space-y-2">
                {trafficSafetyCorr.insights.map((insight: string, idx: number) => (
                  <li key={idx} className="text-white/80 text-sm flex items-start gap-2">
                    <span className="text-orange-400">•</span>
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
              Areas with extended signal loss - potential jamming or coverage gaps
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

          {/* Signal Loss Map */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-400" />
              <h3 className="text-white font-bold">Signal Loss Map</h3>
              <span className="ml-auto text-white/50 text-sm">{signalLossZones.length} zones detected</span>
            </div>
            <SignalLossMap locations={signalLossZones} height={400} />
          </div>
        </>
      )}

      <TableCard
        title="Airline Efficiency Details"
        columns={airlineColumns}
        data={airlineEfficiency}
      />

      {/* Route Efficiency Comparison */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Plane className="w-5 h-5 text-cyan-500" />
          Route Efficiency Comparison
          <QuestionTooltip 
            question="למה חברה A טסה בממוצע 15 דקות יותר מחברה B? / מי החברת טיסה הכי יעילה?"
            questionEn="Why does Airline A fly 15 min longer than B on average? Most efficient airline?"
            level="L2"
          />
        </h2>
        <p className="text-white/60 text-sm">
          Compare airline performance on the same route - "Why does Airline A fly 15 minutes longer than B?"
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <label className="text-white/70 text-sm font-medium">Select Route:</label>
            <select
              value={selectedRoute}
              onChange={(e) => handleRouteSelect(e.target.value)}
              className="bg-surface-highlight text-white px-4 py-2 rounded-lg border border-white/20 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Routes Overview</option>
              {availableRoutes.map(route => (
                <option key={route} value={route}>{route}</option>
              ))}
            </select>
            {routeLoading && <span className="text-white/50 text-sm">Loading...</span>}
          </div>
        </div>

        <div className="p-6">
          {routeEfficiency && (
            <>
              {/* Check if it's a summary (has 'routes' property) or comparison (has 'airlines' property) */}
              {'routes' in routeEfficiency ? (
                // Routes Summary View
                <div>
                  <p className="text-white/60 text-sm mb-4">{routeEfficiency.note}</p>
                  <div className="space-y-3">
                    {routeEfficiency.routes.map((route) => (
                      <div 
                        key={route.route}
                        className="bg-surface-highlight rounded-lg p-4 cursor-pointer hover:bg-white/10 transition-colors"
                        onClick={() => handleRouteSelect(route.route)}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-white font-bold text-lg">{route.route}</span>
                          <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-medium">
                            {route.flight_count} flights
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-white/50">Avg Duration</span>
                            <div className="text-white font-medium">{route.avg_duration_min} min</div>
                          </div>
                          <div>
                            <span className="text-white/50">Anomaly Rate</span>
                            <div className="text-orange-400 font-medium">{route.anomaly_rate}%</div>
                          </div>
                          <div>
                            <span className="text-white/50">Airlines</span>
                            <div className="text-white font-medium">{route.airline_count}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Airline Comparison View
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-white text-lg font-bold">{routeEfficiency.route}</span>
                    <button 
                      onClick={() => handleRouteSelect('')}
                      className="text-cyan-400 text-sm hover:underline"
                    >
                      ← Back to all routes
                    </button>
                  </div>
                  
                  {/* Insights */}
                  {routeEfficiency.insights.length > 0 && (
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 mb-6">
                      <h4 className="text-cyan-400 font-medium mb-2">Insights</h4>
                      <ul className="space-y-1">
                        {routeEfficiency.insights.map((insight, idx) => (
                          <li key={idx} className="text-white/80 text-sm flex items-start gap-2">
                            <span className="text-cyan-400">•</span>
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Performance Summary */}
                  {routeEfficiency.best_performer && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                        <div className="text-green-400 text-sm mb-1">Best Performer</div>
                        <div className="text-white text-2xl font-bold">{routeEfficiency.best_performer}</div>
                      </div>
                      {routeEfficiency.worst_performer && routeEfficiency.worst_performer !== routeEfficiency.best_performer && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                          <div className="text-red-400 text-sm mb-1">Needs Improvement</div>
                          <div className="text-white text-2xl font-bold">{routeEfficiency.worst_performer}</div>
                        </div>
                      )}
                      {routeEfficiency.time_difference_min > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                          <div className="text-amber-400 text-sm mb-1">Time Difference</div>
                          <div className="text-white text-2xl font-bold">{routeEfficiency.time_difference_min} min</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Airlines Comparison Chart */}
                  {routeEfficiency.airlines.length > 0 && (
                    <ChartCard title={`Airline Comparison on ${routeEfficiency.route}`}>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={routeEfficiency.airlines} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                          <XAxis type="number" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                          <YAxis 
                            type="category" 
                            dataKey="airline" 
                            stroke="#ffffff60" 
                            tick={{ fill: '#ffffff60' }}
                            width={60}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1a1a1a',
                              border: '1px solid #ffffff20',
                              borderRadius: '8px'
                            }}
                            formatter={(value: number, name: string) => [
                              name === 'efficiency_score' ? `${value}` : `${value}`,
                              name === 'efficiency_score' ? 'Efficiency Score' :
                              name === 'avg_duration_min' ? 'Avg Duration (min)' :
                              name === 'avg_deviation_nm' ? 'Avg Deviation (nm)' : name
                            ]}
                          />
                          <Bar dataKey="efficiency_score" fill="#22c55e" name="efficiency_score" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Airlines Details Table */}
                  {routeEfficiency.airlines.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airline</th>
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Flights</th>
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Avg Duration</th>
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Deviation</th>
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Anomaly Rate</th>
                            <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {routeEfficiency.airlines.map((airline, idx) => (
                            <tr key={airline.airline} className={`border-b border-white/5 ${idx === 0 ? 'bg-green-500/10' : ''}`}>
                              <td className="px-4 py-3 text-white font-medium">{airline.airline}</td>
                              <td className="px-4 py-3 text-white/80">{airline.flights}</td>
                              <td className="px-4 py-3 text-white/80">{airline.avg_duration_min} min</td>
                              <td className="px-4 py-3 text-white/80">{airline.avg_deviation_nm} nm</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  airline.anomaly_rate > 20 ? 'bg-red-500/20 text-red-400' :
                                  airline.anomaly_rate > 10 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-green-500/20 text-green-400'
                                }`}>
                                  {airline.anomaly_rate}%
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded font-bold text-sm ${
                                  airline.efficiency_score >= 80 ? 'bg-green-500/20 text-green-400' :
                                  airline.efficiency_score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {airline.efficiency_score}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {routeEfficiency.airlines.length === 0 && (
                    <div className="text-center py-8 text-white/40">
                      <Plane className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No airline data available for this route</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          
          {!routeEfficiency && !routeLoading && (
            <div className="text-center py-8 text-white/40">
              <Plane className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a route to compare airline efficiency</p>
            </div>
          )}
        </div>
      </div>

      {/* Level 3: Deep Intelligence - THE MOST IMPORTANT SECTION */}
      <div className="border-b-2 border-purple-500/50 pb-4 pt-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-white text-2xl font-bold">Level 3: Deep Intelligence</h2>
          <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-full">INTEL</span>
          <QuestionTooltip 
            question="לבדוק איפה היו הפרעות קליטה בזמן טיסת המטוסים – אזורים חשודים / תמפה לי את כלל האזורים שיש להם הפרעות GPS"
            questionEn="Check where there were reception disruptions during flights - suspicious areas / map all GPS interference zones"
            level="L3"
          />
        </div>
        <p className="text-white/60 text-sm ml-12">
          Turning DATA into INTEL - GPS jamming mapping, foreign military presence, suspicious patterns
        </p>
      </div>


      {/* GPS Jamming Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="GPS Jamming Zones"
          value={gpsJamming.length}
          subtitle="Detected interference areas"
          icon={<Radar className="w-6 h-6" />}
        />
        <StatCard
          title="Military Aircraft Tracked"
          value={militaryPatterns.length}
          subtitle="Foreign military presence"
          icon={<Shield className="w-6 h-6" />}
        />
      </div>

      {/* GPS Jamming Map Visualization */}
      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Radar className="w-5 h-5 text-red-500" />
                GPS Jamming Threat Map
              </h3>
              <p className="text-white/60 text-sm mt-1">
                Security-focused analysis of potential GPS interference zones
              </p>
              <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-red-500/20 rounded text-xs text-red-300">
                <AlertTriangle className="w-3 h-3" />
                <span>Security Intelligence - Potential hostile interference</span>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 max-w-xs">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div className="text-xs text-red-300">
                  <strong>Focus:</strong> Identifies zones where signal loss patterns suggest 
                  intentional GPS jamming. For general coverage gaps, see the <strong>Traffic Tab</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Map */}
            <div className="xl:col-span-2">
              {gpsJamming.length > 0 || (gpsJammingClusters && gpsJammingClusters.total_points > 0) ? (
                <SignalLossMap 
                  locations={gpsJamming.map(j => ({
                    lat: j.lat,
                    lon: j.lon,
                    count: j.event_count,
                    avgDuration: 300, // Default 5 min for jamming zones
                    intensity: j.intensity,
                    affected_flights: j.affected_flights
                  }))} 
                  height={400}
                  showPolygonClusters={true}
                  clusterThresholdNm={50}
                  precomputedClusters={gpsJammingClusters} // Backend-computed polygon clusters
                />
              ) : (
                <div className="h-[400px] flex items-center justify-center bg-surface-highlight rounded-lg border border-white/10">
                  <div className="text-white/40 text-center">
                    <Radar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No GPS jamming detected in this period</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Stats Panel */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-highlight rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{gpsJamming.length}</div>
                  <div className="text-xs text-white/50">Jamming Zones</div>
                </div>
                <div className="bg-surface-highlight rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">
                    {gpsJamming.reduce((sum, j) => sum + j.affected_flights, 0)}
                  </div>
                  <div className="text-xs text-white/50">Affected Flights</div>
                </div>
              </div>
              
              {/* Confidence breakdown */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-red-500/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-red-400">
                    {gpsJamming.filter(j => j.jamming_confidence === 'HIGH').length}
                  </div>
                  <div className="text-[10px] text-red-300">HIGH</div>
                </div>
                <div className="bg-orange-500/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-orange-400">
                    {gpsJamming.filter(j => j.jamming_confidence === 'MEDIUM').length}
                  </div>
                  <div className="text-[10px] text-orange-300">MEDIUM</div>
                </div>
                <div className="bg-yellow-500/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-yellow-400">
                    {gpsJamming.filter(j => j.jamming_confidence === 'LOW').length}
                  </div>
                  <div className="text-[10px] text-yellow-300">LOW</div>
                </div>
                <div className="bg-green-500/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-400">
                    {gpsJamming.filter(j => !j.jamming_confidence || j.jamming_confidence === 'UNLIKELY').length}
                  </div>
                  <div className="text-[10px] text-green-300">UNLIKELY</div>
                </div>
              </div>
              
              <div className="bg-surface-highlight rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-red-500" />
                  <span className="text-white/80 text-sm font-medium">High Confidence Jamming Zones</span>
                </div>
                <div className="space-y-2">
                  {gpsJamming.slice(0, 5).map((zone, idx) => {
                    const score = zone.jamming_score ?? zone.intensity ?? 0;
                    const confidence = zone.jamming_confidence || (score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : score >= 15 ? 'LOW' : 'UNLIKELY');
                    const confidenceColors: Record<string, { bg: string; text: string }> = {
                      'HIGH': { bg: 'bg-red-500/20', text: 'text-red-400' },
                      'MEDIUM': { bg: 'bg-orange-500/20', text: 'text-orange-400' },
                      'LOW': { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
                      'UNLIKELY': { bg: 'bg-green-500/20', text: 'text-green-400' }
                    };
                    const colors = confidenceColors[confidence] || confidenceColors['UNLIKELY'];
                    
                    return (
                      <div key={idx} className="bg-black/20 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white text-sm font-medium">
                            {zone.lat.toFixed(2)}°N, {zone.lon.toFixed(2)}°E
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors.bg} ${colors.text}`}>
                            {confidence}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-white/50">
                            {zone.affected_flights} flights • Score: {score}/100
                          </div>
                          {zone.altitude_anomalies && zone.altitude_anomalies > 0 && (
                            <span className="text-[10px] text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded">
                              {zone.altitude_anomalies} alt anom
                            </span>
                          )}
                        </div>
                        {zone.jamming_indicators && zone.jamming_indicators.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {zone.jamming_indicators.slice(0, 3).map((ind, i) => (
                              <span key={i} className="text-[9px] bg-white/5 text-white/60 px-1 py-0.5 rounded">
                                {ind}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {gpsJamming.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-4">
                      ✓ No jamming zones detected
                    </p>
                  )}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg p-4">
                <h4 className="text-red-400 text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Security Implications
                </h4>
                <ul className="text-xs text-white/70 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    <span>GPS jamming can indicate hostile activity</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400">•</span>
                    <span>May affect aircraft navigation systems</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">•</span>
                    <span>Report persistent zones to aviation authorities</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TableCard
        title="GPS Jamming Zones (Geographic Data)"
        columns={jammingColumns}
        data={gpsJamming.slice(0, 15)}
      />

      {/* GPS Jamming Temporal Analysis */}
      {gpsJammingTemporal && gpsJammingTemporal.total_events > 0 && (
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            GPS Jamming Temporal Patterns
          </h3>
          <p className="text-white/60 text-sm mb-6">
            When does GPS jamming occur most frequently?
          </p>

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

      {/* Jamming Source Triangulation - WOW Feature */}
      {jammingTriangulation && jammingTriangulation.estimated_sources.length > 0 && (
        <div className="bg-gradient-to-br from-red-900/30 to-orange-900/30 rounded-xl border border-red-500/30 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-500/20">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-red-500" />
                Jamming Source Triangulation
              </h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                jammingTriangulation.triangulation_quality === 'high' ? 'bg-green-500/20 text-green-400' :
                jammingTriangulation.triangulation_quality === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {jammingTriangulation.triangulation_quality.toUpperCase()} CONFIDENCE
              </span>
            </div>
            <p className="text-white/60 text-sm mt-1">
              Estimated locations of GPS jamming sources based on {jammingTriangulation.total_affected_flights} affected flights
            </p>
          </div>
          
          <div className="p-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{jammingTriangulation.estimated_sources.length}</div>
                <div className="text-white/50 text-xs">Estimated Sources</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">{jammingTriangulation.total_affected_flights}</div>
                <div className="text-white/50 text-xs">Affected Flights</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{jammingTriangulation.total_detection_points}</div>
                <div className="text-white/50 text-xs">Detection Points</div>
              </div>
            </div>
            
            {/* Estimated Sources */}
            <div className="space-y-4">
              {jammingTriangulation.estimated_sources.map((source, idx) => (
                <div 
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    source.confidence_level === 'high' ? 'bg-red-500/10 border-red-500/30' :
                    source.confidence_level === 'medium' ? 'bg-orange-500/10 border-orange-500/30' :
                    'bg-yellow-500/10 border-yellow-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                        source.confidence_level === 'high' ? 'bg-red-500 text-white' :
                        source.confidence_level === 'medium' ? 'bg-orange-500 text-white' :
                        'bg-yellow-500 text-black'
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-white font-bold">
                          {source.lat.toFixed(3)}°N, {source.lon.toFixed(3)}°E
                        </div>
                        <div className="text-white/60 text-sm">{source.region}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        source.confidence_level === 'high' ? 'bg-red-500/30 text-red-400' :
                        source.confidence_level === 'medium' ? 'bg-orange-500/30 text-orange-400' :
                        'bg-yellow-500/30 text-yellow-400'
                      }`}>
                        {source.confidence_level.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-white/50 text-xs">Confidence Radius</div>
                      <div className="text-white font-medium">±{source.confidence_radius_nm}nm</div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs">Affected Flights</div>
                      <div className="text-white font-medium">{source.affected_flights_count}</div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs">Est. Power</div>
                      <div className={`font-medium ${
                        source.estimated_power === 'high' ? 'text-red-400' :
                        source.estimated_power === 'medium' ? 'text-orange-400' :
                        'text-yellow-400'
                      }`}>
                        {source.estimated_power.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs">Avg Severity</div>
                      <div className="text-white font-medium">{source.avg_severity}/100</div>
                    </div>
                  </div>
                  
                  {source.affected_flights.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="text-white/50 text-xs mb-2">Affected Flights:</div>
                      <div className="flex flex-wrap gap-1">
                        {source.affected_flights.slice(0, 8).map((flight, i) => (
                          <span key={i} className="px-2 py-0.5 bg-black/30 rounded text-xs text-white/70 font-mono">
                            {flight}
                          </span>
                        ))}
                        {source.affected_flights.length > 8 && (
                          <span className="px-2 py-0.5 text-xs text-white/40">
                            +{source.affected_flights.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-black/20 rounded-lg text-xs text-white/50">
              <strong>Methodology:</strong> {jammingTriangulation.methodology}
            </div>
          </div>
        </div>
      )}

      {/* Military Aircraft Patterns with Type Filter */}
      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-500" />
                Military Aircraft Patterns
              </h3>
              <p className="text-white/60 text-sm mt-1">
                Identify tankers, ISR, fighters, and transport aircraft
              </p>
            </div>
            
            {/* Military Type Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All', color: 'bg-gray-500' },
                { id: 'tanker', label: 'Tankers', color: 'bg-amber-500' },
                { id: 'ISR', label: 'ISR', color: 'bg-cyan-500' },
                { id: 'fighter', label: 'Fighters', color: 'bg-red-500' },
                { id: 'transport', label: 'Transport', color: 'bg-blue-500' },
              ].map(filter => {
                const count = filter.id === 'all' 
                  ? militaryPatterns.length 
                  : militaryPatterns.filter(p => p.type?.toLowerCase() === filter.id.toLowerCase()).length;
                return (
                  <button
                    key={filter.id}
                    onClick={() => setMilitaryTypeFilter(filter.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      militaryTypeFilter === filter.id
                        ? `${filter.color} text-white shadow-lg`
                        : 'bg-surface-highlight text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {filter.label}
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      militaryTypeFilter === filter.id ? 'bg-white/20' : 'bg-black/20'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Filtered Military Stats */}
        <div className="px-6 py-4 border-b border-white/10 bg-surface-highlight/30">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">
                {militaryPatterns.filter(p => p.type?.toLowerCase() === 'tanker').length}
              </div>
              <div className="text-xs text-white/50">Tankers</div>
              <div className="text-xs text-white/40">Aerial Refueling</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {militaryPatterns.filter(p => p.type?.toLowerCase() === 'isr').length}
              </div>
              <div className="text-xs text-white/50">ISR</div>
              <div className="text-xs text-white/40">Surveillance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">
                {militaryPatterns.filter(p => p.type?.toLowerCase() === 'fighter').length}
              </div>
              <div className="text-xs text-white/50">Fighters</div>
              <div className="text-xs text-white/40">Combat Aircraft</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {militaryPatterns.filter(p => p.type?.toLowerCase() === 'transport').length}
              </div>
              <div className="text-xs text-white/50">Transport</div>
              <div className="text-xs text-white/40">Cargo/Personnel</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">
                {militaryPatterns.filter(p => !['tanker', 'isr', 'fighter', 'transport'].includes(p.type?.toLowerCase() || '')).length}
              </div>
              <div className="text-xs text-white/50">Other</div>
              <div className="text-xs text-white/40">VIP, Medical, etc.</div>
            </div>
          </div>
        </div>
        
        {/* Filtered Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Callsign</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Country</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Type</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Pattern</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {militaryPatterns
                .filter(p => militaryTypeFilter === 'all' || p.type?.toLowerCase() === militaryTypeFilter.toLowerCase())
                .slice(0, 20)
                .map((pattern, idx) => (
                  <tr key={pattern.flight_id || idx} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white font-medium">{pattern.callsign}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        pattern.country === 'US' ? 'bg-blue-500/20 text-blue-400' :
                        pattern.country === 'GB' ? 'bg-red-500/20 text-red-400' :
                        pattern.country === 'RU' ? 'bg-orange-500/20 text-orange-400' :
                        pattern.country === 'IL' ? 'bg-green-500/20 text-green-400' :
                        'bg-purple-500/20 text-purple-400'
                      }`}>
                        {pattern.country}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        pattern.type?.toLowerCase() === 'tanker' ? 'bg-amber-500/20 text-amber-400' :
                        pattern.type?.toLowerCase() === 'isr' ? 'bg-cyan-500/20 text-cyan-400' :
                        pattern.type?.toLowerCase() === 'fighter' ? 'bg-red-500/20 text-red-400' :
                        pattern.type?.toLowerCase() === 'transport' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {pattern.type || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/70">{pattern.pattern_type}</span>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-sm">
                      {pattern.type_name || '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {militaryPatterns.filter(p => militaryTypeFilter === 'all' || p.type?.toLowerCase() === militaryTypeFilter.toLowerCase()).length === 0 && (
            <div className="py-8 text-center text-white/40">
              No military aircraft of this type detected
            </div>
          )}
        </div>
      </div>

      {/* Military Locations Map */}
      {militaryPatterns.length > 0 && (
        <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-500" />
                  Military Activity Map
                </h3>
                <p className="text-white/60 text-sm mt-1">
                  Geographic visualization of military aircraft patterns
                </p>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#3b82f6]" />
                  <span className="text-white/60 text-xs">US</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#ef4444]" />
                  <span className="text-white/60 text-xs">GB</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#f59e0b]" />
                  <span className="text-white/60 text-xs">RU</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#10b981]" />
                  <span className="text-white/60 text-xs">IL</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#8b5cf6]" />
                  <span className="text-white/60 text-xs">NATO</span>
                </div>
              </div>
            </div>
            {/* Pattern Type & Aircraft Type Legend */}
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="text-white/50 text-xs">Pattern:</div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm">●</span>
                <span className="text-white/50 text-xs">Orbit (Tanker)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm">◆</span>
                <span className="text-white/50 text-xs">Racetrack (ISR)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm">▶</span>
                <span className="text-white/50 text-xs">Transit</span>
              </div>
            </div>
          </div>
          <div 
            ref={militaryMapContainer} 
            className="h-[400px] w-full"
          />
        </div>
      )}

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
              value={militaryByCountry.summary.top_countries[0]?.country || 'N/A'}
              subtitle={`${militaryByCountry.summary.top_countries[0]?.flights || 0} flights`}
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
                            'bg-gray-500/20 text-gray-400'
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

          {/* Syria Flights Table */}
          {militaryByDestination.syria_flights.length > 0 && (
            <div className="bg-surface rounded-xl border border-orange-500/30 overflow-hidden">
              <div className="px-6 py-4 border-b border-orange-500/20 bg-orange-500/5">
                <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Syria-Bound Military Flights
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Callsign</th>
                      <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Country</th>
                      <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Type</th>
                      <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Origin</th>
                      <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Concern</th>
                    </tr>
                  </thead>
                  <tbody>
                    {militaryByDestination.syria_flights.slice(0, 15).map((flight, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 text-white font-mono">{flight.callsign}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            flight.country === 'RU' ? 'bg-orange-500/20 text-orange-400' :
                            flight.country === 'IR' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {flight.country}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/70">{flight.type}</td>
                        <td className="px-4 py-3">
                          <span className={`capitalize ${
                            flight.is_from_east ? 'text-orange-400 font-medium' : 'text-white/70'
                          }`}>
                            {flight.origin_region}
                            {flight.is_from_east && ' 🔶'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            flight.concern_level === 'high' 
                              ? 'bg-red-500/20 text-red-400' 
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {flight.concern_level.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pattern Analysis (Anomaly DNA) Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Radar className="w-5 h-5" />
          Pattern Analysis (Anomaly DNA)
        </h2>
        <p className="text-white/60 text-sm mb-4">
          Automatically detected recurring anomaly patterns and suspicious flight behaviors.
        </p>
      </div>

      {/* Pattern Clusters */}
      <TableCard
        title="Recurring Anomaly Clusters"
        columns={patternClusterColumns}
        data={patternClusters.slice(0, 10)}
      />
      
      {patternClusters.length === 0 && (
        <div className="text-white/40 text-center py-8">
          No recurring patterns detected in this time period
        </div>
      )}

      {/* Anomaly DNA Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Dna className="w-5 h-5 text-emerald-500" />
          Anomaly DNA Analysis
          <QuestionTooltip 
            question="טביעת אצבע דיגיטלית (Anomaly DNA) - המטוס עשה בדיוק את אותו סיבוב לפני שבוע (איסוף מודיעין שיטתי)"
            questionEn="Digital fingerprint (Anomaly DNA) - the aircraft made the exact same turn a week ago (systematic intelligence collection)"
            level="L3"
          />
        </h2>
        <p className="text-white/60 text-sm">
          Deep analysis of flight anomalies with similar pattern matching and risk assessment
        </p>
      </div>

      {/* DNA Search */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-white/70 text-sm mb-2">Flight ID</label>
            <input
              type="text"
              value={dnaFlightId}
              onChange={(e) => setDnaFlightId(e.target.value)}
              placeholder="Enter flight ID to analyze (e.g., 3b86ff46)"
              className="w-full px-4 py-3 bg-surface-highlight border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-emerald-500"
              onKeyDown={(e) => e.key === 'Enter' && fetchDNA()}
            />
          </div>
          <button
            onClick={fetchDNA}
            disabled={dnaLoading}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
          >
            {dnaLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Dna className="w-4 h-4" />
                Analyze DNA
              </>
            )}
          </button>
        </div>

        {dnaError && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {dnaError}
          </div>
        )}
      </div>

      {/* DNA Results */}
      {anomalyDNA && (
        <div className="space-y-4">
          {/* Search Method Banner (v2) */}
          {anomalyDNA.search_method && (
            <div className={`rounded-xl border p-4 ${
              anomalyDNA.search_method === 'rule_based' 
                ? 'bg-orange-500/10 border-orange-500/30' 
                : 'bg-blue-500/10 border-blue-500/30'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    anomalyDNA.search_method === 'rule_based' ? 'bg-orange-500/20' : 'bg-blue-500/20'
                  }`}>
                    {anomalyDNA.search_method === 'rule_based' ? (
                      <AlertTriangle className="w-5 h-5 text-orange-400" />
                    ) : (
                      <Plane className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className={`font-bold ${
                      anomalyDNA.search_method === 'rule_based' ? 'text-orange-400' : 'text-blue-400'
                    }`}>
                      {anomalyDNA.search_method === 'rule_based' ? 'Rule-Based Matching' : 'Attribute-Based Matching'}
                    </div>
                    <div className="text-white/60 text-sm">
                      {anomalyDNA.search_method === 'rule_based' 
                        ? 'Finding flights with same anomaly rules and nearby anomaly points'
                        : 'Finding flights with same airline and similar start/end points'
                      }
                    </div>
                  </div>
                </div>
                {anomalyDNA.matching_criteria?.time_range && (
                  <div className="flex items-center gap-2 text-white/70 text-sm bg-black/20 px-3 py-2 rounded-lg">
                    <Clock className="w-4 h-4" />
                    <span>Time window: {anomalyDNA.matching_criteria.time_range}</span>
                    <span className="text-white/40">|</span>
                    <span>Last {anomalyDNA.matching_criteria.lookback_days} days</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flight Info & Risk Assessment */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Flight Info */}
            <div className="bg-surface rounded-xl border border-white/10 p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Plane className="w-4 h-4 text-blue-400" />
                Flight Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Flight ID</span>
                  <span className="text-white font-mono">{anomalyDNA.flight_info.flight_id}</span>
                </div>
                {anomalyDNA.flight_info.callsign && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Callsign</span>
                    <span className="text-white font-bold">{anomalyDNA.flight_info.callsign}</span>
                  </div>
                )}
                {anomalyDNA.flight_info.airline && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Airline</span>
                    <span className="text-blue-400 font-medium">{anomalyDNA.flight_info.airline}</span>
                  </div>
                )}
                {(anomalyDNA.flight_info.origin || anomalyDNA.flight_info.destination) && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Route</span>
                    <span className="text-cyan-400 font-medium">
                      {anomalyDNA.flight_info.origin || '?'} → {anomalyDNA.flight_info.destination || '?'}
                    </span>
                  </div>
                )}
                {anomalyDNA.flight_info.flight_time && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Time of Day</span>
                    <span className="text-white">{anomalyDNA.flight_info.flight_time}</span>
                  </div>
                )}
                {anomalyDNA.flight_info.is_anomaly && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Status</span>
                    <span className="text-orange-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Anomaly Detected
                    </span>
                  </div>
                )}
                {anomalyDNA.flight_info.rule_names && anomalyDNA.flight_info.rule_names.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-white/60 text-sm block mb-2">Matched Rules:</span>
                    <div className="flex flex-wrap gap-1">
                      {anomalyDNA.flight_info.rule_names.map((rule, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                          {rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Risk Assessment */}
            <div className={`bg-surface rounded-xl border-2 p-6 ${
              anomalyDNA.risk_assessment?.toLowerCase().includes('high') ? 'border-red-500/50' :
              anomalyDNA.risk_assessment?.toLowerCase().includes('medium') ? 'border-yellow-500/50' : 'border-green-500/50'
            }`}>
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Risk Assessment
              </h3>
              <div className={`text-2xl font-bold mb-2 ${
                anomalyDNA.risk_assessment?.toLowerCase().includes('high') ? 'text-red-400' :
                anomalyDNA.risk_assessment?.toLowerCase().includes('medium') ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {anomalyDNA.risk_assessment?.split(' - ')[0]?.toUpperCase() || 'UNKNOWN'}
              </div>
              <p className="text-white/60 text-sm">
                {anomalyDNA.risk_assessment?.split(' - ')[1] || 'Based on pattern analysis'}
              </p>
              {anomalyDNA.recurring_pattern && (
                <p className="text-white/50 text-xs mt-2 pt-2 border-t border-white/10">
                  {anomalyDNA.recurring_pattern}
                </p>
              )}
            </div>

            {/* Similar Flights Count */}
            <div className="bg-surface rounded-xl border border-white/10 p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 text-purple-400" />
                Similar Flights Found
              </h3>
              <div className="text-4xl font-bold text-purple-400 mb-2">
                {anomalyDNA.similar_flights?.length || 0}
              </div>
              <p className="text-white/60 text-sm">
                {anomalyDNA.matching_criteria?.has_rules 
                  ? `Flights with matching rules (within ${anomalyDNA.matching_criteria.anomaly_point_threshold_nm || 10} NM)`
                  : anomalyDNA.search_criteria?.match_threshold 
                    ? `Flights with ≥${anomalyDNA.search_criteria.match_threshold}% trajectory match`
                    : `Flights with similar attributes (score ≥30)`
                }
              </p>
            </div>
          </div>

          {/* Insights */}
          {anomalyDNA.insights && anomalyDNA.insights.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl p-6">
              <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Key Insights
              </h3>
              <ul className="space-y-2">
                {anomalyDNA.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-white/80">
                    <span className="text-emerald-400 mt-1">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detected Anomalies */}
          {anomalyDNA.anomalies_detected && anomalyDNA.anomalies_detected.length > 0 && (
            <div className="bg-surface rounded-xl border border-white/10 p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                Detected Anomalies
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {anomalyDNA.anomalies_detected.map((anomaly, idx) => (
                  <div key={idx} className="bg-surface-highlight rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">Rule {anomaly.rule_id}</span>
                      {anomaly.timestamp && (
                        <span className="text-orange-400 text-xs">
                          {new Date(anomaly.timestamp * 1000).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <p className="text-white/60 text-sm">{anomaly.rule_name || 'Unknown rule'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar Flights Table */}
          {anomalyDNA.similar_flights && anomalyDNA.similar_flights.length > 0 && (
            <div className="bg-surface rounded-xl border border-white/10 p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 text-purple-400" />
                Similar Flights 
                {anomalyDNA.search_method ? (
                  <span className="text-white/60 font-normal text-sm ml-2">
                    ({anomalyDNA.search_method === 'rule_based' ? 'Rule-based' : 'Attribute-based'} matching)
                  </span>
                ) : anomalyDNA.search_criteria?.match_threshold ? (
                  <span className="text-white/60 font-normal text-sm ml-2">
                    (Trajectory Match ≥{anomalyDNA.search_criteria.match_threshold}%)
                  </span>
                ) : null}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white/60 text-sm py-2 px-3">Flight ID</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Callsign</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Route</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Score</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Match Reasons</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyDNA.similar_flights.slice(0, 20).map((flight, idx) => {
                      // Support both v1 (match_percentage) and v2 (similarity_score)
                      const score = flight.match_percentage ?? flight.similarity_score ?? 0;
                      const isHighScore = score >= 70;
                      const isMedScore = score >= 50 && score < 70;
                      
                      return (
                        <tr key={idx} className={`border-b border-white/5 hover:bg-white/5 ${flight.is_anomaly ? 'bg-orange-500/5' : ''}`}>
                          <td className="py-3 px-3 text-white font-mono text-sm">
                            <div className="flex items-center gap-2">
                              {flight.flight_id}
                              {flight.is_anomaly && (
                                <AlertTriangle className="w-3 h-3 text-orange-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-white">{flight.callsign || '-'}</div>
                            {flight.airline && (
                              <div className="text-xs text-blue-400">{flight.airline}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-cyan-400 text-sm">
                            {flight.origin || flight.destination ? (
                              <span>{flight.origin || '?'} → {flight.destination || '?'}</span>
                            ) : '-'}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-black/30 rounded-full h-2.5">
                                <div 
                                  className={`h-2.5 rounded-full transition-all ${
                                    isHighScore ? 'bg-emerald-500' :
                                    isMedScore ? 'bg-yellow-500' : 'bg-orange-500'
                                  }`}
                                  style={{ width: `${Math.min(score, 100)}%` }}
                                />
                              </div>
                              <span className={`text-sm font-bold min-w-[40px] ${
                                isHighScore ? 'text-emerald-400' :
                                isMedScore ? 'text-yellow-400' : 'text-orange-400'
                              }`}>
                                {score.toFixed(0)}
                              </span>
                            </div>
                            {/* Show score components for v2 */}
                            {flight.match_components && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(flight.match_components).slice(0, 3).map(([key, val]) => (
                                  <span key={key} className="text-[10px] text-white/40">
                                    {key.replace(/_/g, ' ')}: {typeof val === 'number' ? val.toFixed(0) : val}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Show points for v1 */}
                            {flight.matching_points !== undefined && flight.total_points !== undefined && (
                              <div className="text-xs text-white/40 mt-1">
                                {flight.matching_points}/{flight.total_points} points
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 max-w-[250px]">
                            {/* v2: match_reasons */}
                            {flight.match_reasons && flight.match_reasons.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {flight.match_reasons.slice(0, 3).map((reason, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                    {reason.length > 40 ? reason.slice(0, 37) + '...' : reason}
                                  </span>
                                ))}
                              </div>
                            ) : flight.pattern ? (
                              /* v1: pattern tags */
                              <div className="flex flex-wrap gap-1">
                                {flight.pattern.split('+').map((tag, i) => (
                                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                                    tag === 'same_route' ? 'bg-cyan-500/20 text-cyan-400' :
                                    tag === 'same_anomalies' ? 'bg-orange-500/20 text-orange-400' :
                                    tag === 'same_origin' ? 'bg-blue-500/20 text-blue-400' :
                                    tag === 'same_destination' ? 'bg-purple-500/20 text-purple-400' :
                                    tag === 'anomaly' ? 'bg-red-500/20 text-red-400' :
                                    'bg-white/10 text-white/60'
                                  }`}>
                                    {tag.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-white/40">-</span>
                            )}
                            {/* Show common rules if present */}
                            {flight.common_rules && flight.common_rules.length > 0 && (
                              <div className="text-[10px] text-orange-400 mt-1">
                                Common rules: {flight.common_rules.join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-white/60 text-sm">
                            <div>{flight.date ? new Date(flight.date).toLocaleDateString() : '-'}</div>
                            {flight.hour !== undefined && (
                              <div className="text-xs text-white/40">{flight.hour.toString().padStart(2, '0')}:00</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

