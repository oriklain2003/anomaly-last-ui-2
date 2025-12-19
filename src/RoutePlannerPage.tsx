import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
    fetchRouteAirports, 
    fetchAircraftProfiles,
    planAdvancedRoute,
    fetchRouteTraffic,
    refreshRouteTraffic,
    addSimulatedAircraft,
    clearSimulatedAircraft,
    fetchLearnedLayers,
    type RouteAirport, 
    type AdvancedPlannedRoute,
    type AdvancedRoutePlanResponse,
    type TrafficAircraft,
    type AircraftProfile,
    type RouteWaypoint,
    type LearnedPath,
} from './api';
import { SimulationModal } from './components/SimulationModal';
import { MissionSimulationModal } from './components/MissionSimulationModal';
import { 
    Plane, 
    MapPin, 
    Navigation, 
    ChevronLeft, 
    X, 
    Route,
    Ruler,
    Shield,
    Target,
    Loader2,
    AlertCircle,
    RefreshCw,
    Clock,
    AlertTriangle,
    Zap,
    Users,
    MousePointer,
    Pencil,
    Trash2,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    PlayCircle,
} from 'lucide-react';

// Map style
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Route colors
const ROUTE_COLORS = [
    '#22c55e', // green - best
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
];

// Conflict colors
const CONFLICT_COLORS = {
    critical: '#dc2626',
    conflict: '#f97316',
    warning: '#eab308',
    none: '#22c55e',
};

type MapMode = 'select' | 'waypoint' | 'draw-aircraft' | 'draw-zone' | 'draw-target';

// Zone types for tactical planning
interface TacticalZone {
    id: string;
    type: 'low-altitude' | 'high-altitude' | 'slow-speed' | 'high-speed' | 'no-fly';
    points: Array<{ lat: number; lon: number }>;
    altitude?: number;  // For altitude zones
    speed?: number;     // For speed zones
    color: string;
    name: string;
}

// Target for attack planning
interface AttackTarget {
    id: string;
    lat: number;
    lon: number;
    name: string;
    priority: 'high' | 'medium' | 'low';
    type: 'primary' | 'secondary' | 'opportunity';
    ammoRequired: number;
}

// Aircraft in attack mission
interface MissionAircraft {
    id: string;
    callsign: string;
    ammoCapacity: number;
    assignedTargets: string[];
    route?: AdvancedPlannedRoute;
    color: string;
}

// Mission plan
interface AttackMission {
    id: string;
    name: string;
    aircraft: MissionAircraft[];
    targets: AttackTarget[];
    zones: TacticalZone[];
    coordinatedTiming: boolean;
}

// Zone type configurations
const ZONE_CONFIGS = {
    'low-altitude': { color: '#22c55e', name: 'Low Altitude Zone', icon: '⬇️' },
    'high-altitude': { color: '#3b82f6', name: 'High Altitude Zone', icon: '⬆️' },
    'slow-speed': { color: '#f59e0b', name: 'Slow Speed Zone', icon: '🐢' },
    'high-speed': { color: '#8b5cf6', name: 'High Speed Zone', icon: '⚡' },
    'no-fly': { color: '#dc2626', name: 'No-Fly Zone', icon: '🚫' },
};

