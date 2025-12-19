import { useState, useEffect } from 'react';
import { AlertTriangle, Plane, TrendingUp, AlertCircle, Radar, Shield, Target, Activity, Database } from 'lucide-react';
import { StatCard } from './StatCard';
import { ChartCard } from './ChartCard';
import { 
  fetchStatsOverview, 
  fetchFlightsPerDay, 
  fetchGPSJamming, 
  fetchMilitaryPatterns, 
  fetchAirspaceRisk,
  fetchFlightsPerMonth,
  // New tagged API functions (optimized for feedback_tagged.db)
  fetchTaggedStatsOverview,
  fetchTaggedFlightsPerDay,
  fetchTaggedMilitaryStats,
  type TaggedOverviewStats,
  type TaggedFlightPerDay,
  type TaggedMilitaryStats,
  type MonthlyFlightStats
} from '../../api';
import type { OverviewStats, FlightPerDay, GPSJammingPoint, MilitaryPattern, AirspaceRisk } from '../../types';
import { BarChart, Bar } from 'recharts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface OverviewTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number; // Force refresh when this changes
  useTaggedDb?: boolean; // Use feedback_tagged.db for optimized queries
}

// Extended stats type that includes tagged-specific fields
interface ExtendedStats extends OverviewStats {
  military_flights?: number;
  avg_severity?: number;
}

// Extended flights per day with anomaly count
interface ExtendedFlightPerDay extends FlightPerDay {
  anomaly_count?: number;
}

