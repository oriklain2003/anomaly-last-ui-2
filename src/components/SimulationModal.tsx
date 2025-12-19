import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
    X, Play, Pause, SkipBack, SkipForward, 
    Plane, MapPin, AlertTriangle, Clock, 
    Navigation, Zap, Users, Target, Shield,
    ChevronDown, ChevronUp, Eye, EyeOff
} from 'lucide-react';
import clsx from 'clsx';
import type { 
    TrafficAircraft, 
    AdvancedPlannedRoute, 
    RouteWaypoint,
    LearnedPath
} from '../api';

// ============================================================
// Types
// ============================================================

interface SimulatedFlight {
    flight_id: string;
    callsign: string | null;
    current_lat: number;
    current_lon: number;
    current_alt_ft: number;
    heading_deg: number;
    speed_kts: number;
    destination_airport: string | null;
    destination_lat: number | null;
    destination_lon: number | null;
    predicted_path: Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }>;
    eta_minutes: number | null;
    color: string;
    is_planned: boolean; // True if this is the user's planned route
    is_simulated: boolean; // True if user-drawn traffic
}

interface SimulationModalProps {
    plannedRoute: AdvancedPlannedRoute;
    origin: RouteWaypoint;
    destination: RouteWaypoint;
    traffic: TrafficAircraft[];
    learnedPaths: LearnedPath[];
    onClose: () => void;
}

// ============================================================
// Constants
// ============================================================

const MAP_STYLE = 'https://api.maptiler.com/maps/darkmatter/style.json?key=r7kaQpfNDVZdaVp23F1r';

const FLIGHT_COLORS = [
    '#60a5fa', // blue
    '#f59e0b', // amber
    '#10b981', // emerald
    '#f472b6', // pink
    '#a78bfa', // violet
    '#fb7185', // rose
    '#38bdf8', // sky
    '#fbbf24', // yellow
];

const PLANNED_ROUTE_COLOR = '#22c55e'; // Green for planned route

// Airports list
const AIRPORTS = [
    { code: "LLBG", name: "Ben Gurion Intl", lat: 32.011389, lon: 34.886667 },
    { code: "LLER", name: "Ramon Intl", lat: 29.723704, lon: 35.01145 },
    { code: "LLHA", name: "Haifa", lat: 32.809444, lon: 35.043056 },
    { code: "LLBS", name: "Beersheba", lat: 31.287, lon: 34.723 },
    { code: "LLOV", name: "Ovda", lat: 29.940, lon: 34.935 },
    { code: "LLNV", name: "Nevatim AFB", lat: 31.207, lon: 35.012 },
    { code: "LLMG", name: "Megiddo", lat: 32.597, lon: 35.228 },
    { code: "LLHZ", name: "Herzliya", lat: 32.186, lon: 34.835 },
    { code: "LCRA", name: "RAF Akrotiri", lat: 34.5900, lon: 32.9870 },
    { code: "OLBA", name: "Beirut Rafic Hariri Intl", lat: 33.820889, lon: 35.488389 },
    { code: "OLKA", name: "Rayak Air Base", lat: 33.850, lon: 35.987 },
    { code: "OJAI", name: "Queen Alia Intl (Amman)", lat: 31.722556, lon: 35.993214 },
    { code: "OJAM", name: "Amman Civil Airport (Marka)", lat: 31.9697, lon: 35.9917 },
    { code: "OJAQ", name: "King Hussein Intl (Aqaba)", lat: 29.611, lon: 35.018 },
    { code: "OJMF", name: "Mafraq", lat: 32.356, lon: 36.259 },
    { code: "HEGR", name: "El Gora Airport", lat: 31.0686, lon: 34.1296 },
    { code: "OSDI", name: "Damascus Intl", lat: 33.411, lon: 36.516 }
];

// ============================================================
// Helpers
// ============================================================

const getDistanceNM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3440.065; // Earth radius in NM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const getNearestAirport = (lat: number, lon: number) => {
    let nearest = AIRPORTS[0];
    let minDist = getDistanceNM(lat, lon, nearest.lat, nearest.lon);
    
    for (const airport of AIRPORTS) {
        const dist = getDistanceNM(lat, lon, airport.lat, airport.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = airport;
        }
    }
    
    return { ...nearest, distance_nm: minDist };
};

const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1R = lat1 * Math.PI / 180;
    const lat2R = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2R);
    const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
    
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
};

