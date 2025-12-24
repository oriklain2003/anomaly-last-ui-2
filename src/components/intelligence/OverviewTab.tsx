import { useState, useEffect } from 'react';
import { AlertTriangle, Plane, TrendingUp, AlertCircle, Shield, Activity, RotateCcw, MapPin } from 'lucide-react';
import { StatCard } from './StatCard';
import { ChartCard } from './ChartCard';
import { fetchOverviewBatch, type MonthlyFlightStats } from '../../api';
import type { OverviewStats, FlightPerDay, AirspaceRisk } from '../../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface OverviewTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

export function OverviewTab({ startTs, endTs, cacheKey = 0 }: OverviewTabProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [flightsPerDay, setFlightsPerDay] = useState<FlightPerDay[]>([]);
  const [airspaceRisk, setAirspaceRisk] = useState<AirspaceRisk | null>(null);
  const [monthlyFlights, setMonthlyFlights] = useState<MonthlyFlightStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [startTs, endTs, cacheKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use batch API with pre-computed cache
      const batchData = await fetchOverviewBatch(startTs, endTs, [
        'stats', 'flights_per_day', 'airspace_risk', 'monthly_flights'
      ]);
      
      setStats(batchData.stats || null);
      setFlightsPerDay(batchData.flights_per_day || []);
      setAirspaceRisk(batchData.airspace_risk || null);
      setMonthlyFlights(batchData.monthly_flights || []);
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
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Emergency Codes"
          value={stats.emergency_codes.toLocaleString()}
          subtitle="7700/7600/7500"
          icon={<AlertCircle className="w-5 h-5" />}
        />
        <StatCard
          title="Near-Miss Events"
          value={stats.near_miss.toLocaleString()}
          subtitle="Proximity violations"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
        <StatCard
          title="Return-To-Field"
          value={(stats.return_to_field || 0).toLocaleString()}
          subtitle="Returned to origin"
          icon={<RotateCcw className="w-5 h-5" />}
        />
        <StatCard
          title="Unplanned Landing"
          value={(stats.unplanned_landing || 0).toLocaleString()}
          subtitle="Diverted flights"
          icon={<MapPin className="w-5 h-5" />}
        />
        <StatCard
          title="Military Flights"
          value={(stats.military_flights || 0).toLocaleString()}
          subtitle="Military/Government"
          icon={<Plane className="w-5 h-5" />}
        />
        <StatCard
          title="Detection Rate"
          value={`${((stats.total_anomalies / Math.max(stats.total_flights, 1)) * 100).toFixed(1)}%`}
          subtitle="Anomalies per flight"
        />
      </div>

      {/* Intelligence Summary */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Intelligence Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                airspaceRisk.risk_level === 'high' ? 'text-red-400' :
                airspaceRisk.risk_level === 'medium' ? 'text-amber-400' :
                'text-green-400'
              }`}>
                {airspaceRisk.risk_level.toUpperCase()} RISK
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
      {airspaceRisk && airspaceRisk.risk_level !== 'low' && (
        <div className="mt-6 bg-surface-highlight rounded-xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white/80 mb-3">Quick Insights</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${airspaceRisk.risk_level === 'high' ? 'bg-red-400' : 'bg-amber-400'}`}></div>
              <span className="text-white/70">
                Airspace risk is <span className={airspaceRisk.risk_level === 'high' ? 'text-red-400' : 'text-amber-400'}>
                  {airspaceRisk.risk_level}
                </span> - {airspaceRisk.factors?.slice(0, 2).map(f => f.name).join(', ') || 'multiple factors'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

