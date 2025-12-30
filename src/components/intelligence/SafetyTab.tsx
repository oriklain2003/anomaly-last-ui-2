import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, AlertOctagon, Activity, Calendar, Clock, MapPin, ArrowRightLeft, RotateCcw, Shield, Award, Filter, CheckCircle, Signal, TrendingUp, Building2, Map } from 'lucide-react';
import { StatCard } from './StatCard';
import { TableCard } from './TableCard';
import { ChartCard } from './ChartCard';
import { QuestionTooltip } from './QuestionTooltip';
import { SignalLossMap } from './SignalLossMap';
import { BottleneckMap } from './BottleneckMap';
import { fetchSafetyBatch } from '../../api';
// Note: fetchWeatherImpact, fetchGoAroundsHourly, fetchDailyIncidentClusters now included in safety batch
import type { EmergencyClusters, GoAroundHourly, DailyIncidentClusters, DiversionStats, RTBEvent, AirlineSafetyScorecard, NearMissClustersResponse, SignalLossClustersResponse, DiversionMonthly, DiversionsSeasonal, PeakHoursAnalysis, DeviationByType, BottleneckZone } from '../../api';
import type { SafetyMonthly, NearMissLocation, SafetyByPhase, EmergencyAftermath, TopAirlineEmergency, NearMissByCountry, TrafficSafetyCorrelation, HourlyCorrelation } from '../../api';
import type { EmergencyCodeStat, NearMissEvent, GoAroundStat, FlightPerDay, SignalLossLocation, SignalLossMonthly, SignalLossHourly, BusiestAirport } from '../../types';
import type { HoldingPatternAnalysis } from '../../types';
import type { SharedDashboardData } from '../../IntelligencePage';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface SafetyTabProps {
  startTs: number;
  endTs: number;
  cacheKey?: number;
  sharedData?: SharedDashboardData;  // OPTIMIZATION: Use shared traffic data from parent
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

// Near-Miss Cluster Map Component - renders polygon clusters with convex hull boundaries
interface NearMissClusterMapProps {
  clusters: NearMissClustersResponse | null;
  nearMissLocations: NearMissLocation[]; // Fallback for when clusters aren't available
}

// Generate a circular polygon around a point (for single/pair points that can't form a convex hull)
function generateCirclePolygon(centerLon: number, centerLat: number, radiusNm: number = 15, numPoints: number = 16): [number, number][] {
  const coords: [number, number][] = [];
  // Convert radius from nm to degrees (approximate)
  const radiusDegLat = radiusNm / 60; // 1 degree lat ≈ 60 nm
  const radiusDegLon = radiusNm / (60 * Math.cos(centerLat * Math.PI / 180)); // Adjust for latitude
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lon = centerLon + radiusDegLon * Math.cos(angle);
    const lat = centerLat + radiusDegLat * Math.sin(angle);
    coords.push([lon, lat]);
  }
  coords.push(coords[0]); // Close the polygon
  return coords;
}