const destinationPoint = (lat: number, lon: number, bearing: number, distance_nm: number): [number, number] => {
    const R = 3440.065;
    const latR = lat * Math.PI / 180;
    const lonR = lon * Math.PI / 180;
    const bearingR = bearing * Math.PI / 180;
    const angularDist = distance_nm / R;
    
    const lat2 = Math.asin(
        Math.sin(latR) * Math.cos(angularDist) +
        Math.cos(latR) * Math.sin(angularDist) * Math.cos(bearingR)
    );
    
    const lon2 = lonR + Math.atan2(
        Math.sin(bearingR) * Math.sin(angularDist) * Math.cos(latR),
        Math.cos(angularDist) - Math.sin(latR) * Math.sin(lat2)
    );
    
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
};

// Find best matching learned path for a flight
const findMatchingPath = (
    currentLat: number, 
    currentLon: number, 
    heading: number,
    destLat: number,
    destLon: number,
    learnedPaths: LearnedPath[]
): LearnedPath | null => {
    let bestPath: LearnedPath | null = null;
    let bestScore = Infinity;
    
    for (const path of learnedPaths) {
        if (!path.centerline || path.centerline.length < 2) continue;
        
        // Check if path goes roughly in the right direction
        const pathStart = path.centerline[0];
        const pathEnd = path.centerline[path.centerline.length - 1];
        
        // Distance from current position to path start
        const distToStart = getDistanceNM(currentLat, currentLon, pathStart.lat, pathStart.lon);
        
        // Distance from path end to destination
        const distToEnd = getDistanceNM(pathEnd.lat, pathEnd.lon, destLat, destLon);
        
        // Combined score (lower is better)
        const score = distToStart + distToEnd;
        
        if (score < bestScore && distToStart < 50) { // Within 50nm of path start
            bestScore = score;
            bestPath = path;
        }
    }
    
    return bestPath;
};

// Generate predicted path for a flight
const generatePredictedPath = (
    flight: TrafficAircraft,
    destLat: number,
    destLon: number,
    learnedPaths: LearnedPath[],
    durationMinutes: number = 60
): Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }> => {
    const path: Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }> = [];
    
    // Try to find a matching learned path
    const matchedPath = findMatchingPath(
        flight.lat, flight.lon, flight.heading_deg,
        destLat, destLon, learnedPaths
    );
    
    if (matchedPath && matchedPath.centerline.length > 0) {
        // Find the closest point on the matched path
        let closestIdx = 0;
        let closestDist = Infinity;
        
        for (let i = 0; i < matchedPath.centerline.length; i++) {
            const p = matchedPath.centerline[i];
            const dist = getDistanceNM(flight.lat, flight.lon, p.lat, p.lon);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        }
        
        // Use the path from closest point onwards
        let cumulativeTime = 0;
        let prevLat = flight.lat;
        let prevLon = flight.lon;
        
        for (let i = closestIdx; i < matchedPath.centerline.length && cumulativeTime < durationMinutes; i++) {
            const p = matchedPath.centerline[i];
            const segmentDist = getDistanceNM(prevLat, prevLon, p.lat, p.lon);
            const segmentTime = (segmentDist / flight.speed_kts) * 60; // minutes
            cumulativeTime += segmentTime;
            
            path.push({
                lat: p.lat,
                lon: p.lon,
                alt_ft: p.alt || flight.alt_ft,
                time_offset_min: cumulativeTime
            });
            
            prevLat = p.lat;
            prevLon = p.lon;
        }
    } else {
        // Fall back to linear extrapolation towards destination
        const totalDist = getDistanceNM(flight.lat, flight.lon, destLat, destLon);
        const bearing = getBearing(flight.lat, flight.lon, destLat, destLon);
        
        const numPoints = Math.min(20, Math.ceil(durationMinutes / 5));
        
        for (let i = 1; i <= numPoints; i++) {
            const timeOffset = (i / numPoints) * durationMinutes;
            const distTraveled = (flight.speed_kts / 60) * timeOffset; // nm
            
            if (distTraveled >= totalDist) {
                path.push({
                    lat: destLat,
                    lon: destLon,
                    alt_ft: 0, // Landed
                    time_offset_min: timeOffset
                });
                break;
            }
            
            const [newLat, newLon] = destinationPoint(flight.lat, flight.lon, bearing, distTraveled);
            
            // Altitude profile: descend in last 20% of flight
            const progress = distTraveled / totalDist;
            let alt = flight.alt_ft;
            if (progress > 0.8) {
                alt = flight.alt_ft * (1 - (progress - 0.8) / 0.2);
            }
            
            path.push({
                lat: newLat,
                lon: newLon,
                alt_ft: Math.max(0, alt),
                time_offset_min: timeOffset
            });
        }
    }
    
    return path;
};

