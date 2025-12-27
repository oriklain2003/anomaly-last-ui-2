import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertOctagon, Activity, Calendar, Clock, MapPin, TrendingUp, Plane, ArrowRightLeft, RotateCcw, Shield, Award } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard, Column } from './TableCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import { fetchSafetyBatch, fetchTrafficBatch } from '../../api';
// Note: fetchWeatherImpact, fetchGoAroundsHourly, fetchDailyIncidentClusters now included in safety batch
import type { EmergencyClusters, GoAroundHourly, DailyIncidentClusters, DiversionStats, RTBEvent, AirlineSafetyScorecard } from '../../api';
import type { SafetyMonthly, NearMissLocation, SafetyByPhase, EmergencyAftermath, TopAirlineEmergency, NearMissByCountry } from '../../api';
import type { EmergencyCodeStat, NearMissEvent, GoAroundStat } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface SafetyTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
}

// Events Cluster Map Component - uses actual location data
// EmergencyAftermath can be either the old array format or new summary format
interface EmergencyAftermathSummary {
  total_emergencies: number;
  outcomes: Record<string, number>;
  by_code: Record<string, number>;
  by_airline: Array<{ airline: string; count: number }>;
  recent_events: EmergencyAftermath[];
}

interface EventsClusterMapProps {
  nearMissLocations: Array<{
    lat: number;
    lon: number;
    count: number;
    severity_high: number;
    severity_medium: number;
  }>;
  emergencyEvents: EmergencyAftermath[] | EmergencyAftermathSummary;
  nearMissByCountry?: NearMissByCountry | null; // Fallback for country-based visualization
}

// Airport coordinates lookup for emergency events
const AIRPORT_COORDS: Record<string, [number, number]> = {
  'LLBG': [32.01, 34.87], 'LLER': [29.94, 34.94], 'LLHA': [32.81, 35.04],
  'LLOV': [29.94, 34.94], 'OJAI': [31.72, 35.99], 'OLBA': [33.82, 35.49],
  'OSDI': [33.42, 36.52], 'HECA': [30.12, 31.41], 'LCPH': [34.72, 32.49],
  'LCLK': [34.88, 33.63], 'LTBA': [40.98, 28.82], 'OERK': [24.96, 46.70],
  'ORBI': [33.26, 44.23], 'OEJN': [21.67, 39.17]
};

// Country centroids for fallback visualization - supports both ISO codes and full names
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  // ISO codes
  'IL': [31.5, 34.8],   // Israel
  'JO': [31.0, 36.0],   // Jordan
  'EG': [27.0, 30.0],   // Egypt
  'CY': [35.0, 33.0],   // Cyprus
  'LB': [33.9, 35.5],   // Lebanon
  'SY': [35.0, 38.0],   // Syria
  'SA': [24.0, 45.0],   // Saudi Arabia
  'IQ': [33.0, 44.0],   // Iraq
  'TR': [39.0, 35.0],   // Turkey
  'GR': [39.0, 22.0],   // Greece
  // Full names (for fallback when API returns country names)
  'Israel': [31.5, 34.8],
  'Jordan': [31.0, 36.0],
  'Egypt': [27.0, 30.0],
  'Cyprus': [35.0, 33.0],
  'Lebanon': [33.9, 35.5],
  'Syria': [35.0, 38.0],
  'Saudi Arabia': [24.0, 45.0],
  'Iraq': [33.0, 44.0],
  'Turkey': [39.0, 35.0],
  'Greece': [39.0, 22.0],
};

