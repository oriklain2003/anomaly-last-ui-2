import { useState, useEffect, useRef } from 'react';
import { 
  Shield, Radar, TrendingUp, AlertTriangle, Clock, Plane, Target, 
  Moon, Sun, Radio, Crosshair, Map, Activity, Zap, Eye, Flag
} from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, type Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  fetchMilitaryBatch,
  type OperationalTempoResponse,
  type TankerActivityResponse,
  type NightOperationsResponse,
  type ISRPatternsResponse,
  type AirspaceDenialResponse,
  type BorderCrossingsResponse,
  type EWCorrelationResponse,
  type MissionReadinessResponse
} from '../../api';
import { 
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Legend
} from 'recharts';

interface MilitaryTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

// Country colors for charts
const COUNTRY_COLORS: Record<string, string> = {
  US: '#3B82F6',   // Blue
  RU: '#EF4444',   // Red
  GB: '#8B5CF6',   // Purple
  IL: '#10B981',   // Green
  NATO: '#F59E0B', // Amber
  other: '#6B7280' // Gray
};

const READINESS_COLORS: Record<string, string> = {
  LOW: '#10B981',       // Green
  MODERATE: '#6EE7B7',  // Light green
  ELEVATED: '#F59E0B',  // Amber
  HIGH: '#F97316',      // Orange
  IMMINENT: '#EF4444'   // Red
};