// ============================================================
// Component
// ============================================================

export const SimulationModal: React.FC<SimulationModalProps> = ({
    plannedRoute,
    origin,
    destination,
    traffic,
    learnedPaths,
    onClose
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    
    const [flights, setFlights] = useState<SimulatedFlight[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0); // Minutes from now
    const [speed, setSpeed] = useState(1); // Simulation speed multiplier
    const [maxTime, setMaxTime] = useState(60); // Max simulation time in minutes
    
    const [showFlightList, setShowFlightList] = useState(true);
    const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
    const [showPaths, setShowPaths] = useState(true);
    
    const animationRef = useRef<number | undefined>(undefined);
    const lastFrameTime = useRef<number>(0);

    // Initialize simulated flights from traffic + planned route
    useEffect(() => {
        setLoading(true);
        
        const simulatedFlights: SimulatedFlight[] = [];
        
        // Add the planned route as a special flight
        if (plannedRoute && plannedRoute.planned_path.length > 0) {
            const firstPoint = plannedRoute.planned_path[0];
            simulatedFlights.push({
                flight_id: 'PLANNED_ROUTE',
                callsign: 'YOUR FLIGHT',
                current_lat: firstPoint.lat,
                current_lon: firstPoint.lon,
                current_alt_ft: firstPoint.alt_ft,
                heading_deg: getBearing(
                    firstPoint.lat, firstPoint.lon,
                    plannedRoute.planned_path[1]?.lat || destination.lat,
                    plannedRoute.planned_path[1]?.lon || destination.lon
                ),
                speed_kts: 450, // Default cruise
                destination_airport: destination.airport_code || null,
                destination_lat: destination.lat,
                destination_lon: destination.lon,
                predicted_path: plannedRoute.planned_path.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    alt_ft: p.alt_ft,
                    time_offset_min: p.time_offset_min
                })),
                eta_minutes: plannedRoute.eta_minutes,
                color: PLANNED_ROUTE_COLOR,
                is_planned: true,
                is_simulated: false
            });
        }
        
        // Add traffic aircraft
        traffic.forEach((aircraft, index) => {
            // Find destination - use nearest airport if none specified
            let destAirport: { code: string; lat: number; lon: number; name: string } | null = null;
            
            // Check if aircraft has track points that might indicate destination
            if (aircraft.track_points && aircraft.track_points.length > 0) {
                const lastPoint = aircraft.track_points[aircraft.track_points.length - 1];
                destAirport = getNearestAirport(lastPoint.lat, lastPoint.lon);
            } else {
                // Use heading to estimate destination
                const [projLat, projLon] = destinationPoint(
                    aircraft.lat, aircraft.lon, 
                    aircraft.heading_deg, 
                    100 // Project 100nm ahead
                );
                destAirport = getNearestAirport(projLat, projLon);
            }
            
            // Generate predicted path
            const predictedPath = generatePredictedPath(
                aircraft,
                destAirport.lat,
                destAirport.lon,
                learnedPaths,
                60
            );
            
            // Calculate ETA
            const totalDist = getDistanceNM(aircraft.lat, aircraft.lon, destAirport.lat, destAirport.lon);
            const eta = aircraft.speed_kts > 0 ? (totalDist / aircraft.speed_kts) * 60 : null;
            
            simulatedFlights.push({
                flight_id: aircraft.flight_id,
                callsign: aircraft.callsign,
                current_lat: aircraft.lat,
                current_lon: aircraft.lon,
                current_alt_ft: aircraft.alt_ft,
                heading_deg: aircraft.heading_deg,
                speed_kts: aircraft.speed_kts,
                destination_airport: destAirport.code,
                destination_lat: destAirport.lat,
                destination_lon: destAirport.lon,
                predicted_path: predictedPath,
                eta_minutes: eta,
                color: FLIGHT_COLORS[index % FLIGHT_COLORS.length],
                is_planned: false,
                is_simulated: aircraft.is_simulated
            });
        });
        
        setFlights(simulatedFlights);
        
        // Set max time based on longest flight
        const maxEta = Math.max(...simulatedFlights.map(f => f.eta_minutes || 60));
        setMaxTime(Math.min(120, Math.max(60, maxEta)));
        
        setLoading(false);
    }, [plannedRoute, traffic, learnedPaths, destination, origin]);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || loading || flights.length === 0) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [origin.lon, origin.lat],
            zoom: 6,
        });

        popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            maxWidth: '250px'
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // Fit bounds to all flights
            const bounds = new maplibregl.LngLatBounds();
            flights.forEach(f => {
                bounds.extend([f.current_lon, f.current_lat]);
                if (f.destination_lon && f.destination_lat) {
                    bounds.extend([f.destination_lon, f.destination_lat]);
                }
                f.predicted_path.forEach(p => bounds.extend([p.lon, p.lat]));
            });
            map.current.fitBounds(bounds, { padding: 60 });

            // Add sources and layers for each flight
            flights.forEach(flight => {
                // Predicted path (ghost line)
                map.current!.addSource(`path-${flight.flight_id}`, {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: flight.predicted_path.length > 1 ? [{
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates: flight.predicted_path.map(p => [p.lon, p.lat])
                            }
                        }] : []
                    }
                });

                // Path layer
                map.current!.addLayer({
                    id: `layer-path-${flight.flight_id}`,
                    type: 'line',
                    source: `path-${flight.flight_id}`,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': flight.color,
                        'line-width': flight.is_planned ? 4 : 2,
                        'line-opacity': flight.is_planned ? 0.8 : 0.4,
                        'line-dasharray': flight.is_planned ? [1, 0] : [2, 2]
                    }
                });

                // Current position source
                map.current!.addSource(`pos-${flight.flight_id}`, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Position marker
                map.current!.addLayer({
                    id: `layer-pos-${flight.flight_id}`,
                    type: 'circle',
                    source: `pos-${flight.flight_id}`,
                    paint: {
                        'circle-radius': flight.is_planned ? 10 : 6,
                        'circle-color': flight.color,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff'
                    }
                });

                // Label
                map.current!.addLayer({
                    id: `layer-label-${flight.flight_id}`,
                    type: 'symbol',
                    source: `pos-${flight.flight_id}`,
                    layout: {
                        'text-field': flight.callsign || flight.flight_id.slice(0, 6),
                        'text-offset': [0, -1.5],
                        'text-size': flight.is_planned ? 14 : 11,
                        'text-anchor': 'bottom',
                        'text-allow-overlap': true
                    },
                    paint: {
                        'text-color': '#ffffff',
                        'text-halo-color': '#000000',
                        'text-halo-width': 2
                    }
                });
            });

            // Add airport markers
            AIRPORTS.forEach(airport => {
                const el = document.createElement('div');
                el.className = 'airport-marker';
                el.innerHTML = `
                    <div class="w-4 h-4 rounded-full bg-slate-600 border border-slate-400 flex items-center justify-center">
                        <span class="text-[8px] text-white font-bold">✈</span>
                    </div>
                `;
                
                new maplibregl.Marker({ element: el })
                    .setLngLat([airport.lon, airport.lat])
                    .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`
                        <div class="text-xs">
                            <strong>${airport.code}</strong><br/>
                            ${airport.name}
                        </div>
                    `))
                    .addTo(map.current!);
            });
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [loading, flights, origin]);

    // Update positions based on current time
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        flights.forEach(flight => {
            const source = map.current!.getSource(`pos-${flight.flight_id}`) as maplibregl.GeoJSONSource;
            if (!source) return;

            // Interpolate position based on currentTime
            let lat = flight.current_lat;
            let lon = flight.current_lon;
            let alt = flight.current_alt_ft;
            let hasLanded = false;

            if (flight.predicted_path.length > 0) {
                // Find the two points to interpolate between
                let prevPoint = { lat: flight.current_lat, lon: flight.current_lon, alt_ft: flight.current_alt_ft, time_offset_min: 0 };
                let nextPoint = flight.predicted_path[0];

                for (let i = 0; i < flight.predicted_path.length; i++) {
                    if (flight.predicted_path[i].time_offset_min >= currentTime) {
                        nextPoint = flight.predicted_path[i];
                        prevPoint = i > 0 ? flight.predicted_path[i - 1] : prevPoint;
                        break;
                    }
                    prevPoint = flight.predicted_path[i];
                    nextPoint = flight.predicted_path[i];
                }

                // Check if flight has landed
                if (currentTime >= (flight.eta_minutes || maxTime)) {
                    lat = flight.destination_lat || lat;
                    lon = flight.destination_lon || lon;
                    alt = 0;
                    hasLanded = true;
                } else {
                    // Interpolate
                    const timeDiff = nextPoint.time_offset_min - prevPoint.time_offset_min;
                    const progress = timeDiff > 0 ? (currentTime - prevPoint.time_offset_min) / timeDiff : 0;
                    const clampedProgress = Math.max(0, Math.min(1, progress));

                    lat = prevPoint.lat + (nextPoint.lat - prevPoint.lat) * clampedProgress;
                    lon = prevPoint.lon + (nextPoint.lon - prevPoint.lon) * clampedProgress;
                    alt = prevPoint.alt_ft + (nextPoint.alt_ft - prevPoint.alt_ft) * clampedProgress;
                }
            }

            source.setData({
                type: 'FeatureCollection',
                features: hasLanded ? [] : [{
                    type: 'Feature',
                    properties: {
                        flight_id: flight.flight_id,
                        callsign: flight.callsign,
                        alt: Math.round(alt),
                        speed: flight.speed_kts,
                        heading: flight.heading_deg,
                        destination: flight.destination_airport
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [lon, lat]
                    }
                }] as any
            });
        });
    }, [currentTime, flights, maxTime]);

    // Toggle path visibility
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;
        
        flights.forEach(flight => {
            const layerId = `layer-path-${flight.flight_id}`;
            if (map.current!.getLayer(layerId)) {
                map.current!.setLayoutProperty(layerId, 'visibility', showPaths ? 'visible' : 'none');
            }
        });
    }, [showPaths, flights]);

    // Animation loop
    useEffect(() => {
        if (!isPlaying) {
            lastFrameTime.current = 0;
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const animate = (time: number) => {
            if (lastFrameTime.current === 0) {
                lastFrameTime.current = time;
            }

            const delta = (time - lastFrameTime.current) / 1000; // seconds
            lastFrameTime.current = time;

            setCurrentTime(prev => {
                const next = prev + (delta * speed);
                if (next >= maxTime) {
                    setIsPlaying(false);
                    return maxTime;
                }
                return next;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying, speed, maxTime]);

    // Get current position for a flight
    const getCurrentPosition = useCallback((flight: SimulatedFlight) => {
        if (flight.predicted_path.length === 0) {
            return { lat: flight.current_lat, lon: flight.current_lon, alt: flight.current_alt_ft };
        }

        let prevPoint = { lat: flight.current_lat, lon: flight.current_lon, alt_ft: flight.current_alt_ft, time_offset_min: 0 };
        let nextPoint = flight.predicted_path[0];

        for (let i = 0; i < flight.predicted_path.length; i++) {
            if (flight.predicted_path[i].time_offset_min >= currentTime) {
                nextPoint = flight.predicted_path[i];
                prevPoint = i > 0 ? flight.predicted_path[i - 1] : prevPoint;
                break;
            }
            prevPoint = flight.predicted_path[i];
            nextPoint = flight.predicted_path[i];
        }

        const timeDiff = nextPoint.time_offset_min - prevPoint.time_offset_min;
        const progress = timeDiff > 0 ? (currentTime - prevPoint.time_offset_min) / timeDiff : 0;
        const clampedProgress = Math.max(0, Math.min(1, progress));

        return {
            lat: prevPoint.lat + (nextPoint.lat - prevPoint.lat) * clampedProgress,
            lon: prevPoint.lon + (nextPoint.lon - prevPoint.lon) * clampedProgress,
            alt: prevPoint.alt_ft + (nextPoint.alt_ft - prevPoint.alt_ft) * clampedProgress
        };
    }, [currentTime]);

    // Calculate distances between OUR FLIGHT and other flights only
    const getProximityWarnings = useCallback(() => {
        const warnings: Array<{ flight1: string; flight2: string; distance: number; severity: 'critical' | 'warning' }> = [];
        
        // Find our planned flight
        const ourFlight = flights.find(f => f.is_planned);
        if (!ourFlight) return warnings;
        
        const ourPos = getCurrentPosition(ourFlight);
        
        // Check distance to all other flights
        for (const otherFlight of flights) {
            if (otherFlight.is_planned) continue; // Skip self
            
            const otherPos = getCurrentPosition(otherFlight);
            const dist = getDistanceNM(ourPos.lat, ourPos.lon, otherPos.lat, otherPos.lon);
            const altDiff = Math.abs(ourPos.alt - otherPos.alt);
            
            if (dist < 5 && altDiff < 1000) {
                warnings.push({
                    flight1: 'YOUR FLIGHT',
                    flight2: otherFlight.callsign || otherFlight.flight_id,
                    distance: dist,
                    severity: 'critical'
                });
            } else if (dist < 10 && altDiff < 2000) {
                warnings.push({
                    flight1: 'YOUR FLIGHT',
                    flight2: otherFlight.callsign || otherFlight.flight_id,
                    distance: dist,
                    severity: 'warning'
                });
            }
        }
        
        return warnings.sort((a, b) => a.distance - b.distance);
    }, [flights, getCurrentPosition]);

    const formatTime = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm">
                <div className="text-white text-xl flex items-center gap-3">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    Preparing simulation...
                </div>
            </div>
        );
    }

    const proximityWarnings = getProximityWarnings();

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 w-full h-full rounded-2xl overflow-hidden flex flex-col border border-slate-700 shadow-2xl relative">
                
                {/* Header */}
                <div className="absolute top-4 right-4 z-50 flex gap-2">
                    <button 
                        onClick={() => setShowPaths(!showPaths)}
                        className={clsx(
                            "p-2 rounded-full transition-colors border",
                            showPaths ? "bg-cyan-600 text-white border-cyan-500" : "bg-black/50 hover:bg-black/70 text-white border-transparent"
                        )}
                        title={showPaths ? "Hide Paths" : "Show Paths"}
                    >
                        {showPaths ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                    >
                        <X className="size-6" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden relative">
                    {/* Left Panel - Flight List */}
                    <div className={clsx(
                        "bg-slate-900/95 border-r border-slate-700 flex flex-col z-30 shrink-0 transition-all",
                        showFlightList ? "w-80" : "w-12"
                    )}>
                        <button
                            onClick={() => setShowFlightList(!showFlightList)}
                            className="p-3 border-b border-slate-700 flex items-center gap-2 hover:bg-slate-800/50"
                        >
                            <Users className="size-5 text-cyan-400" />
                            {showFlightList && <span className="font-medium">Flights ({flights.length})</span>}
                            {showFlightList ? <ChevronUp className="size-4 ml-auto" /> : <ChevronDown className="size-4" />}
                        </button>
                        
                        {showFlightList && (
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {flights.map(flight => {
                                    const pos = getCurrentPosition(flight);
                                    const hasLanded = currentTime >= (flight.eta_minutes || maxTime);
                                    const nearestAirport = getNearestAirport(pos.lat, pos.lon);
                                    
                                    return (
                                        <div 
                                            key={flight.flight_id}
                                            onClick={() => setSelectedFlight(selectedFlight === flight.flight_id ? null : flight.flight_id)}
                                            className={clsx(
                                                "p-3 rounded-lg border cursor-pointer transition-all",
                                                flight.is_planned 
                                                    ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50"
                                                    : flight.is_simulated
                                                        ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                                                        : "bg-slate-800/50 border-slate-700 hover:border-slate-600",
                                                selectedFlight === flight.flight_id && "ring-2 ring-cyan-500"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div 
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: flight.color }}
                                                    />
                                                    <span className="font-mono font-bold text-sm">
                                                        {flight.callsign || flight.flight_id.slice(0, 8)}
                                                    </span>
                                                </div>
                                                {flight.is_planned && (
                                                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">
                                                        YOUR FLIGHT
                                                    </span>
                                                )}
                                                {flight.is_simulated && !flight.is_planned && (
                                                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                                                        SIMULATED
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                                                <span>Alt:</span>
                                                <span className="font-mono text-right">
                                                    {hasLanded ? 'Landed' : `${Math.round(pos.alt).toLocaleString()} ft`}
                                                </span>
                                                
                                                <span>Speed:</span>
                                                <span className="font-mono text-right">{flight.speed_kts} kts</span>
                                                
                                                <span>Dest:</span>
                                                <span className="font-mono text-right text-cyan-400">
                                                    {flight.destination_airport || 'Unknown'}
                                                </span>
                                                
                                                <span>ETA:</span>
                                                <span className="font-mono text-right">
                                                    {flight.eta_minutes 
                                                        ? (currentTime >= flight.eta_minutes ? 'Arrived' : formatTime(flight.eta_minutes - currentTime))
                                                        : 'N/A'
                                                    }
                                                </span>
                                            </div>
                                            
                                            {selectedFlight === flight.flight_id && (
                                                <div className="mt-2 pt-2 border-t border-slate-600 text-xs space-y-1">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Position:</span>
                                                        <span className="font-mono">{pos.lat.toFixed(4)}, {pos.lon.toFixed(4)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Heading:</span>
                                                        <span className="font-mono">{Math.round(flight.heading_deg)}°</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Nearest Airport:</span>
                                                        <span className="font-mono text-emerald-400">
                                                            {nearestAirport.code} ({nearestAirport.distance_nm.toFixed(1)} nm)
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Map */}
                    <div className="flex-1 relative">
                        <div ref={mapContainer} className="absolute inset-0" />
                        
                        {/* Simulation Info Overlay */}
                        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-4 border border-slate-700 max-w-xs">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <Target className="size-5 text-cyan-400" />
                                Airspace Simulation
                            </h2>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <span className="text-slate-400">Simulation Time:</span>
                                <span className="font-mono text-cyan-400">+{formatTime(currentTime)}</span>
                                
                                <span className="text-slate-400">Active Flights:</span>
                                <span className="font-mono">{flights.filter(f => currentTime < (f.eta_minutes || maxTime)).length}</span>
                                
                                <span className="text-slate-400">Landed:</span>
                                <span className="font-mono text-emerald-400">
                                    {flights.filter(f => currentTime >= (f.eta_minutes || maxTime)).length}
                                </span>
                            </div>
                        </div>

                        {/* Proximity Warnings */}
                        {proximityWarnings.length > 0 && (
                            <div className="absolute top-4 right-20 bg-red-900/90 backdrop-blur-sm rounded-lg p-3 border border-red-500/50 max-w-xs">
                                <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-2">
                                    <AlertTriangle className="size-4" />
                                    Proximity Warnings
                                </h3>
                                <div className="space-y-1">
                                    {proximityWarnings.slice(0, 3).map((w, i) => (
                                        <div 
                                            key={i}
                                            className={clsx(
                                                "text-xs px-2 py-1 rounded",
                                                w.severity === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                                            )}
                                        >
                                            {w.flight1} ↔ {w.flight2}: {w.distance.toFixed(1)} nm
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className="absolute bottom-24 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
                            <h4 className="text-xs font-medium text-slate-400 mb-2">Legend</h4>
                            <div className="space-y-1 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-1 rounded bg-emerald-500" />
                                    <span className="text-slate-300">Your Planned Route</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-blue-400" />
                                    <span className="text-slate-300">Real Traffic</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                                    <span className="text-slate-300">Simulated Traffic</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="bg-slate-900 border-t border-slate-700 p-4 z-40">
                    {/* Time Slider */}
                    <div className="flex items-center gap-4 mb-4">
                        <span className="text-xs font-mono text-slate-400 min-w-[60px]">Now</span>
                        <input 
                            type="range" 
                            min={0} 
                            max={maxTime} 
                            step={0.5}
                            value={currentTime}
                            onChange={(e) => setCurrentTime(Number(e.target.value))}
                            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <span className="text-xs font-mono text-slate-400 min-w-[60px] text-right">+{formatTime(maxTime)}</span>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
                                {[1, 5, 10, 30, 60].map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setSpeed(s)} 
                                        className={clsx(
                                            "px-2 py-1 text-xs font-bold rounded transition-colors",
                                            speed === s ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
                                        )}
                                    >
                                        {s}x
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs text-slate-500">Speed</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setCurrentTime(0)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <SkipBack className="size-5" />
                            </button>
                            
                            <button 
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white p-3 rounded-full transition-transform active:scale-95 shadow-lg shadow-cyan-500/20"
                            >
                                {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current pl-0.5" />}
                            </button>

                            <button 
                                onClick={() => setCurrentTime(maxTime)}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <SkipForward className="size-5" />
                            </button>
                        </div>

                        <div className="text-sm text-slate-400 min-w-[200px] text-right">
                            <span className="font-mono text-cyan-400">+{formatTime(currentTime)}</span>
                            <span className="mx-2">/</span>
                            <span className="font-mono">{formatTime(maxTime)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