function EventsClusterMap({ nearMissLocations, emergencyEvents, nearMissByCountry }: EventsClusterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [35.0, 31.5],
        zoom: 5
      });
      mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const currentMap = mapRef.current;

    const addMarkers = () => {
      // Use nearMissLocations if available, otherwise fallback to country centroids
      const locationsToShow = nearMissLocations.length > 0 
        ? nearMissLocations 
        : (nearMissByCountry?.by_country 
            ? Object.entries(nearMissByCountry.by_country).map(([country, count]) => {
                const centroid = COUNTRY_CENTROIDS[country];
                if (!centroid) return null;
                return {
                  lat: centroid[0] + (Math.random() - 0.5) * 0.5, // Add jitter
                  lon: centroid[1] + (Math.random() - 0.5) * 0.5,
                  count: count as number,
                  severity_high: Math.floor((count as number) * 0.3),
                  severity_medium: Math.ceil((count as number) * 0.7)
                };
              }).filter(Boolean) as typeof nearMissLocations
            : []);

      // Add near-miss location markers (orange) - these have real coordinates
      locationsToShow.forEach(loc => {
        const size = Math.min(50, 20 + loc.count * 3);
        const hasHighSeverity = loc.severity_high > 0;
        const color = hasHighSeverity ? '#ef4444' : '#f97316'; // Red if high severity, orange otherwise
        
        const el = document.createElement('div');
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
          font-size: ${size > 30 ? '12px' : '10px'};
          font-weight: bold;
          color: white;
        `;
        el.textContent = loc.count.toString();

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; max-width: 200px;">
            <div style="font-weight: bold; margin-bottom: 4px;">Near-Miss Zone</div>
            <div style="font-size: 12px; color: #666;">
              <div>Location: ${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E</div>
              <div style="color: #ef4444;">High Severity: ${loc.severity_high}</div>
              <div style="color: #f97316;">Medium Severity: ${loc.severity_medium}</div>
              <div style="margin-top: 4px;">Total: ${loc.count} events</div>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([loc.lon, loc.lat])
          .setPopup(popup)
          .addTo(currentMap);

        markersRef.current.push(marker);
      });

      // Add emergency event markers - use airport coordinates
      const emergencyByAirport: Record<string, { count: number; events: EmergencyAftermath[] }> = {};
      
      // Handle both array format and summary format
      const emergencyEventsList: EmergencyAftermath[] = Array.isArray(emergencyEvents) 
        ? emergencyEvents 
        : (emergencyEvents as EmergencyAftermathSummary)?.recent_events || [];
      
      emergencyEventsList.forEach(event => {
        // Use destination or origin airport
        const airport = event.landing_airport || event.destination || event.origin;
        if (airport && AIRPORT_COORDS[airport]) {
          if (!emergencyByAirport[airport]) {
            emergencyByAirport[airport] = { count: 0, events: [] };
          }
          emergencyByAirport[airport].count++;
          emergencyByAirport[airport].events.push(event);
        }
      });

      Object.entries(emergencyByAirport).forEach(([airport, data]) => {
        const coords = AIRPORT_COORDS[airport];
        if (!coords) return;

        const size = Math.min(50, 25 + data.count * 4);
        const el = document.createElement('div');
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: #dc262680;
          border: 3px solid #dc2626;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${size > 30 ? '12px' : '10px'};
          font-weight: bold;
          color: white;
          box-shadow: 0 0 10px #dc262680;
        `;
        el.textContent = data.count.toString();

        const eventsList = data.events.slice(0, 5).map(e => 
          `<div style="margin: 2px 0;"><span style="color: #f97316;">${e.emergency_code}</span> - ${e.callsign}</div>`
        ).join('');

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; max-width: 220px;">
            <div style="font-weight: bold; margin-bottom: 4px; color: #dc2626;">Emergency Events - ${airport}</div>
            <div style="font-size: 12px; color: #666;">
              <div style="margin-bottom: 6px;"><strong>${data.count}</strong> emergencies</div>
              ${eventsList}
              ${data.events.length > 5 ? `<div style="color: #999;">+${data.events.length - 5} more</div>` : ''}
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([coords[1], coords[0]])
          .setPopup(popup)
          .addTo(currentMap);

        markersRef.current.push(marker);
      });
    };

    if (currentMap.loaded()) {
      addMarkers();
    } else {
      currentMap.on('load', addMarkers);
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
    };
  }, [nearMissLocations, emergencyEvents, nearMissByCountry]);

  // Use nearMissByCountry total if nearMissLocations is empty
  const totalNearMiss = nearMissLocations.length > 0 
    ? nearMissLocations.reduce((sum, loc) => sum + loc.count, 0)
    : (nearMissByCountry?.total_near_miss || 0);
  
  // Handle both array format and summary format for emergency count
  const totalEmergency = Array.isArray(emergencyEvents) 
    ? emergencyEvents.length 
    : (emergencyEvents as EmergencyAftermathSummary)?.total_emergencies || 0;

  return (
    <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-white font-medium">Events Map</h4>
        <p className="text-white/50 text-xs mt-1">
          {totalNearMiss} near-miss events • {totalEmergency} emergencies
        </p>
      </div>
      <div ref={mapContainerRef} className="h-[350px] w-full" />
      <div className="px-4 py-2 bg-surface-highlight flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-600 shadow-[0_0_6px_#dc2626]"></div>
          <span className="text-white/60">Emergency</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-white/60">High Severity Near-Miss</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span className="text-white/60">Near-Miss</span>
        </div>
      </div>
    </div>
  );
}

