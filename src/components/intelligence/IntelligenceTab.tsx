import { useState, useEffect, useRef } from 'react';
import { Shield, Radar, TrendingUp, Info, MapPin, AlertTriangle, Clock, Search, Dna, Plane, Target, ArrowUp, ArrowDown, MinusCircle, PlusCircle } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { SignalLossMap } from './SignalLossMap';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  fetchIntelligenceBatch,
  fetchAnomalyDNAEnhanced,
  fetchRouteEfficiency,
  fetchAvailableRoutes
} from '../../api';
import type { 
  RouteEfficiencyComparison, 
  RoutesSummary
} from '../../api';
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
      // Use batch API - single request instead of 7 parallel calls
      const data = await fetchIntelligenceBatch(startTs, endTs);
      
      setAirlineEfficiency(data.airline_efficiency || []);
      setHoldingPatterns(data.holding_patterns || null);
      setGpsJamming(data.gps_jamming || []);
      setMilitaryPatterns(data.military_patterns || []);
      setPatternClusters(data.pattern_clusters || []);
      setMilitaryRoutes(data.military_routes || null);
      setAirlineActivity(data.airline_activity || null);
    } catch (error) {
      console.error('Failed to load intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize military map with clustering and flight paths
  useEffect(() => {
    if (!militaryMapContainer.current || militaryPatterns.length === 0) return;
    
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
    
    // Color by country
    const countryColors: Record<string, string> = {
      'US': '#3b82f6',
      'GB': '#ef4444',
      'RU': '#f59e0b',
      'IL': '#10b981',
      'NATO': '#8b5cf6'
    };

    // Group markers by grid cell for clustering (0.5 degree cells)
    const gridSize = 0.5;
    const clusters: Map<string, typeof militaryPatterns> = new Map();
    
    militaryPatterns.forEach(pattern => {
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
    
    militaryPatterns.forEach(pattern => {
      if (pattern.locations && pattern.locations.length > 1) {
        const coordinates = pattern.locations
          .filter(loc => typeof loc.lat === 'number' && typeof loc.lon === 'number')
          .map(loc => [loc.lon, loc.lat]);
        
        if (coordinates.length > 1) {
          pathFeatures.push({
            type: 'Feature',
            properties: {
              callsign: pattern.callsign,
              country: pattern.country,
              color: countryColors[pattern.country] || '#6b7280'
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
  }, [militaryPatterns]);

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
    { key: 'avg_flight_time_min', title: 'Avg Flight Time (min)' },
    { key: 'avg_holding_time_min', title: 'Avg Holding Time (min)' },
    { key: 'sample_count', title: 'Sample Size' }
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
      {/* Level 2: Operational Insights */}
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Operational Insights
        </h2>
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
      <ChartCard title="Airline Efficiency Comparison">
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

      {/* Level 3: Deep Intelligence */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Deep Intelligence
        </h2>
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
              {gpsJamming.length > 0 ? (
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
                  clusterThresholdNm={50} // 50nm threshold for regional GPS jamming clusters
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
                {(anomalyDNA.flight_info.origin || anomalyDNA.flight_info.destination) && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Route</span>
                    <span className="text-cyan-400 font-medium">
                      {anomalyDNA.flight_info.origin || '?'} → {anomalyDNA.flight_info.destination || '?'}
                    </span>
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
                Flights with ≥{anomalyDNA.search_criteria?.match_threshold || 80}% trajectory match
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
                      <span className="text-orange-400 text-xs">
                        {new Date(anomaly.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-white/60 text-sm">{anomaly.rule_name}</p>
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
                Similar Flights (Trajectory Match ≥{anomalyDNA.search_criteria?.match_threshold || 80}%)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white/60 text-sm py-2 px-3">Flight ID</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Callsign</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Route</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Match %</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Pattern</th>
                      <th className="text-left text-white/60 text-sm py-2 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyDNA.similar_flights.slice(0, 15).map((flight, idx) => (
                      <tr key={idx} className={`border-b border-white/5 hover:bg-white/5 ${flight.is_anomaly ? 'bg-orange-500/5' : ''}`}>
                        <td className="py-3 px-3 text-white font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {flight.flight_id}
                            {flight.is_anomaly && (
                              <AlertTriangle className="w-3 h-3 text-orange-400" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-white">{flight.callsign || '-'}</td>
                        <td className="py-3 px-3 text-cyan-400 text-sm">
                          {flight.origin || flight.destination ? (
                            <span>{flight.origin || '?'} → {flight.destination || '?'}</span>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-black/30 rounded-full h-2.5">
                              <div 
                                className={`h-2.5 rounded-full transition-all ${
                                  flight.match_percentage >= 90 ? 'bg-emerald-500' :
                                  flight.match_percentage >= 85 ? 'bg-green-500' : 'bg-yellow-500'
                                }`}
                                style={{ width: `${flight.match_percentage}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold min-w-[50px] ${
                              flight.match_percentage >= 90 ? 'text-emerald-400' :
                              flight.match_percentage >= 85 ? 'text-green-400' : 'text-yellow-400'
                            }`}>
                              {flight.match_percentage.toFixed(1)}%
                            </span>
                          </div>
                          {flight.matching_points !== undefined && flight.total_points !== undefined && (
                            <div className="text-xs text-white/40 mt-1">
                              {flight.matching_points}/{flight.total_points} points
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {flight.pattern?.split('+').map((tag, i) => (
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
                        </td>
                        <td className="py-3 px-3 text-white/60 text-sm">
                          {flight.date ? new Date(flight.date).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
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