export function OverviewTab({ startTs, endTs, cacheKey = 0, useTaggedDb = true }: OverviewTabProps) {
  const [stats, setStats] = useState<ExtendedStats | null>(null);
  const [flightsPerDay, setFlightsPerDay] = useState<ExtendedFlightPerDay[]>([]);
  const [gpsJamming, setGpsJamming] = useState<GPSJammingPoint[]>([]);
  const [militaryPatterns, setMilitaryPatterns] = useState<MilitaryPattern[]>([]);
  const [militaryStats, setMilitaryStats] = useState<TaggedMilitaryStats | null>(null);
  const [airspaceRisk, setAirspaceRisk] = useState<AirspaceRisk | null>(null);
  const [monthlyFlights, setMonthlyFlights] = useState<MonthlyFlightStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'tagged' | 'research'>('research');

  useEffect(() => {
    loadData();
  }, [startTs, endTs, cacheKey, useTaggedDb]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (useTaggedDb) {
        // Try to load from feedback_tagged.db first (optimized queries)
        const [taggedOverview, taggedFlights, taggedMilitary, jammingData, riskData, monthlyData] = await Promise.all([
          fetchTaggedStatsOverview(startTs, endTs).catch(() => null),
          fetchTaggedFlightsPerDay(startTs, endTs).catch(() => []),
          fetchTaggedMilitaryStats(startTs, endTs).catch(() => null),
          fetchGPSJamming(startTs, endTs).catch(() => []),
          fetchAirspaceRisk().catch(() => null),
          fetchFlightsPerMonth(startTs, endTs).catch(() => [])
        ]);

        if (taggedOverview && taggedOverview.total_flights > 0) {
          // Use tagged data
          setStats(taggedOverview);
          setFlightsPerDay(taggedFlights);
          setMilitaryStats(taggedMilitary);
          setGpsJamming(jammingData);
          setAirspaceRisk(riskData);
          setMonthlyFlights(monthlyData);
          setDataSource('tagged');
          
          // Convert military stats to patterns format for compatibility
          if (taggedMilitary) {
            const patterns: MilitaryPattern[] = taggedMilitary.flights.map(f => ({
              flight_id: f.flight_id,
              callsign: f.callsign,
              country: f.country,
              aircraft_type: f.type,
              pattern_type: 'transit',
              duration_minutes: 0,
              avg_altitude_ft: 0,
              lat: 0,
              lon: 0
            }));
            setMilitaryPatterns(patterns);
          }
          setLoading(false);
          return;
        }
      }
      
      // Fallback to research.db (original queries)
      const [overviewData, flightsData, jammingData, militaryData, riskData, monthlyData] = await Promise.all([
        fetchStatsOverview(startTs, endTs),
        fetchFlightsPerDay(startTs, endTs),
        fetchGPSJamming(startTs, endTs).catch(() => []),
        fetchMilitaryPatterns(startTs, endTs).catch(() => []),
        fetchAirspaceRisk().catch(() => null),
        fetchFlightsPerMonth(startTs, endTs).catch(() => [])
      ]);
      setStats(overviewData);
      setFlightsPerDay(flightsData);
      setGpsJamming(jammingData);
      setMilitaryPatterns(militaryData);
      setAirspaceRisk(riskData);
      setMonthlyFlights(monthlyData);
      setDataSource('research');
    } catch (error) {
      console.error('Failed to load overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading overview...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">No data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Source Indicator */}
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Database className="w-3 h-3" />
        <span>
          Data source: <span className={dataSource === 'tagged' ? 'text-green-400' : 'text-blue-400'}>
            {dataSource === 'tagged' ? 'feedback_tagged.db (optimized)' : 'research.db'}
          </span>
        </span>
        {stats.avg_severity !== undefined && (
          <span className="ml-4">
            Avg Severity: <span className="text-amber-400">{stats.avg_severity.toFixed(2)}</span>
          </span>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Flights"
          value={stats.total_flights.toLocaleString()}
          subtitle="Tracked flights"
          icon={<Plane className="w-6 h-6" />}
        />
        <StatCard
          title="Anomaly Flights"
          value={stats.total_anomalies.toLocaleString()}
          subtitle="Flights with anomalies"
          icon={<AlertTriangle className="w-6 h-6" />}
        />
        <StatCard
          title="Safety Events"
          value={stats.safety_events.toLocaleString()}
          subtitle="Critical incidents"
          icon={<AlertCircle className="w-6 h-6" />}
        />
        <StatCard
          title="Go-Arounds"
          value={stats.go_arounds.toLocaleString()}
          subtitle="Aborted landings"
          icon={<TrendingUp className="w-6 h-6" />}
        />
      </div>

      {/* Flights Per Day Chart */}
      <ChartCard title="Flights Per Day (Last 30 Days)">
        {flightsPerDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={flightsPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis 
                dataKey="date" 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <YAxis 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #ffffff20',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#fff' }}
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Total Flights"
              />
              <Line 
                type="monotone" 
                dataKey="military_count" 
                stroke="#ef4444" 
                strokeWidth={2}
                name="Military"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-white/40">
            No flight data available
          </div>
        )}
      </ChartCard>

      {/* Monthly Flight Aggregation */}
      {monthlyFlights.length > 0 && (
        <ChartCard title="Monthly Flight Aggregation">
          <div className="mb-4">
            {(() => {
              const peakMonth = monthlyFlights.reduce((max, m) => m.total_flights > max.total_flights ? m : max, monthlyFlights[0]);
              return (
                <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    <span className="text-white">
                      Busiest Month: <span className="text-blue-400 font-bold">{peakMonth.month}</span>
                      <span className="text-white/60 ml-2">({peakMonth.total_flights.toLocaleString()} flights)</span>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyFlights}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis 
                dataKey="month" 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60', fontSize: 11 }}
              />
              <YAxis 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #ffffff20',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="total_flights" fill="#3b82f6" name="Total Flights" radius={[4, 4, 0, 0]} />
              <Bar dataKey="military_count" fill="#ef4444" name="Military" radius={[4, 4, 0, 0]} />
              <Bar dataKey="anomaly_count" fill="#f59e0b" name="Anomalies" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Emergency Codes"
          value={stats.emergency_codes.toLocaleString()}
          subtitle="7700/7600/7500"
        />
        <StatCard
          title="Near-Miss Events"
          value={stats.near_miss.toLocaleString()}
          subtitle="Proximity violations"
        />
        <StatCard
          title="Detection Rate"
          value={`${((stats.total_anomalies / Math.max(stats.total_flights, 1)) * 100).toFixed(1)}%`}
          subtitle="Anomalies per flight"
        />
      </div>

      {/* Level 3: Intelligence Summary */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Intelligence Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Radar className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{gpsJamming.length}</div>
                <div className="text-xs text-purple-300">GPS Jamming Zones</div>
              </div>
            </div>
            {gpsJamming.length > 0 && (
              <div className="mt-3 text-xs text-purple-200/70">
                {gpsJamming.reduce((sum, j) => sum + j.affected_flights, 0)} affected flights
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-xl p-4 border border-red-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Target className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {militaryStats?.total_military ?? stats.military_flights ?? militaryPatterns.length}
                </div>
                <div className="text-xs text-red-300">Military Aircraft</div>
              </div>
            </div>
            {(militaryStats || militaryPatterns.length > 0) && (
              <div className="mt-3 text-xs text-red-200/70">
                {militaryStats 
                  ? Object.keys(militaryStats.by_country).slice(0, 3).join(', ')
                  : [...new Set(militaryPatterns.map(m => m.country))].slice(0, 3).join(', ')
                }
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 rounded-xl p-4 border border-amber-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Activity className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {airspaceRisk ? airspaceRisk.risk_score : '--'}
                </div>
                <div className="text-xs text-amber-300">Airspace Risk Score</div>
              </div>
            </div>
            {airspaceRisk && (
              <div className={`mt-3 text-xs font-medium ${
                airspaceRisk.risk_level === 'HIGH' ? 'text-red-400' :
                airspaceRisk.risk_level === 'MEDIUM' ? 'text-amber-400' :
                'text-green-400'
              }`}>
                {airspaceRisk.risk_level} RISK
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 rounded-xl p-4 border border-cyan-500/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {flightsPerDay.length > 0 
                    ? Math.round(flightsPerDay.reduce((sum, d) => sum + d.count, 0) / flightsPerDay.length)
                    : '--'}
                </div>
                <div className="text-xs text-cyan-300">Avg Daily Flights</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-cyan-200/70">
              {flightsPerDay.length} days analyzed
            </div>
          </div>
        </div>
      </div>

      {/* Quick Insights */}
      {(gpsJamming.length > 0 || militaryPatterns.length > 0 || (airspaceRisk && airspaceRisk.risk_level !== 'LOW')) && (
        <div className="mt-6 bg-surface-highlight rounded-xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white/80 mb-3">Quick Insights</h4>
          <div className="space-y-2">
            {gpsJamming.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                <span className="text-white/70">
                  <span className="text-purple-400 font-medium">{gpsJamming.length} GPS jamming zones</span> detected - 
                  highest intensity at {gpsJamming[0]?.lat.toFixed(2)}°N, {gpsJamming[0]?.lon.toFixed(2)}°E
                </span>
              </div>
            )}
            {(militaryStats?.total_military || militaryPatterns.length > 0) && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span className="text-white/70">
                  <span className="text-red-400 font-medium">
                    {militaryStats?.total_military ?? militaryPatterns.length} military aircraft
                  </span> tracked
                  {(() => {
                    if (militaryStats) {
                      const countries = Object.keys(militaryStats.by_country).filter(Boolean);
                      if (countries.length > 0) {
                        return ` from ${countries.slice(0, 2).join(', ')}`;
                      }
                      const types = Object.keys(militaryStats.by_type).filter(Boolean);
                      if (types.length > 0) {
                        return ` - ${types.slice(0, 2).join(', ')}`;
                      }
                      return '';
                    }
                    const orbitCount = militaryPatterns.filter(m => m.pattern_type === 'orbit').length;
                    if (orbitCount > 0) {
                      return ` - ${orbitCount} in orbit patterns`;
                    }
                    const countries = [...new Set(militaryPatterns.map(m => m.country).filter(Boolean))];
                    if (countries.length > 0) {
                      return ` from ${countries.slice(0, 2).join(', ')}`;
                    }
                    return '';
                  })()}
                </span>
              </div>
            )}
            {airspaceRisk && airspaceRisk.risk_level !== 'LOW' && (
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${airspaceRisk.risk_level === 'HIGH' ? 'bg-red-400' : 'bg-amber-400'}`}></div>
                <span className="text-white/70">
                  Airspace risk is <span className={airspaceRisk.risk_level === 'HIGH' ? 'text-red-400' : 'text-amber-400'}>
                    {airspaceRisk.risk_level}
                  </span> - {airspaceRisk.factors?.slice(0, 2).map(f => f.name).join(', ') || 'multiple factors'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

