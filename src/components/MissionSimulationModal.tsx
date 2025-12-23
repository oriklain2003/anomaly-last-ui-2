import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
    X, Play, Pause, SkipBack, SkipForward, 
    Plane, AlertTriangle, Clock, 
    Target, Shield,
    ChevronDown, ChevronUp
} from 'lucide-react';
import type { 
    TrafficAircraft, 
    AdvancedPlannedRoute, 
    RouteWaypoint
} from '../api';

// ============================================================
// Types
// ============================================================

interface AttackTarget {
    id: string;
    lat: number;
    lon: number;
    name: string;
    priority: 'high' | 'medium' | 'low';
    type: 'primary' | 'secondary' | 'opportunity';
    ammoRequired: number;
}

interface MissionAircraft {
    id: string;
    callsign: string;
    ammoCapacity: number;
    assignedTargets: string[];
    route?: AdvancedPlannedRoute;
    color: string;
}

interface AttackMission {
    id: string;
    name: string;
    aircraft: MissionAircraft[];
    targets: AttackTarget[];
    zones: any[];
    coordinatedTiming: boolean;
}

interface SimulatedMissionFlight {
    flight_id: string;
    callsign: string;
    current_lat: number;
    current_lon: number;
    current_alt_ft: number;
    heading_deg: number;
    speed_kts: number;
    predicted_path: Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }>;
    eta_minutes: number | null;
    color: string;
    is_mission_aircraft: boolean;
    assigned_targets: string[];
    status: 'en_route' | 'attacking' | 'rtb' | 'landed';
}

interface MissionSimulationModalProps {
    mission: AttackMission;
    origin: RouteWaypoint;
    traffic: TrafficAircraft[];
    attackTargets: AttackTarget[];
    onClose: () => void;
}

// ============================================================
// Missile Types and Physics
// ============================================================

interface Missile {
    id: string;
    launcherId: string;
    targetId: string;
    lat: number;
    lon: number;
    alt_ft: number;
    heading_deg: number;
    speed_kts: number;
    launchTime: number;
    status: 'flying' | 'hit' | 'miss';
    trail: Array<{ lat: number; lon: number }>;
    guidanceMode: 'midcourse' | 'terminal';
    prev_los_angle: number | null;
}

// Missile constants
const MISSILE_SPEED_KTS = 2000; // Mach 3 ~ 2000 kts
const MISSILE_MAX_RANGE_NM = 30;
const MISSILE_HIT_RADIUS_NM = 0.5;
const NAV_CONSTANT = 4; // Proportional Navigation constant (N)

// ============================================================
// Constants
// ============================================================

const MAP_STYLE = 'https://api.maptiler.com/maps/darkmatter/style.json?key=r7kaQpfNDVZdaVp23F1r';

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

const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
};

const interpolatePosition = (
    path: Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }>,
    timeMinutes: number
): { lat: number; lon: number; alt: number; heading: number } | null => {
    if (!path || path.length === 0) return null;
    
    // Before start
    if (timeMinutes <= path[0].time_offset_min) {
        const heading = path.length > 1 
            ? getBearing(path[0].lat, path[0].lon, path[1].lat, path[1].lon)
            : 0;
        return { lat: path[0].lat, lon: path[0].lon, alt: path[0].alt_ft, heading };
    }
    
    // After end
    if (timeMinutes >= path[path.length - 1].time_offset_min) {
        const heading = path.length > 1 
            ? getBearing(path[path.length - 2].lat, path[path.length - 2].lon, path[path.length - 1].lat, path[path.length - 1].lon)
            : 0;
        return { lat: path[path.length - 1].lat, lon: path[path.length - 1].lon, alt: path[path.length - 1].alt_ft, heading };
    }
    
    // Find segment
    for (let i = 0; i < path.length - 1; i++) {
        if (timeMinutes >= path[i].time_offset_min && timeMinutes <= path[i + 1].time_offset_min) {
            const t = (timeMinutes - path[i].time_offset_min) / (path[i + 1].time_offset_min - path[i].time_offset_min);
            const lat = path[i].lat + t * (path[i + 1].lat - path[i].lat);
            const lon = path[i].lon + t * (path[i + 1].lon - path[i].lon);
            const alt = path[i].alt_ft + t * (path[i + 1].alt_ft - path[i].alt_ft);
            const heading = getBearing(path[i].lat, path[i].lon, path[i + 1].lat, path[i + 1].lon);
            return { lat, lon, alt, heading };
        }
    }
    
    return null;
};