export function MilitaryTab({ startTs, endTs, cacheKey = 0 }: MilitaryTabProps) {
  // State for all panels
  const [operationalTempo, setOperationalTempo] = useState<OperationalTempoResponse | null>(null);
  const [tankerActivity, setTankerActivity] = useState<TankerActivityResponse | null>(null);
  const [nightOperations, setNightOperations] = useState<NightOperationsResponse | null>(null);
  const [isrPatterns, setIsrPatterns] = useState<ISRPatternsResponse | null>(null);
  const [airspaceDenial, setAirspaceDenial] = useState<AirspaceDenialResponse | null>(null);
  const [borderCrossings, setBorderCrossings] = useState<BorderCrossingsResponse | null>(null);
  const [ewCorrelation, setEwCorrelation] = useState<EWCorrelationResponse | null>(null);
  const [missionReadiness, setMissionReadiness] = useState<MissionReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Map refs
  const ewMapContainer = useRef<HTMLDivElement>(null);
  const ewMapRef = useRef<maplibregl.Map | null>(null);
  const isrMapContainer = useRef<HTMLDivElement>(null);
  const isrMapRef = useRef<maplibregl.Map | null>(null);
  const tankerMapContainer = useRef<HTMLDivElement>(null);
  const tankerMapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Single batch call for all 8 panels - uses cached data when available
        const batchData = await fetchMilitaryBatch(startTs, endTs);

        setOperationalTempo(batchData.operational_tempo || null);
        setTankerActivity(batchData.tanker_activity || null);
        setNightOperations(batchData.night_operations || null);
        setIsrPatterns(batchData.isr_patterns || null);
        setAirspaceDenial(batchData.airspace_denial || null);
        setBorderCrossings(batchData.border_crossings || null);
        setEwCorrelation(batchData.ew_correlation || null);
        setMissionReadiness(batchData.mission_readiness || null);
      } catch (error) {
        console.error('Error loading military data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [startTs, endTs, cacheKey]);

  // Initialize EW Correlation Map
  useEffect(() => {
    if (!ewMapContainer.current || !ewCorrelation) return;

    if (ewMapRef.current) {
      ewMapRef.current.remove();
    }

    const map = new maplibregl.Map({
      container: ewMapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
          },
        ],
      },
      center: [35, 33],
      zoom: 5.5,
    });

    ewMapRef.current = map;

    map.on('load', () => {
      // Add jamming zones as circles
      ewCorrelation.jamming_zones.forEach((zone) => {
        if (!zone.lat || !zone.lon) return;
        
        // Create a circle feature for the jamming zone
        const el = document.createElement('div');
        el.className = 'jamming-zone-marker';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = `rgba(239, 68, 68, ${Math.min(0.8, zone.severity / 100)})`;
        el.style.border = '2px solid #EF4444';
        el.style.cursor = 'pointer';
        el.style.animation = 'pulse 2s infinite';
        
        new maplibregl.Marker({ element: el })
          .setLngLat([zone.lon, zone.lat])
          .setPopup(new maplibregl.Popup().setHTML(`
            <div style="color: #000; padding: 8px;">
              <strong>GPS Jamming Zone</strong><br/>
              Severity: ${zone.severity}/100<br/>
              Affected Flights: ${zone.affected_flights || 'Unknown'}<br/>
              Indicators: ${zone.indicators?.join(', ') || 'N/A'}
            </div>
          `))
          .addTo(map);
      });

      // Add estimated EW sources as triangles
      ewCorrelation.estimated_ew_sources.forEach((source) => {
        const el = document.createElement('div');
        el.innerHTML = '⚠';
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        
        new maplibregl.Marker({ element: el })
          .setLngLat([source.lon, source.lat])
          .setPopup(new maplibregl.Popup().setHTML(`
            <div style="color: #000; padding: 8px;">
              <strong>Estimated EW Source</strong><br/>
              Likely Operator: ${source.likely_operator}<br/>
              Confidence: ${source.confidence}<br/>
              Severity: ${source.severity}/100
            </div>
          `))
          .addTo(map);
      });
    });

    return () => {
      if (ewMapRef.current) {
        ewMapRef.current.remove();
        ewMapRef.current = null;
      }
    };
  }, [ewCorrelation]);

  // Initialize Tanker Map
  useEffect(() => {
    if (!tankerMapContainer.current || !tankerActivity?.active_tankers.length) return;

    if (tankerMapRef.current) {
      tankerMapRef.current.remove();
    }

    const map = new maplibregl.Map({
      container: tankerMapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
          },
        ],
      },
      center: [35, 33],
      zoom: 5,
    });

    tankerMapRef.current = map;

    map.on('load', () => {
      tankerActivity.active_tankers.forEach((tanker) => {
        if (!tanker.last_position?.lat || !tanker.last_position?.lon) return;
        
        const el = document.createElement('div');
        el.innerHTML = '✈';
        el.style.fontSize = '20px';
        el.style.transform = 'rotate(45deg)';
        el.style.cursor = 'pointer';
        el.style.color = COUNTRY_COLORS[tanker.country] || COUNTRY_COLORS.other;
        
        new maplibregl.Marker({ element: el })
          .setLngLat([tanker.last_position.lon, tanker.last_position.lat])
          .setPopup(new maplibregl.Popup().setHTML(`
            <div style="color: #000; padding: 8px;">
              <strong>${tanker.callsign}</strong><br/>
              Country: ${tanker.country}<br/>
              Holding Area: ${tanker.holding_area}<br/>
              Duration: ${tanker.duration_min} min<br/>
              Orbits: ${tanker.orbit_count}
            </div>
          `))
          .addTo(map);
      });
    });

    return () => {
      if (tankerMapRef.current) {
        tankerMapRef.current.remove();
        tankerMapRef.current = null;
      }
    };
  }, [tankerActivity]);

  // Initialize ISR Map
  useEffect(() => {
    if (!isrMapContainer.current || !isrPatterns?.patterns.length) return;

    if (isrMapRef.current) {
      isrMapRef.current.remove();
    }

    const map = new maplibregl.Map({
      container: isrMapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
          },
        ],
      },
      center: [35, 33],
      zoom: 5,
    });

    isrMapRef.current = map;

    map.on('load', () => {
      isrPatterns.patterns.forEach((pattern, idx) => {
        // Draw orbit center marker
        const el = document.createElement('div');
        el.innerHTML = '◎';
        el.style.fontSize = '24px';
        el.style.color = COUNTRY_COLORS[pattern.country] || COUNTRY_COLORS.other;
        el.style.cursor = 'pointer';
        
        new maplibregl.Marker({ element: el })
          .setLngLat([pattern.orbit_center.lon, pattern.orbit_center.lat])
          .setPopup(new maplibregl.Popup().setHTML(`
            <div style="color: #000; padding: 8px;">
              <strong>${pattern.callsign}</strong><br/>
              Pattern: ${pattern.pattern_type}<br/>
              Country: ${pattern.country}<br/>
              Radius: ${pattern.orbit_radius_nm} nm<br/>
              Duration: ${pattern.duration_min} min<br/>
              Target Area: ${pattern.likely_target}
            </div>
          `))
          .addTo(map);

        // Draw orbit path if track points exist
        if (pattern.track_points && pattern.track_points.length > 1) {
          const coordinates = pattern.track_points.map(p => [p.lon, p.lat] as [number, number]);
          
          map.addSource(`isr-path-${idx}`, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates
              }
            }
          });

          map.addLayer({
            id: `isr-path-layer-${idx}`,
            type: 'line',
            source: `isr-path-${idx}`,
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': COUNTRY_COLORS[pattern.country] || COUNTRY_COLORS.other,
              'line-width': 2,
              'line-opacity': 0.6
            }
          });
        }
      });
    });

    return () => {
      if (isrMapRef.current) {
        isrMapRef.current.remove();
        isrMapRef.current = null;
      }
    };
  }, [isrPatterns]);

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  // Table columns
  const tankerColumns: Column[] = [
    { key: 'callsign', title: 'Callsign' },
    { key: 'country', title: 'Country', render: (v: any) => (
      <span style={{ color: COUNTRY_COLORS[v as string] || COUNTRY_COLORS.other }}>{String(v)}</span>
    )},
    { key: 'holding_area', title: 'Holding Area' },
    { key: 'duration_min', title: 'Duration', render: (v: any) => `${v} min` },
    { key: 'orbit_count', title: 'Orbits' },
  ];

  const nightFlightColumns: Column[] = [
    { key: 'callsign', title: 'Callsign' },
    { key: 'country', title: 'Country', render: (v: any) => (
      <span style={{ color: COUNTRY_COLORS[v as string] || COUNTRY_COLORS.other }}>{String(v)}</span>
    )},
    { key: 'type', title: 'Type' },
    { key: 'hour', title: 'Hour', render: (v: any) => `${v}:00` },
    { key: 'duration_min', title: 'Duration', render: (v: any) => `${v} min` },
  ];

  const borderCrossingColumns: Column[] = [
    { key: 'callsign', title: 'Callsign' },
    { key: 'country', title: 'Country', render: (v: any) => (
      <span style={{ color: COUNTRY_COLORS[v as string] || COUNTRY_COLORS.other }}>{String(v)}</span>
    )},
    { key: 'from_region', title: 'From' },
    { key: 'to_region', title: 'To' },
    { key: 'hour', title: 'Time' },
  ];

  const denialZoneColumns: Column[] = [
    { key: 'area_name', title: 'Area' },
    { key: 'reduction_pct', title: 'Reduction', render: (v: any) => (
      <span className={Number(v) > 70 ? 'text-red-400' : Number(v) > 40 ? 'text-amber-400' : 'text-gray-400'}>
        {v}%
      </span>
    )},
    { key: 'likely_cause', title: 'Likely Cause', render: (v: any) => String(v).replace(/_/g, ' ') },
    { key: 'military_flights_nearby', title: 'Mil. Flights' },
  ];

  const isrPatternColumns: Column[] = [
    { key: 'callsign', title: 'Callsign' },
    { key: 'country', title: 'Country', render: (v: any) => (
      <span style={{ color: COUNTRY_COLORS[v as string] || COUNTRY_COLORS.other }}>{String(v)}</span>
    )},
    { key: 'pattern_type', title: 'Pattern' },
    { key: 'likely_target', title: 'Target Area' },
    { key: 'duration_min', title: 'Duration', render: (v: any) => `${v} min` },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Section: Mission Readiness Widget */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Target className="w-5 h-5 text-amber-500" />
          Mission Readiness Prediction
          <QuestionTooltip question="What is the likelihood of upcoming military operations based on combined indicators?" />
        </h2>
        
        {missionReadiness && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Readiness Gauge */}
            <div className="lg:col-span-1 bg-gray-800/60 rounded-xl p-6 border border-gray-700">
              <div className="text-center">
                <div 
                  className="relative w-36 h-36 mx-auto mb-4"
                  style={{ 
                    background: `conic-gradient(${READINESS_COLORS[missionReadiness.readiness_level]} ${missionReadiness.overall_readiness_score}%, #374151 0%)`,
                    borderRadius: '50%'
                  }}
                >
                  <div className="absolute inset-2 bg-gray-900 rounded-full flex items-center justify-center flex-col">
                    <span className="text-3xl font-bold text-white">{missionReadiness.overall_readiness_score}</span>
                    <span className="text-xs text-gray-400">/ 100</span>
                  </div>
                </div>
                <div 
                  className="text-2xl font-bold mb-2"
                  style={{ color: READINESS_COLORS[missionReadiness.readiness_level] }}
                >
                  {missionReadiness.readiness_level}
                </div>
                <p className="text-sm text-gray-400">{missionReadiness.prediction}</p>
                <p className="text-xs text-gray-500 mt-2">Confidence: {missionReadiness.confidence}</p>
              </div>
            </div>

            {/* Indicators */}
            <div className="lg:col-span-2 bg-gray-800/60 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Indicator Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(missionReadiness.indicators).map(([key, indicator]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-400 capitalize">{key.replace(/_/g, ' ')}</div>
                    <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${indicator.score}%`,
                          backgroundColor: indicator.score > 60 ? '#EF4444' : indicator.score > 30 ? '#F59E0B' : '#10B981'
                        }}
                      />
                    </div>
                    <div className="w-16 text-right text-sm font-mono text-gray-300">{indicator.score}/100</div>
                  </div>
                ))}
              </div>
              
              {missionReadiness.alerts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h4 className="text-xs font-semibold text-amber-400 mb-2">⚠ Active Alerts</h4>
                  {missionReadiness.alerts.slice(0, 3).map((alert, idx) => (
                    <div key={idx} className="text-xs text-gray-400 py-1">{alert.message}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Section: Operational Tempo Timeline */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Activity className="w-5 h-5 text-blue-500" />
          Operational Tempo Timeline
          <QuestionTooltip question="How has military activity by country changed over time?" />
        </h2>
        
        {operationalTempo && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Military Flights"
              value={operationalTempo.total_flights}
              icon={<Plane className="w-5 h-5 text-blue-400" />}
            />
            <StatCard
              title="Activity Spikes"
              value={operationalTempo.activity_spikes.length}
              icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
              trend={operationalTempo.activity_spikes.length > 3 ? { direction: 'up', value: `${operationalTempo.activity_spikes.length} detected` } : undefined}
            />
            <StatCard
              title="Peak Activity"
              value={operationalTempo.peak_activity?.country || 'N/A'}
              subtitle={operationalTempo.peak_activity?.hour || ''}
              icon={<TrendingUp className="w-5 h-5 text-green-400" />}
            />
            <StatCard
              title="Trend: Russia"
              value={operationalTempo.trend_analysis?.RU || 'N/A'}
              icon={<Activity className="w-5 h-5 text-red-400" />}
              trend={operationalTempo.trend_analysis?.RU === 'increasing' ? { direction: 'up', value: 'Rising' } : operationalTempo.trend_analysis?.RU === 'decreasing' ? { direction: 'down', value: 'Declining' } : undefined}
            />
          </div>
        )}

        {operationalTempo?.daily_data && operationalTempo.daily_data.length > 0 && (
          <ChartCard title="Daily Military Activity by Country" className="mt-4">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={operationalTempo.daily_data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} />
                  <YAxis stroke="#9CA3AF" fontSize={11} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#F9FAFB' }}
                  />
                  <Area type="monotone" dataKey="US" stackId="1" stroke={COUNTRY_COLORS.US} fill={COUNTRY_COLORS.US} fillOpacity={0.6} />
                  <Area type="monotone" dataKey="RU" stackId="1" stroke={COUNTRY_COLORS.RU} fill={COUNTRY_COLORS.RU} fillOpacity={0.6} />
                  <Area type="monotone" dataKey="GB" stackId="1" stroke={COUNTRY_COLORS.GB} fill={COUNTRY_COLORS.GB} fillOpacity={0.6} />
                  <Area type="monotone" dataKey="IL" stackId="1" stroke={COUNTRY_COLORS.IL} fill={COUNTRY_COLORS.IL} fillOpacity={0.6} />
                  <Area type="monotone" dataKey="NATO" stackId="1" stroke={COUNTRY_COLORS.NATO} fill={COUNTRY_COLORS.NATO} fillOpacity={0.6} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {operationalTempo?.activity_spikes && operationalTempo.activity_spikes.length > 0 && (
          <div className="mt-4 bg-gray-800/60 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Activity Spikes Detected
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {operationalTempo.activity_spikes.slice(0, 6).map((spike, idx) => (
                <div key={idx} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <span style={{ color: COUNTRY_COLORS[spike.country] || COUNTRY_COLORS.other }} className="font-semibold">
                      {spike.country}
                    </span>
                    <span className="text-red-400 font-mono text-sm">+{spike.increase_pct}%</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{spike.hour}</div>
                  <div className="text-xs text-gray-500">{spike.count} flights (avg: {spike.average})</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section: Electronic Warfare Correlation Map */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Radio className="w-5 h-5 text-red-500" />
          Electronic Warfare Correlation Map
          <QuestionTooltip question="Where do GPS jamming zones correlate with military flight paths?" />
        </h2>

        {ewCorrelation && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              title="Jamming Zones"
              value={ewCorrelation.total_jamming_zones}
              icon={<Radar className="w-5 h-5 text-red-400" />}
            />
            <StatCard
              title="Military Correlation"
              value={`${ewCorrelation.correlation_score}%`}
              icon={<Target className="w-5 h-5 text-amber-400" />}
              trend={ewCorrelation.correlation_score > 50 ? { direction: 'up', value: 'High correlation' } : undefined}
            />
            <StatCard
              title="Estimated EW Sources"
              value={ewCorrelation.estimated_ew_sources.length}
              icon={<Zap className="w-5 h-5 text-yellow-400" />}
            />
            <StatCard
              title="Zones w/ Military"
              value={ewCorrelation.zones_with_military}
              icon={<Shield className="w-5 h-5 text-blue-400" />}
            />
          </div>
        )}

        <div 
          ref={ewMapContainer} 
          className="w-full h-96 rounded-xl border border-gray-700 overflow-hidden"
          style={{ minHeight: '384px' }}
        />

        {ewCorrelation?.estimated_ew_sources && ewCorrelation.estimated_ew_sources.length > 0 && (
          <div className="mt-4 bg-gray-800/60 rounded-xl p-4 border border-amber-700/50">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Estimated EW Sources
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ewCorrelation.estimated_ew_sources.slice(0, 4).map((source, idx) => (
                <div key={idx} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700">
                  <div className="font-semibold text-gray-200">{source.likely_operator}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Position: {source.lat.toFixed(2)}°N, {source.lon.toFixed(2)}°E
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">Confidence: {source.confidence}</span>
                    <span className="text-xs text-red-400">Severity: {source.severity}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section: Aerial Refueling Track Monitor */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Plane className="w-5 h-5 text-blue-500" />
          Aerial Refueling Track Monitor
          <QuestionTooltip question="Where are tanker aircraft holding? This indicates potential strike support operations." />
        </h2>

        {tankerActivity && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              title="Active Tankers"
              value={tankerActivity.tanker_count}
              icon={<Plane className="w-5 h-5 text-blue-400" />}
            />
            <StatCard
              title="Total Tanker Hours"
              value={tankerActivity.total_tanker_hours}
              subtitle="Combined holding time"
              icon={<Clock className="w-5 h-5 text-amber-400" />}
            />
            {Object.entries(tankerActivity.by_holding_area).slice(0, 2).map(([area, count]) => (
              <StatCard
                key={area}
                title={area}
                value={count}
                subtitle="Tankers"
                icon={<Map className="w-5 h-5 text-green-400" />}
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div 
            ref={tankerMapContainer}
            className="h-80 rounded-xl border border-gray-700 overflow-hidden"
            style={{ minHeight: '320px' }}
          />
          
          {tankerActivity?.active_tankers && (
            <TableCard
              title="Active Tanker Aircraft"
              columns={tankerColumns}
              data={tankerActivity.active_tankers.slice(0, 10)}
            />
          )}
        </div>

        {tankerActivity?.alerts && tankerActivity.alerts.length > 0 && (
          <div className="mt-4 bg-red-900/20 rounded-xl p-4 border border-red-700/50">
            {tankerActivity.alerts.map((alert, idx) => (
              <div key={idx} className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{alert.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section: Night Operations Analysis */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Moon className="w-5 h-5 text-indigo-500" />
          Night Operations Analysis
          <QuestionTooltip question="What military activity occurs at night? Night ops often indicate sensitive/covert missions." />
        </h2>

        {nightOperations && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <StatCard
                title="Night Flights"
                value={nightOperations.day_vs_night.night}
                subtitle={`${nightOperations.day_vs_night.night_pct}% of total`}
                icon={<Moon className="w-5 h-5 text-indigo-400" />}
                trend={nightOperations.unusual_night_activity ? { direction: 'up', value: 'Above normal' } : undefined}
              />
              <StatCard
                title="Day Flights"
                value={nightOperations.day_vs_night.day}
                icon={<Sun className="w-5 h-5 text-amber-400" />}
              />
              {Object.entries(nightOperations.by_country_night).slice(0, 2).map(([country, count]) => (
                <StatCard
                  key={country}
                  title={`${country} Night Ops`}
                  value={count}
                  icon={<Shield className="w-5 h-5" style={{ color: COUNTRY_COLORS[country] || COUNTRY_COLORS.other }} />}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Day vs Night Distribution">
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Day (06:00-20:00)', value: nightOperations.day_vs_night.day, fill: '#F59E0B' },
                          { name: 'Night (20:00-06:00)', value: nightOperations.day_vs_night.night, fill: '#6366F1' }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <TableCard
                title="Recent Night Flights"
                columns={nightFlightColumns}
                data={nightOperations.night_flights.slice(0, 8)}
              />
            </div>

            {nightOperations.unusual_night_activity && (
              <div className="mt-4 bg-indigo-900/20 rounded-xl p-4 border border-indigo-700/50">
                <div className="flex items-center gap-2 text-indigo-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-semibold">Unusual Night Activity Detected</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  {nightOperations.day_vs_night.night_pct}% of military flights occurred at night (threshold: 30%)
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section: ISR Pattern Detection Gallery */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Eye className="w-5 h-5 text-purple-500" />
          ISR Pattern Detection Gallery
          <QuestionTooltip question="What reconnaissance patterns are being flown? Orbits and racetracks indicate surveillance activity." />
        </h2>

        {isrPatterns && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <StatCard
                title="ISR Flights"
                value={isrPatterns.total_isr_flights}
                icon={<Eye className="w-5 h-5 text-purple-400" />}
              />
              {Object.entries(isrPatterns.by_pattern_type).slice(0, 3).map(([type, count]) => (
                <StatCard
                  key={type}
                  title={type.charAt(0).toUpperCase() + type.slice(1)}
                  value={count}
                  subtitle="patterns detected"
                  icon={<Crosshair className="w-5 h-5 text-cyan-400" />}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div 
                ref={isrMapContainer}
                className="h-80 rounded-xl border border-gray-700 overflow-hidden"
                style={{ minHeight: '320px' }}
              />
              
              <TableCard
                title="Detected ISR Patterns"
                columns={isrPatternColumns}
                data={isrPatterns.patterns.slice(0, 8)}
              />
            </div>

            {isrPatterns.likely_collection_areas.length > 0 && (
              <div className="mt-4 bg-purple-900/20 rounded-xl p-4 border border-purple-700/50">
                <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Likely Collection Target Areas
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {isrPatterns.likely_collection_areas.slice(0, 4).map((area, idx) => (
                    <div key={idx} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700">
                      <div className="font-semibold text-gray-200 text-sm">{area.description}</div>
                      <div className="text-xs text-purple-400 mt-1">{area.flights_overhead} flights overhead</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section: Airspace Denial Visualization */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Flag className="w-5 h-5 text-orange-500" />
          Airspace Denial Visualization
          <QuestionTooltip question="Where are commercial aircraft avoiding? Empty zones indicate military activity or closures." />
        </h2>

        {airspaceDenial && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <StatCard
                title="Denial Zones"
                value={airspaceDenial.total_zones}
                icon={<Flag className="w-5 h-5 text-orange-400" />}
              />
              {airspaceDenial.most_avoided_areas.slice(0, 3).map((area) => (
                <StatCard
                  key={area.area_name}
                  title={area.area_name}
                  value={`${area.reduction_pct}%`}
                  subtitle="traffic reduction"
                  icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
                  trend={area.reduction_pct > 50 ? { direction: 'up', value: 'Severe' } : undefined}
                />
              ))}
            </div>

            <TableCard
              title="Airspace Denial Zones"
              columns={denialZoneColumns}
              data={airspaceDenial.denial_zones}
            />

            {airspaceDenial.alerts.length > 0 && (
              <div className="mt-4 bg-orange-900/20 rounded-xl p-4 border border-orange-700/50">
                {airspaceDenial.alerts.map((alert, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-orange-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{alert.message}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Section: Cross-Border Intercept Timeline */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
          <Crosshair className="w-5 h-5 text-cyan-500" />
          Cross-Border Intercept Timeline
          <QuestionTooltip question="When and where do military aircraft cross borders?" />
        </h2>

        {borderCrossings && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <StatCard
                title="Total Crossings"
                value={borderCrossings.total_crossings}
                icon={<Crosshair className="w-5 h-5 text-cyan-400" />}
              />
              <StatCard
                title="High Interest"
                value={borderCrossings.high_interest_crossings.length}
                subtitle="RU/IR to sensitive areas"
                icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
                trend={borderCrossings.high_interest_crossings.length > 5 ? { direction: 'up', value: 'Alert' } : undefined}
              />
              {Object.entries(borderCrossings.by_country_pair).slice(0, 2).map(([pair, count]) => (
                <StatCard
                  key={pair}
                  title={pair}
                  value={count}
                  subtitle="crossings"
                  icon={<Map className="w-5 h-5 text-blue-400" />}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TableCard
                title="Recent Border Crossings"
                columns={borderCrossingColumns}
                data={borderCrossings.crossings.slice(0, 10)}
              />
              
              {borderCrossings.high_interest_crossings.length > 0 && (
                <div className="bg-red-900/20 rounded-xl p-4 border border-red-700/50">
                  <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> High Interest Crossings
                  </h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {borderCrossings.high_interest_crossings.slice(0, 8).map((crossing, idx) => (
                      <div key={idx} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-200">{crossing.callsign}</span>
                          <span style={{ color: COUNTRY_COLORS[crossing.country] || COUNTRY_COLORS.other }}>
                            {crossing.country}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {crossing.from_region} → {crossing.to_region}
                        </div>
                        <div className="text-xs text-gray-500">{crossing.hour}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

export default MilitaryTab;