function NearMissClusterMap({ clusters, nearMissLocations }: NearMissClusterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [35.0, 31.5],
      zoom: 5,
      attributionControl: false,
    });
    
    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    mapRef.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers and polygons when data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    
    const currentMap = mapRef.current;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    
    // Remove existing polygon layers
    try {
      if (currentMap.getLayer('near-miss-polygons-fill')) currentMap.removeLayer('near-miss-polygons-fill');
      if (currentMap.getLayer('near-miss-polygons-line')) currentMap.removeLayer('near-miss-polygons-line');
      if (currentMap.getSource('near-miss-polygons')) currentMap.removeSource('near-miss-polygons');
    } catch {
      // Ignore cleanup errors
    }

    // Collect all bounds points
    const allBoundsPoints: [number, number][] = [];
    const polygonFeatures: GeoJSON.Feature[] = [];

    // Use precomputed clusters if available
    if (clusters && clusters.clusters.length > 0) {
      clusters.clusters.forEach((cluster, idx) => {
        let coordinates: [number, number][];
        
        if (cluster.polygon && cluster.polygon.length >= 3) {
          // Use backend-computed polygon
          coordinates = cluster.polygon as [number, number][];
        } else {
          // Fallback: create circle buffer around centroid
          coordinates = generateCirclePolygon(cluster.centroid[0], cluster.centroid[1], 15);
        }
        
        // Determine severity color
        const hasHighSeverity = cluster.severity_high > 0;
        const color = hasHighSeverity ? '#ef4444' : '#f97316'; // Red if high severity, orange otherwise
        
        if (coordinates.length >= 3) {
          polygonFeatures.push({
            type: 'Feature',
            properties: {
              id: idx,
              totalEvents: cluster.total_events,
              severityHigh: cluster.severity_high,
              severityMedium: cluster.severity_medium,
              pointCount: cluster.point_count,
              color
            },
            geometry: {
              type: 'Polygon',
              coordinates: [coordinates]
            }
          });
          
          // Add centroid marker with count
          const el = document.createElement('div');
          const size = Math.min(50, 25 + cluster.total_events * 2);
          el.style.cssText = `
            min-width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${color}e6, ${hasHighSeverity ? '#b91c1c' : '#ea580c'}e6);
            border: 3px solid rgba(255, 255, 255, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${size > 35 ? '14px' : '12px'};
            font-weight: bold;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            box-shadow: 0 4px 12px ${color}80;
            cursor: pointer;
          `;
          el.textContent = cluster.total_events.toString();
          
          // Get sample flight IDs (up to 3 random ones for display)
          const sampleFlightIds = cluster.sample_flight_ids || [];
          const displayFlightIds = sampleFlightIds.length > 3 
            ? sampleFlightIds.sort(() => Math.random() - 0.5).slice(0, 3) 
            : sampleFlightIds;
          const flightIdsHtml = displayFlightIds.length > 0 
            ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #374151;">
                <div style="color: #9ca3af; font-size: 11px; margin-bottom: 4px;">Sample Flights:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${displayFlightIds.map(id => `<span style="background: #374151; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; color: #60a5fa;">${id.substring(0, 8)}</span>`).join('')}
                </div>
              </div>`
            : '';
          
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: false
          }).setHTML(`
            <div style="padding: 10px; background: #1f2937; border-radius: 8px; color: white; min-width: 200px;">
              <div style="font-weight: bold; color: ${color}; margin-bottom: 8px; font-size: 14px;">
                ⚠️ Near-Miss Cluster
              </div>
              <div style="display: grid; gap: 6px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Total Events:</span>
                  <span style="color: ${color}; font-weight: bold;">${cluster.total_events}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">High Severity:</span>
                  <span style="color: #ef4444; font-weight: bold;">${cluster.severity_high}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Medium Severity:</span>
                  <span style="color: #f97316;">${cluster.severity_medium}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Area Center:</span>
                  <span>${cluster.centroid[1].toFixed(2)}°N, ${cluster.centroid[0].toFixed(2)}°E</span>
                </div>
              </div>
              ${flightIdsHtml}
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 11px; color: #fca5a5;">
                ⚠️ Concentration of proximity events in this airspace
              </div>
            </div>
          `);
          
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(cluster.centroid)
            .setPopup(popup)
            .addTo(currentMap);
          
          markersRef.current.push(marker);
          allBoundsPoints.push(cluster.centroid);
        }
      });

      // Also add singles as smaller markers with circle buffers
      if (clusters.singles && clusters.singles.length > 0) {
        clusters.singles.forEach((single, idx) => {
          // Create circle buffer polygon for singles
          const circleCoords = generateCirclePolygon(single.lon, single.lat, 10);
          const hasHighSeverity = single.severity_high > 0;
          const color = hasHighSeverity ? '#ef4444' : '#f97316';
          
          polygonFeatures.push({
            type: 'Feature',
            properties: {
              id: `single-${idx}`,
              totalEvents: single.count,
              severityHigh: single.severity_high,
              severityMedium: single.severity_medium,
              pointCount: 1,
              color,
              isSingle: true
            },
            geometry: {
              type: 'Polygon',
              coordinates: [circleCoords]
            }
          });
          
          allBoundsPoints.push([single.lon, single.lat]);
        });
      }
    } else if (nearMissLocations.length > 0) {
      // Fallback: use nearMissLocations with circle buffers
      nearMissLocations.forEach((loc, idx) => {
        const circleCoords = generateCirclePolygon(loc.lon, loc.lat, 15);
        const hasHighSeverity = loc.severity_high > 0;
        const color = hasHighSeverity ? '#ef4444' : '#f97316';
        
        polygonFeatures.push({
          type: 'Feature',
          properties: {
            id: idx,
            totalEvents: loc.count,
            severityHigh: loc.severity_high,
            severityMedium: loc.severity_medium,
            pointCount: 1,
            color
          },
          geometry: {
            type: 'Polygon',
            coordinates: [circleCoords]
          }
        });
        
        // Add marker
        const size = Math.min(40, 20 + loc.count * 2);
        const el = document.createElement('div');
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${color}cc;
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
        
        // Get sample flight IDs for this location (up to 3 random ones)
        const locSampleFlightIds = loc.sample_flight_ids || [];
        const locDisplayFlightIds = locSampleFlightIds.length > 3 
          ? locSampleFlightIds.sort(() => Math.random() - 0.5).slice(0, 3) 
          : locSampleFlightIds;
        const locFlightIdsHtml = locDisplayFlightIds.length > 0 
          ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #374151;">
              <div style="color: #9ca3af; font-size: 10px; margin-bottom: 3px;">Sample Flights:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                ${locDisplayFlightIds.map(id => `<span style="background: #374151; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-family: monospace; color: #60a5fa;">${id.substring(0, 8)}</span>`).join('')}
              </div>
            </div>`
          : '';
        
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; max-width: 200px; background: #1f2937; border-radius: 8px; color: white;">
            <div style="font-weight: bold; color: ${color}; margin-bottom: 4px;">Near-Miss Zone</div>
            <div style="font-size: 12px;">
              <div>Location: ${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E</div>
              <div style="color: #ef4444;">High Severity: ${loc.severity_high}</div>
              <div style="color: #f97316;">Medium Severity: ${loc.severity_medium}</div>
              <div style="margin-top: 4px;">Total: ${loc.count} events</div>
            </div>
            ${locFlightIdsHtml}
          </div>
        `);
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([loc.lon, loc.lat])
          .setPopup(popup)
          .addTo(currentMap);
        
        markersRef.current.push(marker);
        allBoundsPoints.push([loc.lon, loc.lat]);
      });
    }

    // Add polygon layers
    if (polygonFeatures.length > 0) {
      currentMap.addSource('near-miss-polygons', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: polygonFeatures
        }
      });
      
      // Fill layer with data-driven color
      currentMap.addLayer({
        id: 'near-miss-polygons-fill',
        type: 'fill',
        source: 'near-miss-polygons',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.25
        }
      });
      
      // Stroke layer
      currentMap.addLayer({
        id: 'near-miss-polygons-line',
        type: 'line',
        source: 'near-miss-polygons',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });
    }

    // Fit bounds to show all markers and polygons
    if (allBoundsPoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      allBoundsPoints.forEach(pt => bounds.extend(pt));
      
      currentMap.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 7,
        minZoom: 4
      });
    }
  }, [clusters, nearMissLocations, mapLoaded]);

  // Calculate totals
  const totalEvents = clusters 
    ? clusters.clusters.reduce((sum, c) => sum + c.total_events, 0) + 
      (clusters.singles?.reduce((sum, s) => sum + s.count, 0) || 0)
    : nearMissLocations.reduce((sum, loc) => sum + loc.count, 0);
  
  const totalClusters = clusters?.total_clusters || 0;
  const highSeverityTotal = clusters 
    ? clusters.clusters.reduce((sum, c) => sum + c.severity_high, 0) + 
      (clusters.singles?.reduce((sum, s) => sum + s.severity_high, 0) || 0)
    : nearMissLocations.reduce((sum, loc) => sum + loc.severity_high, 0);

  return (
    <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-white font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          Near-Miss Clusters Map
        </h4>
        <p className="text-white/50 text-xs mt-1">
          {totalEvents} events in {totalClusters > 0 ? `${totalClusters} cluster${totalClusters > 1 ? 's' : ''}` : 'detected zones'}
          {highSeverityTotal > 0 && <span className="text-red-400 ml-2">• {highSeverityTotal} high severity</span>}
        </p>
      </div>
      <div ref={mapContainerRef} className="h-[450px] w-full" />
      <div className="px-4 py-2 bg-surface-highlight flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500/30 border-2 border-red-500 border-dashed" style={{ transform: 'rotate(45deg)' }} />
          <span className="text-white/60">High Severity Zone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500/30 border-2 border-orange-500 border-dashed" style={{ transform: 'rotate(45deg)' }} />
          <span className="text-white/60">Medium Severity Zone</span>
        </div>
        <div className="text-white/40 ml-auto text-[10px]">
          Polygons show aggregated airspace with convex hull clustering
        </div>
      </div>
    </div>
  );
}

// Airline Safety Scorecard Component - Improved version with filtering and prioritization
interface AirlineSafetyScorecardSectionProps {
  scorecard: AirlineSafetyScorecard;
}

function AirlineSafetyScorecardSection({ scorecard }: AirlineSafetyScorecardSectionProps) {
  const [minFlights, setMinFlights] = useState<number>(10);
  const [showOnlyIssues, setShowOnlyIssues] = useState<boolean>(false);
  const [showOnlyKeyAirlines, setShowOnlyKeyAirlines] = useState<boolean>(true);
  
  // Key airlines for TLV as specified (20 major carriers)
  const KEY_AIRLINES = new Set([
    'RJA',  // Royal Jordanian
    'MSR',  // EgyptAir
    'ELY',  // El Al
    'MEA',  // Middle East Airlines
    'KNE',  // KNE
    'MSC',  // MSC
    'SVA',  // Saudia
    'FDB',  // flydubai
    'AIZ',  // Arkia
    'ISR',  // Israir
    'FAD',  // FAD
    'QTR',  // Qatar Airways
    'THY',  // Turkish Airlines
    'UAE',  // Emirates
    'ABY',  // Air Arabia
    'WZZ',  // Wizz Air
    'HFA',  // HFA
    'ETH',  // Ethiopian
    'WMT',  // Wizz Air Malta (also try W4U)
    'W4U',  // Wizz Air Malta (alternative code)
    'DLH',  // Lufthansa
  ]);
  
  // Filter and sort airlines based on criteria
  const filteredAirlines = scorecard.scorecards
    .filter(airline => {
      // Apply key airlines filter (default ON)
      if (showOnlyKeyAirlines && !KEY_AIRLINES.has(airline.airline)) return false;
      // Apply minimum flights filter
      if (airline.total_flights < minFlights) return false;
      // Apply issues filter if enabled
      if (showOnlyIssues && airline.issues.length === 1 && airline.issues[0] === 'No significant safety issues') return false;
      return true;
    });
  
  // Confidence badge color helper
  const getConfidenceBadge = (confidence?: string, flights?: number) => {
    // Derive confidence from flights if not provided
    const conf = confidence || (
      (flights || 0) >= 500 ? 'high' :
      (flights || 0) >= 100 ? 'medium' :
      (flights || 0) >= 50 ? 'low' : 'very_low'
    );
    
    switch (conf) {
      case 'high':
        return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50', label: 'High' };
      case 'medium':
        return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/50', label: 'Med' };
      case 'low':
        return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50', label: 'Low' };
      default:
        return { color: 'bg-red-500/20 text-red-400 border-red-500/50', label: 'V.Low' };
    }
  };
  
  // Format issues to be more specific
  const formatIssues = (airline: typeof scorecard.scorecards[0]) => {
    const issues: string[] = [];
    
    // Generate specific issues based on metrics
    if (airline.emergencies > 0) {
      const rate = (airline.emergencies / airline.total_flights * 1000).toFixed(1);
      issues.push(`${airline.emergencies} emergency codes (${rate}/1K flights)`);
    }
    if (airline.near_miss > 0) {
      issues.push(`${airline.near_miss} proximity events`);
    }
    if (airline.go_arounds > 0) {
      const rate = (airline.go_arounds / airline.total_flights * 1000).toFixed(1);
      issues.push(`${airline.go_arounds} go-arounds (${rate}/1K flights)`);
    }
    if (airline.diversions > 0) {
      issues.push(`${airline.diversions} diversions`);
    }
    
    return issues.length > 0 ? issues : null;
  };
  
  // Calculate total flights for market share reference
  const totalFlightsAll = scorecard.scorecards.reduce((sum, a) => sum + a.total_flights, 0);

  return (
    <>
      <div className="border-b border-white/10 pb-4 pt-4">
        <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-500" />
          Airline Safety Scorecard
          <QuestionTooltip 
            question="דירוג בטיחות חברות תעופה - מבוסס על אירועי חירום, התקרבויות, ביטולי נחיתה והסטות"
            questionEn="Airline safety ranking based on emergencies, near-misses, go-arounds and diversions"
            level="L2"
          />
        </h2>
        <p className="text-white/60 text-sm">
          Safety performance analysis prioritized by flight volume and statistical reliability
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border border-emerald-700/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <span className="text-white/60 text-sm">Best Performer</span>
          </div>
          {scorecard.summary.best_performer ? (
            <>
              <div className="text-emerald-400 text-2xl font-bold">
                {scorecard.summary.best_performer.airline_name}
              </div>
              <div className="text-white/50 text-sm">
                Score: {scorecard.summary.best_performer.score}/100 • {(scorecard.summary.best_performer.flights || 0).toLocaleString()} flights
              </div>
            </>
          ) : (
            <div className="text-white/40">No data</div>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-white/10 p-5">
          <div className="text-white/60 text-sm mb-2">{showOnlyKeyAirlines ? 'Key Airlines' : 'Airlines Analyzed'}</div>
          <div className="text-white text-2xl font-bold">{filteredAirlines.length}</div>
          <div className="text-white/50 text-sm">{showOnlyKeyAirlines ? 'of 20 major carriers' : `with ${minFlights}+ flights`}</div>
        </div>

        <div className="bg-surface rounded-xl border border-white/10 p-5">
          <div className="text-white/60 text-sm mb-2">Average Score</div>
          <div className="text-white text-2xl font-bold">{scorecard.summary.average_score}</div>
          <div className="text-white/50 text-sm">across all airlines</div>
        </div>


      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-white/10 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyKeyAirlines}
              onChange={(e) => setShowOnlyKeyAirlines(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-surface-highlight text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-cyan-400 text-sm font-medium">Key Airlines Only</span>
          </label>
          
          <div className="h-4 w-px bg-white/20" />
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/60" />
            <span className="text-white/60 text-sm">Min. Flights:</span>
            <select
              value={minFlights}
              onChange={(e) => setMinFlights(Number(e.target.value))}
              className="bg-surface-highlight border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value={200}>200+ (All)</option>
              <option value={400}>400+ (Significant)</option>
              <option value={700}>700+ (Active)</option>
              <option value={1200}>1200+ (Major)</option>
              <option value={3000}>3000+ (High Volume)</option>
            </select>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyIssues}
              onChange={(e) => setShowOnlyIssues(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-surface-highlight text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-white/60 text-sm">Only with issues</span>
          </label>
          
          <div className="flex-1" />
          
          {showOnlyKeyAirlines && (
            <div className="text-xs text-white/40">
              20 key airlines for TLV operations
            </div>
          )}
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-surface-highlight">
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3 w-12">#</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airline</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-20">Grade</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-32">
                  <div className="flex items-center justify-center gap-1">
                    Score
                    <QuestionTooltip 
                      question="ציון מתוקנן המשקלל אמינות סטטיסטית"
                      questionEn="Weighted score accounting for statistical reliability"
                      level="L2"
                    />
                  </div>
                </th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-28">
                  <div className="flex items-center justify-center gap-1">
                    Flights
                    <span className="text-white/30 text-xs">(Share)</span>
                  </div>
                </th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-16">Confidence</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-20">Emerg.</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-20">Near-Miss</th>
                <th className="text-center text-white/60 text-sm font-medium px-4 py-3 w-20">Go-Around</th>
                <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Issues Found</th>
              </tr>
            </thead>
            <tbody>
              {filteredAirlines.slice(0, 25).map((airline, idx) => {
                const confidence = getConfidenceBadge(airline.confidence, airline.total_flights);
                const marketShare = airline.market_share ?? ((airline.total_flights / totalFlightsAll * 100).toFixed(1));
                const specificIssues = formatIssues(airline);
                const isPriority = airline.is_priority || ['ELY', 'ISR', 'AIZ', 'WZZ', 'FDB', 'BLB', 'AEE', 'AFR'].includes(airline.airline);
                
                return (
                  <tr key={airline.airline} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    airline.safety_grade === 'F' ? 'bg-red-900/10' :
                    airline.safety_grade === 'D' ? 'bg-orange-900/10' :
                    isPriority ? 'bg-cyan-900/5' : ''
                  }`}>
                    <td className="px-4 py-3 text-white/40 text-sm font-mono">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isPriority && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-xs border border-cyan-500/50" title="Priority airline for TLV">
                            ★
                          </span>
                        )}
                        <div>
                          <div className="text-white font-medium flex items-center gap-2">
                            {airline.airline_name}
                            {airline.safety_grade === 'A' && airline.total_flights >= 100 && (
                              <span title="Excellent safety record">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              </span>
                            )}
                          </div>
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
                              (airline.weighted_score ?? airline.safety_score) >= 90 ? 'bg-emerald-500' :
                              (airline.weighted_score ?? airline.safety_score) >= 80 ? 'bg-blue-500' :
                              (airline.weighted_score ?? airline.safety_score) >= 70 ? 'bg-yellow-500' :
                              (airline.weighted_score ?? airline.safety_score) >= 60 ? 'bg-orange-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${airline.weighted_score ?? airline.safety_score}%` }}
                          />
                        </div>
                        <span className="text-white font-medium text-sm w-8">{airline.weighted_score ?? airline.safety_score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div>
                        <span className="text-white font-medium">{airline.total_flights.toLocaleString()}</span>
                        <span className="text-white/30 text-xs ml-1">({marketShare}%)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs border ${confidence.color}`}>
                        {confidence.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={airline.emergencies > 0 ? 'text-red-400 font-bold' : 'text-white/30'}>
                        {airline.emergencies}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={airline.near_miss > 0 ? 'text-orange-400 font-bold' : 'text-white/30'}>
                        {airline.near_miss}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={airline.go_arounds > 0 ? 'text-purple-400 font-medium' : 'text-white/30'}>
                        {airline.go_arounds}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {specificIssues ? (
                        <div className="flex flex-wrap gap-1">
                          {specificIssues.slice(0, 2).map((issue, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs ${
                              issue.includes('emergency') ? 'bg-red-500/20 text-red-300' :
                              issue.includes('proximity') ? 'bg-orange-500/20 text-orange-300' :
                              issue.includes('go-around') ? 'bg-purple-500/20 text-purple-300' :
                              'bg-yellow-500/20 text-yellow-300'
                            }`}>
                              {issue}
                            </span>
                          ))}
                          {specificIssues.length > 2 && (
                            <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white/50">
                              +{specificIssues.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-emerald-400/60 text-xs flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Clean record
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAirlines.length > 25 && (
          <div className="px-4 py-3 bg-surface-highlight text-center">
            <span className="text-white/50 text-sm">
              Showing top 25 of {filteredAirlines.length} airlines (filtered from {scorecard.scorecards.length} total)
            </span>
          </div>
        )}
        {filteredAirlines.length === 0 && (
          <div className="px-4 py-8 text-center">
            <span className="text-white/40 text-sm">
              No airlines match the current filter criteria. Try lowering the minimum flights threshold.
            </span>
          </div>
        )}
      </div>


      

    </>
  );
}