// ============================================================
// Missile Physics - Proportional Navigation
// ============================================================

/**
 * Update missile position using Proportional Navigation guidance law.
 * PN commands acceleration proportional to LOS rate: a_c = N * V_c * LOS_rate
 */
const updateMissilePN = (
    missile: Missile,
    targetLat: number,
    targetLon: number,
    deltaTimeMin: number
): Missile => {
    const dtHours = deltaTimeMin / 60;
    
    // Calculate current LOS angle to target
    const losAngle = getBearing(missile.lat, missile.lon, targetLat, targetLon);
    
    // Calculate LOS rate (deg/min)
    let losRate = 0;
    if (missile.prev_los_angle !== null) {
        let angleDiff = losAngle - missile.prev_los_angle;
        // Normalize to -180 to 180
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;
        losRate = angleDiff / deltaTimeMin;
    }
    
    // Distance to target
    const distToTarget = getDistanceNM(missile.lat, missile.lon, targetLat, targetLon);
    
    // PN commanded turn rate: turn_rate = N * LOS_rate
    const commandedTurnRate = NAV_CONSTANT * losRate; // deg/min
    
    // Calculate new heading
    let newHeading = missile.heading_deg + commandedTurnRate * deltaTimeMin;
    // Normalize
    while (newHeading >= 360) newHeading -= 360;
    while (newHeading < 0) newHeading += 360;
    
    // Move missile along new heading
    const distanceTraveled = MISSILE_SPEED_KTS * dtHours; // NM
    
    // Convert heading to radians
    const headingRad = newHeading * Math.PI / 180;
    
    // Approximate lat/lon change
    const latDegPerNm = 1 / 60;
    const lonDegPerNm = 1 / (60 * Math.cos(missile.lat * Math.PI / 180));
    
    const newLat = missile.lat + distanceTraveled * Math.cos(headingRad) * latDegPerNm;
    const newLon = missile.lon + distanceTraveled * Math.sin(headingRad) * lonDegPerNm;
    
    // Update trail (keep last 20 points)
    const newTrail = [...missile.trail, { lat: missile.lat, lon: missile.lon }];
    if (newTrail.length > 20) newTrail.shift();
    
    // Check for hit
    const newDistToTarget = getDistanceNM(newLat, newLon, targetLat, targetLon);
    const isHit = newDistToTarget < MISSILE_HIT_RADIUS_NM;
    
    // Check for miss (flew past)
    const isMiss = newDistToTarget > distToTarget && distToTarget < 2; // Flew past
    
    return {
        ...missile,
        lat: newLat,
        lon: newLon,
        heading_deg: newHeading,
        prev_los_angle: losAngle,
        trail: newTrail,
        status: isHit ? 'hit' : (isMiss ? 'miss' : 'flying'),
        guidanceMode: distToTarget < 5 ? 'terminal' : 'midcourse',
    };
};

/**
 * Check if aircraft should launch missile at target
 */
const shouldLaunchMissile = (
    aircraftLat: number,
    aircraftLon: number,
    targetLat: number,
    targetLon: number,
    existingMissiles: Missile[],
    targetId: string
): boolean => {
    const distance = getDistanceNM(aircraftLat, aircraftLon, targetLat, targetLon);
    
    // Check if within launch range
    if (distance > MISSILE_MAX_RANGE_NM || distance < 2) return false;
    
    // Check if already have active missile on this target
    const hasActiveMissile = existingMissiles.some(
        m => m.targetId === targetId && m.status === 'flying'
    );
    if (hasActiveMissile) return false;
    
    return true;
};

/**
 * Create a new missile
 */
