import { useState, useEffect } from 'react';
import { Plane, Signal, AlertTriangle, Info, Clock, MapPin, TrendingUp, Building2, BarChart3, Calendar, Map } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import { SignalLossMap } from './SignalLossMap';
import { BottleneckMap } from './BottleneckMap';
import { 
  fetchTrafficBatch,
  fetchRunwayUsage,
  fetchAirportHourlyTraffic,
} from '../../api';
import type { 
  SignalLossAnomalyResponse,
  DiversionMonthly,
  DiversionsSeasonal
} from '../../api';
import type { FlightPerDay, SignalLossLocation, SignalLossMonthly, SignalLossHourly, BusiestAirport } from '../../types';
import type { PeakHoursAnalysis, RunwayUsage, FlightsMissingInfo, DeviationByType, BottleneckZone, AirportHourlyTraffic } from '../../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Area } from 'recharts';

interface TrafficTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

export function TrafficTab({ startTs, endTs, cacheKey = 0 }: TrafficTabProps) {
  const [flightsPerDay, setFlightsPerDay] = useState<FlightPerDay[]>([]);
  const [airports, setAirports] = useState<BusiestAirport[]>([]);
  const [signalLoss, setSignalLoss] = useState<SignalLossLocation[]>([]);
  const [signalLossMonthly, setSignalLossMonthly] = useState<SignalLossMonthly[]>([]);
  const [signalLossHourly, setSignalLossHourly] = useState<SignalLossHourly[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHoursAnalysis | null>(null);
  const [runwayUsage, setRunwayUsage] = useState<RunwayUsage[]>([]);
  const [allRunwayUsage, setAllRunwayUsage] = useState<Record<string, RunwayUsage[]>>({});
  const [missingInfo, setMissingInfo] = useState<FlightsMissingInfo | null>(null);
  const [deviationsByType, setDeviationsByType] = useState<DeviationByType[]>([]);
  const [bottleneckZones, setBottleneckZones] = useState<BottleneckZone[]>([]);
  const [airportHourly, setAirportHourly] = useState<AirportHourlyTraffic[]>([]);
  const [selectedAirport, setSelectedAirport] = useState('LLBG');
  const [loading, setLoading] = useState(true);
  
  // New dashboard demands state
  const [signalLossAnomalies, setSignalLossAnomalies] = useState<SignalLossAnomalyResponse | null>(null);
  const [diversionsMonthly, setDiversionsMonthly] = useState<DiversionMonthly[]>([]);
  const [diversionsSeasonal, setDiversionsSeasonal] = useState<DiversionsSeasonal | null>(null);

  useEffect(() => {
    loadData();
  }, [startTs, endTs, cacheKey]);

  useEffect(() => {
    // Update runway usage from cached data when airport changes
    if (allRunwayUsage[selectedAirport]) {
      setRunwayUsage(allRunwayUsage[selectedAirport]);
    } else {
      // Fallback to API if not in cache
      loadRunwayUsage();
    }
    loadAirportHourly();
  }, [selectedAirport, startTs, endTs, allRunwayUsage]);

  const loadAirportHourly = async () => {
    try {
      const data = await fetchAirportHourlyTraffic(selectedAirport, startTs, endTs);
      setAirportHourly(data);
    } catch (error) {
      console.error('Failed to load airport hourly traffic:', error);
      setAirportHourly([]);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Use batch API - single request for ALL traffic data
      const batchData = await fetchTrafficBatch(startTs, endTs);
      
      // Core traffic data (Level 1 Category B)
      setFlightsPerDay(batchData.flights_per_day || []);
      setAirports(batchData.busiest_airports || []);
      setSignalLoss(batchData.signal_loss || []);
      setSignalLossMonthly(batchData.signal_loss_monthly || []);
      setSignalLossHourly(batchData.signal_loss_hourly || []);
      setPeakHours(batchData.peak_hours || null);
      setMissingInfo(batchData.missing_info || null);
      setDeviationsByType(batchData.deviations_by_type || []);
      setBottleneckZones(batchData.bottleneck_zones || []);
      setSignalLossAnomalies(batchData.signal_loss_anomalies || null);
      setDiversionsMonthly(batchData.diversions_monthly || []);
      setDiversionsSeasonal(batchData.diversions_seasonal || null);
      
      // Store all runway usage data from cache
      if (batchData.runway_usage) {
        setAllRunwayUsage(batchData.runway_usage);
        // Set initial runway usage for selected airport
        setRunwayUsage(batchData.runway_usage[selectedAirport] || []);
      }
    } catch (error) {
      console.error('Failed to load traffic data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRunwayUsage = async () => {
    try {
      const data = await fetchRunwayUsage(selectedAirport, startTs, endTs);
      setRunwayUsage(data);
    } catch (error) {
      console.error('Failed to load runway usage:', error);
      setRunwayUsage([]);
    }
  };

  // loadSeasonalData removed - now included in main batch load

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading traffic statistics...</div>
      </div>
    );
  }

  const totalFlights = flightsPerDay.reduce((sum, day) => sum + day.count, 0);
  const avgFlightsPerDay = flightsPerDay.length > 0 ? Math.round(totalFlights / flightsPerDay.length) : 0;
  const totalMilitary = flightsPerDay.reduce((sum, day) => sum + day.military_count, 0);
  const totalSignalLoss = signalLoss.reduce((sum, loc) => sum + loc.count, 0);

  const airportColumns: Column[] = [
    { key: 'airport', title: 'Airport' },
    { key: 'arrivals', title: 'Arrivals' },
    { key: 'departures', title: 'Departures' },
    { key: 'total', title: 'Total Operations' }
  ];

  const signalLossColumns: Column[] = [
    { key: 'lat', title: 'Latitude', render: (val) => val.toFixed(3) },
    { key: 'lon', title: 'Longitude', render: (val) => val.toFixed(3) },
    { key: 'count', title: 'Events' },
    { key: 'avgDuration', title: 'Avg Gap Duration (s)', render: (val) => Math.round(val) }
  ];

  return (
    <div className="space-y-6">
      {/* Level 1 Category B: Traffic Statistics Header */}
      <div className="border-b-2 border-blue-500/50 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Plane className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-white text-2xl font-bold">Traffic & Infrastructure</h2>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full">LEVEL 1</span>
        </div>
        <p className="text-white/60 text-sm ml-12">
          Flight volumes, airport operations, signal coverage, and airspace utilization
        </p>
      </div>

      {/* Key Traffic Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Flights"
          value={totalFlights.toLocaleString()}
          subtitle="In selected period"
          icon={<Plane className="w-6 h-6" />}
          question={{ he: "כמה מטוסים עוברים מעל ישראל ביום?/בשבוע?/בחודש?", en: "How many planes pass over Israel per day/week/month?", level: "L1" }}
        />
        <StatCard
          title="Avg Flights/Day"
          value={avgFlightsPerDay.toLocaleString()}
          subtitle="Daily average"
          question={{ he: "כמה מטוסים עוברים מעל ישראל ביום?", en: "How many planes pass over Israel per day?", level: "L1" }}
        />
        <StatCard
          title="Military Flights"
          value={totalMilitary.toLocaleString()}
          subtitle="Tracked military"
          icon={<Plane className="w-6 h-6" />}
          question={{ he: "כמה מטוסים צבאיים טסים בשמי המזרח התיכון?", en: "How many military planes fly in Middle East skies?", level: "L1" }}
        />
        <StatCard
          title="Signal Loss Events"
          value={totalSignalLoss.toLocaleString()}
          subtitle="GPS/tracking gaps"
          icon={<Signal className="w-6 h-6" />}
          question={{ he: "איפה רמת קליטת האות של מטוס יורדת?", en: "Where does aircraft signal reception drop?", level: "L2" }}
        />
      </div>

      {/* Missing Information Stats */}
      {missingInfo && (missingInfo.no_callsign > 0 || missingInfo.no_destination > 0) && (
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-medium">Flights with Missing Information</h3>
            <QuestionTooltip 
              question="כמה מטוסים טסים בלי אות קריאה? / כמה מטוסים טסים בלי יעד מוגדר?"
              questionEn="How many planes fly without callsign / without defined destination?"
              level="L1"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{missingInfo.no_callsign}</div>
              <div className="text-white/60 text-sm">Without Callsign</div>
              <div className="text-white/40 text-xs mt-1">
                {missingInfo.total_flights > 0 
                  ? `${((missingInfo.no_callsign / missingInfo.total_flights) * 100).toFixed(1)}% of flights`
                  : 'N/A'}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-400">{missingInfo.no_destination}</div>
              <div className="text-white/60 text-sm">Without Destination</div>
              <div className="text-white/40 text-xs mt-1">
                {missingInfo.total_flights > 0 
                  ? `${((missingInfo.no_destination / missingInfo.total_flights) * 100).toFixed(1)}% of flights`
                  : 'N/A'}
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">{missingInfo.total_flights}</div>
              <div className="text-white/60 text-sm">Total Tracked Flights</div>
              <div className="text-white/40 text-xs mt-1">In this period</div>
            </div>
          </div>
        </div>
      )}

      {/* Bottleneck Zones */}
      {bottleneckZones.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Airspace Bottleneck Zones
              <QuestionTooltip 
                question="באיזה איזורים יש צווארי בקבוק?"
                questionEn="In which areas are there bottlenecks?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Areas with high traffic density and potential congestion
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Summary Stats */}
            <div className="lg:col-span-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {bottleneckZones.filter(z => z.congestion_level === 'critical').length}
                  </div>
                  <div className="text-white/60 text-xs">Critical Zones</div>
                </div>
                <div className="bg-orange-500/20 border border-orange-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">
                    {bottleneckZones.filter(z => z.congestion_level === 'high').length}
                  </div>
                  <div className="text-white/60 text-xs">High Congestion</div>
                </div>
              </div>

              {/* Top Bottlenecks List */}
              <div className="bg-surface rounded-xl border border-white/10 p-4">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-400" />
                  Top Bottleneck Areas
                </h4>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {bottleneckZones.slice(0, 8).map((zone, idx) => (
                    <div key={idx} className={`rounded-lg p-3 ${
                      zone.congestion_level === 'critical' ? 'bg-red-500/20 border border-red-500/30' :
                      zone.congestion_level === 'high' ? 'bg-orange-500/20 border border-orange-500/30' :
                      'bg-surface-highlight'
                    }`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-medium text-sm">
                          {zone.lat.toFixed(2)}°N, {zone.lon.toFixed(2)}°E
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          zone.congestion_level === 'critical' ? 'bg-red-500 text-white' :
                          zone.congestion_level === 'high' ? 'bg-orange-500 text-white' :
                          zone.congestion_level === 'moderate' ? 'bg-yellow-500 text-black' :
                          'bg-green-500 text-white'
                        }`}>
                          {zone.congestion_level}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-white/50">Flights</span>
                          <div className="text-white font-medium">{zone.flight_count?.toLocaleString() || 0}</div>
                        </div>
                        <div>
                          <span className="text-white/50">Holds</span>
                          <div className="text-purple-400 font-medium">{zone.holding_count?.toLocaleString() || 0}</div>
                        </div>
                        <div>
                          <span className="text-white/50">Score</span>
                          <div className="text-orange-400 font-medium">{typeof zone.density_score === 'number' ? zone.density_score.toFixed(1) : zone.density_score}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottleneck Chart */}
            <div className="lg:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Bar Chart */}
              <ChartCard title="Bottleneck Density Scores">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bottleneckZones.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis type="number" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                    <YAxis 
                      type="category" 
                      dataKey={(d) => `${d.lat.toFixed(1)}°, ${d.lon.toFixed(1)}°`}
                      stroke="#ffffff60" 
                      tick={{ fill: '#ffffff60', fontSize: 10 }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        value,
                        name === 'density_score' ? 'Density Score' :
                        name === 'flight_count' ? 'Flights' :
                        name === 'holding_count' ? 'Holdings' : name
                      ]}
                    />
                    <Bar 
                      dataKey="density_score" 
                      fill="#f97316" 
                      name="density_score"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Bottleneck Map */}
              <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                  <Map className="w-4 h-4 text-orange-400" />
                  <h3 className="text-white font-medium text-sm">Bottleneck Locations</h3>
                </div>
                <BottleneckMap zones={bottleneckZones} height={300} />
              </div>
            </div>
          </div>

          {/* Congestion Legend */}
          <div className="bg-gradient-to-r from-red-500/10 via-orange-500/10 to-green-500/10 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-white/60 text-sm">Congestion Levels:</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-white/80 text-sm">Critical (Score &gt;50)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-white/80 text-sm">High (Score &gt;30)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-white/80 text-sm">Moderate (Score &gt;15)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-white/80 text-sm">Low</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Section: Flight Volume */}
      <div className="mt-8 mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          Flight Volume Analysis
          <QuestionTooltip 
            question="באיזה חודש טסו הכי הרבה מטוסים בשמיים? / באיזה שעה ביום הכי עמוס בשמיים?"
            questionEn="Which month had most flights? What hour is the busiest?"
            level="L1"
          />
        </h2>
        <p className="text-white/50 text-sm mt-1 ml-12">Daily flight counts and traffic patterns</p>
      </div>
      
      {/* Flights Per Day Chart */}
      <ChartCard title="Flight Traffic Over Time">
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
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="Total"
              />
              <Line 
                type="monotone" 
                dataKey="military_count" 
                stroke="#ef4444" 
                strokeWidth={2}
                name="Military"
              />
              <Line 
                type="monotone" 
                dataKey="civilian_count" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Civilian"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-white/40">
            No flight data available
          </div>
        )}
      </ChartCard>

      {/* Section: Airport Operations */}
      <div className="mt-10 mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Building2 className="w-5 h-5 text-emerald-400" />
          </div>
          Airport Operations
          <QuestionTooltip 
            question={"על איזה מסלול טיסה בנתב\"ג נוחתים הכי הרבה?"}
            questionEn="Which runway at Ben Gurion has the most landings?"
            level="L1"
          />
        </h2>
        <p className="text-white/50 text-sm mt-1 ml-12">Busiest airports and runway usage statistics</p>
      </div>
      
      {/* Busiest Airports Table */}
      <TableCard
        title="Busiest Airports"
        columns={airportColumns}
        data={airports}
      />

      {/* Section: Signal Coverage */}
      <div className="mt-10 mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <Signal className="w-5 h-5 text-red-400" />
          </div>
          Signal Coverage Analysis
          <QuestionTooltip 
            question="איפה רמת קליטת האות של מטוס יורדת?"
            questionEn="Where does aircraft signal reception drop?"
            level="L2"
          />
        </h2>
        <p className="text-white/50 text-sm mt-1 ml-12">Areas with tracking signal gaps and coverage issues</p>
      </div>

      {/* Signal Loss / GPS Jamming Zones Section */}
      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        {/* Header with explanation */}
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Signal className="w-5 h-5 text-red-500" />
                Signal Coverage Analysis
              </h3>
              <p className="text-white/60 text-sm mt-1">
                Operational view of areas where aircraft tracking signals were lost or interrupted
              </p>
              <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-blue-500/20 rounded text-xs text-blue-300">
                <Info className="w-3 h-3" />
                <span>For operational awareness - includes all coverage gaps</span>
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 max-w-xs">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-300">
                  <strong>Purpose:</strong> Track operational coverage gaps from ADS-B receivers, 
                  terrain blocking, and equipment issues. For security-focused GPS jamming analysis, 
                  see the <strong>Intelligence Tab</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Map and Details */}
        <div className="p-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Map - takes 2 columns on xl screens */}
            <div className="xl:col-span-2">
              <SignalLossMap 
                locations={signalLoss} 
                height={450}
                showPolygonClusters={true}
                clusterThresholdNm={15} // 15nm for operational signal loss clustering
              />
            </div>
            
            {/* Stats and Hotspots Panel */}
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-highlight rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{totalSignalLoss}</div>
                  <div className="text-xs text-white/50">Total Events</div>
                </div>
                <div className="bg-surface-highlight rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{signalLoss.length}</div>
                  <div className="text-xs text-white/50">Unique Zones</div>
                </div>
              </div>
              
              {/* Top Hotspots */}
              <div className="bg-surface-highlight rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-red-500" />
                  <span className="text-white/80 text-sm font-medium">Top Signal Loss Hotspots</span>
                </div>
                <div className="space-y-2">
                  {signalLoss.slice(0, 5).map((loc, idx) => (
                    <div key={idx} className="bg-black/20 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white text-sm font-medium">
                          {loc.lat.toFixed(2)}°N, {loc.lon.toFixed(2)}°E
                        </span>
                        <span className="text-red-400 font-bold text-sm">{loc.count} events</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <Clock className="w-3 h-3" />
                        <span>Avg gap: {Math.round(loc.avgDuration)}s</span>
                      </div>
                    </div>
                  ))}
                  {signalLoss.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-4">
                      ✓ No signal loss zones detected
                    </p>
                  )}
                </div>
              </div>
              
              {/* Explanation Panel */}
              <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
                <h4 className="text-yellow-400 text-sm font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  What causes signal loss?
                </h4>
                <ul className="text-xs text-white/70 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    <span><strong className="text-white/90">GPS Jamming:</strong> Intentional interference with navigation signals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-400">•</span>
                    <span><strong className="text-white/90">Terrain:</strong> Mountains or buildings blocking signals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">•</span>
                    <span><strong className="text-white/90">Coverage Gap:</strong> Areas with limited ADS-B receiver coverage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span><strong className="text-white/90">Equipment:</strong> Temporary transponder issues on aircraft</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Signal Loss Detailed Table */}
      {signalLoss.length > 0 && (
        <TableCard
          title="Signal Loss Zone Details"
          columns={signalLossColumns}
          data={signalLoss.slice(0, 15)}
        />
      )}

      {/* Signal Loss Trends Section */}
      {(signalLossMonthly.length > 0 || signalLossHourly.length > 0) && (
        <div className="space-y-4 mt-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="text-white text-lg font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-400" />
              Signal Loss Trends
              <QuestionTooltip 
                question="יש חודש מסוים שהיו יותר איבודי קליטה? / באיזה שעות ביום יש הכי הרבה הפרעות?"
                questionEn="Was there a specific month with more signal loss? What hours have most disruptions?"
                level="L2"
              />
            </h3>
            <p className="text-white/60 text-sm">
              Monthly and hourly patterns of signal loss events
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly Signal Loss */}
            {signalLossMonthly.length > 0 && (
              <ChartCard title="Monthly Signal Loss Events">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={signalLossMonthly}>
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
                        name === 'total_events' ? 'Total Events' : 
                        name === 'affected_flights' ? 'Affected Flights' : name
                      ]}
                    />
                    <Bar dataKey="total_events" fill="#ef4444" name="total_events" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="affected_flights" fill="#f97316" name="affected_flights" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Hourly Signal Loss Distribution */}
            {signalLossHourly.length > 0 && (
              <ChartCard title="Signal Loss by Hour of Day">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={signalLossHourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="hour" 
                      stroke="#ffffff60"
                      tick={{ fill: '#ffffff60', fontSize: 11 }}
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
                      formatter={(value: number) => [value, 'Events']}
                    />
                    <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* Peak Hours Analysis Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          Peak Hours Analysis
          <QuestionTooltip 
            question={"באיזה שעה ביום הכי עמוס בשמיים? / באיזה שעה ביום הכי עמוס בנתב\"ג? / מתי הכי מסוכן בשמיים בטיחותית?"}
            questionEn="What hour is the busiest in the sky / at Ben Gurion? When is it most dangerous?"
            level="L1"
          />
        </h2>
        <p className="text-white/60 text-sm">
          Correlation between traffic volume and safety events by hour
        </p>
      </div>

      {peakHours && (
        <div className="space-y-4">
          {/* Correlation Score Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`bg-surface rounded-xl p-6 border-2 ${
              peakHours.correlation_score > 0.5 ? 'border-red-500/50' :
              peakHours.correlation_score > 0.2 ? 'border-yellow-500/50' : 'border-green-500/50'
            }`}>
              <div className="text-white/60 text-sm mb-1">Traffic-Safety Correlation</div>
              <div className={`text-4xl font-bold ${
                peakHours.correlation_score > 0.5 ? 'text-red-400' :
                peakHours.correlation_score > 0.2 ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {(peakHours.correlation_score * 100).toFixed(0)}%
              </div>
              <div className="text-white/50 text-xs mt-2">
                {peakHours.correlation_score > 0.5 
                  ? 'High correlation - safety events increase with traffic'
                  : peakHours.correlation_score > 0.2 
                  ? 'Moderate correlation - some relationship'
                  : 'Low correlation - safety events independent of traffic'}
              </div>
            </div>
            <StatCard
              title="Peak Traffic Hours"
              value={(peakHours.peak_traffic_hours || []).slice(0, 3).map(h => `${h}:00`).join(', ') || 'N/A'}
              subtitle="Busiest times"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Peak Safety Hours"
              value={(peakHours.peak_safety_hours || []).slice(0, 3).map(h => `${h}:00`).join(', ') || 'N/A'}
              subtitle="Most events"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
          </div>

          {/* Hourly Chart */}
          {peakHours.hourly_data && peakHours.hourly_data.length > 0 && (
          <ChartCard title="Traffic vs Safety Events by Hour">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={peakHours.hourly_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis 
                  dataKey="hour" 
                  stroke="#ffffff60"
                  tick={{ fill: '#ffffff60' }}
                  tickFormatter={(h) => `${h}:00`}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="#3b82f6"
                  tick={{ fill: '#3b82f6' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#ef4444"
                  tick={{ fill: '#ef4444' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #ffffff20',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === 'traffic' ? 'Traffic' : 'Safety Events'
                  ]}
                />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="traffic" 
                  fill="#3b82f620" 
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="traffic"
                />
                <Bar 
                  yAxisId="right"
                  dataKey="safety_events" 
                  fill="#ef4444" 
                  name="safety_events"
                  radius={[4, 4, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
          )}
        </div>
      )}

      {!peakHours && (
        <div className="bg-surface rounded-xl p-8 border border-white/10 text-center">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-white/20" />
          <p className="text-white/40">Peak hours analysis not available for this period</p>
        </div>
      )}


      {/* Deviations by Aircraft Type */}
      {deviationsByType.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h3 className="text-white text-lg font-bold mb-2 flex items-center gap-2">
              <Plane className="w-5 h-5 text-purple-400" />
              Route Deviations by Aircraft Type
              <QuestionTooltip 
                question="כמה מטוסים לא טסו על פי נתיב מוגדר? / איזה סוגי מטוסים טסים לא על פי נתיב מוגדר?"
                questionEn="How many planes did not fly on defined routes? Which aircraft types?"
                level="L1"
              />
            </h3>
            <p className="text-white/60 text-sm">
              Which aircraft types deviate most from defined routes?
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart */}
            <ChartCard title="Deviations by Aircraft Type">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deviationsByType.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis type="number" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                  <YAxis 
                    type="category" 
                    dataKey="aircraft_type" 
                    stroke="#ffffff60" 
                    tick={{ fill: '#ffffff60', fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #ffffff20',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="deviation_count" fill="#8b5cf6" name="Total Deviations" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Details Table */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h4 className="text-white font-bold mb-4">Deviation Details</h4>
              <div className="space-y-3 max-h-[280px] overflow-y-auto">
                {deviationsByType.slice(0, 8).map((item, idx) => (
                  <div key={item.aircraft_type} className="bg-surface-highlight rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-purple-500 text-white' :
                          idx === 1 ? 'bg-purple-400 text-white' :
                          'bg-white/10 text-white/60'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-white font-medium">{item.aircraft_type}</span>
                      </div>
                      <span className="text-purple-400 font-bold">{item.deviation_count}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-white/50">Avg Dev</span>
                        <div className="text-white font-medium">{item.avg_deviation_nm} nm</div>
                      </div>
                      <div>
                        <span className="text-white/50">Large (&gt;20nm)</span>
                        <div className="text-red-400 font-medium">{item.large_deviations}</div>
                      </div>
                      <div>
                        <span className="text-white/50">Flights</span>
                        <div className="text-white font-medium">{item.unique_flights}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Monthly Diversions Chart */}
      {diversionsMonthly.length > 0 && (
        <div className="mt-4">
          <ChartCard 
            title="Monthly Diversion Trends"
            question={{ he: "באיזה תקופה בשנה יש הכי הרבה המתנות?", en: "What time of year has the most holding patterns?", level: "L2" }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={diversionsMonthly}>
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
                <Bar dataKey="diversions" fill="#f97316" name="Diversions" radius={[4, 4, 0, 0]} />
                <Bar dataKey="holding_patterns" fill="#8b5cf6" name="Holding Patterns" radius={[4, 4, 0, 0]} />
                <Line 
                  type="monotone" 
                  dataKey="affected_flights" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  name="Affected Flights"
                  dot={{ fill: '#22c55e', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Seasonal Diversions Analysis */}
      {diversionsSeasonal && diversionsSeasonal.total_diversions > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              Seasonal Diversion Analysis
              <QuestionTooltip 
                question="באיזה תקופה בשנה יש הכי הרבה המתנות?"
                questionEn="What time of year has the most holding patterns?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              What time of year has the most diversions?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Peak Season Highlight */}
            <div className="bg-gradient-to-r from-purple-500/20 to-orange-500/20 border border-purple-500/30 rounded-xl p-6">
              <div className="text-white/60 text-sm mb-1">Peak Season</div>
              <div className="text-3xl font-bold text-purple-400">{diversionsSeasonal.peak_season}</div>
              <div className="text-white/60 text-sm mt-2">
                {diversionsSeasonal.total_diversions} total diversions in period
              </div>
            </div>

            {/* By Season */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-bold mb-4">By Season</h3>
              <div className="space-y-2">
                {diversionsSeasonal.by_season.map((item) => {
                  const maxCount = Math.max(...diversionsSeasonal.by_season.map(s => s.count));
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  const isPeak = item.season === diversionsSeasonal.peak_season;
                  return (
                    <div key={item.season} className={`p-2 rounded ${isPeak ? 'bg-purple-500/20' : 'bg-surface-highlight'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-medium ${isPeak ? 'text-purple-400' : 'text-white'}`}>
                          {item.season}
                        </span>
                        <span className={`font-bold ${isPeak ? 'text-purple-400' : 'text-white/70'}`}>
                          {item.count}
                        </span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${isPeak ? 'bg-purple-500' : 'bg-orange-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Quarter */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-bold mb-4">By Quarter</h3>
              <div className="space-y-2">
                {diversionsSeasonal.by_quarter.map((item) => {
                  const maxCount = Math.max(...diversionsSeasonal.by_quarter.map(q => q.count));
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={item.quarter} className="p-2 bg-surface-highlight rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-medium">{item.quarter}</span>
                        <span className="text-orange-400 font-bold">{item.count}</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Insights */}
          {diversionsSeasonal.insights && diversionsSeasonal.insights.length > 0 && (
            <div className="bg-gradient-to-r from-purple-500/10 to-orange-500/10 border border-purple-500/30 rounded-xl p-4">
              <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-purple-400" />
                Seasonal Insights
              </h4>
              <ul className="text-white/70 text-sm space-y-1">
                {diversionsSeasonal.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}


      {/* Runway Usage Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-500" />
          Runway Usage
          <QuestionTooltip 
            question={"על איזה מסלול טיסה בנתב\"ג נוחתים הכי הרבה?"}
            questionEn="Which runway at Ben Gurion has the most landings?"
            level="L1"
          />
        </h2>
        <p className="text-white/60 text-sm"> 
          Landing and takeoff distribution by runway
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-white/10 p-6">
        {/* Airport Selector */}
        <div className="flex flex-col gap-3 mb-6">
          <label className="text-white/60 text-sm">Select Airport:</label>
          <div className="flex flex-wrap gap-2">
            {[
              { code: 'LLBG', name: 'Ben Gurion' },
              { code: 'LLER', name: 'Ramon' },
              { code: 'LLHA', name: 'Haifa' },
              { code: 'LLOV', name: 'Ovda' },
              { code: 'LLRD', name: 'Rosh Pina' },
              { code: 'LLET', name: 'Eilat' },
              { code: 'LLMZ', name: 'Mitzpe Ramon' }
            ].map(apt => (
              <button
                key={apt.code}
                onClick={() => setSelectedAirport(apt.code)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedAirport === apt.code 
                    ? 'bg-cyan-500 text-white' 
                    : 'bg-surface-highlight text-white/60 hover:text-white hover:bg-white/10'
                }`}
                title={apt.name}
              >
                <span className="font-bold">{apt.code}</span>
                <span className="text-xs ml-1 opacity-70">({apt.name})</span>
              </button>
            ))}
          </div>
        </div>

        {runwayUsage.length > 0 ? (
          <div className="space-y-4">
            {/* Runway Bars */}
            <div className="space-y-3">
              {runwayUsage.map(rwy => (
                <div key={rwy.runway} className="bg-surface-highlight rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-bold text-lg">Runway {rwy.runway}</span>
                    <span className="text-cyan-400 font-bold">{rwy.total} ops</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-green-400">Landings</span>
                        <span className="text-white">{rwy.landings}</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-3">
                        <div 
                          className="bg-green-500 h-3 rounded-full"
                          style={{ 
                            width: `${rwy.total > 0 ? (rwy.landings / rwy.total) * 100 : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-blue-400">Takeoffs</span>
                        <span className="text-white">{rwy.takeoffs}</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-3">
                        <div 
                          className="bg-blue-500 h-3 rounded-full"
                          style={{ 
                            width: `${rwy.total > 0 ? (rwy.takeoffs / rwy.total) * 100 : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary Chart */}
            <ChartCard title={`${selectedAirport} Runway Distribution`}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={runwayUsage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis type="number" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                  <YAxis 
                    type="category" 
                    dataKey="runway" 
                    stroke="#ffffff60" 
                    tick={{ fill: '#ffffff60' }}
                    width={80}
                    tickFormatter={(v) => `RWY ${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #ffffff20',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="landings" fill="#10b981" name="Landings" stackId="a" />
                  <Bar dataKey="takeoffs" fill="#3b82f6" name="Takeoffs" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        ) : (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-white/20" />
            <p className="text-white/40">No runway data available for {selectedAirport}</p>
          </div>
        )}
      </div>

      {/* Airport Hourly Traffic Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" />
          Airport Hourly Traffic
        </h2>
        <p className="text-white/60 text-sm">
          Which hour is busiest at {selectedAirport}?
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-white/10 p-6">
        {airportHourly.length > 0 && airportHourly.some(h => h.total > 0) ? (
          <div className="space-y-6">
            {/* Peak Hour Summary */}
            {(() => {
              const peakHour = airportHourly.reduce((max, h) => h.total > max.total ? h : max, airportHourly[0]);
              return (
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-amber-400" />
                    <div>
                      <span className="text-white font-medium">Busiest Hour at {selectedAirport}: </span>
                      <span className="text-amber-400 font-bold text-xl">{peakHour.hour}:00 - {peakHour.hour + 1}:00</span>
                      <span className="text-white/60 ml-2">({peakHour.total} operations)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Hourly Chart */}
            <ChartCard title={`${selectedAirport} Hourly Traffic Distribution`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={airportHourly}>
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
                    labelFormatter={(h) => `Hour: ${h}:00 - ${Number(h) + 1}:00`}
                  />
                  <Bar dataKey="departures" fill="#3b82f6" name="Departures" stackId="a" />
                  <Bar dataKey="arrivals" fill="#10b981" name="Arrivals" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Hourly Stats Grid */}
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {airportHourly.map(h => {
                const maxTotal = Math.max(...airportHourly.map(x => x.total));
                const intensity = maxTotal > 0 ? (h.total / maxTotal) : 0;
                return (
                  <div 
                    key={h.hour}
                    className="rounded-lg p-2 text-center"
                    style={{
                      backgroundColor: `rgba(245, 158, 11, ${intensity * 0.5})`,
                      border: `1px solid rgba(245, 158, 11, ${intensity * 0.3 + 0.1})`
                    }}
                  >
                    <div className="text-white/60 text-xs">{h.hour}:00</div>
                    <div className="text-white font-bold">{h.total}</div>
                    <div className="text-xs">
                      <span className="text-blue-400">{h.departures}↑</span>
                      <span className="text-white/30 mx-1">|</span>
                      <span className="text-green-400">{h.arrivals}↓</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 mx-auto mb-3 text-white/20" />
            <p className="text-white/40">No hourly data available for {selectedAirport}</p>
          </div>
        )}
      </div>

      {/* Signal Loss Anomaly Detection */}
      {signalLossAnomalies && signalLossAnomalies.anomalous_zones && signalLossAnomalies.anomalous_zones.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Unusual Signal Loss Detected
              <QuestionTooltip 
                question="האם אתה יכול להגיד לי איפה ומתי היו אזורים שלפתע חוו איבודי קליטה למרות שבדרך כלל יש להם קליטה?"
                questionEn="Can you tell me where and when there were areas that suddenly experienced signal loss despite usually having reception?"
                level="L3"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Areas with abnormal signal loss compared to historical baseline
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Anomalous Zones"
              value={signalLossAnomalies.total_anomalies.toString()}
              subtitle="Areas with unusual loss"
              icon={<Signal className="w-6 h-6" />}
            />
            <StatCard
              title="Highest Anomaly"
              value={`${(signalLossAnomalies.anomalous_zones[0]?.anomaly_score * 100 || 0).toFixed(0)}%`}
              subtitle="Above baseline"
            />
            <StatCard
              title="Affected Flights"
              value={signalLossAnomalies.anomalous_zones.reduce((sum, z) => sum + z.affected_flights, 0).toString()}
              subtitle="In anomalous zones"
            />
          </div>

          <div className="bg-surface rounded-xl border border-white/10 p-5">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-yellow-400" />
              Anomalous Signal Loss Zones
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {signalLossAnomalies.anomalous_zones.slice(0, 10).map((zone, idx) => (
                <div key={idx} className={`rounded-lg p-4 ${
                  zone.anomaly_score > 1 
                    ? 'bg-red-500/20 border border-red-500/30' 
                    : 'bg-yellow-500/20 border border-yellow-500/30'
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium">
                      {zone.lat.toFixed(2)}°N, {zone.lon.toFixed(2)}°E
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      zone.anomaly_score > 1 ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
                    }`}>
                      +{(zone.anomaly_score * 100).toFixed(0)}% from baseline
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-white/50">Current</span>
                      <div className="text-white font-medium">{zone.current_losses} losses</div>
                    </div>
                    <div>
                      <span className="text-white/50">Baseline</span>
                      <div className="text-white/70">{zone.baseline_losses} losses</div>
                    </div>
                    <div>
                      <span className="text-white/50">Flights</span>
                      <div className="text-yellow-400 font-medium">{zone.affected_flights}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          {signalLossAnomalies.insights && signalLossAnomalies.insights.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-4">
              <h4 className="text-white font-bold mb-2">Signal Loss Insights</h4>
              <ul className="text-white/70 text-sm space-y-1">
                {signalLossAnomalies.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

    </div>
  );
}

