import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertOctagon, Activity, Calendar, Clock, MapPin, TrendingUp, Plane, Cloud, CloudRain } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { fetchSafetyBatch, fetchWeatherImpact } from '../../api';
import type { WeatherImpactAnalysis } from '../../api';
import type { GoAroundHourly, SafetyMonthly, NearMissLocation, SafetyByPhase, EmergencyAftermath, TopAirlineEmergency, NearMissByCountry } from '../../api';
import type { EmergencyCodeStat, NearMissEvent, GoAroundStat } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface SafetyTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

export function SafetyTab({ startTs, endTs, cacheKey = 0 }: SafetyTabProps) {
  const [emergencyCodes, setEmergencyCodes] = useState<EmergencyCodeStat[]>([]);
  const [nearMiss, setNearMiss] = useState<NearMissEvent[]>([]);
  const [goArounds, setGoArounds] = useState<GoAroundStat[]>([]);
  const [goAroundsHourly, setGoAroundsHourly] = useState<GoAroundHourly[]>([]);
  const [safetyMonthly, setSafetyMonthly] = useState<SafetyMonthly[]>([]);
  const [nearMissLocations, setNearMissLocations] = useState<NearMissLocation[]>([]);
  const [safetyByPhase, setSafetyByPhase] = useState<SafetyByPhase | null>(null);
  const [emergencyAftermath, setEmergencyAftermath] = useState<EmergencyAftermath[]>([]);
  const [topAirlineEmergencies, setTopAirlineEmergencies] = useState<TopAirlineEmergency[]>([]);
  const [nearMissByCountry, setNearMissByCountry] = useState<NearMissByCountry | null>(null);
  const [weatherImpact, setWeatherImpact] = useState<WeatherImpactAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  // Map refs for near-miss heatmap
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    loadData();
  }, [startTs, endTs, cacheKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use batch API - single request instead of 10 parallel calls
      const data = await fetchSafetyBatch(startTs, endTs);
      
      setEmergencyCodes(data.emergency_codes || []);
      setNearMiss(data.near_miss || []);
      setGoArounds(data.go_arounds || []);
      setGoAroundsHourly(data.go_arounds_hourly || []);
      setSafetyMonthly(data.safety_monthly || []);
      setNearMissLocations(data.near_miss_locations || []);
      setSafetyByPhase(data.safety_by_phase || null);
      setEmergencyAftermath(data.emergency_aftermath || []);
      setTopAirlineEmergencies(data.top_airline_emergencies || []);
      setNearMissByCountry(data.near_miss_by_country || null);
      
      // Load weather impact separately
      try {
        const weather = await fetchWeatherImpact(startTs, endTs);
        setWeatherImpact(weather);
      } catch (e) {
        console.error('Failed to load weather impact:', e);
      }
    } catch (error) {
      console.error('Failed to load safety data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize near-miss heatmap
  useEffect(() => {
    if (!mapContainer.current || nearMissLocations.length === 0) return;

    // Clear existing markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    if (!map.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [35.0, 31.5],
        zoom: 6
      });
      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const currentMap = map.current;

    const addMarkers = () => {
      nearMissLocations.forEach(loc => {
        const el = document.createElement('div');
        const size = Math.min(40, 15 + loc.count * 3);
        const color = loc.severity_high > 0 ? '#ef4444' : '#f59e0b';
        
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color}80;
          border: 2px solid ${color};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          color: white;
        `;
        el.textContent = loc.count.toString();

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; max-width: 200px;">
            <div style="font-weight: bold; margin-bottom: 4px;">Near-Miss Zone</div>
            <div style="font-size: 12px; color: #666;">
              <div>Location: ${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E</div>
              <div>Total Events: ${loc.count}</div>
              <div style="color: #ef4444;">High Severity: ${loc.severity_high}</div>
              <div style="color: #f59e0b;">Medium Severity: ${loc.severity_medium}</div>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([loc.lon, loc.lat])
          .setPopup(popup)
          .addTo(currentMap);

        markers.current.push(marker);
      });
    };

    if (currentMap.loaded()) {
      addMarkers();
    } else {
      currentMap.on('load', addMarkers);
    }

    return () => {
      markers.current.forEach(m => m.remove());
    };
  }, [nearMissLocations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading safety statistics...</div>
      </div>
    );
  }

  const totalEmergencies = emergencyCodes.reduce((sum, code) => sum + code.count, 0);
  const highSeverityNearMiss = nearMiss.filter(e => e.severity === 'high').length;
  const totalGoArounds = goArounds.reduce((sum, ga) => sum + ga.count, 0);

  // Find most dangerous month
  const mostDangerousMonth = safetyMonthly.length > 0 
    ? safetyMonthly.reduce((max, m) => m.total_events > max.total_events ? m : max, safetyMonthly[0])
    : null;

  // Find peak go-around hours
  const peakGoAroundHours = goAroundsHourly
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => h.hour);

  const nearMissColumns: Column[] = [
    { key: 'timestamp', title: 'Time', render: (val) => new Date(val * 1000).toLocaleString() },
    { key: 'flight_id', title: 'Flight' },
    { key: 'other_flight_id', title: 'Other Flight' },
    { key: 'distance_nm', title: 'Distance (nm)' },
    { key: 'altitude_diff_ft', title: 'Alt Diff (ft)' },
    { 
      key: 'severity', 
      title: 'Severity',
      render: (val) => (
        <span className={val === 'high' ? 'text-red-500 font-bold' : 'text-yellow-500'}>
          {val.toUpperCase()}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Key Safety Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Emergency Codes"
          value={totalEmergencies}
          subtitle="7700/7600/7500 squawks"
          icon={<AlertTriangle className="w-6 h-6" />}
        />
        <StatCard
          title="Near-Miss Events"
          value={nearMiss.length}
          subtitle={`${highSeverityNearMiss} high severity`}
          icon={<AlertOctagon className="w-6 h-6" />}
        />
        <StatCard
          title="Go-Arounds"
          value={totalGoArounds}
          subtitle="Aborted landings"
          icon={<Activity className="w-6 h-6" />}
        />
        {mostDangerousMonth && (
          <StatCard
            title="Most Dangerous Month"
            value={mostDangerousMonth.month}
            subtitle={`${mostDangerousMonth.total_events} events`}
            icon={<Calendar className="w-6 h-6" />}
          />
        )}
      </div>

      {/* Monthly Safety Events Breakdown */}
      {safetyMonthly.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-500" />
              Monthly Safety Trends
            </h2>
            <p className="text-white/60 text-sm">
              Which month was the most dangerous?
            </p>
          </div>

          <ChartCard title="Safety Events by Month">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={safetyMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis 
                  dataKey="month" 
                  stroke="#ffffff60" 
                  tick={{ fill: '#ffffff60', fontSize: 11 }} 
                />
                <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #ffffff20',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="emergency_codes" fill="#ef4444" name="Emergency Codes" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="near_miss" fill="#f59e0b" name="Near-Miss" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="go_arounds" fill="#8b5cf6" name="Go-Arounds" stackId="a" radius={[4, 4, 0, 0]} />
                <Line 
                  type="monotone" 
                  dataKey="affected_flights" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Affected Flights"
                  dot={{ fill: '#3b82f6' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      {/* Safety Events by Flight Phase */}
      {safetyByPhase && safetyByPhase.total_events > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-500" />
              Safety Events by Flight Phase
            </h2>
            <p className="text-white/60 text-sm">
              How many safety events occur at cruise altitude vs approach?
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Cruise */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-white font-medium">Cruise</span>
                </div>
                <span className="text-blue-400 font-bold text-xl">{safetyByPhase.phases.cruise.count}</span>
              </div>
              <div className="text-white/50 text-xs mb-3">&gt; 25,000 ft</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/60">Emergency</span>
                  <span className="text-red-400">{safetyByPhase.phases.cruise.emergency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Near-miss</span>
                  <span className="text-orange-400">{safetyByPhase.phases.cruise.near_miss}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Go-around</span>
                  <span className="text-purple-400">{safetyByPhase.phases.cruise.go_around}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-white/40 text-xs">{safetyByPhase.percentages.cruise}% of events</div>
              </div>
            </div>

            {/* Descent/Climb */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-white font-medium">Descent/Climb</span>
                </div>
                <span className="text-yellow-400 font-bold text-xl">{safetyByPhase.phases.descent_climb.count}</span>
              </div>
              <div className="text-white/50 text-xs mb-3">10,000 - 25,000 ft</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/60">Emergency</span>
                  <span className="text-red-400">{safetyByPhase.phases.descent_climb.emergency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Near-miss</span>
                  <span className="text-orange-400">{safetyByPhase.phases.descent_climb.near_miss}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Go-around</span>
                  <span className="text-purple-400">{safetyByPhase.phases.descent_climb.go_around}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-white/40 text-xs">{safetyByPhase.percentages.descent_climb}% of events</div>
              </div>
            </div>

            {/* Approach */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-white font-medium">Approach</span>
                </div>
                <span className="text-red-400 font-bold text-xl">{safetyByPhase.phases.approach.count}</span>
              </div>
              <div className="text-white/50 text-xs mb-3">&lt; 10,000 ft</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/60">Emergency</span>
                  <span className="text-red-400">{safetyByPhase.phases.approach.emergency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Near-miss</span>
                  <span className="text-orange-400">{safetyByPhase.phases.approach.near_miss}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Go-around</span>
                  <span className="text-purple-400">{safetyByPhase.phases.approach.go_around}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-white/40 text-xs">{safetyByPhase.percentages.approach}% of events</div>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="text-white/60 text-sm mb-4">Distribution by Phase</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-blue-400">Cruise</span>
                    <span className="text-white">{safetyByPhase.percentages.cruise}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${safetyByPhase.percentages.cruise}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-yellow-400">Descent/Climb</span>
                    <span className="text-white">{safetyByPhase.percentages.descent_climb}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-yellow-500 h-2 rounded-full transition-all"
                      style={{ width: `${safetyByPhase.percentages.descent_climb}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-red-400">Approach</span>
                    <span className="text-white">{safetyByPhase.percentages.approach}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${safetyByPhase.percentages.approach}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 text-center">
                <div className="text-white font-bold text-lg">{safetyByPhase.total_events}</div>
                <div className="text-white/40 text-xs">Total Events</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Emergency Codes Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Emergency Codes by Type">
          {emergencyCodes.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={emergencyCodes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="code" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #ffffff20',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-white/40">
              No emergency codes in this period
            </div>
          )}
        </ChartCard>

        {/* Top Airlines by Emergency Declarations */}
        <ChartCard title="Top Airlines by Emergency Declarations">
          {topAirlineEmergencies.length > 0 ? (
            <div className="space-y-3">
              {topAirlineEmergencies.slice(0, 8).map((airline, idx) => (
                <div key={airline.airline} className="flex items-center gap-3">
                  <div className="w-6 text-white/40 text-sm font-mono">{idx + 1}.</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Plane className="w-4 h-4 text-red-400" />
                        <span className="text-white font-medium">{airline.airline}</span>
                      </div>
                      <span className="text-red-400 font-bold">{airline.emergency_count}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/30 rounded-full h-2">
                        <div 
                          className="bg-red-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, airline.emergency_rate * 10)}%` }}
                        />
                      </div>
                      <span className="text-white/50 text-xs w-16 text-right">
                        {airline.emergency_rate.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-white/40 text-xs mt-1">
                      {airline.total_flights} total flights
                    </div>
                  </div>
                </div>
              ))}
              {topAirlineEmergencies.length === 0 && (
                <div className="text-white/40 text-center py-8">
                  No emergency declarations in this period
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-white/40">
              No emergency data available
            </div>
          )}
        </ChartCard>
      </div>

      {/* Emergency Aftermath Analysis */}
      {emergencyAftermath.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Emergency Code Aftermath
            </h2>
            <p className="text-white/60 text-sm">
              What happened after aircraft switched to emergency codes?
            </p>
          </div>

          {/* Outcome Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[
              { outcome: 'landed_at_destination', label: 'Landed at Dest', color: 'text-green-400 bg-green-500/20' },
              { outcome: 'diverted', label: 'Diverted', color: 'text-orange-400 bg-orange-500/20' },
              { outcome: 'returned_to_base', label: 'Returned to Base', color: 'text-yellow-400 bg-yellow-500/20' },
              { outcome: 'go_around_then_landed', label: 'Go-Around + Land', color: 'text-purple-400 bg-purple-500/20' },
              { outcome: 'continued_flight', label: 'Continued', color: 'text-blue-400 bg-blue-500/20' }
            ].map(({ outcome, label, color }) => {
              const count = emergencyAftermath.filter(e => e.outcome === outcome).length;
              return (
                <div key={outcome} className={`rounded-lg p-3 ${color.split(' ')[1]} border border-white/10`}>
                  <div className={`text-2xl font-bold ${color.split(' ')[0]}`}>{count}</div>
                  <div className="text-white/60 text-xs">{label}</div>
                </div>
              );
            })}
          </div>

          {/* Detailed Events Table */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Time</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Callsign</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Code</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Route</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Outcome</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Landing</th>
                  </tr>
                </thead>
                <tbody>
                  {emergencyAftermath.slice(0, 15).map((event, idx) => (
                    <tr key={`${event.flight_id}-${idx}`} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 text-white/60 text-sm">
                        {new Date(event.timestamp * 1000).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{event.callsign}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          event.emergency_code === '7500' ? 'bg-red-600 text-white' :
                          event.emergency_code === '7700' ? 'bg-orange-500 text-white' :
                          'bg-yellow-500 text-black'
                        }`}>
                          {event.emergency_code}
                        </span>
                        <span className="text-white/50 text-xs ml-2">{event.code_description}</span>
                      </td>
                      <td className="px-4 py-3 text-white/60 text-sm">
                        {event.origin || '?'} → {event.destination || '?'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          event.outcome === 'landed_at_destination' ? 'bg-green-500/20 text-green-400' :
                          event.outcome === 'diverted' ? 'bg-orange-500/20 text-orange-400' :
                          event.outcome === 'returned_to_base' ? 'bg-yellow-500/20 text-yellow-400' :
                          event.outcome === 'go_around_then_landed' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {event.outcome.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-cyan-400 font-medium">
                          {event.landing_airport || '-'}
                        </span>
                        {event.had_go_around && (
                          <span className="text-purple-400 text-xs ml-1">(GA)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {emergencyAftermath.length > 15 && (
              <div className="px-4 py-3 bg-surface-highlight text-center">
                <span className="text-white/50 text-sm">Showing 15 of {emergencyAftermath.length} events</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Go-Around Section */}
      <div className="border-b border-white/10 pb-4 pt-4">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-500" />
          Go-Around Analysis
        </h2>
        <p className="text-white/60 text-sm">
          At which hours do go-arounds peak?
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Go-Around by Airport */}
        <ChartCard title="Go-Arounds by Airport">
          {goArounds.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={goArounds.slice(0, 10)} layout="vertical">
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
          ) : (
            <div className="h-64 flex items-center justify-center text-white/40">
              No go-around events in this period
            </div>
          )}
        </ChartCard>

        {/* Go-Around by Hour */}
        <ChartCard title="Go-Arounds by Hour of Day">
          {goAroundsHourly.some(h => h.count > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={goAroundsHourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis 
                  dataKey="hour" 
                  stroke="#ffffff60" 
                  tick={{ fill: '#ffffff60', fontSize: 10 }}
                  tickFormatter={(h) => `${h}:00`}
                />
                <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #ffffff20',
                    borderRadius: '8px'
                  }}
                  labelFormatter={(h) => `Hour: ${h}:00`}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-white/40">
              No hourly data available
            </div>
          )}
        </ChartCard>
      </div>

      {/* Peak Hours Summary */}
      {peakGoAroundHours.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 to-purple-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-white font-medium">Peak Go-Around Hours: </span>
              <span className="text-amber-400 font-bold">
                {peakGoAroundHours.map(h => `${h}:00`).join(', ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Near-Miss by Country */}
      {nearMissByCountry && nearMissByCountry.total_near_miss > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" />
              Near-Miss Events by Country
            </h2>
            <p className="text-white/60 text-sm">
              How many near-miss events happened over Israel/Jordan?
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Country Distribution */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-medium mb-4">Events by Country</h4>
              <div className="space-y-3">
                {Object.entries(nearMissByCountry.by_country)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([country, count]) => {
                    const maxCount = Math.max(...Object.values(nearMissByCountry.by_country));
                    const percentage = (count / maxCount) * 100;
                    return (
                      <div key={country} className="flex items-center gap-3">
                        <div className="w-8 text-white font-bold text-sm">{country}</div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white/60 text-sm">{count} events</span>
                            <span className="text-orange-400 font-bold">{((count / nearMissByCountry.total_near_miss) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-black/30 rounded-full h-2">
                            <div 
                              className="bg-orange-500 h-2 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 text-center">
                <div className="text-white font-bold text-2xl">{nearMissByCountry.total_near_miss}</div>
                <div className="text-white/50 text-sm">Total Near-Miss Events</div>
              </div>
            </div>

            {/* Recent Events */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-medium mb-4">Recent Events</h4>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {nearMissByCountry.events.slice(0, 15).map((event, idx) => (
                  <div key={`${event.flight_id}-${idx}`} className="bg-surface-highlight rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-medium">{event.callsign}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        event.severity >= 0.7 ? 'bg-red-500/20 text-red-400' :
                        event.severity >= 0.4 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {(event.severity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <span>{new Date(event.timestamp * 1000).toLocaleString()}</span>
                      {event.countries.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-orange-400">{event.countries.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Near-Miss Geographic Heatmap */}
      {nearMissLocations.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-500" />
              Near-Miss Geographic Distribution
            </h2>
            <p className="text-white/60 text-sm">
              Where do most safety events occur?
            </p>
          </div>

          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-0">
              {/* Map */}
              <div className="xl:col-span-2">
                <div ref={mapContainer} className="h-[400px] w-full" />
              </div>
              
              {/* Stats Panel */}
              <div className="p-4 border-l border-white/10 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-highlight rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-400">{nearMissLocations.length}</div>
                    <div className="text-xs text-white/50">Hotspot Zones</div>
                  </div>
                  <div className="bg-surface-highlight rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-orange-400">
                      {nearMissLocations.reduce((sum, l) => sum + l.count, 0)}
                    </div>
                    <div className="text-xs text-white/50">Total Events</div>
                  </div>
                </div>

                <div className="bg-surface-highlight rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-red-500" />
                    <span className="text-white/80 text-sm font-medium">Top Hotspots</span>
                  </div>
                  <div className="space-y-2">
                    {nearMissLocations.slice(0, 5).map((loc, idx) => (
                      <div key={idx} className="bg-black/20 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white text-sm font-medium">
                            {loc.lat.toFixed(2)}°N, {loc.lon.toFixed(2)}°E
                          </span>
                          <span className="text-red-400 font-bold text-sm">{loc.count}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-red-400">{loc.severity_high} high</span>
                          <span className="text-white/30">|</span>
                          <span className="text-yellow-400">{loc.severity_medium} medium</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-lg p-4">
                  <h4 className="text-red-400 text-sm font-medium mb-2">Legend</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-red-500/80 border-2 border-red-500"></div>
                      <span className="text-white/70">High severity events</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-amber-500/80 border-2 border-amber-500"></div>
                      <span className="text-white/70">Medium severity events</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Near-Miss Events Table */}
      <TableCard
        title="Recent Near-Miss Events"
        columns={nearMissColumns}
        data={nearMiss.slice(0, 20)}
      />

      {/* Weather Impact Section */}
      {weatherImpact && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <CloudRain className="w-5 h-5 text-blue-400" />
              Weather Impact Analysis
            </h2>
            <p className="text-white/60 text-sm">
              Diversions, go-arounds, and deviations potentially caused by weather
            </p>
          </div>

          {/* Weather Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Weather-Related Events"
              value={weatherImpact.weather_correlated_anomalies}
              subtitle="Total weather-correlated"
              icon={<Cloud className="w-6 h-6" />}
            />
            <StatCard
              title="Diversions"
              value={weatherImpact.total_diversions}
              subtitle="Likely weather-caused"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Go-Arounds"
              value={weatherImpact.total_go_arounds}
              subtitle="Weather pattern"
              icon={<Activity className="w-6 h-6" />}
            />
            <StatCard
              title="Route Deviations"
              value={weatherImpact.total_deviations}
              subtitle="Storm avoidance"
              icon={<TrendingUp className="w-6 h-6" />}
            />
          </div>

          {/* Weather Insights */}
          {weatherImpact.insights.length > 0 && (
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

          {/* Weather by Airport */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Diversions by Airport */}
            {weatherImpact.diversions_likely_weather.length > 0 && (
              <div className="bg-surface rounded-xl border border-white/10 p-5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-orange-400" />
                  Diversions by Destination Airport
                </h3>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {weatherImpact.diversions_likely_weather.map((d) => (
                    <div key={d.airport} className="bg-surface-highlight rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-medium">{d.airport}</span>
                        <span className="text-orange-400 font-bold">{d.count} diversions</span>
                      </div>
                      {d.dates.length > 0 && (
                        <div className="text-white/50 text-xs">
                          Dates: {d.dates.slice(0, 3).join(', ')}{d.dates.length > 3 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Go-Arounds by Airport */}
            {weatherImpact.go_arounds_weather_pattern.length > 0 && (
              <div className="bg-surface rounded-xl border border-white/10 p-5">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  Go-Arounds by Airport
                </h3>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {weatherImpact.go_arounds_weather_pattern.map((g) => (
                    <div key={g.airport} className="bg-surface-highlight rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-medium">{g.airport}</span>
                        <span className="text-purple-400 font-bold">{g.count} go-arounds</span>
                      </div>
                      <div className="text-white/50 text-xs">
                        Peak hour: {g.peak_hour}:00
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Monthly Weather Impact Chart */}
          {weatherImpact.monthly_weather_impact.length > 0 && (
            <ChartCard title="Monthly Weather Impact">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={weatherImpact.monthly_weather_impact}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis 
                    dataKey="month" 
                    stroke="#ffffff60"
                    tick={{ fill: '#ffffff60', fontSize: 11 }}
                  />
                  <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #ffffff20',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'diversion_count' ? 'Diversions' :
                      name === 'go_around_count' ? 'Go-Arounds' :
                      name === 'deviation_count' ? 'Deviations' : name
                    ]}
                  />
                  <Bar dataKey="diversion_count" fill="#f97316" name="diversion_count" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="go_around_count" fill="#8b5cf6" name="go_around_count" radius={[4, 4, 0, 0]} />
                  <Line 
                    type="monotone" 
                    dataKey="deviation_count" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="deviation_count"
                    dot={{ fill: '#22c55e', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}