const createMissile = (
    launcherId: string,
    targetId: string,
    launcherLat: number,
    launcherLon: number,
    launcherAlt: number,
    launcherHeading: number,
    launchTime: number
): Missile => ({
    id: `missile_${launcherId}_${targetId}_${Date.now()}`,
    launcherId,
    targetId,
    lat: launcherLat,
    lon: launcherLon,
    alt_ft: launcherAlt,
    heading_deg: launcherHeading,
    speed_kts: MISSILE_SPEED_KTS,
    launchTime,
    status: 'flying',
    trail: [],
    guidanceMode: 'midcourse',
    prev_los_angle: null,
});

// ============================================================
// Main Component
// ============================================================

export const MissionSimulationModal: React.FC<MissionSimulationModalProps> = ({
    mission,
    origin,
    traffic,
    attackTargets,
    onClose
}) => {
    const [mapContainerReady, setMapContainerReady] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const map = useRef<maplibregl.Map | null>(null);
    
    // Callback ref to detect when the container is mounted
    const setMapContainer = (node: HTMLDivElement | null) => {
        mapContainerRef.current = node;
        if (node) {
            setMapContainerReady(true);
        }
    };
    
    const [flights, setFlights] = useState<SimulatedMissionFlight[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(10);
    const [maxTime, setMaxTime] = useState(120);
    const [expandedPanel, setExpandedPanel] = useState<'mission' | 'warnings'>('mission');
    const [destroyedTargets, setDestroyedTargets] = useState<Set<string>>(new Set());
    const [missiles, setMissiles] = useState<Missile[]>([]);
    const [missileEvents, setMissileEvents] = useState<Array<{ time: number; type: 'launch' | 'hit' | 'miss'; targetName: string; aircraftCallsign: string }>>([]);
    const prevTimeRef = useRef<number>(0);

    // Initialize flights from mission
    useEffect(() => {
        const missionFlights: SimulatedMissionFlight[] = [];
        let maxEta = 0;

        // Add mission aircraft
        for (const aircraft of mission.aircraft) {
            // Build the path from either planned_path or centerline
            let path: Array<{ lat: number; lon: number; alt_ft: number; time_offset_min: number }> = [];
            
            if (aircraft.route && aircraft.route.planned_path && aircraft.route.planned_path.length > 0) {
                // Use planned_path if available
                path = aircraft.route.planned_path.map(p => ({
                    lat: p.lat,
                    lon: p.lon,
                    alt_ft: p.alt_ft,
                    time_offset_min: p.time_offset_min
                }));
            } else if (aircraft.route && aircraft.route.centerline && aircraft.route.centerline.length > 0) {
                // Fall back to centerline and compute time offsets
                const speedKts = 500; // Assume fighter jet speed
                let cumulativeDistanceNm = 0;
                
                path = aircraft.route.centerline.map((p, i, arr) => {
                    if (i > 0) {
                        const prevP = arr[i - 1];
                        const dist = getDistanceNM(prevP.lat, prevP.lon, p.lat, p.lon);
                        cumulativeDistanceNm += dist;
                    }
                    const timeOffsetMin = (cumulativeDistanceNm / speedKts) * 60;
                    return {
                        lat: p.lat,
                        lon: p.lon,
                        alt_ft: p.alt || 30000,
                        time_offset_min: timeOffsetMin
                    };
                });
            } else {
                // No route data - create a simple direct path from origin to targets
                
                // Start at origin
                path.push({
                    lat: origin.lat,
                    lon: origin.lon,
                    alt_ft: 0,
                    time_offset_min: 0
                });
                
                // Climb to cruise
                path.push({
                    lat: origin.lat,
                    lon: origin.lon,
                    alt_ft: 30000,
                    time_offset_min: 5
                });
                
                // Add each target as a waypoint
                let timeOffset = 10;
                for (const targetId of aircraft.assignedTargets) {
                    const target = attackTargets.find(t => t.id === targetId);
                    if (target) {
                        path.push({
                            lat: target.lat,
                            lon: target.lon,
                            alt_ft: 30000,
                            time_offset_min: timeOffset
                        });
                        timeOffset += 15;
                    }
                }
                
                // Return to base
                path.push({
                    lat: origin.lat,
                    lon: origin.lon,
                    alt_ft: 30000,
                    time_offset_min: timeOffset
                });
                path.push({
                    lat: origin.lat,
                    lon: origin.lon,
                    alt_ft: 0,
                    time_offset_min: timeOffset + 5
                });
            }
            
            if (path.length === 0) {
                continue;
            }

            const eta = path[path.length - 1].time_offset_min;
            if (eta > maxEta) maxEta = eta;

            missionFlights.push({
                flight_id: aircraft.id,
                callsign: aircraft.callsign,
                current_lat: path[0]?.lat || origin.lat,
                current_lon: path[0]?.lon || origin.lon,
                current_alt_ft: path[0]?.alt_ft || 0,
                heading_deg: 0,
                speed_kts: 500,
                predicted_path: path,
                eta_minutes: eta,
                color: aircraft.color,
                is_mission_aircraft: true,
                assigned_targets: aircraft.assignedTargets,
                status: 'en_route'
            });
        }

        // Add other traffic
        for (let i = 0; i < Math.min(traffic.length, 10); i++) {
            const t = traffic[i];
            if (t.is_simulated) continue;

            missionFlights.push({
                flight_id: t.flight_id,
                callsign: t.callsign || `Traffic ${i + 1}`,
                current_lat: t.lat,
                current_lon: t.lon,
                current_alt_ft: t.alt_ft,
                heading_deg: t.heading_deg,
                speed_kts: t.speed_kts,
                predicted_path: [],
                eta_minutes: null,
                color: '#64748b',
                is_mission_aircraft: false,
                assigned_targets: [],
                status: 'en_route'
            });
        }

        setFlights(missionFlights);
        setMaxTime(Math.max(maxEta + 10, 60));
        setLoading(false);
    }, [mission, traffic, origin]);

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current || !mapContainerReady || map.current) {
            return;
        }
        map.current = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE,
            center: [origin.lon, origin.lat],
            zoom: 7,
            attributionControl: false,
        });

        map.current.on('load', () => {
            // Add routes source
            map.current!.addSource('mission-routes', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'mission-routes-line',
                type: 'line',
                source: 'mission-routes',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 3,
                    'line-opacity': 0.8,
                }
            });

            // Add targets source
            map.current!.addSource('targets', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'targets-circle',
                type: 'circle',
                source: 'targets',
                paint: {
                    'circle-radius': ['case', ['get', 'destroyed'], 6, 10],
                    'circle-color': ['case',
                        ['get', 'destroyed'], '#22c55e',
                        ['==', ['get', 'priority'], 'high'], '#dc2626',
                        ['==', ['get', 'priority'], 'medium'], '#f59e0b',
                        '#22c55e'
                    ],
                    'circle-stroke-width': ['case', ['get', 'destroyed'], 1, 3],
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': ['case', ['get', 'destroyed'], 0.5, 1],
                }
            });

            // Add aircraft source
            map.current!.addSource('aircraft', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'aircraft-symbols',
                type: 'circle',
                source: 'aircraft',
                paint: {
                    'circle-radius': ['case', ['get', 'isMission'], 10, 6],
                    'circle-color': ['get', 'color'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                }
            });

            // Add missile trails source
            map.current!.addSource('missile-trails', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'missile-trails-line',
                type: 'line',
                source: 'missile-trails',
                paint: {
                    'line-color': '#ff6b6b',
                    'line-width': 2,
                    'line-opacity': 0.7,
                    'line-dasharray': [2, 2],
                }
            });

            // Add missiles source
            map.current!.addSource('missiles', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'missiles-circle',
                type: 'circle',
                source: 'missiles',
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#ff6b6b',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                }
            });

            // Add explosions source
            map.current!.addSource('explosions', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'explosions-circle',
                type: 'circle',
                source: 'explosions',
                paint: {
                    'circle-radius': 15,
                    'circle-color': '#ff8c00',
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffff00',
                }
            });

            // Add base marker
            new maplibregl.Marker({ color: '#22c55e' })
                .setLngLat([origin.lon, origin.lat])
                .setPopup(new maplibregl.Popup().setHTML(`<strong>Base</strong><br/>${origin.name || 'Home Base'}`))
                .addTo(map.current!);
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [origin, mapContainerReady]);

    // Update map layers
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) {
            return;
        }

        // Update routes
        const routeSource = map.current.getSource('mission-routes') as maplibregl.GeoJSONSource;
        
        if (routeSource) {
            const routeFeatures = flights
                .filter(f => f.is_mission_aircraft && f.predicted_path.length > 0)
                .map(f => ({
                    type: 'Feature' as const,
                    properties: { color: f.color, callsign: f.callsign },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: f.predicted_path.map(p => [p.lon, p.lat])
                    }
                }));
            routeSource.setData({ type: 'FeatureCollection', features: routeFeatures });
        }

        // Update targets
        const targetSource = map.current.getSource('targets') as maplibregl.GeoJSONSource;
        if (targetSource) {
            const targetFeatures = attackTargets.map(t => ({
                type: 'Feature' as const,
                properties: { 
                    id: t.id, 
                    name: t.name, 
                    priority: t.priority,
                    destroyed: destroyedTargets.has(t.id)
                },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [t.lon, t.lat]
                }
            }));
            targetSource.setData({ type: 'FeatureCollection', features: targetFeatures });
        }

        // Update aircraft positions
        const aircraftSource = map.current.getSource('aircraft') as maplibregl.GeoJSONSource;
        
        if (aircraftSource) {
            const aircraftFeatures = flights.map(f => {
                let pos = { lat: f.current_lat, lon: f.current_lon, alt: f.current_alt_ft, heading: f.heading_deg };
                
                if (f.is_mission_aircraft && f.predicted_path.length > 0) {
                    const interpolated = interpolatePosition(f.predicted_path, currentTime);
                    if (interpolated) {
                        pos = interpolated;
                    }
                }

                return {
                    type: 'Feature' as const,
                    properties: { 
                        id: f.flight_id, 
                        callsign: f.callsign, 
                        color: f.color,
                        isMission: f.is_mission_aircraft,
                        heading: pos.heading
                    },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [pos.lon, pos.lat]
                    }
                };
            });
            aircraftSource.setData({ type: 'FeatureCollection', features: aircraftFeatures });
        }

        // Update missiles
        const missileSource = map.current.getSource('missiles') as maplibregl.GeoJSONSource;
        if (missileSource) {
            const missileFeatures = missiles
                .filter(m => m.status === 'flying')
                .map(m => ({
                    type: 'Feature' as const,
                    properties: { id: m.id, heading: m.heading_deg },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [m.lon, m.lat]
                    }
                }));
            missileSource.setData({ type: 'FeatureCollection', features: missileFeatures });
        }

        // Update missile trails
        const trailSource = map.current.getSource('missile-trails') as maplibregl.GeoJSONSource;
        if (trailSource) {
            const trailFeatures = missiles
                .filter(m => m.trail.length > 1)
                .map(m => ({
                    type: 'Feature' as const,
                    properties: { id: m.id },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: [...m.trail.map(p => [p.lon, p.lat]), [m.lon, m.lat]]
                    }
                }));
            trailSource.setData({ type: 'FeatureCollection', features: trailFeatures });
        }

        // Update explosions (recently hit missiles)
        const explosionSource = map.current.getSource('explosions') as maplibregl.GeoJSONSource;
        if (explosionSource) {
            const explosionFeatures = missiles
                .filter(m => m.status === 'hit')
                .map(m => ({
                    type: 'Feature' as const,
                    properties: { id: m.id },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [m.lon, m.lat]
                    }
                }));
            explosionSource.setData({ type: 'FeatureCollection', features: explosionFeatures });
        }
    }, [flights, currentTime, attackTargets, destroyedTargets, missiles]);

    // Check for target destruction
    useEffect(() => {
        const newDestroyed = new Set(destroyedTargets);
        
        for (const flight of flights) {
            if (!flight.is_mission_aircraft) continue;
            
            const pos = flight.predicted_path.length > 0 
                ? interpolatePosition(flight.predicted_path, currentTime)
                : null;
            
            if (!pos) continue;

            for (const targetId of flight.assigned_targets) {
                if (newDestroyed.has(targetId)) continue;
                
                const target = attackTargets.find(t => t.id === targetId);
                if (!target) {
                    console.warn(`Target ${targetId} not found in attackTargets`, attackTargets.map(t => t.id));
                    continue;
                }

                const dist = getDistanceNM(pos.lat, pos.lon, target.lat, target.lon);
                
                // Log distance to targets periodically
                if (Math.floor(currentTime) % 5 === 0 && currentTime - Math.floor(currentTime) < 0.2) {
                    console.log(`T+${currentTime.toFixed(1)}: ${flight.callsign} -> ${target.name}: ${dist.toFixed(1)}nm (pos: ${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)})`);
                }
                
                if (dist < 2) { // Within 2nm = target destroyed
                    console.log(`TARGET DESTROYED: ${target.name} at T+${currentTime.toFixed(1)}`);
                    newDestroyed.add(targetId);
                }
            }
        }

        if (newDestroyed.size !== destroyedTargets.size) {
            setDestroyedTargets(newDestroyed);
        }
    }, [currentTime, flights, attackTargets, destroyedTargets]);

    // Playback timer with missile physics
    useEffect(() => {
        if (!isPlaying) return;

        const interval = setInterval(() => {
            setCurrentTime(prev => {
                const next = prev + (playbackSpeed / 60);
                const deltaTime = next - prevTimeRef.current;
                prevTimeRef.current = next;
                
                // Update missiles with PN guidance
                setMissiles(currentMissiles => {
                    const updatedMissiles = currentMissiles.map(missile => {
                        if (missile.status !== 'flying') return missile;
                        
                        // Find target position
                        const target = attackTargets.find(t => t.id === missile.targetId);
                        if (!target) return { ...missile, status: 'miss' as const };
                        
                        // Update missile using Proportional Navigation
                        return updateMissilePN(missile, target.lat, target.lon, deltaTime);
                    });
                    
                    // Check for hits and update destroyed targets
                    const newHits = updatedMissiles.filter(m => m.status === 'hit' && currentMissiles.find(cm => cm.id === m.id)?.status === 'flying');
                    if (newHits.length > 0) {
                        setDestroyedTargets(prev => {
                            const newSet = new Set(prev);
                            newHits.forEach(m => newSet.add(m.targetId));
                            return newSet;
                        });
                        
                        // Log events
                        newHits.forEach(m => {
                            const target = attackTargets.find(t => t.id === m.targetId);
                            const aircraft = flights.find(f => f.flight_id === m.launcherId);
                            setMissileEvents(evts => [...evts, {
                                time: next,
                                type: 'hit',
                                targetName: target?.name || 'Unknown',
                                aircraftCallsign: aircraft?.callsign || 'Unknown'
                            }]);
                        });
                    }
                    
                    return updatedMissiles;
                });
                
                // Check for new missile launches
                const missionFlights = flights.filter(f => f.is_mission_aircraft);
                for (const flight of missionFlights) {
                    const pos = flight.predicted_path.length > 0
                        ? interpolatePosition(flight.predicted_path, next)
                        : null;
                    if (!pos) continue;
                    
                    for (const targetId of flight.assigned_targets) {
                        const target = attackTargets.find(t => t.id === targetId);
                        if (!target || destroyedTargets.has(targetId)) continue;
                        
                        setMissiles(currentMissiles => {
                            if (shouldLaunchMissile(pos.lat, pos.lon, target.lat, target.lon, currentMissiles, targetId)) {
                                const newMissile = createMissile(
                                    flight.flight_id,
                                    targetId,
                                    pos.lat,
                                    pos.lon,
                                    pos.alt,
                                    pos.heading,
                                    next
                                );
                                
                                setMissileEvents(evts => [...evts, {
                                    time: next,
                                    type: 'launch',
                                    targetName: target.name,
                                    aircraftCallsign: flight.callsign
                                }]);
                                
                                return [...currentMissiles, newMissile];
                            }
                            return currentMissiles;
                        });
                    }
                }
                
                if (next >= maxTime) {
                    setIsPlaying(false);
                    return maxTime;
                }
                return next;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [isPlaying, playbackSpeed, maxTime, flights, attackTargets, destroyedTargets]);

    // Get proximity warnings
    const getProximityWarnings = useCallback(() => {
        const warnings: Array<{ flight1: string; flight2: string; distance: number; severity: 'critical' | 'warning' }> = [];
        
        const missionFlights = flights.filter(f => f.is_mission_aircraft);
        
        for (const mf of missionFlights) {
            const mfPos = mf.predicted_path.length > 0 
                ? interpolatePosition(mf.predicted_path, currentTime)
                : null;
            if (!mfPos) continue;

            for (const other of flights) {
                if (other.flight_id === mf.flight_id) continue;
                
                let otherPos;
                if (other.is_mission_aircraft && other.predicted_path.length > 0) {
                    otherPos = interpolatePosition(other.predicted_path, currentTime);
                } else {
                    otherPos = { lat: other.current_lat, lon: other.current_lon, alt: other.current_alt_ft };
                }
                if (!otherPos) continue;

                const dist = getDistanceNM(mfPos.lat, mfPos.lon, otherPos.lat, otherPos.lon);
                const altDiff = Math.abs(mfPos.alt - otherPos.alt);

                if (dist < 5 && altDiff < 1000) {
                    warnings.push({
                        flight1: mf.callsign,
                        flight2: other.callsign,
                        distance: dist,
                        severity: 'critical'
                    });
                } else if (dist < 10 && altDiff < 2000) {
                    warnings.push({
                        flight1: mf.callsign,
                        flight2: other.callsign,
                        distance: dist,
                        severity: 'warning'
                    });
                }
            }
        }
        return warnings;
    }, [flights, currentTime]);

    const warnings = getProximityWarnings();

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
                <div className="text-white">Loading mission simulation...</div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
                        <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Mission Simulation</h2>
                        <p className="text-sm text-slate-400">{mission.name} • {mission.aircraft.length} aircraft • {attackTargets.length} targets</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <X className="w-6 h-6 text-slate-400" />
                </button>
            </div>

            {/* Main content */}
            <div className="flex-1 flex">
                {/* Map */}
                <div className="flex-1 relative">
                    <div ref={setMapContainer} className="absolute inset-0" />
                    
                    {/* Time display */}
                    <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-slate-700">
                        <div className="flex items-center gap-2 text-white">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span className="font-mono text-lg">T+{Math.floor(currentTime)}:{String(Math.floor((currentTime % 1) * 60)).padStart(2, '0')}</span>
                        </div>
                    </div>

                    {/* Mission status */}
                    <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-slate-700">
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-red-400" />
                                <span className="text-white">{attackTargets.length - destroyedTargets.size} remaining</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-green-400" />
                                <span className="text-white">{destroyedTargets.size} destroyed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-white">{missiles.filter(m => m.status === 'flying').length} missiles</span>
                            </div>
                        </div>
                    </div>

                    {/* Missile events log */}
                    {missileEvents.length > 0 && (
                        <div className="absolute bottom-20 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700 max-h-32 overflow-y-auto w-64">
                            <div className="text-xs text-slate-400 mb-1 font-medium">Missile Activity</div>
                            {missileEvents.slice(-5).reverse().map((evt, i) => (
                                <div key={i} className={`text-xs py-0.5 ${evt.type === 'hit' ? 'text-green-400' : evt.type === 'launch' ? 'text-orange-400' : 'text-red-400'}`}>
                                    T+{evt.time.toFixed(1)}: {evt.aircraftCallsign} {evt.type === 'launch' ? '→' : evt.type === 'hit' ? '✓' : '✗'} {evt.targetName}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Side panel */}
                <div className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col">
                    {/* Mission Aircraft Panel */}
                    <div className="border-b border-slate-700">
                        <button
                            onClick={() => setExpandedPanel(expandedPanel === 'mission' ? 'warnings' : 'mission')}
                            className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50"
                        >
                            <div className="flex items-center gap-2">
                                <Plane className="w-5 h-5 text-red-400" />
                                <span className="font-medium text-white">Mission Aircraft</span>
                                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                                    {mission.aircraft.filter(a => a.assignedTargets.length > 0).length}
                                </span>
                            </div>
                            {expandedPanel === 'mission' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        
                        {expandedPanel === 'mission' && (
                            <div className="px-4 pb-4 space-y-2 max-h-60 overflow-y-auto">
                                {flights.filter(f => f.is_mission_aircraft).map(flight => {
                                    const pos = flight.predicted_path.length > 0 
                                        ? interpolatePosition(flight.predicted_path, currentTime)
                                        : null;
                                    const destroyedCount = flight.assigned_targets.filter(t => destroyedTargets.has(t)).length;
                                    
                                    return (
                                        <div
                                            key={flight.flight_id}
                                            className="p-3 rounded-lg bg-slate-800/50 border-l-4"
                                            style={{ borderLeftColor: flight.color }}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-mono text-white font-medium">{flight.callsign}</span>
                                                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                                                    {destroyedCount}/{flight.assigned_targets.length} targets
                                                </span>
                                            </div>
                                            {pos && (
                                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                                                    <div>Alt: {Math.round(pos.alt).toLocaleString()} ft</div>
                                                    <div>Hdg: {Math.round(pos.heading)}°</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Warnings Panel */}
                    <div className="border-b border-slate-700">
                        <button
                            onClick={() => setExpandedPanel(expandedPanel === 'warnings' ? 'mission' : 'warnings')}
                            className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50"
                        >
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                <span className="font-medium text-white">Proximity Warnings</span>
                                {warnings.length > 0 && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        warnings.some(w => w.severity === 'critical') 
                                            ? 'bg-red-500/20 text-red-400' 
                                            : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                        {warnings.length}
                                    </span>
                                )}
                            </div>
                            {expandedPanel === 'warnings' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        
                        {expandedPanel === 'warnings' && (
                            <div className="px-4 pb-4 space-y-2 max-h-40 overflow-y-auto">
                                {warnings.length === 0 ? (
                                    <div className="text-sm text-slate-500 text-center py-4">
                                        No proximity warnings
                                    </div>
                                ) : (
                                    warnings.map((w, i) => (
                                        <div
                                            key={i}
                                            className={`p-2 rounded text-xs ${
                                                w.severity === 'critical' 
                                                    ? 'bg-red-500/20 text-red-300' 
                                                    : 'bg-amber-500/20 text-amber-300'
                                            }`}
                                        >
                                            <span className="font-mono">{w.flight1}</span>
                                            <span className="text-slate-400"> ↔ </span>
                                            <span className="font-mono">{w.flight2}</span>
                                            <span className="text-slate-400"> • {w.distance.toFixed(1)} nm</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Targets List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            Targets
                        </h3>
                        <div className="space-y-2">
                            {attackTargets.map(target => {
                                const destroyed = destroyedTargets.has(target.id);
                                return (
                                    <div
                                        key={target.id}
                                        className={`p-2 rounded text-xs ${
                                            destroyed 
                                                ? 'bg-green-500/20 text-green-300 line-through opacity-60' 
                                                : target.priority === 'high' 
                                                    ? 'bg-red-500/20 text-red-300'
                                                    : target.priority === 'medium'
                                                        ? 'bg-amber-500/20 text-amber-300'
                                                        : 'bg-slate-700 text-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{target.name}</span>
                                            <span className="text-xs opacity-60">{destroyed ? '✓ Destroyed' : target.priority}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Playback controls */}
            <div className="bg-slate-900 border-t border-slate-700 px-6 py-4">
                <div className="flex items-center gap-4">
                    {/* Time slider */}
                    <div className="flex-1">
                        <input
                            type="range"
                            min="0"
                            max={maxTime}
                            step="0.1"
                            value={currentTime}
                            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>T+0:00</span>
                            <span>T+{Math.floor(maxTime)}:00</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentTime(0)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <SkipBack className="w-5 h-5 text-slate-400" />
                        </button>
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-3 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                        >
                            {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white" />}
                        </button>
                        <button
                            onClick={() => setCurrentTime(maxTime)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <SkipForward className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* Speed selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Speed:</span>
                        {[1, 10, 30, 60].map(speed => (
                            <button
                                key={speed}
                                onClick={() => setPlaybackSpeed(speed)}
                                className={`px-2 py-1 text-xs rounded ${
                                    playbackSpeed === speed 
                                        ? 'bg-red-600 text-white' 
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