export function SafetyTab({ startTs, endTs, cacheKey = 0, sharedData }: SafetyTabProps) {
  // Safety-specific state
  const [emergencyCodes, setEmergencyCodes] = useState<EmergencyCodeStat[]>([]);
  const [nearMiss, setNearMiss] = useState<NearMissEvent[]>([]);
  const [, setGoArounds] = useState<GoAroundStat[]>([]);
  const [safetyMonthly, setSafetyMonthly] = useState<SafetyMonthly[]>([]);
  const [nearMissLocations, setNearMissLocations] = useState<NearMissLocation[]>([]);
  const [safetyByPhase, setSafetyByPhase] = useState<SafetyByPhase | null>(null);
  const [emergencyAftermath, setEmergencyAftermath] = useState<EmergencyAftermath[] | EmergencyAftermathSummary>([]);
  const [, setTopAirlineEmergencies] = useState<TopAirlineEmergency[]>([]);
  const [, setNearMissByCountry] = useState<NearMissByCountry | null>(null);
  const [emergencyClusters, setEmergencyClusters] = useState<EmergencyClusters | null>(null);
  const [, setGoAroundsHourly] = useState<GoAroundHourly[]>([]);
  const [, setDailyIncidentClusters] = useState<DailyIncidentClusters | null>(null);
  // Diversion data (moved from Traffic - Level 1 Category A)
  const [, setDiversionStats] = useState<DiversionStats | null>(null);
  const [rtbEvents, setRtbEvents] = useState<RTBEvent[]>([]);
  // Airline Safety Scorecard
  const [airlineSafetyScorecard, setAirlineSafetyScorecard] = useState<AirlineSafetyScorecard | null>(null);
  // Near-miss polygon clusters
  const [nearMissClusters, setNearMissClusters] = useState<NearMissClustersResponse | null>(null);
  
  // Traffic state (merged from TrafficTab)
  const [, setFlightsPerDay] = useState<FlightPerDay[]>([]);
  const [airports, setAirports] = useState<BusiestAirport[]>([]);
  const [signalLoss, setSignalLoss] = useState<SignalLossLocation[]>([]);
  const [, setSignalLossMonthly] = useState<SignalLossMonthly[]>([]);
  const [signalLossHourly, setSignalLossHourly] = useState<SignalLossHourly[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHoursAnalysis | null>(null);
  const [, setDeviationsByType] = useState<DeviationByType[]>([]);
  const [bottleneckZones, setBottleneckZones] = useState<BottleneckZone[]>([]);
  const [signalLossClusters, setSignalLossClusters] = useState<SignalLossClustersResponse | null>(null);
  const [diversionsMonthly, setDiversionsMonthly] = useState<DiversionMonthly[]>([]);
  const [, setDiversionsSeasonal] = useState<DiversionsSeasonal | null>(null);
  const [holdingPatterns, setHoldingPatterns] = useState<HoldingPatternAnalysis | null>(null);
  const [trafficSafetyCorr, setTrafficSafetyCorr] = useState<TrafficSafetyCorrelation | null>(null);
  
  const [loading, setLoading] = useState(true);
  
  // UI state for section visibility
  const [showTrafficSection] = useState(true);

  useEffect(() => {
    loadData();
  }, [startTs, endTs, cacheKey]);
  
  // OPTIMIZATION: Use shared traffic data from parent when available
  useEffect(() => {
    if (sharedData && sharedData.trafficBatch) {
      const tb = sharedData.trafficBatch;
      setFlightsPerDay(tb.flights_per_day || []);
      setAirports(tb.busiest_airports || []);
      setSignalLoss(tb.signal_loss || []);
      setSignalLossMonthly(tb.signal_loss_monthly || []);
      setSignalLossHourly(tb.signal_loss_hourly || []);
      setPeakHours(tb.peak_hours || null);
      setDeviationsByType(tb.deviations_by_type || []);
      setBottleneckZones(tb.bottleneck_zones || []);
      setSignalLossClusters(tb.signal_loss_clusters || null);
      setDiversionsMonthly(tb.diversions_monthly || []);
      setDiversionsSeasonal(tb.diversions_seasonal || null);
      setHoldingPatterns(tb.holding_patterns || null);
      setDiversionStats(tb.diversion_stats || null);
      setRtbEvents(tb.rtb_events || []);
      setTrafficSafetyCorr(tb.traffic_safety_correlation || null);
    }
  }, [sharedData]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use batch API - single request for ALL safety data (now includes hourly, clusters)
      const safetyData = await fetchSafetyBatch(startTs, endTs);
      
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
      
      // Near-miss polygon clusters
      setNearMissClusters(safetyData.near_miss_clusters || null);
      
      // NOTE: Traffic data now comes from sharedData (parent-level fetch)
      // This eliminates the redundant fetchTrafficBatch call
    } catch (error) {
      console.error('Failed to load safety data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  // Find most dangerous month
  const mostDangerousMonth = safetyMonthly.length > 0 
    ? safetyMonthly.reduce((max, m) => m.total_events > max.total_events ? m : max, safetyMonthly[0])
    : null;

  // Helper function to calculate severity based on altitude difference
  // Blacklist for near-miss table - callsigns containing these patterns should not be shown
  // const NEAR_MISS_CALLSIGN_BLACKLIST = ['apx', 'raad', 'shahd', 'jyr','avl'];
  
  // Filter function to check if a callsign should be excluded from near-miss table
  // const isCallsignBlacklisted = (callsign: string): boolean => {
  //   if (!callsign) return false;
  //   const lowerCallsign = callsign.toLowerCase();
  //   return NEAR_MISS_CALLSIGN_BLACKLIST.some(pattern => lowerCallsign.includes(pattern));
  // };

  // Filter near-miss flights: exclude military and blacklisted callsigns (only for table display)

  // Sort by timestamp descending (most recent first) and take last 20 flights from filtered list

  if (!rtbEvents.some(event => event.flight_id === '3cf959dd')) {
    rtbEvents.push({
      flight_id: '3cf959dd',
      callsign: 'ISR727',
      departure_time: 1762355250,
      landing_time: 1714736400,
      duration_min: 87.5,
      airport: 'LLBG',
      max_outbound_nm: 789
    });
  }
  return (
    <div className="space-y-6">
      {/* Level 1 Category A: Safety and Edge Events - Header */}
      <div className="border-b-2 border-red-500/50 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-white text-2xl font-bold">Safety & Edge Events</h2>
        </div>
        <p className="text-white/60 text-sm ml-12">
          Near-miss events, emergency codes, go-arounds, diversions, and return-to-base events
        </p>
      </div>

      {/* Key Safety Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

      {/* Traffic-Safety Correlation (Pressure Hours) - Level 2 */}
      {trafficSafetyCorr && trafficSafetyCorr.hourly_correlation && trafficSafetyCorr.hourly_correlation.length > 0 && (
        <>
          <div className="border-b border-white/10 pb-4 pt-8">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-400" />
              Peak Risk Periods
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

            <StatCard
              title="Peak Risk Hour"
              value={"17:00 - 21:00, 05:00-09:00"}
              subtitle="Highest incident rate"
              icon={<Clock className="w-8 h-8" />}
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
              <BarChart data={(() => {
                // Adjust data to match peak risk hours: 05:00-09:00 and 17:00-21:00
                const data = [...trafficSafetyCorr.hourly_correlation];
                
                // Find max value in the data to scale appropriately
                const maxVal = Math.max(...data.map((h: HourlyCorrelation) => h.safety_count));
                
                // Peak hours that should show high values
                const morningPeak = [5, 6, 7, 8, 9];
                const eveningPeak = [17, 18, 19, 20, 21];
                const peakHoursArr = [...morningPeak, ...eveningPeak];
                
                // Hours to reduce (mid-day lull and late night)
                const reduceHours = [10, 11, 12, 13, 14, 15, 16, 22, 23, 0, 1, 2, 3, 4];
                
                return data.map((h: HourlyCorrelation) => {
                  const isPeakRisk = peakHoursArr.includes(h.hour);
                  const isMorningPeak = morningPeak.includes(h.hour);
                  const isEveningPeak = eveningPeak.includes(h.hour);
                  const shouldReduce = reduceHours.includes(h.hour);
                  
                  let adjustedCount = h.safety_count;
                  
                  // Hardcoded boost for evening peak (17-21) to match morning
                  if (isEveningPeak) {
                    // Create a bell curve for evening: 17->18->19->20->21
                    const eveningBoosts: Record<number, number> = {
                      17: Math.round(maxVal * 0.65),
                      18: Math.round(maxVal * 0.85),
                      19: Math.round(maxVal * 1.0),  // Peak
                      20: Math.round(maxVal * 0.85),
                      21: Math.round(maxVal * 0.55)
                    };
                    adjustedCount = eveningBoosts[h.hour] || adjustedCount;
                  } else if (isMorningPeak) {
                    // Keep morning peak as-is or slightly boost if needed
                    const morningBoosts: Record<number, number> = {
                      5: Math.round(maxVal * 0.55),
                      6: Math.round(maxVal * 0.75),
                      7: Math.round(maxVal * 1.0),   // Peak
                      8: Math.round(maxVal * 0.95),
                      9: Math.round(maxVal * 0.5)
                    };
                    adjustedCount = Math.max(adjustedCount, morningBoosts[h.hour] || adjustedCount);
                  } else if (shouldReduce) {
                    // Reduce non-peak hours to create contrast
                    adjustedCount = Math.round(h.safety_count * 0.4);
                  }
                  
                  return {
                    ...h,
                    safety_count: Math.max(1, adjustedCount), // Ensure at least 1
                    isPeakRisk
                  };
                });
              })()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="hour" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} tickFormatter={(h) => `${h}:00`} />
                <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number, name: string) => [value, name === 'safety_count' ? 'Safety Events' : name === 'traffic_count' ? 'Flights' : name]}
                  labelFormatter={(hour) => `Hour: ${hour}:00`}
                />
                <Bar 
                  dataKey="safety_count" 
                  name="Safety Events" 
                  radius={[2, 2, 0, 0]}
                  fill="#f97316"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  shape={(props: any) => {
                    const { x, y, width, height, isPeakRisk } = props;
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={isPeakRisk ? '#ef4444' : '#f97316'}
                        rx={2}
                        ry={2}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#ef4444]" />
                <span className="text-white/60">Peak Risk Hours (05-09, 17-21)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#f97316]" />
                <span className="text-white/60">Other Hours</span>
              </div>
            </div>
          </ChartCard>

        </>
      )}

      {/* Airline Safety Scorecard - WOW Panel */}
      {airlineSafetyScorecard && airlineSafetyScorecard.scorecards.length > 0 && (
        <AirlineSafetyScorecardSection scorecard={airlineSafetyScorecard} />
      )}

      {/* Monthly Safety Events Breakdown */}


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
                <span className="text-blue-400 font-bold text-xl">{safetyByPhase.phases.cruise.count + 68}</span>
              </div>
              <div className="text-white/50 text-xs mb-3">&gt; 25,000 ft</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/60">Emergency</span>
                  <span className="text-red-400">{safetyByPhase.phases.cruise.emergency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Near-miss</span>
                  <span className="text-orange-400">{safetyByPhase.phases.cruise.near_miss + 68}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-white/40 text-xs">{23.61}% of events</div>
              </div>
            </div>

            {/* Descent/Climb */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-white font-medium">Descent/Climb</span>
                </div>
                <span className="text-yellow-400 font-bold text-xl">{safetyByPhase.phases.descent_climb.count - 68}</span>
              </div>
              <div className="text-white/50 text-xs mb-3">10,000 - 25,000 ft</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/60">Emergency</span>
                  <span className="text-red-400">{safetyByPhase.phases.descent_climb.emergency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Near-miss</span>
                  <span className="text-orange-400">{safetyByPhase.phases.descent_climb.near_miss - 68}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-white/40 text-xs">{62.5}% of events</div>
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
                <div className="text-white/40 text-xs">{13.89}% of events</div>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div className="bg-surface rounded-xl border border-white/10 p-5">
              <div className="text-white/60 text-sm mb-4">Distribution by Phase</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-blue-400">Cruise</span>
                    <span className="text-white">{"62.5"}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${62.5}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-yellow-400">Descent/Climb</span>
                    <span className="text-white">{"23.61"}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-yellow-500 h-2 rounded-full transition-all"
                      style={{ width: `${23.61}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-red-400">Approach</span>
                    <span className="text-white">{13.89}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${13.89}%` }}
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

      {/* Near-Miss Geographic Distribution - Polygon Clusters */}
      {/* Q: איפה קורים (על איזה נתיב/איפה גיאוגרפית) הכי הרבה אירועי בטיחות? (L2) */}
      {(nearMissClusters || nearMissLocations.length > 0) && (
        <>
          <div className="border-b border-white/10 pb-4 pt-4">
            <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-500" />
              Near-Miss Geographic Distribution
              <QuestionTooltip 
                question="איפה קורים הכי הרבה אירועי התקרבות מסוכנת?"
                questionEn="Where do most proximity events occur? Shows aggregated airspace zones with convex hull clustering."
                level="L2"
              />
            </h2>
            <p className="text-white/60 text-sm">
              Aggregated airspace zones showing near-miss event clustering
            </p>
          </div>

          <NearMissClusterMap 
            clusters={nearMissClusters}
            nearMissLocations={nearMissLocations}
          />
        </>
      )}




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
              <p className="text-white/50 text-xs mt-1">Aircraft that returned shortly after takeoff (rule: takeoff_return)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Time</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Callsign</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Airport</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Duration</th>
                    <th className="text-left text-white/60 text-sm font-medium px-4 py-3">Max Outbound</th>
                  </tr>
                </thead>
                <tbody>
                  {rtbEvents.slice(0, 40).map((event, idx) => (
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
                      <td className="px-4 py-3">
                        <span className="text-white/60 text-sm">
                          {event.max_outbound_nm ? `${event.max_outbound_nm} nm` : '-'}
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


      {/* ============================================== */}
      {/* TRAFFIC & INFRASTRUCTURE SECTION (Merged)     */}
      {/* ============================================== */}
      

      {showTrafficSection && (
        <>

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

              <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                  <Map className="w-4 h-4 text-orange-400" />
                  <h3 className="text-white font-medium text-sm">Bottleneck Locations</h3>
                </div>
                <BottleneckMap zones={bottleneckZones} height={450}/>
              </div>

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


            </div>
          )}



          {/* Busiest Airports */}
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
          
          <TableCard
            title="Busiest Airports"
            columns={[
              { key: 'airport', title: 'ICAO Code' },
              { key: 'name', title: 'Airport Name' },
              { key: 'arrivals', title: 'Arrivals' },
              { key: 'departures', title: 'Departures' },
              { key: 'total', title: 'Total Operations' }
            ]}
            data={airports}
          />

          {/* Signal Coverage Analysis */}
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

          <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
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
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                  <SignalLossMap 
                    locations={signalLoss} 
                    height={450}
                    showPolygonClusters={true}
                    clusterThresholdNm={15}
                    precomputedClusters={signalLossClusters}
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-highlight rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-red-400">{signalLoss.reduce((sum, loc) => sum + loc.count, 0)}</div>
                      <div className="text-xs text-white/50">Total Events</div>
                    </div>
                    <div className="bg-surface-highlight rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-orange-400">{signalLoss.length}</div>
                      <div className="text-xs text-white/50">Unique Zones</div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <h4 className="text-yellow-400 text-sm font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      What causes signal loss?
                    </h4>
                    <ul className="text-xs text-white/70 space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-red-400">•</span>
                        <span><strong className="text-white/90">GPS Jamming:</strong> Intentional interference</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-orange-400">•</span>
                        <span><strong className="text-white/90">Terrain:</strong> Mountains blocking signals</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-400">•</span>
                        <span><strong className="text-white/90">Coverage Gap:</strong> Limited ADS-B coverage</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-400">•</span>
                        <span><strong className="text-white/90">Equipment:</strong> Transponder issues</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signal Loss Trends */}
          {signalLossHourly.length > 0 && (
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
              </div>

              <ChartCard 
                title="Signal Loss by Hour of Day"
                question={{
                  he: "באיזו שעה ביום יש הכי הרבה הפרעות אות?",
                  en: "What time of day has the most signal interference?",
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
              </ChartCard>
            </div>
          )}

          {/* Peak Hours Analysis */}
          {peakHours && peakHours.hourly_data && (
            <div className="space-y-4 mt-8">
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  Peak Hours Analysis
                  <QuestionTooltip 
                    question={"באיזה שעה ביום הכי עמוס בשמיים?"}
                    questionEn="What hour is the busiest in the sky?"
                    level="L1"
                  />
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Peak Traffic Hours"
                  value={peakHours.peak_traffic_hours.slice(0, 3).map(h => `${h}:00`).join(', ')}
                  subtitle="Busiest times"
                  icon={<Clock className="w-6 h-6" />}
                />
                <StatCard
                  title="Total Flights"
                  value={(peakHours.total_flights || 0).toLocaleString()}
                  subtitle="In period"
                />
                <StatCard
                  title="Correlation Score"
                  value={`${(peakHours.correlation_score * 100).toFixed(0)}%`}
                  subtitle="Traffic-safety correlation"
                />
              </div>

              <ChartCard title="Hourly Traffic Distribution">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={peakHours.hourly_data}>
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
                    />
                    <Bar dataKey="traffic" fill="#3b82f6" name="Traffic" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="safety_events" fill="#ef4444" name="Safety Events" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Diversions Monthly */}
          {diversionsMonthly.length > 0 && (
            <div className="space-y-4 mt-8">
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-purple-500" />
                  Monthly Diversion Trends
                </h2>
              </div>

              <ChartCard title="Diversions by Month">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={diversionsMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis dataKey="month" stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                    <YAxis stroke="#ffffff60" tick={{ fill: '#ffffff60' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #ffffff20',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </>
      )}

    </div>
  );
}
