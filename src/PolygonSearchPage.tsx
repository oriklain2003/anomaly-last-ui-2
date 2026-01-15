import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchFlightsByPolygon, searchFlightsByWKT, PolygonSearchResult, fetchUnifiedTrack } from './api';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

const MAPTILER_API_KEY = 'r7kaQpfNDVZdaVp23F1r';

export const PolygonSearchPage: React.FC = () => {
    const navigate = useNavigate();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const draw = useRef<MapboxDraw | null>(null);
    
    const [searchResults, setSearchResults] = useState<PolygonSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wktInput, setWktInput] = useState('');
    const [useWKT, setUseWKT] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Initialize map
    useEffect(() => {
        if (map.current) return; // Initialize map only once
        if (!mapContainer.current) return;

        console.log('Initializing map...');

        try {
            const mapInstance = new maplibregl.Map({
                container: mapContainer.current,
                style: `https://api.maptiler.com/maps/darkmatter/style.json?key=${MAPTILER_API_KEY}`,
                center: [34.8516, 31.0461], // Israel center
                zoom: 7,
                attributionControl: false
            });

            map.current = mapInstance;

            mapInstance.on('load', () => {
                console.log('Map loaded successfully');
                setMapLoaded(true);
                
                // Add drawing controls after map loads
                try {
                    const drawControl = new MapboxDraw({
                        displayControlsDefault: false,
                        controls: {
                            polygon: true,
                            trash: true
                        },
                        defaultMode: 'draw_polygon'
                    });
                    
                    draw.current = drawControl;
                    mapInstance.addControl(drawControl as any);
                    console.log('Drawing controls added');
                } catch (drawErr) {
                    console.error('Error adding drawing controls:', drawErr);
                    setError('Map loaded but drawing tools failed to initialize.');
                }
            });

            mapInstance.on('error', (e) => {
                console.error('Map error:', e);
                setError(`Map error: ${e.error?.message || 'Unknown error'}`);
            });

            // Add navigation controls
            mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

        } catch (err) {
            console.error('Error initializing map:', err);
            setError(`Failed to initialize map: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }

        return () => {
            if (draw.current) {
                draw.current = null;
            }
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    const handleSearch = async () => {
        setError(null);
        setSearchResults([]);
        setIsSearching(true);

        try {
            let startTs: number | undefined;
            let endTs: number | undefined;

            if (startDate) {
                startTs = Math.floor(new Date(startDate).getTime() / 1000);
            }
            if (endDate) {
                endTs = Math.floor(new Date(endDate).getTime() / 1000);
            }

            if (useWKT) {
                // Search using WKT
                if (!wktInput.trim()) {
                    setError('Please enter a WKT polygon string');
                    setIsSearching(false);
                    return;
                }

                const response = await searchFlightsByWKT(wktInput.trim(), startTs, endTs);
                setSearchResults(response.flights);
            } else {
                // Search using drawn polygon
                if (!draw.current) {
                    setError('Drawing tool not initialized');
                    setIsSearching(false);
                    return;
                }

                const data = draw.current.getAll();
                if (data.features.length === 0) {
                    setError('Please draw a polygon on the map first');
                    setIsSearching(false);
                    return;
                }

                const polygon = data.features[0];
                if (polygon.geometry.type !== 'Polygon') {
                    setError('Please draw a polygon');
                    setIsSearching(false);
                    return;
                }

                // Convert coordinates to [lon, lat] format
                const coords = polygon.geometry.coordinates[0];
                
                const response = await searchFlightsByPolygon(coords, startTs, endTs);
                setSearchResults(response.flights);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    const handleClearPolygon = () => {
        draw.current?.deleteAll();
        setSearchResults([]);
        setError(null);
    };

    const handleViewFlight = async (flightId: string) => {
        try {
            setSelectedFlight(flightId);
            const track = await fetchUnifiedTrack(flightId);
            
            if (track && track.points && track.points.length > 0) {
                // Clear existing flight layers
                if (map.current?.getSource('flight-track')) {
                    map.current.removeLayer('flight-track-line');
                    map.current.removeSource('flight-track');
                }

                // Add flight track to map
                const lineCoords = track.points
                    .filter(p => p.lat != null && p.lon != null)
                    .map(p => [p.lon!, p.lat!]);

                map.current?.addSource('flight-track', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: lineCoords
                        }
                    }
                });

                map.current?.addLayer({
                    id: 'flight-track-line',
                    type: 'line',
                    source: 'flight-track',
                    paint: {
                        'line-color': '#00ff00',
                        'line-width': 3
                    }
                });

                // Fit map to flight bounds
                if (lineCoords.length > 0) {
                    const bounds = lineCoords.reduce(
                        (bounds, coord) => bounds.extend(coord as [number, number]),
                        new maplibregl.LngLatBounds(lineCoords[0] as [number, number], lineCoords[0] as [number, number])
                    );
                    map.current?.fitBounds(bounds, { padding: 50 });
                }
            }
        } catch (err) {
            console.error('Error loading flight track:', err);
        }
    };

    const handleOpenInViewer = (flightId: string) => {
        navigate(`/flight-viewer?flight_id=${flightId}`);
    };

    const formatTimestamp = (ts: number) => {
        return new Date(ts * 1000).toLocaleString();
    };

    const formatDuration = (startTs: number, endTs: number) => {
        const durationSec = endTs - startTs;
        const hours = Math.floor(durationSec / 3600);
        const minutes = Math.floor((durationSec % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    >
                        ← Back
                    </button>
                    <h1 className="text-2xl font-bold">Polygon Flight Search</h1>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Map Section */}
                <div className="flex-1 relative" style={{ minHeight: 0 }}>
                    <div ref={mapContainer} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
                </div>

                {/* Control Panel */}
                <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
                    {/* Search Controls */}
                    <div className="p-4 border-b border-gray-700">
                        <h2 className="text-lg font-semibold mb-4">Search Area</h2>
                        
                        {/* Mode Toggle */}
                        <div className="mb-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={useWKT}
                                    onChange={(e) => setUseWKT(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <span>Use WKT String</span>
                            </label>
                        </div>

                        {useWKT ? (
                            <div className="mb-4">
                                <label className="block mb-2 text-sm">WKT Polygon:</label>
                                <textarea
                                    value={wktInput}
                                    onChange={(e) => setWktInput(e.target.value)}
                                    placeholder="POLYGON ((lon1 lat1, lon2 lat2, ...))"
                                    className="w-full h-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                                />
                            </div>
                        ) : (
                            <div className="mb-4 text-sm text-gray-400">
                                Draw a polygon on the map to search for flights
                            </div>
                        )}

                        {/* Time Range Filters */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm">Start Date (Optional):</label>
                            <input
                                type="datetime-local"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block mb-2 text-sm">End Date (Optional):</label>
                            <input
                                type="datetime-local"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleSearch}
                                disabled={isSearching}
                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                            <button
                                onClick={handleClearPolygon}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
                            >
                                Clear
                            </button>
                        </div>

                        {/* Map Status */}
                        {!mapLoaded && !error && (
                            <div className="mt-4 p-3 bg-blue-900/50 border border-blue-700 rounded text-sm">
                                Loading map...
                            </div>
                        )}

                        {mapLoaded && !error && (
                            <div className="mt-4 p-3 bg-green-900/50 border border-green-700 rounded text-sm">
                                Map ready! Draw a polygon to search.
                            </div>
                        )}

                        {error && (
                            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-sm">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-4">
                            <h2 className="text-lg font-semibold mb-4">
                                Results ({searchResults.length})
                            </h2>

                            {searchResults.length === 0 ? (
                                <div className="text-gray-400 text-sm">
                                    No flights found. Draw a polygon and click Search.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {searchResults.map((flight) => (
                                        <div
                                            key={flight.flight_id}
                                            className={`p-3 bg-gray-700 rounded border ${
                                                selectedFlight === flight.flight_id
                                                    ? 'border-blue-500'
                                                    : 'border-gray-600'
                                            } hover:bg-gray-650 transition-colors`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <div className="font-semibold">
                                                        {flight.callsign || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {flight.flight_id}
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-gray-400">
                                                    <div>{flight.points_in_polygon} points</div>
                                                    <div>
                                                        {formatDuration(
                                                            flight.first_timestamp,
                                                            flight.last_timestamp
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-xs text-gray-400 mb-2">
                                                <div>Start: {formatTimestamp(flight.first_timestamp)}</div>
                                                <div>End: {formatTimestamp(flight.last_timestamp)}</div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleViewFlight(flight.flight_id)}
                                                    className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
                                                >
                                                    Show on Map
                                                </button>
                                                <button
                                                    onClick={() => handleOpenInViewer(flight.flight_id)}
                                                    className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
                                                >
                                                    Open Viewer
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
