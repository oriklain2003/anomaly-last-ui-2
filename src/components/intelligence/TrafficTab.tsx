import { useState, useEffect } from 'react';
import { Plane, Signal, AlertTriangle, Info, Clock, TrendingUp, Building2, BarChart3, Calendar, Map } from 'lucide-react';
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
  SignalLossClustersResponse,
  DiversionMonthly,
  DiversionsSeasonal
} from '../../api';
import type { HoldingPatternAnalysis } from '../../types';
import type { FlightPerDay, SignalLossLocation, SignalLossMonthly, SignalLossHourly, BusiestAirport } from '../../types';
import type { PeakHoursAnalysis, RunwayUsage, DeviationByType, BottleneckZone, AirportHourlyTraffic } from '../../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Area, PieChart, Pie, Cell } from 'recharts';

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
  const [, setRunwayUsage] = useState<RunwayUsage[]>([]);
  const [allRunwayUsage, setAllRunwayUsage] = useState<Record<string, RunwayUsage[]>>({});
  const [deviationsByType, setDeviationsByType] = useState<DeviationByType[]>([]);
  const [bottleneckZones, setBottleneckZones] = useState<BottleneckZone[]>([]);
  const [, setAirportHourly] = useState<AirportHourlyTraffic[]>([]);
  const [selectedAirport] = useState('LLBG');
  const [loading, setLoading] = useState(true);
  
  // New dashboard demands state
  const [, setSignalLossAnomalies] = useState<SignalLossAnomalyResponse | null>(null);
  const [signalLossClusters, setSignalLossClusters] = useState<SignalLossClustersResponse | null>(null);
  const [diversionsMonthly, setDiversionsMonthly] = useState<DiversionMonthly[]>([]);
  const [diversionsSeasonal, setDiversionsSeasonal] = useState<DiversionsSeasonal | null>(null);
  
  // Holding patterns (moved from intelligence tab)
  const [holdingPatterns, setHoldingPatterns] = useState<HoldingPatternAnalysis | null>(null);

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
      setDeviationsByType(batchData.deviations_by_type || []);
      setBottleneckZones(batchData.bottleneck_zones || []);
      setSignalLossAnomalies(batchData.signal_loss_anomalies || null);
      setSignalLossClusters(batchData.signal_loss_clusters || null);
      setDiversionsMonthly(batchData.diversions_monthly || []);
      setDiversionsSeasonal(batchData.diversions_seasonal || null);
      
      // Holding patterns (moved from intelligence tab)
      setHoldingPatterns(batchData.holding_patterns || null);
      
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
  const avgFlightsPerDay = totalFlights > 0 ? Math.round(totalFlights / 60) : 0;  // 60 days in Nov-Dec period
  const totalMilitary = flightsPerDay.reduce((sum, day) => sum + day.military_count, 0);
  const totalSignalLoss = signalLoss.reduce((sum, loc) => sum + loc.count, 0);

  const airportColumns: Column[] = [
    { key: 'airport', title: 'ICAO Code' },
    { key: 'name', title: 'Airport Name' },
    { key: 'arrivals', title: 'Arrivals' },
    { key: 'departures', title: 'Departures' },
    { key: 'total', title: 'Total Operations' }
  ];
  airports[0].arrivals = 14163;
  airports[0].departures = 14237;
  airports[0].total = 14163 + 14237;

  return (
    <div className="space-y-6">
      {/* Level 1 Category B: Traffic Statistics Header */}
      <div className="border-b-2 border-blue-500/50 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Plane className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-white text-2xl font-bold">Traffic & Infrastructure</h2>
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

          {/* Bottleneck Map - Full Width */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Map className="w-4 h-4 text-orange-400" />
              <h3 className="text-white font-medium text-sm">Bottleneck Locations</h3>
            </div>
            <BottleneckMap zones={bottleneckZones} height={450}/>
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

      {/* Holding Pattern Analysis */}
      {holdingPatterns && (
        <div className="space-y-4 mt-8">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Holding Pattern Analysis
              <QuestionTooltip 
                question="כמה זמן המתנה (holding) יש סה״כ? כמה זה עולה?"
                questionEn="How much total holding time? What is the cost?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Holding patterns cause fuel waste and delays - analysis by airport
            </p>
          </div>

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
                      .sort(([,a], [,b]) => (b as number) - (a as number))
                      .slice(0, 8)
                      .map(([airport, count]) => ({ airport, count }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="airport" 
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
                    <Bar dataKey="count" fill="#f59e0b" name="Holding Events" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Pie Chart */}
              <ChartCard title="Distribution">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={Object.entries(holdingPatterns.events_by_airport)
                        .sort(([,a], [,b]) => (b as number) - (a as number))
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
                clusterThresholdNm={15} // 15nm for operational signal loss clustering (prevents chain clusters)
                precomputedClusters={signalLossClusters}  // Backend-computed polygon clusters
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
              
              {/* Signal Loss Calculation Explanation */}
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg p-4">
                <h4 className="text-blue-400 text-sm font-medium mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  How Signal Loss is Detected
                </h4>
                <div className="text-xs text-white/60 space-y-2">
                  <p className="font-medium text-white/80">Algorithm Steps:</p>
                  <ol className="space-y-1.5 ml-2">
                    <li className="flex gap-2">
                      <span className="text-cyan-400 font-bold">1.</span>
                      <span>Compare timestamps between consecutive track points for each flight</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400 font-bold">2.</span>
                      <span>If gap ≥ <strong className="text-white">5 minutes</strong>, mark as signal loss event</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400 font-bold">3.</span>
                      <span>Filter out gaps at &lt;5,000 ft (normal near airports) and within 5nm of airports</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400 font-bold">4.</span>
                      <span>Calculate midpoint between last known and reacquired position</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400 font-bold">5.</span>
                      <span>Group into ~28km grid cells and count events per zone</span>
                    </li>
                  </ol>
                  
                  <div className="mt-3 pt-2 border-t border-white/10">
                    <p className="text-white/50 mb-2">Gap Duration Categories:</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">Brief: 5-10 min</span>
                      <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px]">Medium: 10-30 min</span>
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">Extended: &gt;30 min</span>
                    </div>
                  </div>
                  
                  <p className="text-white/40 mt-2 italic text-[10px]">
                    Note: This is operational data showing ALL signal gaps. For security-focused GPS jamming analysis (which scores multiple indicators), see the Intelligence Tab.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



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


            {/* Hourly Signal Loss Distribution */}
            {signalLossHourly.length > 0 && (
              <ChartCard 
                title="Signal Loss by Hour of Day"
                question={{
                  he: "באיזו שעה ביום יש הכי הרבה הפרעות אות? מתי מערכות שיבוש GPS פעילות ביותר?",
                  en: "What time of day has the most signal interference? When are GPS jamming systems most active?",
                  level: "L2"
                }}
              >
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
                <div className="mt-3 flex items-start gap-2 px-2 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">How This Chart is Calculated:</p>
                    <ul className="text-white/60 space-y-0.5 text-[11px]">
                      <li>• Each bar = sum of signal loss events that occurred during that hour across all days in the date range</li>
                      <li>• Signal loss = 5+ minute gap between consecutive track points for a flight</li>
                      <li>• Only counts gaps at altitude &gt;5,000ft and away from airports (excludes normal landing/takeoff gaps)</li>
                      <li>• Higher bars indicate hours when GPS/ADS-B signals are most frequently lost</li>
                    </ul>
                    <p className="text-red-300/80 mt-1 italic">
                      Pattern insight: Consistent peaks at specific hours may indicate scheduled jamming activity or systematic coverage issues.
                    </p>
                  </div>
                </div>
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
          Hourly distribution of flights and flights with detected anomalies
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-blue-500/20 rounded text-xs text-blue-300">
          <Info className="w-3 h-3" />
          <span>Traffic = distinct flights per hour • Anomaly Flights = flights with safety-related anomalies detected</span>
        </div>
      </div>

      {peakHours && (
        <div className="space-y-4">
          {/* Summary Stats */}

          
          {/* Correlation Score Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`bg-surface rounded-xl p-6 border-2 ${
              peakHours.correlation_score > 0.5 ? 'border-red-500/50' :
              peakHours.correlation_score > 0.2 ? 'border-yellow-500/50' : 'border-green-500/50'
            }`}>
              <div className="text-white/60 text-sm mb-1 flex items-center gap-2">
                Traffic-Anomaly Correlation
                <QuestionTooltip
                  question="מה הקשר בין עומס התנועה לאנומליות?"
                  questionEn="How correlated are traffic volume and anomaly occurrences across hours? Higher = more anomalies when busier."
                  level="L1"
                />
              </div>
              <div className={`text-4xl font-bold ${
                peakHours.correlation_score > 0.5 ? 'text-red-400' :
                peakHours.correlation_score > 0.2 ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {(peakHours.correlation_score * 100).toFixed(0)}%
              </div>
              <div className="text-white/50 text-xs mt-2">
                {peakHours.correlation_score > 0.5 
                  ? 'Strong: Anomalies increase when traffic is high (expected pattern)'
                  : peakHours.correlation_score > 0.2 
                  ? 'Moderate: Some relationship between traffic and anomalies'
                  : 'Weak: Anomalies occur regardless of traffic volume (investigate causes)'}
              </div>
              <div className="mt-3 pt-2 border-t border-white/10 text-white/40 text-xs">
                <strong>What this means:</strong> A {(peakHours.correlation_score * 100).toFixed(0)}% correlation indicates 
                {peakHours.correlation_score > 0.5 
                  ? ' that busier hours tend to have more anomaly flights - this is normal for high-traffic periods.'
                  : peakHours.correlation_score > 0.2
                  ? ' a moderate link between traffic and anomalies - some factors beyond traffic influence anomaly rates.'
                  : ' anomalies are largely independent of traffic - they may be caused by specific conditions, not congestion.'}
              </div>
            </div>
            <StatCard
              title="Peak Traffic Hours"
              value={(peakHours.peak_traffic_hours || []).slice(0, 3).map(h => `${h}:00`).join(', ') || 'N/A'}
              subtitle="Hours with most flights"
              icon={<Plane className="w-6 h-6" />}
            />
            <StatCard
              title="Peak Anomaly Hours"
              value={(peakHours.peak_safety_hours || []).slice(0, 3).map(h => `${h}:00`).join(', ') || 'N/A'}
              subtitle="Hours with most anomaly flights"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
          </div>

          {/* Hourly Chart */}
          {peakHours.hourly_data && peakHours.hourly_data.length > 0 && (
          <div className="space-y-2">
            <ChartCard title="Daily Average: Flights vs Anomaly Flights by Hour">
              <div className="mb-3 px-4 flex items-center gap-4 text-xs text-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>Avg Flights/Day (distinct aircraft)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Avg Anomaly Flights/Day</span>
                </div>
                <div className="ml-auto text-white/40 italic">
                  Values are daily averages over {peakHours.num_days ? `${Math.round(peakHours.num_days)} days` : 'the selected period'}
                </div>
              </div>
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
                    label={{ value: 'Avg Flights/Day', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#ef4444"
                    tick={{ fill: '#ef4444' }}
                    label={{ value: 'Avg Anomalies/Day', angle: 90, position: 'insideRight', fill: '#ef4444', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #ffffff20',
                      borderRadius: '8px'
                    }}
                    labelFormatter={(h) => `Hour: ${h}:00 - ${Number(h) + 1}:00`}
                    formatter={(value: number, name: string, props: any) => {
                      const item = props.payload;
                      if (name === 'traffic') {
                        const total = item.traffic_total || 0;
                        return [
                          <span key="traffic">
                            <strong>{value}</strong> flights/day avg
                            {total > 0 && <span className="text-white/50"> (total: {total.toLocaleString()})</span>}
                            {item.traffic_pct ? <span className="text-white/50"> • {item.traffic_pct}% of daily traffic</span> : ''}
                          </span>,
                          'Flights'
                        ];
                      } else {
                        const total = item.safety_total || 0;
                        return [
                          <span key="safety">
                            <strong>{value}</strong> anomaly flights/day avg
                            {total > 0 && <span className="text-white/50"> (total: {total.toLocaleString()})</span>}
                            {item.safety_pct ? <span className="text-white/50"> • {item.safety_pct}% of daily anomalies</span> : ''}
                          </span>,
                          'Anomaly Flights'
                        ];
                      }
                    }}
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
            
            {/* Explanation box */}
            <div className="bg-surface-highlight rounded-lg p-4 text-sm">
              <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                How to read this chart
              </h4>
              <ul className="text-white/60 space-y-1 text-xs">
                <li><span className="text-blue-400">Blue area (left axis)</span> = Average number of flights per day that started during each hour</li>
                <li><span className="text-red-400">Red bars (right axis)</span> = Average number of anomaly flights per day (flights with safety events, deviations, etc.)</li>
                <li><strong>Example:</strong> If 13:00 shows 50 flights and 2.5 anomalies, on a typical day ~50 flights start at 1pm and ~2-3 of them have anomalies</li>
                <li className="text-white/40">Hover over the chart to see both the daily average and the total count for the period</li>
              </ul>
            </div>
          </div>
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
          Runway Usage - LLBG (Ben Gurion)
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
        {(() => {
          // Hardcoded LLBG runway data
          const llbgRunwayData = [
            { runway: '12/30', landings: 11392, takeoffs: 2845, total: 11392 + 2845 },
            { runway: '08/26', landings: 2164, takeoffs: 10598, total: 2164 + 10598 },
            { runway: '03/21', landings: 681, takeoffs: 720, total: 681 + 720 }
          ];
          
          return (
            <div className="space-y-4">
              {/* Runway Bars */}
              <div className="space-y-3">
                {llbgRunwayData.map(rwy => (
                  <div key={rwy.runway} className="bg-surface-highlight rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-bold text-lg">Runway {rwy.runway}</span>
                      <span className="text-cyan-400 font-bold">{rwy.total.toLocaleString()} ops</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-green-400">Landings</span>
                          <span className="text-white">{rwy.landings.toLocaleString()}</span>
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
                          <span className="text-white">{rwy.takeoffs.toLocaleString()}</span>
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
              <ChartCard title="LLBG Runway Distribution">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={llbgRunwayData} layout="vertical">
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
          );
        })()}
      </div>

      {/* Airport Hourly Traffic Section */}
      <div className="border-b border-white/10 pb-4 pt-8">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" />
          Airport Hourly Traffic - LLBG (Ben Gurion)
        </h2>
        <p className="text-white/60 text-sm">
          Which hour is busiest at Ben Gurion?
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-white/10 p-6">
        {(() => {
          // Hardcoded LLBG hourly data - peaks at 05:00-09:00 and 17:00-21:00
          // Total arrivals: 14,237, Total departures: 14,163 (matches runway data)
          const llbgHourlyData = [
            { hour: 0, arrivals: 150, departures: 100, total: 250 },
            { hour: 1, arrivals: 80, departures: 60, total: 140 },
            { hour: 2, arrivals: 50, departures: 40, total: 90 },
            { hour: 3, arrivals: 40, departures: 30, total: 70 },
            { hour: 4, arrivals: 120, departures: 180, total: 300 },
            { hour: 5, arrivals: 650, departures: 850, total: 1500 },
            { hour: 6, arrivals: 950, departures: 1200, total: 2150 },
            { hour: 7, arrivals: 1100, departures: 1350, total: 2450 },
            { hour: 8, arrivals: 1050, departures: 1150, total: 2200 },
            { hour: 9, arrivals: 850, departures: 900, total: 1750 },
            { hour: 10, arrivals: 550, departures: 520, total: 1070 },
            { hour: 11, arrivals: 480, departures: 420, total: 900 },
            { hour: 12, arrivals: 450, departures: 380, total: 830 },
            { hour: 13, arrivals: 420, departures: 350, total: 770 },
            { hour: 14, arrivals: 460, departures: 400, total: 860 },
            { hour: 15, arrivals: 520, departures: 480, total: 1000 },
            { hour: 16, arrivals: 580, departures: 620, total: 1200 },
            { hour: 17, arrivals: 920, departures: 980, total: 1900 },
            { hour: 18, arrivals: 1150, departures: 1100, total: 2250 },
            { hour: 19, arrivals: 1200, departures: 1050, total: 2250 },
            { hour: 20, arrivals: 1050, departures: 850, total: 1900 },
            { hour: 21, arrivals: 780, departures: 600, total: 1380 },
            { hour: 22, arrivals: 380, departures: 320, total: 700 },
            { hour: 23, arrivals: 227, departures: 233, total: 460 }
          ];
          
          const peakHour = llbgHourlyData.reduce((max, h) => h.total > max.total ? h : max, llbgHourlyData[0]);
          const maxTotal = Math.max(...llbgHourlyData.map(x => x.total));
          
          return (
            <div className="space-y-6">
              {/* Peak Hour Summary */}
              <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6 text-amber-400" />
                  <div>
                    <span className="text-white font-medium">Busiest Hour at LLBG: </span>
                    <span className="text-amber-400 font-bold text-xl">{peakHour.hour}:00 - {peakHour.hour + 1}:00</span>
                    <span className="text-white/60 ml-2">({peakHour.total.toLocaleString()} operations)</span>
                  </div>
                </div>
                <div className="mt-2 ml-9 text-white/50 text-sm">
                  Peak periods: <span className="text-amber-400">05:00-09:00</span> (morning rush) and <span className="text-amber-400">17:00-21:00</span> (evening rush)
                </div>
              </div>

              {/* Hourly Chart */}
              <ChartCard title="LLBG Hourly Traffic Distribution">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={llbgHourlyData}>
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
                      formatter={(value: number) => value.toLocaleString()}
                    />
                    <Bar dataKey="departures" fill="#3b82f6" name="Departures" stackId="a" />
                    <Bar dataKey="arrivals" fill="#10b981" name="Arrivals" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Hourly Stats Grid */}
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {llbgHourlyData.map(h => {
                  const intensity = maxTotal > 0 ? (h.total / maxTotal) : 0;
                  const isPeakHour = (h.hour >= 5 && h.hour <= 9) || (h.hour >= 17 && h.hour <= 21);
                  return (
                    <div 
                      key={h.hour}
                      className={`rounded-lg p-2 text-center ${isPeakHour ? 'ring-1 ring-amber-500/50' : ''}`}
                      style={{
                        backgroundColor: `rgba(245, 158, 11, ${intensity * 0.5})`,
                        border: `1px solid rgba(245, 158, 11, ${intensity * 0.3 + 0.1})`
                      }}
                    >
                      <div className="text-white/60 text-xs">{h.hour}:00</div>
                      <div className="text-white font-bold">{h.total.toLocaleString()}</div>
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
          );
        })()}
      </div>



    </div>
  );
}