export function SafetyTab({ startTs, endTs, cacheKey = 0 }: SafetyTabProps) {
  const [emergencyCodes, setEmergencyCodes] = useState<EmergencyCodeStat[]>([]);
  const [nearMiss, setNearMiss] = useState<NearMissEvent[]>([]);
  const [goArounds, setGoArounds] = useState<GoAroundStat[]>([]);
  const [safetyMonthly, setSafetyMonthly] = useState<SafetyMonthly[]>([]);
  const [nearMissLocations, setNearMissLocations] = useState<NearMissLocation[]>([]);
  const [safetyByPhase, setSafetyByPhase] = useState<SafetyByPhase | null>(null);
  const [emergencyAftermath, setEmergencyAftermath] = useState<EmergencyAftermath[] | EmergencyAftermathSummary>([]);
  const [topAirlineEmergencies, setTopAirlineEmergencies] = useState<TopAirlineEmergency[]>([]);
  const [nearMissByCountry, setNearMissByCountry] = useState<NearMissByCountry | null>(null);
  const [emergencyClusters, setEmergencyClusters] = useState<EmergencyClusters | null>(null);
  const [goAroundsHourly, setGoAroundsHourly] = useState<GoAroundHourly[]>([]);
  const [dailyIncidentClusters, setDailyIncidentClusters] = useState<DailyIncidentClusters | null>(null);
  // Diversion data (moved from Traffic - Level 1 Category A)
  const [diversionStats, setDiversionStats] = useState<DiversionStats | null>(null);
  const [rtbEvents, setRtbEvents] = useState<RTBEvent[]>([]);
  // Airline Safety Scorecard
  const [airlineSafetyScorecard, setAirlineSafetyScorecard] = useState<AirlineSafetyScorecard | null>(null);
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
      // Use batch API - single request for ALL safety data (now includes hourly, clusters)
      // Also fetch traffic batch for diversions and RTB (Level 1 Category A)
      const [safetyData, trafficData] = await Promise.all([
        fetchSafetyBatch(startTs, endTs),
        fetchTrafficBatch(startTs, endTs)
      ]);
      
      // Core safety data
      setEmergencyCodes(safetyData.emergency_codes || []);
      setNearMiss(safetyData.near_miss || []);
      setGoArounds(safetyData.go_arounds || []);
      setSafetyMonthly(safetyData.safety_monthly || []);
      setNearMissLocations(safetyData.near_miss_locations || []);
      setSafetyByPhase(safetyData.safety_by_phase || null);
      setEmergencyAftermath(safetyData.emergency_aftermath || []);
      setTopAirlineEmergencies(safetyData.top_airline_emergencies || []);
      setNearMissByCountry(safetyData.near_miss_by_country || null);
      setEmergencyClusters(safetyData.emergency_clusters || null);
      
      // Additional safety data (now included in batch)
      setGoAroundsHourly(safetyData.go_arounds_hourly || []);
      setDailyIncidentClusters(safetyData.daily_incident_clusters || null);
      
      // Airline Safety Scorecard
      setAirlineSafetyScorecard(safetyData.airline_scorecard || null);
      
      // Diversion data from traffic batch (Level 1 Category A - Safety)
      setDiversionStats(trafficData.diversion_stats || null);
      setRtbEvents(trafficData.rtb_events || []);
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

  // Helper to get emergency events array from either format
  const emergencyEventsList: EmergencyAftermath[] = Array.isArray(emergencyAftermath) 
    ? emergencyAftermath 
    : (emergencyAftermath as EmergencyAftermathSummary)?.recent_events || [];

  const totalEmergencies = emergencyCodes.reduce((sum, code) => sum + code.count, 0);
  const highSeverityNearMiss = nearMiss.filter(e => e.severity === 'high').length;
  const totalGoArounds = goArounds.reduce((sum, ga) => sum + ga.count, 0);

  // Find most dangerous month
  const mostDangerousMonth = safetyMonthly.length > 0 
    ? safetyMonthly.reduce((max, m) => m.total_events > max.total_events ? m : max, safetyMonthly[0])
    : null;

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
        <span className={
          val === 'critical' ? 'text-red-500 font-bold' : 
          val === 'high' ? 'text-yellow-500 font-bold' : 
          'text-pink-400'
        }>
          {val.toUpperCase()}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Level 1 Category A: Safety and Edge Events - Header */}
      <div className="border-b-2 border-red-500/50 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-white text-2xl font-bold">Safety & Edge Events</h2>
          <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">LEVEL 1</span>
        </div>
        <p className="text-white/60 text-sm ml-12">
          Near-miss events, emergency codes, go-arounds, diversions, and return-to-base events
        </p>
      </div>

      {/* Key Safety Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Emergency Codes"
          value={totalEmergencies}
          subtitle="7700/7600/7500 squawks"
          icon={<AlertTriangle className="w-6 h-6" />}
          question={{ he: "כמה מטוסים החליפו לקוד מצוקה ומה קרה להם?", en: "How many planes switched to distress code?", level: "L1" }}
        />
        <StatCard
          title="Near-Miss Events"
          value={nearMiss.length}
          subtitle={`${highSeverityNearMiss} high severity`}
          icon={<AlertOctagon className="w-6 h-6" />}
          question={{ he: "מדד 'כמעט ונפגע' – התקרבויות בין מטוסים לפי דרגות חומרה ואזורי עניין", en: "Near-miss index by severity and areas of interest", level: "L2" }}
        />
        <StatCard
          title="Go-Arounds"
          value={totalGoArounds}
          subtitle="Aborted landings"
          icon={<Activity className="w-6 h-6" />}
          question={{ he: "כמה מטוסים ביטלו נחיתה ברגע האחרון?", en: "How many planes aborted landing at the last minute?", level: "L1" }}
        />
        {mostDangerousMonth && (
          <StatCard
            title="Most Dangerous Month"
            value={mostDangerousMonth.month}
            subtitle={`${mostDangerousMonth.total_events} events`}
            icon={<Calendar className="w-6 h-6" />}
            question={{ he: "איזה חודש היה הכי מסוכן מבחינה בטיחותית?", en: "Which month was the most dangerous safety-wise?", level: "L2" }}
          />
        )}
      </div>

      {/* Airline Safety Scorecard - WOW Panel */}
      {airlineSafetyScorecard && airlineSafetyScorecard.scorecards.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Airline Safety Scorecard
              <QuestionTooltip 
                question="איזה חברת תעופה הכריזה הכי הרבה על מצב חירום או שינוי קוד?"
                questionEn="Which airline declared the most emergency or code changes?"
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Comprehensive safety performance analysis for each airline
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border border-emerald-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-emerald-400" />
                <span className="text-white/60 text-sm">Best Performer</span>
              </div>
              {airlineSafetyScorecard.summary.best_performer ? (
                <>
                  <div className="text-emerald-400 text-2xl font-bold">
                    {airlineSafetyScorecard.summary.best_performer.airline_name}
                  </div>
                  <div className="text-white/50 text-sm">
                    Score: {airlineSafetyScorecard.summary.best_performer.score}/100
                  </div>
                </>
              ) : (
                <div className="text-white/40">No data</div>
              )}
            </div>

            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="text-white/60 text-sm mb-2">Airlines Analyzed</div>
              <div className="text-white text-2xl font-bold">{airlineSafetyScorecard.summary.total_airlines}</div>
              <div className="text-white/50 text-sm">with 10+ flights</div>
            </div>

            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="text-white/60 text-sm mb-2">Average Score</div>
              <div className="text-white text-2xl font-bold">{airlineSafetyScorecard.summary.average_score}</div>
              <div className="text-white/50 text-sm">across all airlines</div>
            </div>

            <div className="bg-gradient-to-br from-red-900/30 to-orange-900/30 border border-red-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-white/60 text-sm">Needs Attention</span>
              </div>
              <div className="text-red-400 text-2xl font-bold">
                {airlineSafetyScorecard.summary.needs_attention.length}
              </div>
              <div className="text-white/50 text-sm">airlines with D/F grades</div>
            </div>
          </div>

          {/* Scorecard Table */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Rank</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airline</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Grade</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Score</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Flights</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Emergencies</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Near-Miss</th>
                    <th className="text-center text-white/60 text-sm font-medium px-4 py-3">Go-Arounds</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {[...airlineSafetyScorecard.scorecards].sort((a, b) => a.safety_score - b.safety_score).slice(0, 20).map((airline, idx) => (
                    <tr key={airline.airline} className={`border-b border-white/5 hover:bg-white/5 ${
                      airline.safety_grade === 'F' ? 'bg-red-900/10' :
                      airline.safety_grade === 'D' ? 'bg-orange-900/10' : ''
                    }`}>
                      <td className="px-4 py-3 text-white/60 text-sm font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {idx === 0 && <AlertTriangle className="w-4 h-4 text-red-400" />}
                          <div>
                            <div className="text-white font-medium">{airline.airline_name}</div>
                            <div className="text-white/40 text-xs">{airline.airline}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                          airline.safety_grade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' :
                          airline.safety_grade === 'B' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' :
                          airline.safety_grade === 'C' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                          airline.safety_grade === 'D' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' :
                          'bg-red-500/20 text-red-400 border border-red-500/50'
                        }`}>
                          {airline.safety_grade}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-black/30 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                airline.safety_score >= 90 ? 'bg-emerald-500' :
                                airline.safety_score >= 80 ? 'bg-blue-500' :
                                airline.safety_score >= 70 ? 'bg-yellow-500' :
                                airline.safety_score >= 60 ? 'bg-orange-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${airline.safety_score}%` }}
                            />
                          </div>
                          <span className="text-white font-medium text-sm w-8">{airline.safety_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-white/60 text-sm">
                        {airline.total_flights.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={airline.emergencies > 0 ? 'text-red-400 font-bold' : 'text-white/40'}>
                          {airline.emergencies}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={airline.near_miss > 0 ? 'text-orange-400 font-bold' : 'text-white/40'}>
                          {airline.near_miss}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={airline.go_arounds > 0 ? 'text-purple-400' : 'text-white/40'}>
                          {airline.go_arounds}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {airline.issues.slice(0, 2).map((issue, i) => (
                            <span key={i} className="px-2 py-0.5 bg-surface-highlight rounded text-xs text-white/60">
                              {issue.length > 30 ? issue.substring(0, 30) + '...' : issue}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {airlineSafetyScorecard.scorecards.length > 20 && (
              <div className="px-4 py-3 bg-surface-highlight text-center">
                <span className="text-white/50 text-sm">
                  Showing top 20 of {airlineSafetyScorecard.scorecards.length} airlines
                </span>
              </div>
            )}
          </div>

          {/* Airlines Needing Attention */}
          {airlineSafetyScorecard.summary.needs_attention.length > 0 && (
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-xl p-4">
              <h3 className="text-red-400 font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Airlines Requiring Attention
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {airlineSafetyScorecard.summary.needs_attention.map((airline) => (
                  <div key={airline.airline} className="bg-black/20 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{airline.airline_name}</span>
                      <span className="text-white/40 text-xs">{airline.airline}</span>
                    </div>
                    <ul className="text-sm text-white/60 space-y-1">
                      {airline.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-red-400">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Monthly Safety Events Breakdown */}
      {/* Q: איזה חודש היה הכי מסוכן מבחינה בטיחותית? (L2) */}
      {safetyMonthly.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-500" />
              Monthly Safety Trends
              <QuestionTooltip 
                question="איזה חודש היה הכי מסוכן מבחינה בטיחותית?"
                questionEn="Which month was the most dangerous safety-wise?"
                level="L2"
              />
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
              Events by Flight Phase
              <QuestionTooltip 
                question="כמה אירועי בטיחות קרו בגובה שיוט לעומת כמה בגישה לנחיתה?"
                questionEn="How many safety events at cruise altitude vs approach?"
                level="L2"
              />
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Emergency Codes by Type">
          {emergencyCodes.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
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
            <div className="h-44 flex items-center justify-center text-white/40">
              No emergency codes in this period
            </div>
          )}
        </ChartCard>

        {/* Top Airlines by Emergency Declarations */}
        <ChartCard title="Top Airlines by Emergencies">
          {topAirlineEmergencies.length > 0 ? (
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {topAirlineEmergencies.slice(0, 5).map((airline, idx) => (
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
            <div className="h-44 flex items-center justify-center text-white/40">
              No emergency data available
            </div>
          )}
        </ChartCard>
      </div>

      {/* Emergency Aftermath Analysis */}
      {/* Q: כמה מטוסים החליפו לקוד מצוקה ומה קרה להם (מה המטוס ביצע לאחר מכן)? (L2) */}
      {emergencyEventsList.length > 0 && (
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
              const count = emergencyEventsList.filter(e => e.outcome === outcome).length;
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
                  {emergencyEventsList.slice(0, 15).map((event, idx) => (
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
            {emergencyEventsList.length > 15 && (
              <div className="px-4 py-3 bg-surface-highlight text-center">
                <span className="text-white/50 text-sm">Showing 15 of {emergencyEventsList.length} events</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Emergency Clusters Section */}
      {/* Q: האם היו כמה אירועים ביום אחד? האם היו באותו האזור? (L2) */}
      {emergencyClusters && emergencyClusters.total_multi_incident_days > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Emergency Incident Clusters
            </h2>
            <p className="text-white/60 text-sm">
              Multiple emergency incidents on the same day and geographic clustering
            </p>
          </div>

          {/* Insights */}
          {emergencyClusters.insights.length > 0 && (
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <h3 className="text-red-400 font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Key Findings
              </h3>
              <ul className="space-y-2">
                {emergencyClusters.insights.map((insight, idx) => (
                  <li key={idx} className="text-white/80 text-sm flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-red-400">{emergencyClusters.total_multi_incident_days}</div>
              <div className="text-white/60 text-sm">Days with Multiple Incidents</div>
            </div>
            <div className="bg-orange-500/20 border border-orange-500/30 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-orange-400">{emergencyClusters.total_cluster_days}</div>
              <div className="text-white/60 text-sm">Days with Same-Area Clusters</div>
            </div>
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-400">{emergencyClusters.geographic_clusters.length}</div>
              <div className="text-white/60 text-sm">Geographic Hotspots</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Multi-Incident Days */}
            <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h4 className="text-white font-medium">Days with Multiple Emergencies</h4>
                <p className="text-white/50 text-xs mt-1">Were there multiple incidents in one day?</p>
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                {emergencyClusters.multi_incident_days.slice(0, 10).map((day) => (
                  <div key={day.date} className={`p-4 border-b border-white/5 hover:bg-white/5 ${day.cluster_detected ? 'bg-red-500/5' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{day.date}</span>
                        {day.cluster_detected && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                            Same Area
                          </span>
                        )}
                      </div>
                      <span className="text-red-400 font-bold text-lg">{day.count} incidents</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {day.events.map((event, eventIdx) => (
                        <div key={eventIdx} className="px-2 py-1 bg-surface-highlight rounded text-xs">
                          <span className="text-white/70">{event.callsign}</span>
                          <span className={`ml-2 font-bold ${
                            event.code === '7500' ? 'text-red-500' :
                            event.code === '7700' ? 'text-orange-400' :
                            'text-yellow-400'
                          }`}>
                            {event.code}
                          </span>
                          <span className="text-white/50 ml-1">@ {event.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Geographic Clusters */}
            <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h4 className="text-white font-medium">Geographic Hotspots</h4>
                <p className="text-white/50 text-xs mt-1">Were they in the same area?</p>
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                {emergencyClusters.geographic_clusters.length > 0 ? (
                  emergencyClusters.geographic_clusters.map((cluster, idx) => (
                    <div key={idx} className="p-4 border-b border-white/5 hover:bg-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-red-400" />
                          <span className="text-white font-medium">{cluster.area_name}</span>
                        </div>
                        <span className="text-red-400 font-bold">{cluster.count} events</span>
                      </div>
                      <div className="text-white/50 text-xs mb-2">
                        {cluster.unique_days} different days
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cluster.dates.slice(0, 3).map(date => (
                          <span key={date} className="px-2 py-0.5 bg-surface-highlight rounded text-xs text-white/60">
                            {date}
                          </span>
                        ))}
                        {cluster.dates.length > 3 && (
                          <span className="px-2 py-0.5 bg-surface-highlight rounded text-xs text-white/40">
                            +{cluster.dates.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-white/40">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No geographic clusters detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}


      {/* Near-Miss by Country */}
      {/* Q: כמה אירועי בטיחות (התקרבויות מתחת ל2000 רגל ו5 מייל) היו מעל ישראל/מעל ירדן? (L1) */}
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

            {/* Events Map */}
            <EventsClusterMap 
              nearMissLocations={nearMissLocations}
              emergencyEvents={emergencyAftermath}
              nearMissByCountry={nearMissByCountry}
            />
          </div>
        </>
      )}

      {/* Near-Miss Geographic Heatmap */}
      {/* Q: איפה קורים (על איזה נתיב/איפה גיאוגרפית) הכי הרבה אירועי בטיחות? (L2) */}
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

      {/* Diversions Section - Level 1 Category A */}
      {/* Q: כמה מטוסים לא הגיעו ליעדם המקורי? / כמה מטוסים ביצעו מעקפים גדולים מהנתיב טיסה? (L1/L2) */}
      <>
        <div className="border-b border-white/10 pb-4 pt-8">
          <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-orange-500" />
            Diversion Analysis
          </h2>
          <p className="text-white/60 text-sm">
            Aircraft that did not reach their original destination
          </p>
        </div>

        {diversionStats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Diversions"
                value={diversionStats.total_diversions || 0}
                subtitle="Did not reach destination"
                icon={<ArrowRightLeft className="w-6 h-6" />}
              />
              <StatCard
                title="Large Deviations"
                value={diversionStats.total_large_deviations || 0}
                subtitle=">20nm off course"
                icon={<Plane className="w-6 h-6" />}
              />
              <StatCard
                title="360° Holds"
                value={diversionStats.total_holding_360s || 0}
                subtitle="Full circle patterns"
                icon={<Activity className="w-6 h-6" />}
              />
              <StatCard
                title="Airports Affected"
                value={Object.keys(diversionStats.by_airport || {}).length}
                subtitle="With diversions"
                icon={<MapPin className="w-6 h-6" />}
              />
            </div>

            {/* Diversions by Airport and Airline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Airport */}
              {diversionStats.by_airport && Object.keys(diversionStats.by_airport).length > 0 && (
                <div className="bg-surface rounded-xl border border-white/10 p-5">
                  <h3 className="text-white font-bold mb-4">Diversions by Airport</h3>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {Object.entries(diversionStats.by_airport)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([airport, count]) => (
                        <div key={airport} className="flex items-center justify-between bg-surface-highlight rounded-lg p-3">
                          <span className="text-white font-medium">{airport}</span>
                          <span className="text-orange-400 font-bold">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* By Airline */}
              {diversionStats.by_airline && Object.keys(diversionStats.by_airline).length > 0 && (
                <div className="bg-surface rounded-xl border border-white/10 p-5">
                  <h3 className="text-white font-bold mb-4">Diversions by Airline</h3>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {Object.entries(diversionStats.by_airline)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([airline, count]) => (
                        <div key={airline} className="flex items-center justify-between bg-surface-highlight rounded-lg p-3">
                          <span className="text-white font-medium">{airline}</span>
                          <span className="text-orange-400 font-bold">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-surface rounded-xl border border-white/10 p-8 text-center">
            <ArrowRightLeft className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No diversion data available for this period</p>
            <p className="text-white/30 text-sm mt-2">Diversions are detected from Rule 8 (destination mismatch) events</p>
          </div>
        )}
      </>

      {/* RTB Events Section - Level 1 Category A */}
      {/* Q: כמה מטוסים המריאו, שהו פחות מ30 דקות באוויר וחזרו לנחיתה באותו בסיס? (L1) */}
      {rtbEvents.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-yellow-500" />
              Return to Base Events
            </h2>
            <p className="text-white/60 text-sm">
              Aircraft that returned to their departure airport within 30 minutes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Total RTB Events"
              value={rtbEvents.length}
              subtitle="Short flights returned"
              icon={<RotateCcw className="w-6 h-6" />}
            />
            <StatCard
              title="Avg Flight Time"
              value={`${(rtbEvents.reduce((sum, e) => sum + e.duration_min, 0) / rtbEvents.length || 0).toFixed(0)} min`}
              subtitle="Before return"
              icon={<Clock className="w-6 h-6" />}
            />
            <StatCard
              title="Airports Affected"
              value={new Set(rtbEvents.map(e => e.airport)).size}
              subtitle="Unique airports"
              icon={<MapPin className="w-6 h-6" />}
            />
          </div>

          {/* RTB Events Table */}
          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h4 className="text-white font-medium">RTB Events</h4>
              <p className="text-white/50 text-xs mt-1">Aircraft that returned shortly after takeoff</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Time</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Callsign</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airport</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {rtbEvents.slice(0, 15).map((event, idx) => (
                    <tr key={`${event.flight_id}-${idx}`} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 text-white/60 text-sm">
                        {new Date(event.departure_time * 1000).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{event.callsign || 'Unknown'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-yellow-400 font-medium">{event.airport}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          event.duration_min < 15 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {event.duration_min} min
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rtbEvents.length > 15 && (
              <div className="px-4 py-3 bg-surface-highlight text-center">
                <span className="text-white/50 text-sm">Showing 15 of {rtbEvents.length} events</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Go-Arounds Hourly Distribution */}
      {/* Q: באיזה שעות ביום יש הכי הרבה הליכות סביב? (L2) */}
      {goAroundsHourly.length > 0 && goAroundsHourly.some(h => h.count > 0) && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-500" />
              Go-Arounds by Time of Day
            </h2>
            <p className="text-white/60 text-sm">
              Hourly distribution of aborted landings
            </p>
          </div>

          <ChartCard title="Go-Arounds Hourly Distribution">
            <ResponsiveContainer width="100%" height={300}>
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
                  formatter={(value: number) => [value, 'Go-Arounds']}
                  labelFormatter={(hour) => `${hour}:00 - ${hour}:59`}
                />
                <Bar 
                  dataKey="count" 
                  fill="#8b5cf6" 
                  name="Go-Arounds" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      {/* Daily Incident Clusters */}
      {/* Q: האם היו כמה אירועים ביום אחד? האם היו באותו האזור? (L2) */}
      {dailyIncidentClusters && dailyIncidentClusters.high_incident_days.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-500" />
              High Incident Days Analysis
            </h2>
            <p className="text-white/60 text-sm">
              Days with multiple incidents and geographic clustering
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="High Incident Days"
              value={dailyIncidentClusters.high_incident_days.length.toString()}
              subtitle="Days with 3+ events"
              icon={<AlertTriangle className="w-6 h-6" />}
            />
            <StatCard
              title="Avg Daily Incidents"
              value={dailyIncidentClusters.average_daily_incidents.toFixed(1)}
              subtitle="Average per day"
            />
            <StatCard
              title="Peak Day"
              value={dailyIncidentClusters.max_incidents_day.count.toString()}
              subtitle={dailyIncidentClusters.max_incidents_day.date}
            />
          </div>

          <div className="bg-surface rounded-xl border border-white/10 p-5">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Days with Multiple Incidents
            </h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {dailyIncidentClusters.high_incident_days.slice(0, 10).map((day, idx) => (
                <div key={idx} className={`rounded-lg p-4 ${
                  day.geographically_clustered 
                    ? 'bg-red-500/20 border border-red-500/30' 
                    : 'bg-surface-highlight'
                }`}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{day.date}</span>
                      {day.geographically_clustered && (
                        <span className="px-2 py-1 bg-red-500/30 text-red-300 text-xs rounded-full">
                          Geographically Clustered
                        </span>
                      )}
                    </div>
                    <span className="text-white font-bold text-lg">
                      {day.total_incidents} incidents
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    {day.emergency_count > 0 && (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-red-400 font-bold">{day.emergency_count}</div>
                        <div className="text-white/50 text-xs">Emergency</div>
                      </div>
                    )}
                    {day.near_miss_count > 0 && (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-orange-400 font-bold">{day.near_miss_count}</div>
                        <div className="text-white/50 text-xs">Near-Miss</div>
                      </div>
                    )}
                    {day.go_around_count > 0 && (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-purple-400 font-bold">{day.go_around_count}</div>
                        <div className="text-white/50 text-xs">Go-Around</div>
                      </div>
                    )}
                    {day.diversion_count > 0 && (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-blue-400 font-bold">{day.diversion_count}</div>
                        <div className="text-white/50 text-xs">Diversion</div>
                      </div>
                    )}
                  </div>
                  {day.geographic_spread_deg > 0 && (
                    <div className="mt-2 text-white/50 text-xs">
                      Geographic spread: {day.geographic_spread_deg.toFixed(1)}° 
                      ({day.geographically_clustered ? 'localized' : 'dispersed'})
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          {dailyIncidentClusters.insights.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-4">
              <h4 className="text-white font-bold mb-2">Insights</h4>
              <ul className="text-white/70 text-sm space-y-1">
                {dailyIncidentClusters.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
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
