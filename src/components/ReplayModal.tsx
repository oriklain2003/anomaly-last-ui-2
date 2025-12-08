import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { fetchUnifiedTrack } from '../api';
import type { TrackPoint } from '../types';
import clsx from 'clsx';

interface ReplayModalProps {
    mainFlightId: string;
    secondaryFlightIds?: string[];
    onClose: () => void;
}

interface FlightData {
    id: string;
    points: TrackPoint[];
    color: string;
}

type TelemetryData = 
    | { status: 'waiting' }
    | ({ status: 'active' | 'ended' } & TrackPoint);

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

export const ReplayModal: React.FC<ReplayModalProps> = ({ mainFlightId, secondaryFlightIds = [], onClose }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    
    const [flights, setFlights] = useState<FlightData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [speed, setSpeed] = useState<number>(1);
    const [minTime, setMinTime] = useState<number>(0);
    const [maxTime, setMaxTime] = useState<number>(0);
    
    const animationRef = useRef<number | undefined>(undefined);
    const lastFrameTime = useRef<number>(0);

    // Fetch data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Ensure unique IDs and remove any empty strings
                const ids = [mainFlightId, ...new Set(secondaryFlightIds)].filter(Boolean);
                console.log("[Replay] Loading flights:", ids);
                
                const results = await Promise.all(
                    ids.map(async (id, index) => {
                        try {
                            const track = await fetchUnifiedTrack(id);
                            return {
                                id,
                                points: track.points.sort((a, b) => a.timestamp - b.timestamp),
                                color: COLORS[index % COLORS.length]
                            };
                        } catch (e) {
                            console.error(`Failed to load track for ${id}`, e);
                            return null;
                        }
                    })
                );

                const validFlights = results.filter((f): f is FlightData => f !== null);
                setFlights(validFlights);

                if (validFlights.length > 0) {
                    const allPoints = validFlights.flatMap(f => f.points);
                    const min = Math.min(...allPoints.map(p => p.timestamp));
                    const max = Math.max(...allPoints.map(p => p.timestamp));
                    setMinTime(min);
                    setMaxTime(max);
                    setCurrentTime(min);
                }
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [mainFlightId, secondaryFlightIds]);

    // Initialize Map
    useEffect(() => {
        if (!mapContainer.current || loading || flights.length === 0) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://api.maptiler.com/maps/darkmatter/style.json?key=r7kaQpfNDVZdaVp23F1r',
            center: [0, 0],
            zoom: 2,
        });

        popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            maxWidth: '200px'
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // Fit bounds
            const bounds = new maplibregl.LngLatBounds();
            flights.forEach(f => {
                f.points.forEach(p => bounds.extend([p.lon, p.lat]));
            });
            map.current.fitBounds(bounds, { padding: 50 });

            // Add sources and layers for each flight
            flights.forEach(flight => {
                // Ghost Line source (Full path)
                map.current!.addSource(`source-${flight.id}-ghost`, {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates: flight.points.map(p => [p.lon, p.lat])
                            }
                        }]
                    }
                });

                // Ghost Line layer
                map.current!.addLayer({
                    id: `layer-${flight.id}-ghost`,
                    type: 'line',
                    source: `source-${flight.id}-ghost`,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': flight.color,
                        'line-width': 2,
                        'line-opacity': 0.2, // Faint
                        'line-dasharray': [2, 2] // Dashed
                    }
                });

                // Line source
                map.current!.addSource(`source-${flight.id}`, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Line layer
                map.current!.addLayer({
                    id: `layer-${flight.id}-line`,
                    type: 'line',
                    source: `source-${flight.id}`,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': flight.color,
                        'line-width': 4,
                        'line-opacity': 0.8
                    }
                });
                
                // Add click handler for the line (to jump time?) or just info?
                // For now, let's keep it simple.

                // Current position marker source
                map.current!.addSource(`source-${flight.id}-pos`, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Current position marker layer (circle/dot)
                map.current!.addLayer({
                    id: `layer-${flight.id}-pos`,
                    type: 'circle',
                    source: `source-${flight.id}-pos`,
                    paint: {
                        'circle-radius': 8,
                        'circle-color': flight.color,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff'
                    }
                });
                
                // Add flight label
                map.current!.addLayer({
                    id: `layer-${flight.id}-label`,
                    type: 'symbol',
                    source: `source-${flight.id}-pos`,
                    layout: {
                        'text-field': flight.id,
                        'text-offset': [0, -2],
                        'text-size': 12,
                        'text-anchor': 'bottom',
                        'text-allow-overlap': true
                    },
                    paint: {
                        'text-color': '#ffffff',
                        'text-halo-color': '#000000',
                        'text-halo-width': 2
                    }
                });

                // Interaction for popup
                const showPopup = (e: any) => {
                    if (!map.current || !popupRef.current) return;
                    map.current.getCanvas().style.cursor = 'pointer';

                    const feature = e.features[0];
                    const props = feature.properties;
                    const coords = (feature.geometry as any).coordinates.slice();

                    while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
                        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
                    }

                    const timeStr = new Date(props.timestamp * 1000).toLocaleTimeString();
                    
                    popupRef.current
                        .setLngLat(coords)
                        .setHTML(`
                            <div class="text-gray-900 p-2 text-xs font-sans min-w-[120px]">
                                <div class="font-bold border-b border-gray-300 pb-1 mb-1 text-sm">${flight.id}</div>
                                <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                                    <div class="text-gray-500">Time:</div>
                                    <div class="font-mono font-bold text-right">${timeStr}</div>
                                    <div class="text-gray-500">Alt:</div>
                                    <div class="font-mono font-bold text-right">${props.alt} ft</div>
                                    <div class="text-gray-500">Hdg:</div>
                                    <div class="font-mono font-bold text-right">${props.track}°</div>
                                    <div class="text-gray-500">GS:</div>
                                    <div class="font-mono font-bold text-right">${props.gspeed || 0} kts</div>
                                </div>
                            </div>
                        `)
                        .addTo(map.current);
                };

                const hidePopup = () => {
                    if (!map.current || !popupRef.current) return;
                    map.current.getCanvas().style.cursor = '';
                    popupRef.current.remove();
                };

                map.current?.on('mouseenter', `layer-${flight.id}-pos`, showPopup);
                map.current?.on('mouseleave', `layer-${flight.id}-pos`, hidePopup);
                map.current?.on('click', `layer-${flight.id}-pos`, showPopup); // Also work on click
            });
        });

        return () => {
            map.current?.remove();
        };
    }, [loading, flights]);

    // Animation Loop
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

    // Update Map Data based on Current Time
    useEffect(() => {
        if (!map.current || !map.current.isStyleLoaded()) return;

        flights.forEach(flight => {
            const activePoints = flight.points.filter(p => p.timestamp <= currentTime);
            
            if (activePoints.length === 0) {
                // Clear
                (map.current!.getSource(`source-${flight.id}`) as maplibregl.GeoJSONSource)?.setData({
                    type: 'FeatureCollection',
                    features: []
                });
                (map.current!.getSource(`source-${flight.id}-pos`) as maplibregl.GeoJSONSource)?.setData({
                    type: 'FeatureCollection',
                    features: []
                });
                return;
            }

            // Update Line
            (map.current!.getSource(`source-${flight.id}`) as maplibregl.GeoJSONSource)?.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: activePoints.map(p => [p.lon, p.lat])
                    }
                }] as any
            });

            // Update Head Marker
            const lastPoint = activePoints[activePoints.length - 1];
            (map.current!.getSource(`source-${flight.id}-pos`) as maplibregl.GeoJSONSource)?.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {
                        timestamp: lastPoint.timestamp,
                        alt: lastPoint.alt,
                        track: lastPoint.track || 0,
                        gspeed: lastPoint.gspeed || 0
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [lastPoint.lon, lastPoint.lat]
                    }
                }] as any
            });
        });

    }, [currentTime, flights]);

    const formatTime = (ts: number) => {
        return new Date(ts * 1000).toLocaleTimeString();
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentTime(Number(e.target.value));
    };

    // Helper to get current telemetry for display in UI overlay
    const getCurrentTelemetry = (flight: FlightData): TelemetryData => {
        const started = flight.points[0].timestamp <= currentTime;
        // Check if we are past the last point
        const ended = currentTime > flight.points[flight.points.length - 1].timestamp;

        if (!started) return { status: 'waiting' };
        
        const activePoints = flight.points.filter(p => p.timestamp <= currentTime);
        if (activePoints.length === 0) return { status: 'waiting' };
        
        const p = activePoints[activePoints.length - 1];
        
        return { 
            status: ended ? 'ended' : 'active',
            ...p
        };
    };

    if (loading) return null; // Or a loader

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#1e2124] w-full h-full rounded-2xl overflow-hidden flex flex-col border border-white/10 shadow-2xl relative">
                
                {/* Header / Close */}
                <div className="absolute top-4 right-4 z-20 flex gap-2">
                    <button 
                        onClick={onClose}
                        className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                    >
                        <X className="size-6" />
                    </button>
                </div>

                {/* Live Telemetry Overlay */}
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                    {flights.map(f => {
                        const tel = getCurrentTelemetry(f);
                        if (!tel) return null;

                        return (
                            <div key={f.id} className="bg-black/60 backdrop-blur border border-white/10 p-3 rounded-lg text-xs w-48 shadow-lg transition-all">
                                <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-1">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                    <span className="font-bold text-white">{f.id}</span>
                                    {tel.status === 'waiting' && <span className="text-[10px] text-yellow-500 ml-auto italic">Waiting...</span>}
                                    {tel.status === 'ended' && <span className="text-[10px] text-red-400 ml-auto italic">Ended</span>}
                                </div>
                                {tel.status !== 'waiting' && (
                                    <div className={clsx("grid grid-cols-2 gap-1 text-white/80", tel.status === 'ended' && "opacity-50")}>
                                        <span>Alt:</span>
                                        <span className="font-mono text-right">{tel.alt} ft</span>
                                        <span>Hdg:</span>
                                        <span className="font-mono text-right">{tel.track}°</span>
                                        <span>Speed:</span>
                                        <span className="font-mono text-right">{tel.gspeed || 0} kts</span>
                                        <span>Lat/Lon:</span>
                                        <span className="font-mono text-right text-[10px]">{tel.lat.toFixed(3)}, {tel.lon.toFixed(3)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Map */}
                <div ref={mapContainer} className="flex-1 bg-gray-900" />

                {/* Controls */}
                <div className="bg-[#2C2F33] border-t border-white/10 p-4">
                    
                    {/* Time Slider */}
                    <div className="flex items-center gap-4 mb-4">
                        <span className="text-xs font-mono text-white/60 min-w-[80px]">{formatTime(currentTime)}</span>
                        <input 
                            type="range" 
                            min={minTime} 
                            max={maxTime} 
                            step={1}
                            value={currentTime}
                            onChange={handleSeek}
                            className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80"
                        />
                         <span className="text-xs font-mono text-white/60 min-w-[80px] text-right">{formatTime(maxTime)}</span>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center justify-between">
                        
                        <div className="flex items-center gap-2">
                             <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
                                <button 
                                    onClick={() => setSpeed(1)} 
                                    className={clsx("px-2 py-1 text-xs font-bold rounded", speed === 1 ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                                >1x</button>
                                <button 
                                    onClick={() => setSpeed(5)} 
                                    className={clsx("px-2 py-1 text-xs font-bold rounded", speed === 5 ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                                >5x</button>
                                <button 
                                    onClick={() => setSpeed(10)} 
                                    className={clsx("px-2 py-1 text-xs font-bold rounded", speed === 10 ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                                >10x</button>
                                <button 
                                    onClick={() => setSpeed(20)} 
                                    className={clsx("px-2 py-1 text-xs font-bold rounded", speed === 20 ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                                >20x</button>
                                <button 
                                    onClick={() => setSpeed(60)} 
                                    className={clsx("px-2 py-1 text-xs font-bold rounded", speed === 60 ? "bg-primary text-white" : "text-white/40 hover:text-white")}
                                >60x</button>
                             </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setCurrentTime(minTime)}
                                className="text-white/60 hover:text-white transition-colors"
                            >
                                <SkipBack className="size-5" />
                            </button>
                            
                            <button 
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="bg-primary hover:bg-primary/80 text-white p-3 rounded-full transition-transform active:scale-95 shadow-lg shadow-primary/20"
                            >
                                {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current pl-1" />}
                            </button>

                             <button 
                                onClick={() => setCurrentTime(maxTime)}
                                className="text-white/60 hover:text-white transition-colors"
                            >
                                <SkipForward className="size-5" />
                            </button>
                        </div>

                        <div className="flex flex-col items-end gap-1 min-w-[200px]">
                            {flights.map(f => (
                                <div key={f.id} className="flex items-center gap-2 text-xs">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                    <span className="text-white/80 font-mono">{f.id}</span>
                                </div>
                            ))}
                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
};