export const RoutePlannerPage: React.FC = () => {
    // State
    const [airports, setAirports] = useState<RouteAirport[]>([]);
    const [profiles, setProfiles] = useState<Record<string, AircraftProfile>>({});
    const [selectedAircraftType, setSelectedAircraftType] = useState<'fighter' | 'civil'>('civil');
    
    // Waypoints
    const [origin, setOrigin] = useState<RouteWaypoint | null>(null);
    const [destination, setDestination] = useState<RouteWaypoint | null>(null);
    const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
    
    // Route planning
    const [planResult, setPlanResult] = useState<AdvancedRoutePlanResponse | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<AdvancedPlannedRoute | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [, setLoadingAirports] = useState(true);
    
    // Traffic
    const [traffic, setTraffic] = useState<TrafficAircraft[]>([]);
    const [trafficLoading, setTrafficLoading] = useState(false);
    const [showTraffic, setShowTraffic] = useState(true);
    const [trafficCacheAge, setTrafficCacheAge] = useState<number | null>(null);
    
    // Map interaction mode
    const [mapMode, setMapMode] = useState<MapMode>('select');
    const [drawingPath, setDrawingPath] = useState<Array<{ lat: number; lon: number }>>([]);
    
    // Tactical Planning State
    const [tacticalZones, setTacticalZones] = useState<TacticalZone[]>([]);
    const [currentZoneType, setCurrentZoneType] = useState<TacticalZone['type']>('no-fly');
    const [drawingZone, setDrawingZone] = useState<Array<{ lat: number; lon: number }>>([]);
    const [zoneAltitude, setZoneAltitude] = useState<string>('5000');
    const [zoneSpeed, setZoneSpeed] = useState<string>('200');
    
    // Attack Planning State
    const [attackMode, setAttackMode] = useState(false);
    const [attackTargets, setAttackTargets] = useState<AttackTarget[]>([]);
    const [missionAircraft, setMissionAircraft] = useState<MissionAircraft[]>([]);
    const [currentTargetPriority, setCurrentTargetPriority] = useState<AttackTarget['priority']>('high');
    const [newAircraftCallsign, setNewAircraftCallsign] = useState('');
    const [newAircraftAmmo, setNewAircraftAmmo] = useState('4');
    const [missionPlan, setMissionPlan] = useState<AttackMission | null>(null);
    const [showMissionPanel, setShowMissionPanel] = useState(false);
    
    // Refs for map click handler (to avoid stale closure)
    const mapModeRef = useRef<MapMode>('select');
    const originRef = useRef<RouteWaypoint | null>(null);
    const destinationRef = useRef<RouteWaypoint | null>(null);
    const airportsRef = useRef<RouteAirport[]>([]);
    const attackModeRef = useRef(false);
    const currentTargetPriorityRef = useRef<AttackTarget['priority']>('high');
    
    // UI state
    const [expandedPanel, setExpandedPanel] = useState<'route' | 'traffic' | 'conflicts'>('route');
    const [customAltitude, setCustomAltitude] = useState<string>('');
    const [customSpeed, setCustomSpeed] = useState<string>('');
    
    // Simulated aircraft input
    const [simAircraftSpeed, setSimAircraftSpeed] = useState<string>('450');
    const [simAircraftAlt, setSimAircraftAlt] = useState<string>('35000');

    // Simulation modal
    const [showSimulation, setShowSimulation] = useState(false);
    const [showMissionSimulation, setShowMissionSimulation] = useState(false);
    const [learnedPaths, setLearnedPaths] = useState<LearnedPath[]>([]);

    // Layer visibility
    const [showLearnedPaths, setShowLearnedPaths] = useState(false);
    const [showUsedCorridors, setShowUsedCorridors] = useState(true);

    // Map refs
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const trafficMarkersRef = useRef<maplibregl.Marker[]>([]);

    // Load airports, profiles, and learned paths on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const [airportsData, profilesData, layersData] = await Promise.all([
                    fetchRouteAirports(),
                    fetchAircraftProfiles(),
                    fetchLearnedLayers(),
                ]);
                setAirports(airportsData.airports);
                setProfiles(profilesData.profiles);
                setLearnedPaths(layersData.paths || []);
            } catch (err) {
                setError('Failed to load data');
                console.error(err);
            } finally {
                setLoadingAirports(false);
            }
        };
        loadData();
    }, []);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [35.0, 32.0],
            zoom: 6,
            attributionControl: false,
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.current.on('load', () => {
            // Routes source
            map.current!.addSource('routes', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Route glow layer
            map.current!.addLayer({
                id: 'routes-glow',
                type: 'line',
                source: 'routes',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 10,
                    'line-opacity': ['case', ['get', 'isSelected'], 0.4, 0],
                    'line-blur': 4,
                },
            });

            // Route lines layer
            map.current!.addLayer({
                id: 'routes-line',
                type: 'line',
                source: 'routes',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': ['case', ['get', 'isSelected'], 4, 2],
                    'line-opacity': ['case', ['get', 'isSelected'], 1, 0.5],
                }
            });

            // Conflicts source
            map.current!.addSource('conflicts', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Conflict circles
            map.current!.addLayer({
                id: 'conflicts-circle',
                type: 'circle',
                source: 'conflicts',
                paint: {
                    'circle-radius': ['case',
                        ['==', ['get', 'severity'], 'critical'], 12,
                        ['==', ['get', 'severity'], 'conflict'], 10,
                        8
                    ],
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.6,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                }
            });

            // Traffic source
            map.current!.addSource('traffic', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Traffic layer
            map.current!.addLayer({
                id: 'traffic-symbols',
                type: 'circle',
                source: 'traffic',
                paint: {
                    'circle-radius': 6,
                    'circle-color': ['case', ['get', 'isSimulated'], '#f59e0b', '#60a5fa'],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff',
                }
            });

            // Drawing path source
            map.current!.addSource('drawing', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'drawing-line',
                type: 'line',
                source: 'drawing',
                paint: {
                    'line-color': '#f59e0b',
                    'line-width': 3,
                    'line-dasharray': [2, 2],
                }
            });

            // ============================================================
            // TACTICAL ZONES LAYER - No-fly, altitude, speed zones
            // ============================================================
            map.current!.addSource('tactical-zones', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Zone fill
            map.current!.addLayer({
                id: 'tactical-zones-fill',
                type: 'fill',
                source: 'tactical-zones',
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.2,
                }
            });

            // Zone outline
            map.current!.addLayer({
                id: 'tactical-zones-outline',
                type: 'line',
                source: 'tactical-zones',
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2,
                    'line-dasharray': [4, 2],
                }
            });

            // Zone drawing preview
            map.current!.addSource('zone-drawing', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            map.current!.addLayer({
                id: 'zone-drawing-line',
                type: 'line',
                source: 'zone-drawing',
                paint: {
                    'line-color': '#22c55e',
                    'line-width': 2,
                    'line-dasharray': [2, 2],
                }
            });

            // ============================================================
            // ATTACK TARGETS LAYER
            // ============================================================
            map.current!.addSource('attack-targets', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Target circles
            map.current!.addLayer({
                id: 'attack-targets-circle',
                type: 'circle',
                source: 'attack-targets',
                paint: {
                    'circle-radius': ['case',
                        ['==', ['get', 'priority'], 'high'], 12,
                        ['==', ['get', 'priority'], 'medium'], 10,
                        8
                    ],
                    'circle-color': ['case',
                        ['==', ['get', 'priority'], 'high'], '#dc2626',
                        ['==', ['get', 'priority'], 'medium'], '#f59e0b',
                        '#22c55e'
                    ],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff',
                }
            });

            // Target pulsing effect (outer ring)
            map.current!.addLayer({
                id: 'attack-targets-pulse',
                type: 'circle',
                source: 'attack-targets',
                paint: {
                    'circle-radius': ['case',
                        ['==', ['get', 'priority'], 'high'], 20,
                        ['==', ['get', 'priority'], 'medium'], 16,
                        12
                    ],
                    'circle-color': 'transparent',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': ['case',
                        ['==', ['get', 'priority'], 'high'], '#dc2626',
                        ['==', ['get', 'priority'], 'medium'], '#f59e0b',
                        '#22c55e'
                    ],
                    'circle-stroke-opacity': 0.5,
                }
            });

            // ============================================================
            // LEARNED PATHS LAYER - All corridors from the database
            // ============================================================
            map.current!.addSource('learned-paths', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Learned paths background (wider, semi-transparent)
            map.current!.addLayer({
                id: 'learned-paths-bg',
                type: 'line',
                source: 'learned-paths',
                paint: {
                    'line-color': '#6366f1',
                    'line-width': 8,
                    'line-opacity': 0.15,
                },
                layout: {
                    'visibility': 'none',
                }
            }, 'routes-glow'); // Insert below routes

            // Learned paths line
            map.current!.addLayer({
                id: 'learned-paths-line',
                type: 'line',
                source: 'learned-paths',
                paint: {
                    'line-color': '#6366f1',
                    'line-width': 1.5,
                    'line-opacity': 0.4,
                    'line-dasharray': [4, 2],
                },
                layout: {
                    'visibility': 'none',
                }
            }, 'routes-glow');

            // ============================================================
            // USED CORRIDORS LAYER - Corridors used in best route
            // ============================================================
            map.current!.addSource('used-corridors', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Used corridors background (wider, more visible)
            map.current!.addLayer({
                id: 'used-corridors-bg',
                type: 'line',
                source: 'used-corridors',
                paint: {
                    'line-color': '#10b981',
                    'line-width': 12,
                    'line-opacity': 0.25,
                },
            }, 'routes-glow');

            // Used corridors line
            map.current!.addLayer({
                id: 'used-corridors-line',
                type: 'line',
                source: 'used-corridors',
                paint: {
                    'line-color': '#10b981',
                    'line-width': 2,
                    'line-opacity': 0.7,
                    'line-dasharray': [6, 3],
                },
            }, 'routes-glow');
        });

        // Map click handler - use function that reads from refs to avoid stale closure
        map.current.on('click', (e: maplibregl.MapMouseEvent) => {
            const { lng, lat } = e.lngLat;
            const currentMode = mapModeRef.current;
            const currentOrigin = originRef.current;
            const currentDestination = destinationRef.current;
            const currentAirports = airportsRef.current;
            const isAttackMode = attackModeRef.current;
            const targetPriority = currentTargetPriorityRef.current;

            if (currentMode === 'waypoint') {
                // Check if clicking near an airport
                const nearbyAirport = currentAirports.find(a => 
                    Math.abs(a.lat - lat) < 0.1 && Math.abs(a.lon - lng) < 0.1
                );

                const newWaypoint: RouteWaypoint = nearbyAirport ? {
                    lat: nearbyAirport.lat,
                    lon: nearbyAirport.lon,
                    name: nearbyAirport.name,
                    airport_code: nearbyAirport.code,
                    is_airport: true,
                } : {
                    lat,
                    lon: lng,
                    name: `Custom Point`,
                };

                if (!currentOrigin) {
                    setOrigin(newWaypoint);
                } else if (!currentDestination) {
                    setDestination(newWaypoint);
                } else {
                    setWaypoints(prev => [...prev, newWaypoint]);
                }
            } else if (currentMode === 'draw-aircraft') {
                setDrawingPath(prev => [...prev, { lat, lon: lng }]);
            } else if (currentMode === 'draw-zone') {
                // Add point to zone polygon
                setDrawingZone(prev => [...prev, { lat, lon: lng }]);
            } else if (currentMode === 'draw-target' && isAttackMode) {
                // Add attack target
                const newTarget: AttackTarget = {
                    id: `target_${Date.now()}`,
                    lat,
                    lon: lng,
                    name: `Target ${attackTargets.length + 1}`,
                    priority: targetPriority,
                    type: targetPriority === 'high' ? 'primary' : targetPriority === 'medium' ? 'secondary' : 'opportunity',
                    ammoRequired: targetPriority === 'high' ? 2 : 1,
                };
                setAttackTargets(prev => [...prev, newTarget]);
            }
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Keep refs in sync with state for map click handler
    useEffect(() => {
        mapModeRef.current = mapMode;
    }, [mapMode]);

    useEffect(() => {
        originRef.current = origin;
    }, [origin]);

    useEffect(() => {
        destinationRef.current = destination;
    }, [destination]);

    useEffect(() => {
        airportsRef.current = airports;
    }, [airports]);

    useEffect(() => {
        attackModeRef.current = attackMode;
    }, [attackMode]);

    useEffect(() => {
        currentTargetPriorityRef.current = currentTargetPriority;
    }, [currentTargetPriority]);

    // Update map when routes change
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        const routeSource = map.current.getSource('routes') as maplibregl.GeoJSONSource;
        const conflictSource = map.current.getSource('conflicts') as maplibregl.GeoJSONSource;
        
        if (!routeSource) return;

        if (!planResult || !planResult.routes.length) {
            routeSource.setData({ type: 'FeatureCollection', features: [] });
            conflictSource?.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        // Create route features
        const routeFeatures = planResult.routes.map((route, index) => ({
            type: 'Feature' as const,
            properties: {
                id: route.path_id,
                color: ROUTE_COLORS[index % ROUTE_COLORS.length],
                isSelected: selectedRoute?.path_id === route.path_id,
            },
            geometry: {
                type: 'LineString' as const,
                coordinates: route.centerline.map(p => [p.lon, p.lat])
            }
        }));

        routeSource.setData({ type: 'FeatureCollection', features: routeFeatures });

        // Create conflict features
        const conflictFeatures: any[] = [];
        if (selectedRoute) {
            selectedRoute.conflicts.forEach(c => {
                conflictFeatures.push({
                    type: 'Feature',
                    properties: {
                        severity: c.severity,
                        color: CONFLICT_COLORS[c.severity as keyof typeof CONFLICT_COLORS] || CONFLICT_COLORS.warning,
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [c.planned_lon, c.planned_lat]
                    }
                });
            });
        }
        conflictSource?.setData({ type: 'FeatureCollection', features: conflictFeatures });

        // Add waypoint markers
        if (origin) {
            addWaypointMarker(origin, 'origin');
        }
        if (destination) {
            addWaypointMarker(destination, 'destination');
        }
        waypoints.forEach((wp, i) => {
            addWaypointMarker(wp, 'waypoint', i + 1);
        });

        // Fit bounds
        if (routeFeatures.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            routeFeatures.forEach(f => {
                f.geometry.coordinates.forEach(coord => {
                    bounds.extend(coord as [number, number]);
                });
            });
            map.current.fitBounds(bounds, { padding: 80, maxZoom: 10 });
        }
    }, [planResult, selectedRoute, origin, destination, waypoints]);

    // Update traffic on map
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        // Clear traffic markers
        trafficMarkersRef.current.forEach(m => m.remove());
        trafficMarkersRef.current = [];

        const trafficSource = map.current.getSource('traffic') as maplibregl.GeoJSONSource;
        if (!trafficSource) return;

        if (!showTraffic || traffic.length === 0) {
            trafficSource.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        const features = traffic.map(t => ({
            type: 'Feature' as const,
            properties: {
                flight_id: t.flight_id,
                callsign: t.callsign,
                isSimulated: t.is_simulated,
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [t.lon, t.lat]
            }
        }));

        trafficSource.setData({ type: 'FeatureCollection', features });
    }, [traffic, showTraffic]);

    // Update learned paths layer
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const source = map.current.getSource('learned-paths') as maplibregl.GeoJSONSource;
        if (!source) return;

        // Toggle visibility
        const visibility = showLearnedPaths ? 'visible' : 'none';
        map.current.setLayoutProperty('learned-paths-bg', 'visibility', visibility);
        map.current.setLayoutProperty('learned-paths-line', 'visibility', visibility);

        if (!showLearnedPaths || learnedPaths.length === 0) {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        // Create features for all learned paths
        const features = learnedPaths.map((path) => ({
            type: 'Feature' as const,
            properties: {
                id: path.id,
                origin: path.origin,
                destination: path.destination,
                member_count: path.member_count,
            },
            geometry: {
                type: 'LineString' as const,
                coordinates: path.centerline.map(p => [p.lon, p.lat])
            }
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [learnedPaths, showLearnedPaths]);

    // Update used corridors layer - show the FULL learned corridors that were used to build the route
    // Now uses corridor_ids from the API response for accurate corridor tracking
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const source = map.current.getSource('used-corridors') as maplibregl.GeoJSONSource;
        if (!source) return;

        // Toggle visibility
        const visibility = showUsedCorridors ? 'visible' : 'none';
        map.current.setLayoutProperty('used-corridors-bg', 'visibility', visibility);
        map.current.setLayoutProperty('used-corridors-line', 'visibility', visibility);

        if (!showUsedCorridors || !selectedRoute || !learnedPaths.length) {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        // For direct routes, no corridors are used
        if (selectedRoute.recommendation === 'direct') {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        // Use corridor_ids from the API response to find the exact corridors used
        const corridorIds = selectedRoute.corridor_ids || [];
        
        // Find the full corridor data for each ID
        const usedCorridors = learnedPaths.filter(corridor => 
            corridorIds.includes(corridor.id)
        );

        // If no corridor_ids were provided (older API), fall back to the previous heuristic
        if (corridorIds.length === 0 && (selectedRoute.recommendation === 'learned_corridor' || 
            selectedRoute.recommendation === 'chained_corridor' || 
            selectedRoute.recommendation === 'corridor_aware' ||
            selectedRoute.recommendation === 'best')) {
            
            // Fallback: Find corridors that match origin/destination
            const originCode = origin?.airport_code;
            const destCode = destination?.airport_code;
            
            if (originCode && destCode) {
                learnedPaths.forEach(corridor => {
                    if (!corridor.centerline || corridor.centerline.length < 2) return;
                    
                    // Check for O/D match (either direction)
                    if ((corridor.origin === originCode && corridor.destination === destCode) ||
                        (corridor.origin === destCode && corridor.destination === originCode)) {
                        usedCorridors.push(corridor);
                    }
                    // Also add corridors that start from origin or end at destination
                    else if (corridor.origin === originCode || corridor.destination === destCode) {
                        usedCorridors.push(corridor);
                    }
                });
            }
        }

        // Create features for used corridors - showing FULL corridor paths
        const features = usedCorridors.map((path) => ({
            type: 'Feature' as const,
            properties: {
                id: path.id,
                origin: path.origin,
                destination: path.destination,
                member_count: path.member_count,
            },
            geometry: {
                type: 'LineString' as const,
                coordinates: path.centerline.map(p => [p.lon, p.lat])
            }
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [selectedRoute, learnedPaths, showUsedCorridors, origin, destination]);

    // Update drawing path
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const drawingSource = map.current.getSource('drawing') as maplibregl.GeoJSONSource;
        if (!drawingSource) return;

        if (drawingPath.length < 2) {
            drawingSource.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        drawingSource.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: drawingPath.map(p => [p.lon, p.lat])
                }
            }]
        });
    }, [drawingPath]);

    // Update tactical zones layer
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const source = map.current.getSource('tactical-zones') as maplibregl.GeoJSONSource;
        if (!source) return;

        const features = tacticalZones.map(zone => ({
            type: 'Feature' as const,
            properties: {
                id: zone.id,
                type: zone.type,
                color: zone.color,
                name: zone.name,
                altitude: zone.altitude,
                speed: zone.speed,
            },
            geometry: {
                type: 'Polygon' as const,
                coordinates: [
                    [...zone.points.map(p => [p.lon, p.lat]), [zone.points[0].lon, zone.points[0].lat]]
                ]
            }
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [tacticalZones]);

    // Update zone drawing preview
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const source = map.current.getSource('zone-drawing') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (drawingZone.length < 2) {
            source.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        // Show polygon preview with closing line
        const coords = drawingZone.map(p => [p.lon, p.lat]);
        if (drawingZone.length >= 3) {
            coords.push([drawingZone[0].lon, drawingZone[0].lat]); // Close polygon
        }

        source.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                }
            }]
        });
    }, [drawingZone]);

    // Update attack targets layer
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        const source = map.current.getSource('attack-targets') as maplibregl.GeoJSONSource;
        if (!source) return;

        const features = attackTargets.map(target => ({
            type: 'Feature' as const,
            properties: {
                id: target.id,
                name: target.name,
                priority: target.priority,
                type: target.type,
                ammoRequired: target.ammoRequired,
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [target.lon, target.lat]
            }
        }));

        source.setData({ type: 'FeatureCollection', features });
    }, [attackTargets]);

    // Add waypoint marker helper
    const addWaypointMarker = (wp: RouteWaypoint, type: 'origin' | 'destination' | 'waypoint', index?: number) => {
        if (!map.current) return;

        const colors = {
            origin: '#22c55e',
            destination: '#ef4444',
            waypoint: '#3b82f6',
        };

        const el = document.createElement('div');
        el.className = 'waypoint-marker';
        el.innerHTML = `
            <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white" style="background: ${colors[type]}">
                <span class="text-white text-xs font-bold">${type === 'waypoint' ? index : type[0].toUpperCase()}</span>
            </div>
        `;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([wp.lon, wp.lat])
            .setPopup(new maplibregl.Popup().setHTML(`
                <strong>${wp.name || wp.airport_code || 'Custom Point'}</strong><br/>
                <span class="text-xs">${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}</span>
            `))
            .addTo(map.current);

        markersRef.current.push(marker);
    };

    // Handle plan route
    const handlePlanRoute = useCallback(async () => {
        if (!origin || !destination) {
            setError('Please set origin and destination');
            return;
        }

        setLoading(true);
        setError(null);
        setPlanResult(null);
        setSelectedRoute(null);

        try {
            // Convert tactical zones to API format
            const zonesForApi = tacticalZones.map(zone => ({
                id: zone.id,
                type: zone.type,
                points: zone.points,
                altitude: zone.altitude,
                speed: zone.speed,
            }));

            const result = await planAdvancedRoute(origin, destination, {
                waypoints: waypoints.length > 0 ? waypoints : undefined,
                aircraft_type: selectedAircraftType,
                altitude_ft: customAltitude ? parseFloat(customAltitude) : undefined,
                speed_kts: customSpeed ? parseFloat(customSpeed) : undefined,
                check_conflicts: true,
                tactical_zones: zonesForApi.length > 0 ? zonesForApi : undefined,
            });
            setPlanResult(result);
            if (result.best_route) {
                setSelectedRoute(result.best_route);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to plan route');
        } finally {
            setLoading(false);
        }
    }, [origin, destination, waypoints, selectedAircraftType, customAltitude, customSpeed]);

    // Handle refresh traffic
    const handleRefreshTraffic = useCallback(async () => {
        setTrafficLoading(true);
        try {
            const result = await refreshRouteTraffic();
            setTraffic(result.traffic);
            setTrafficCacheAge(0);
        } catch (err) {
            console.error('Failed to refresh traffic:', err);
        } finally {
            setTrafficLoading(false);
        }
    }, []);

    // Load cached traffic on mount
    useEffect(() => {
        const loadTraffic = async () => {
            try {
                const result = await fetchRouteTraffic();
                setTraffic(result.traffic);
                setTrafficCacheAge(result.cache_info.cache_age_seconds);
            } catch (err) {
                console.error('Failed to load traffic:', err);
            }
        };
        loadTraffic();
    }, []);

    // Handle finish drawing aircraft
    const handleFinishDrawing = useCallback(async () => {
        if (drawingPath.length < 2) {
            setError('Draw at least 2 points for the aircraft path');
            return;
        }

        try {
            await addSimulatedAircraft(
                `user_${Date.now()}`,
                drawingPath,
                parseFloat(simAircraftSpeed) || 450,
                parseFloat(simAircraftAlt) || 35000,
            );
            
            // Refresh traffic to show new aircraft
            const result = await fetchRouteTraffic();
            setTraffic(result.traffic);
            
            setDrawingPath([]);
            setMapMode('select');
        } catch (err: any) {
            setError(err.message || 'Failed to add aircraft');
        }
    }, [drawingPath, simAircraftSpeed, simAircraftAlt]);

    // Handle clear simulated
    const handleClearSimulated = useCallback(async () => {
        try {
            await clearSimulatedAircraft();
            const result = await fetchRouteTraffic();
            setTraffic(result.traffic);
        } catch (err) {
            console.error('Failed to clear simulated:', err);
        }
    }, []);

    // Handle finish drawing zone
    const handleFinishZone = useCallback(() => {
        if (drawingZone.length < 3) {
            setError('Draw at least 3 points to create a zone');
            return;
        }

        const config = ZONE_CONFIGS[currentZoneType];
        const newZone: TacticalZone = {
            id: `zone_${Date.now()}`,
            type: currentZoneType,
            points: [...drawingZone],
            color: config.color,
            name: `${config.name} ${tacticalZones.length + 1}`,
            altitude: currentZoneType.includes('altitude') ? parseFloat(zoneAltitude) : undefined,
            speed: currentZoneType.includes('speed') ? parseFloat(zoneSpeed) : undefined,
        };

        setTacticalZones(prev => [...prev, newZone]);
        setDrawingZone([]);
        setMapMode('select');
    }, [drawingZone, currentZoneType, zoneAltitude, zoneSpeed, tacticalZones.length]);

    // Delete a zone
    const handleDeleteZone = useCallback((zoneId: string) => {
        setTacticalZones(prev => prev.filter(z => z.id !== zoneId));
    }, []);

    // Delete a target
    const handleDeleteTarget = useCallback((targetId: string) => {
        setAttackTargets(prev => prev.filter(t => t.id !== targetId));
    }, []);

    // Add mission aircraft
    const handleAddMissionAircraft = useCallback(() => {
        if (!newAircraftCallsign.trim()) {
            setError('Enter a callsign for the aircraft');
            return;
        }

        const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
        const newAircraft: MissionAircraft = {
            id: `aircraft_${Date.now()}`,
            callsign: newAircraftCallsign.trim(),
            ammoCapacity: parseInt(newAircraftAmmo) || 4,
            assignedTargets: [],
            color: colors[missionAircraft.length % colors.length],
        };

        setMissionAircraft(prev => [...prev, newAircraft]);
        setNewAircraftCallsign('');
    }, [newAircraftCallsign, newAircraftAmmo, missionAircraft.length]);

    // Remove mission aircraft
    const handleRemoveMissionAircraft = useCallback((aircraftId: string) => {
        setMissionAircraft(prev => prev.filter(a => a.id !== aircraftId));
    }, []);

    // Generate attack mission plan
    const handleGenerateMissionPlan = useCallback(async () => {
        if (attackTargets.length === 0) {
            setError('Add at least one target');
            return;
        }
        if (missionAircraft.length === 0) {
            setError('Add at least one aircraft');
            return;
        }
        if (!origin) {
            setError('Set an origin (base) for the mission');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Calculate total ammo needed
            const totalAmmoNeeded = attackTargets.reduce((sum, t) => sum + t.ammoRequired, 0);
            const totalAmmoAvailable = missionAircraft.reduce((sum, a) => sum + a.ammoCapacity, 0);

            if (totalAmmoNeeded > totalAmmoAvailable) {
                setError(`Not enough ammo! Need ${totalAmmoNeeded}, have ${totalAmmoAvailable}`);
                setLoading(false);
                return;
            }

            // Sort targets by priority (high first)
            const sortedTargets = [...attackTargets].sort((a, b) => {
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });

            // Assign targets to aircraft (greedy algorithm)
            const assignedAircraft = missionAircraft.map(a => ({
                ...a,
                assignedTargets: [] as string[],
                remainingAmmo: a.ammoCapacity,
            }));

            for (const target of sortedTargets) {
                // Find aircraft with enough ammo that's closest to the target or has least assignments
                const availableAircraft = assignedAircraft
                    .filter(a => a.remainingAmmo >= target.ammoRequired)
                    .sort((a, b) => a.assignedTargets.length - b.assignedTargets.length);

                if (availableAircraft.length > 0) {
                    availableAircraft[0].assignedTargets.push(target.id);
                    availableAircraft[0].remainingAmmo -= target.ammoRequired;
                }
            }

            // Plan routes for each aircraft
            const aircraftWithRoutes = await Promise.all(
                assignedAircraft
                    .filter(a => a.assignedTargets.length > 0)
                    .map(async (aircraft) => {
                        // Build waypoints from assigned targets
                        const targetWaypoints = aircraft.assignedTargets.map(tid => {
                            const target = attackTargets.find(t => t.id === tid)!;
                            return {
                                lat: target.lat,
                                lon: target.lon,
                                name: target.name,
                            };
                        });

                        // Plan route through targets, returning to base
                        try {
                            const result = await planAdvancedRoute(
                                origin,
                                origin, // Return to base
                                {
                                    waypoints: targetWaypoints,
                                    aircraft_type: 'fighter',
                                    check_conflicts: true,
                                }
                            );
                            return {
                                ...aircraft,
                                route: result.best_route || undefined,
                            };
                        } catch {
                            return aircraft;
                        }
                    })
            );

            // Create mission plan
            const mission: AttackMission = {
                id: `mission_${Date.now()}`,
                name: `Strike Mission ${new Date().toLocaleTimeString()}`,
                aircraft: aircraftWithRoutes,
                targets: attackTargets,
                zones: tacticalZones,
                coordinatedTiming: true,
            };

            setMissionPlan(mission);
            setMissionAircraft(aircraftWithRoutes);
            setShowMissionPanel(true);
        } catch (err: any) {
            setError(err.message || 'Failed to generate mission plan');
        } finally {
            setLoading(false);
        }
    }, [attackTargets, missionAircraft, origin, tacticalZones]);

    // Clear mission
    const handleClearMission = useCallback(() => {
        setAttackTargets([]);
        setMissionAircraft([]);
        setMissionPlan(null);
        setAttackMode(false);
        setShowMissionPanel(false);
    }, []);

    // Clear waypoints
    const handleClearWaypoints = () => {
        setOrigin(null);
        setDestination(null);
        setWaypoints([]);
        setPlanResult(null);
        setSelectedRoute(null);
    };

    // Get conflict summary badge
    const getConflictBadge = (route: AdvancedPlannedRoute) => {
        if (route.conflict_count > 0) {
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    {route.conflict_count} conflicts
                </span>
            );
        }
        if (route.warning_count > 0) {
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    <AlertCircle className="w-3 h-3" />
                    {route.warning_count} warnings
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                <Shield className="w-3 h-3" />
                Clear
            </span>
        );
    };

    const currentProfile = profiles[selectedAircraftType];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Header */}
            <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 px-6 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                            <span>Back</span>
                        </Link>
                        <div className="h-6 w-px bg-slate-700" />
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                <Route className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold">Tactical Route Planner</h1>
                                <p className="text-xs text-slate-400">Advanced path planning with conflict detection</p>
                            </div>
                        </div>
                    </div>

                    {/* Aircraft Type Toggle */}
                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-800 rounded-lg p-1">
                            <button
                                onClick={() => setSelectedAircraftType('civil')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                    selectedAircraftType === 'civil'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Plane className="w-4 h-4 inline mr-2" />
                                Civil
                            </button>
                            <button
                                onClick={() => setSelectedAircraftType('fighter')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                    selectedAircraftType === 'fighter'
                                        ? 'bg-orange-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <Zap className="w-4 h-4 inline mr-2" />
                                Fighter
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex">
                {/* Left Panel */}
                <div className="w-[420px] bg-slate-900/50 border-r border-slate-800 flex flex-col overflow-hidden">
                    {/* Mode Toggle: Route Planning vs Attack Planning */}
                    <div className="p-3 border-b border-slate-800">
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setAttackMode(false); setMapMode('select'); }}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    !attackMode
                                        ? 'bg-cyan-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <Route className="w-4 h-4" />
                                Route Planning
                            </button>
                            <button
                                onClick={() => { setAttackMode(true); setMapMode('select'); setShowMissionPanel(true); }}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    attackMode
                                        ? 'bg-red-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <Target className="w-4 h-4" />
                                Attack Mission
                            </button>
                        </div>
                    </div>

                    {/* Map Mode Toolbar */}
                    <div className="p-4 border-b border-slate-800">
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => { setMapMode('select'); setDrawingPath([]); setDrawingZone([]); }}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    mapMode === 'select'
                                        ? 'bg-slate-700 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <MousePointer className="w-4 h-4" />
                                Select
                            </button>
                            <button
                                onClick={() => { setMapMode('waypoint'); setDrawingPath([]); setDrawingZone([]); }}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    mapMode === 'waypoint'
                                        ? 'bg-cyan-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <MapPin className="w-4 h-4" />
                                Point
                            </button>
                            <button
                                onClick={() => { setMapMode('draw-aircraft'); setDrawingPath([]); setDrawingZone([]); }}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    mapMode === 'draw-aircraft'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <Pencil className="w-4 h-4" />
                                Traffic
                            </button>
                            <button
                                onClick={() => { setMapMode('draw-zone'); setDrawingPath([]); setDrawingZone([]); }}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    mapMode === 'draw-zone'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <Shield className="w-4 h-4" />
                                Zone
                            </button>
                            {attackMode && (
                                <button
                                    onClick={() => { setMapMode('draw-target'); setDrawingPath([]); setDrawingZone([]); }}
                                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                        mapMode === 'draw-target'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <Target className="w-4 h-4" />
                                    Target
                                </button>
                            )}
                        </div>
                        
                        {mapMode === 'waypoint' && (
                            <p className="text-xs text-cyan-400 mt-2">
                                Click on the map to add {!origin ? 'origin' : !destination ? 'destination' : 'waypoint'}
                            </p>
                        )}

                        {mapMode === 'draw-zone' && (
                            <div className="mt-3 space-y-2">
                                <p className="text-xs text-purple-400">Click to draw zone polygon, then finish</p>
                                <select
                                    value={currentZoneType}
                                    onChange={(e) => setCurrentZoneType(e.target.value as TacticalZone['type'])}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                >
                                    <option value="no-fly">🚫 No-Fly Zone</option>
                                    <option value="low-altitude">⬇️ Low Altitude Zone</option>
                                    <option value="high-altitude">⬆️ High Altitude Zone</option>
                                    <option value="slow-speed">🐢 Slow Speed Zone</option>
                                    <option value="high-speed">⚡ High Speed Zone</option>
                                </select>
                                {currentZoneType.includes('altitude') && (
                                    <input
                                        type="number"
                                        placeholder="Altitude (ft)"
                                        value={zoneAltitude}
                                        onChange={(e) => setZoneAltitude(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                    />
                                )}
                                {currentZoneType.includes('speed') && (
                                    <input
                                        type="number"
                                        placeholder="Speed (kts)"
                                        value={zoneSpeed}
                                        onChange={(e) => setZoneSpeed(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                    />
                                )}
                                {drawingZone.length >= 3 && (
                                    <button
                                        onClick={handleFinishZone}
                                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium"
                                    >
                                        Create Zone ({drawingZone.length} points)
                                    </button>
                                )}
                            </div>
                        )}

                        {mapMode === 'draw-target' && (
                            <div className="mt-3 space-y-2">
                                <p className="text-xs text-red-400">Click on the map to add attack targets</p>
                                <select
                                    value={currentTargetPriority}
                                    onChange={(e) => setCurrentTargetPriority(e.target.value as AttackTarget['priority'])}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                >
                                    <option value="high">🔴 High Priority (2 ammo)</option>
                                    <option value="medium">🟠 Medium Priority (1 ammo)</option>
                                    <option value="low">🟢 Low Priority (1 ammo)</option>
                                </select>
                            </div>
                        )}
                        
                        {mapMode === 'draw-aircraft' && (
                            <div className="mt-3 space-y-2">
                                <p className="text-xs text-amber-400">Click to draw aircraft path, then set speed/altitude</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder="Speed (kts)"
                                        value={simAircraftSpeed}
                                        onChange={(e) => setSimAircraftSpeed(e.target.value)}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Alt (ft)"
                                        value={simAircraftAlt}
                                        onChange={(e) => setSimAircraftAlt(e.target.value)}
                                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                {drawingPath.length >= 2 && (
                                    <button
                                        onClick={handleFinishDrawing}
                                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium"
                                    >
                                        Add Aircraft ({drawingPath.length} points)
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Route Configuration Panel */}
                        <div className="border-b border-slate-800">
                            <button
                                onClick={() => setExpandedPanel(expandedPanel === 'route' ? 'traffic' : 'route')}
                                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50"
                            >
                                <div className="flex items-center gap-2">
                                    <Navigation className="w-5 h-5 text-cyan-400" />
                                    <span className="font-medium">Route Configuration</span>
                                </div>
                                {expandedPanel === 'route' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            
                            {expandedPanel === 'route' && (
                                <div className="px-4 pb-4 space-y-4">
                                    {/* Waypoints List */}
                                    <div className="space-y-2">
                                        {/* Origin */}
                                        <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
                                            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">O</div>
                                            <div className="flex-1 text-sm">
                                                {origin ? (origin.name || origin.airport_code || `${origin.lat.toFixed(3)}, ${origin.lon.toFixed(3)}`) : 'Click map to set origin'}
                                            </div>
                                            {origin && (
                                                <button onClick={() => setOrigin(null)} className="text-slate-400 hover:text-red-400">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Waypoints */}
                                        {waypoints.map((wp, i) => (
                                            <div key={i} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
                                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                                                <div className="flex-1 text-sm">
                                                    {wp.name || wp.airport_code || `${wp.lat.toFixed(3)}, ${wp.lon.toFixed(3)}`}
                                                </div>
                                                <button 
                                                    onClick={() => setWaypoints(waypoints.filter((_, idx) => idx !== i))}
                                                    className="text-slate-400 hover:text-red-400"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Destination */}
                                        <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg">
                                            <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-xs font-bold">D</div>
                                            <div className="flex-1 text-sm">
                                                {destination ? (destination.name || destination.airport_code || `${destination.lat.toFixed(3)}, ${destination.lon.toFixed(3)}`) : 'Click map to set destination'}
                                            </div>
                                            {destination && (
                                                <button onClick={() => setDestination(null)} className="text-slate-400 hover:text-red-400">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick Airport Select */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                const apt = airports.find(a => a.code === e.target.value);
                                                if (apt) setOrigin({ lat: apt.lat, lon: apt.lon, name: apt.name, airport_code: apt.code, is_airport: true });
                                            }}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="">Quick: Set Origin</option>
                                            {airports.map(a => (
                                                <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                const apt = airports.find(a => a.code === e.target.value);
                                                if (apt) setDestination({ lat: apt.lat, lon: apt.lon, name: apt.name, airport_code: apt.code, is_airport: true });
                                            }}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="">Quick: Set Dest</option>
                                            {airports.map(a => (
                                                <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Custom altitude/speed */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            placeholder={`Altitude (${currentProfile?.cruise_altitude_ft || 35000} ft)`}
                                            value={customAltitude}
                                            onChange={(e) => setCustomAltitude(e.target.value)}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                                        />
                                        <input
                                            type="number"
                                            placeholder={`Speed (${currentProfile?.cruise_speed_kts || 450} kts)`}
                                            value={customSpeed}
                                            onChange={(e) => setCustomSpeed(e.target.value)}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handlePlanRoute}
                                            disabled={loading || !origin || !destination}
                                            className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plane className="w-5 h-5" />}
                                            {loading ? 'Planning...' : 'Plan Route'}
                                        </button>
                                        <button
                                            onClick={handleClearWaypoints}
                                            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                                            <p className="text-sm text-red-400">{error}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Traffic Panel */}
                        <div className="border-b border-slate-800">
                            <button
                                onClick={() => setExpandedPanel(expandedPanel === 'traffic' ? 'route' : 'traffic')}
                                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50"
                            >
                                <div className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-400" />
                                    <span className="font-medium">Airspace Traffic</span>
                                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{traffic.length}</span>
                                </div>
                                {expandedPanel === 'traffic' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {expandedPanel === 'traffic' && (
                                <div className="px-4 pb-4 space-y-3">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleRefreshTraffic}
                                            disabled={trafficLoading}
                                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${trafficLoading ? 'animate-spin' : ''}`} />
                                            Refresh Traffic
                                        </button>
                                        <button
                                            onClick={() => setShowTraffic(!showTraffic)}
                                            className={`px-4 py-2 rounded-lg text-sm ${showTraffic ? 'bg-slate-700' : 'bg-slate-800'}`}
                                        >
                                            {showTraffic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {trafficCacheAge !== null && (
                                        <p className="text-xs text-slate-500">
                                            Cache age: {trafficCacheAge ? `${Math.round(trafficCacheAge / 60)} min ago` : 'Just refreshed'}
                                        </p>
                                    )}

                                    {traffic.filter(t => t.is_simulated).length > 0 && (
                                        <div className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                            <span className="text-xs text-amber-400">
                                                {traffic.filter(t => t.is_simulated).length} simulated aircraft
                                            </span>
                                            <button
                                                onClick={handleClearSimulated}
                                                className="text-xs text-amber-400 hover:text-amber-300"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}

                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                        {traffic.slice(0, 20).map(t => (
                                            <div key={t.flight_id} className={`p-2 rounded text-xs ${t.is_simulated ? 'bg-amber-500/10' : 'bg-slate-800/50'}`}>
                                                <div className="flex justify-between">
                                                    <span className="font-mono">{t.callsign || t.flight_id.slice(0, 8)}</span>
                                                    <span className="text-slate-400">{Math.round(t.alt_ft)} ft</span>
                                                </div>
                                                <div className="text-slate-500">
                                                    {Math.round(t.speed_kts)} kts • {Math.round(t.heading_deg)}°
                                                </div>
                                            </div>
                                        ))}
                                        {traffic.length > 20 && (
                                            <p className="text-xs text-slate-500 text-center py-2">
                                                +{traffic.length - 20} more aircraft
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tactical Zones Panel */}
                        {tacticalZones.length > 0 && (
                            <div className="border-b border-slate-800 p-4">
                                <h3 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    Tactical Zones ({tacticalZones.length})
                                </h3>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {tacticalZones.map(zone => (
                                        <div 
                                            key={zone.id} 
                                            className="flex items-center justify-between p-2 rounded-lg"
                                            style={{ backgroundColor: `${zone.color}20`, borderLeft: `3px solid ${zone.color}` }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{ZONE_CONFIGS[zone.type].icon}</span>
                                                <div>
                                                    <div className="text-xs font-medium">{zone.name}</div>
                                                    {zone.altitude && <div className="text-xs text-slate-400">{zone.altitude} ft</div>}
                                                    {zone.speed && <div className="text-xs text-slate-400">{zone.speed} kts</div>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteZone(zone.id)}
                                                className="text-slate-400 hover:text-red-400"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Attack Mission Panel */}
                        {attackMode && showMissionPanel && (
                            <div className="border-b border-slate-800 p-4">
                                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                                    <Target className="w-4 h-4" />
                                    Attack Mission Planning
                                </h3>

                                {/* Targets List */}
                                {attackTargets.length > 0 && (
                                    <div className="mb-4">
                                        <div className="text-xs text-slate-400 mb-2">Targets ({attackTargets.length})</div>
                                        <div className="space-y-1 max-h-32 overflow-y-auto">
                                            {attackTargets.map(target => (
                                                <div 
                                                    key={target.id}
                                                    className={`flex items-center justify-between p-2 rounded text-xs ${
                                                        target.priority === 'high' ? 'bg-red-500/20' :
                                                        target.priority === 'medium' ? 'bg-amber-500/20' : 'bg-green-500/20'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${
                                                            target.priority === 'high' ? 'bg-red-500' :
                                                            target.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                                                        }`} />
                                                        <span>{target.name}</span>
                                                        <span className="text-slate-500">({target.ammoRequired} ammo)</span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteTarget(target.id)}
                                                        className="text-slate-400 hover:text-red-400"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Aircraft Fleet */}
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 mb-2">Mission Aircraft</div>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            placeholder="Callsign"
                                            value={newAircraftCallsign}
                                            onChange={(e) => setNewAircraftCallsign(e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Ammo"
                                            value={newAircraftAmmo}
                                            onChange={(e) => setNewAircraftAmmo(e.target.value)}
                                            className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                                        />
                                        <button
                                            onClick={handleAddMissionAircraft}
                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {missionAircraft.length > 0 && (
                                        <div className="space-y-1">
                                            {missionAircraft.map(aircraft => (
                                                <div 
                                                    key={aircraft.id}
                                                    className="flex items-center justify-between p-2 rounded text-xs bg-slate-800/50"
                                                    style={{ borderLeft: `3px solid ${aircraft.color}` }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Plane className="w-3 h-3" style={{ color: aircraft.color }} />
                                                        <span className="font-mono">{aircraft.callsign}</span>
                                                        <span className="text-slate-500">({aircraft.ammoCapacity} ammo)</span>
                                                        {aircraft.assignedTargets.length > 0 && (
                                                            <span className="text-xs bg-slate-700 px-1 rounded">
                                                                {aircraft.assignedTargets.length} targets
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveMissionAircraft(aircraft.id)}
                                                        className="text-slate-400 hover:text-red-400"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Mission Summary */}
                                {attackTargets.length > 0 && missionAircraft.length > 0 && (
                                    <div className="mb-4 p-2 bg-slate-800/50 rounded text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Total Ammo Required:</span>
                                            <span>{attackTargets.reduce((sum, t) => sum + t.ammoRequired, 0)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Total Ammo Available:</span>
                                            <span>{missionAircraft.reduce((sum, a) => sum + a.ammoCapacity, 0)}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleGenerateMissionPlan}
                                        disabled={loading || attackTargets.length === 0 || missionAircraft.length === 0 || !origin}
                                        className="flex-1 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                                        Generate Attack Plan
                                    </button>
                                    <button
                                        onClick={handleClearMission}
                                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Mission Plan Result */}
                                {missionPlan && (
                                    <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-sm font-medium text-green-400">✓ Mission Plan Generated</div>
                                            <button
                                                onClick={() => setShowMissionSimulation(true)}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-medium rounded-lg transition-all"
                                            >
                                                <PlayCircle className="w-3 h-3" />
                                                Simulate Mission
                                            </button>
                                        </div>
                                        <div className="text-xs space-y-1">
                                            <div className="text-slate-400">{missionPlan.name}</div>
                                            {missionPlan.aircraft.filter(a => a.assignedTargets.length > 0).map(aircraft => (
                                                <div key={aircraft.id} className="flex items-center gap-2">
                                                    <span style={{ color: aircraft.color }}>●</span>
                                                    <span className="font-mono">{aircraft.callsign}</span>
                                                    <span className="text-slate-500">→ {aircraft.assignedTargets.length} targets</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results Panel */}
                        {planResult && planResult.routes.length > 0 && (
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                        <Target className="w-4 h-4" />
                                        {planResult.total_routes} Route Options
                                    </h3>
                                    
                                    {/* Simulate Button */}
                                    {selectedRoute && (
                                        <button
                                            onClick={() => setShowSimulation(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-purple-500/20"
                                        >
                                            <PlayCircle className="w-4 h-4" />
                                            Simulate
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {planResult.routes.map((route, index) => (
                                        <div
                                            key={route.path_id}
                                            onClick={() => setSelectedRoute(route)}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                                selectedRoute?.path_id === route.path_id
                                                    ? 'bg-slate-800 border-cyan-500/50'
                                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div 
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }}
                                                    />
                                                    <span className="font-medium text-sm">{route.recommendation}</span>
                                                </div>
                                                {getConflictBadge(route)}
                                            </div>

                                            {/* Score Bar */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs text-slate-400 mb-1">
                                                    <span>Score</span>
                                                    <span className="font-mono">{(route.score * 100).toFixed(0)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full rounded-full"
                                                        style={{ 
                                                            width: `${route.score * 100}%`,
                                                            backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length]
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="grid grid-cols-4 gap-2 text-xs">
                                                <div className="text-center">
                                                    <Ruler className="w-3 h-3 mx-auto mb-1 text-slate-400" />
                                                    <span>{route.distance_nm.toFixed(0)} nm</span>
                                                </div>
                                                <div className="text-center">
                                                    <Clock className="w-3 h-3 mx-auto mb-1 text-slate-400" />
                                                    <span>{route.eta_minutes.toFixed(0)} min</span>
                                                </div>
                                                <div className="text-center">
                                                    <Shield className="w-3 h-3 mx-auto mb-1 text-slate-400" />
                                                    <span>{(route.safety_score * 100).toFixed(0)}%</span>
                                                </div>
                                                <div className="text-center">
                                                    <Target className="w-3 h-3 mx-auto mb-1 text-slate-400" />
                                                    <span>{route.waypoint_count} pts</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Conflicts Detail */}
                        {selectedRoute && selectedRoute.conflicts.length > 0 && (
                            <div className="p-4 border-t border-slate-800">
                                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    Conflict Details ({selectedRoute.conflicts.length})
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {selectedRoute.conflicts.map((c, i) => (
                                        <div 
                                            key={i}
                                            className={`p-2 rounded text-xs border ${
                                                c.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                                                c.severity === 'conflict' ? 'bg-orange-500/10 border-orange-500/30' :
                                                'bg-amber-500/10 border-amber-500/30'
                                            }`}
                                        >
                                            <div className="flex justify-between mb-1">
                                                <span className="font-medium uppercase">{c.severity}</span>
                                                <span className="text-slate-400">+{c.planned_time_offset_min.toFixed(0)} min</span>
                                            </div>
                                            <div className="text-slate-400">
                                                {c.traffic_callsign || c.traffic_flight_id.slice(0, 8)} • 
                                                {c.horizontal_distance_nm.toFixed(1)} nm horiz • 
                                                {c.vertical_distance_ft.toFixed(0)} ft vert
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Map */}
                <div className="flex-1 relative">
                    <div ref={mapContainer} className="absolute inset-0" />
                    
                    {/* Profile Info */}
                    {currentProfile && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
                            <h4 className="text-xs font-medium text-slate-400 mb-2">{currentProfile.name}</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-slate-500">Cruise:</span>
                                <span>{currentProfile.cruise_speed_kts} kts</span>
                                <span className="text-slate-500">Altitude:</span>
                                <span>{currentProfile.cruise_altitude_ft.toLocaleString()} ft</span>
                                <span className="text-slate-500">Climb:</span>
                                <span>{currentProfile.climb_rate_ft_min.toLocaleString()} ft/min</span>
                            </div>
                        </div>
                    )}

                    {/* Layer Controls */}
                    <div className="absolute bottom-4 left-4 space-y-2">
                        {/* Layer Toggles */}
                        <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
                            <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                Map Layers
                            </h4>
                            <div className="space-y-2">
                                {/* Show All Learned Paths */}
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={showLearnedPaths}
                                        onChange={(e) => setShowLearnedPaths(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                                    />
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-4 h-0.5 rounded bg-indigo-500 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #6366f1, #6366f1 4px, transparent 4px, transparent 6px)' }} />
                                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                                            All Learned Paths ({learnedPaths.length})
                                        </span>
                                    </div>
                                </label>
                                
                                {/* Show Used Corridors */}
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={showUsedCorridors}
                                        onChange={(e) => setShowUsedCorridors(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                                    />
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-4 h-1 rounded bg-emerald-500/70" />
                                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                                            Used Corridors
                                        </span>
                                    </div>
                                </label>
                                
                                {/* Show Traffic */}
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={showTraffic}
                                        onChange={(e) => setShowTraffic(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                                    />
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-blue-400" />
                                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                                            Live Traffic ({traffic.length})
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Legend */}
                        {(planResult?.routes.length || traffic.length > 0) && (
                            <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg p-3 border border-slate-700">
                                <h4 className="text-xs font-medium text-slate-400 mb-2">Legend</h4>
                                <div className="space-y-1 text-xs">
                                    {planResult?.routes.slice(0, 4).map((route, i) => (
                                        <div key={route.path_id} className="flex items-center gap-2">
                                            <div className="w-4 h-1 rounded" style={{ backgroundColor: ROUTE_COLORS[i] }} />
                                            <span className="text-slate-300">{route.recommendation}</span>
                                        </div>
                                    ))}
                                    {showUsedCorridors && selectedRoute && (
                                        <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                                            <div className="w-4 h-1 rounded bg-emerald-500/70" />
                                            <span className="text-emerald-400">Used Corridor</span>
                                        </div>
                                    )}
                                    {showLearnedPaths && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-0.5 rounded opacity-60" style={{ backgroundColor: '#6366f1' }} />
                                            <span className="text-indigo-400">All Corridors</span>
                                        </div>
                                    )}
                                    {showTraffic && traffic.length > 0 && (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-blue-400" />
                                                <span className="text-slate-300">Real Traffic</span>
                                            </div>
                                            {traffic.some(t => t.is_simulated) && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                                                    <span className="text-slate-300">Simulated</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {selectedRoute?.conflicts && selectedRoute.conflicts.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-red-500" />
                                            <span className="text-slate-300">Conflict Zone</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mode indicator */}
                    {mapMode !== 'select' && (
                        <div className="absolute top-4 right-16 bg-slate-900/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-cyan-500/50">
                            <span className="text-sm text-cyan-400">
                                {mapMode === 'waypoint' ? 'Click to add waypoint' : 'Click to draw aircraft path'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Simulation Modal - Single Route */}
            {showSimulation && selectedRoute && origin && destination && (
                <SimulationModal
                    plannedRoute={selectedRoute}
                    origin={origin}
                    destination={destination}
                    traffic={traffic}
                    learnedPaths={learnedPaths}
                    onClose={() => setShowSimulation(false)}
                />
            )}

            {/* Mission Simulation Modal - Multiple Aircraft */}
            {showMissionSimulation && missionPlan && origin && (
                <MissionSimulationModal
                    mission={missionPlan}
                    origin={origin}
                    traffic={traffic}
                    attackTargets={attackTargets}
                    onClose={() => setShowMissionSimulation(false)}
                />
            )}
        </div>
    );
};
