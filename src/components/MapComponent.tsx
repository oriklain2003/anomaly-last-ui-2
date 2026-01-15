import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TrackPoint } from '../types';
import { fetchLearnedLayers, type LearnedLayers, fetchUnionTubes, type UnionTubesResponse } from '../api';

// Fix for Hebrew text rendering (RTL)
try {
  if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
    maplibregl.setRTLTextPlugin(
      'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
      true // Lazy load
    );
  }
} catch (err) {
  console.error('Failed to set RTL text plugin', err);
}

// ============================================================
// AI Highlight Types
// ============================================================

export interface AIHighlightedPoint {
    lat: number;
    lon: number;
    label?: string;
}

export interface AIHighlightedSegment {
    startIndex: number;
    endIndex: number;
}

// ============================================================
// Component Props and Ref Handle
// ============================================================

// ML Anomaly Point for map display
export interface MLAnomalyPoint {
    lat: number;
    lon: number;
    timestamp: number;
    point_score: number;
    layer: string;  // e.g., 'Deep Dense', 'CNN', 'Transformer', 'Hybrid'
}

interface MapComponentProps {
  points: TrackPoint[];
  secondaryPoints?: TrackPoint[];
  anomalyTimestamps?: number[];
  mlAnomalyPoints?: MLAnomalyPoint[];
  aiHighlightedPoint?: AIHighlightedPoint | null;
  aiHighlightedSegment?: AIHighlightedSegment | null;
  onClearAIHighlights?: () => void;
  currentFlightOrigin?: string;
  currentFlightDestination?: string;
}

export interface MapComponentHandle {
    getContainer: () => HTMLDivElement | null;
    flyTo: (lat: number, lon: number, zoom?: number) => void;
    fitBounds: (north: number, south: number, east: number, west: number) => void;
    highlightPoint: (lat: number, lon: number, label?: string) => void;
    highlightSegment: (startIndex: number, endIndex: number) => void;
    clearHighlights: () => void;
    captureScreenshot: () => Promise<string | null>;
}

// ============================================================
// Component Implementation
// ============================================================

export const MapComponent = forwardRef<MapComponentHandle, MapComponentProps>(({ 
    points, 
    secondaryPoints = [], 
    anomalyTimestamps = [],
    mlAnomalyPoints = [],
    aiHighlightedPoint,
    aiHighlightedSegment,
    onClearAIHighlights,
    currentFlightOrigin,
    currentFlightDestination
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const aiMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mlMarkersRef = useRef<maplibregl.Marker[]>([]);
  const apiKey = 'r7kaQpfNDVZdaVp23F1r';

  const [learnedLayers, setLearnedLayers] = useState<LearnedLayers | null>(null);
  const [unionTubes, setUnionTubes] = useState<UnionTubesResponse | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [showTurns, setShowTurns] = useState(false);
  const [showSids, setShowSids] = useState(false);
  const [showStars, setShowStars] = useState(false);
  const [showTubes, setShowTubes] = useState(false);
  const [showUnionTubes, setShowUnionTubes] = useState(false);
  const [showMLPoints, setShowMLPoints] = useState(true);
  const [selectedPathCluster, setSelectedPathCluster] = useState<string>('all');
  const [showPathSelector, setShowPathSelector] = useState(false);
  const [selectedTubeCluster, setSelectedTubeCluster] = useState<string>('all');
  const [showTubeSelector, setShowTubeSelector] = useState(false);
  const [clickedPathInfo, setClickedPathInfo] = useState<{ id: string; origin?: string; destination?: string; member_count?: number; type?: 'path' | 'tube' | 'union_tube' | 'sid' | 'star' | 'turn' } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [originSearchQuery, setOriginSearchQuery] = useState<string>('');
  const [destSearchQuery, setDestSearchQuery] = useState<string>('');
  const [tubeOriginSearchQuery, setTubeOriginSearchQuery] = useState<string>('');
  const [tubeDestSearchQuery, setTubeDestSearchQuery] = useState<string>('');
  const [unionTubeOriginSearchQuery, setUnionTubeOriginSearchQuery] = useState<string>('');
  const [unionTubeDestSearchQuery, setUnionTubeDestSearchQuery] = useState<string>('');
  const [showUnionTubeSelector, setShowUnionTubeSelector] = useState(false);

  // Calculate total valid paths (backend already filters these)
  const totalValidPaths = useMemo(() => {
    if (!learnedLayers?.paths) return 0;
    return learnedLayers.paths.length;
  }, [learnedLayers?.paths]);

  // Group paths by origin-destination cluster
  const pathClusters = useMemo(() => {
    if (!learnedLayers?.paths) return [];
    
    const clusterMap = new Map<string, { key: string; label: string; count: number }>();
    
    learnedLayers.paths.forEach(path => {
      const origin = path.origin || 'Unknown';
      const dest = path.destination || 'Unknown';
      
      const key = `${origin}_${dest}`;
      const label = `${origin} → ${dest}`;
      
      if (clusterMap.has(key)) {
        clusterMap.get(key)!.count++;
      } else {
        clusterMap.set(key, { key, label, count: 1 });
      }
    });
    
    // Sort by count descending
    return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
  }, [learnedLayers?.paths]);

  // Calculate total valid tubes (backend already filters these)
  const totalValidTubes = useMemo(() => {
    if (!learnedLayers?.tubes) return 0;
    return learnedLayers.tubes.length;
  }, [learnedLayers?.tubes]);

  // Group tubes by origin-destination cluster
  const tubeClusters = useMemo(() => {
    if (!learnedLayers?.tubes) return [];
    
    const clusterMap = new Map<string, { key: string; label: string; count: number }>();
    
    learnedLayers.tubes.forEach(tube => {
      const origin = tube.origin || 'Unknown';
      const dest = tube.destination || 'Unknown';
      
      const key = `${origin}_${dest}`;
      const label = `${origin} → ${dest}`;
      
      if (clusterMap.has(key)) {
        clusterMap.get(key)!.count++;
      } else {
        clusterMap.set(key, { key, label, count: 1 });
      }
    });
    
    // Sort by count descending
    return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
  }, [learnedLayers?.tubes]);

  // Filter clusters by airport search queries
  const filteredPathClusters = useMemo(() => {
    const hasOriginQuery = originSearchQuery.trim().length > 0;
    const hasDestQuery = destSearchQuery.trim().length > 0;
    
    if (!hasOriginQuery && !hasDestQuery) return pathClusters;
    
    const originQuery = originSearchQuery.trim().toUpperCase();
    const destQuery = destSearchQuery.trim().toUpperCase();
    
    return pathClusters.filter(cluster => {
      const [origin, dest] = cluster.key.split('_');
      const matchesOrigin = !hasOriginQuery || origin.toUpperCase().includes(originQuery);
      const matchesDestination = !hasDestQuery || dest.toUpperCase().includes(destQuery);
      return matchesOrigin && matchesDestination;
    });
  }, [pathClusters, originSearchQuery, destSearchQuery]);

  // Filter tube clusters by airport search queries
  const filteredTubeClusters = useMemo(() => {
    const hasOriginQuery = tubeOriginSearchQuery.trim().length > 0;
    const hasDestQuery = tubeDestSearchQuery.trim().length > 0;
    
    if (!hasOriginQuery && !hasDestQuery) return tubeClusters;
    
    const originQuery = tubeOriginSearchQuery.trim().toUpperCase();
    const destQuery = tubeDestSearchQuery.trim().toUpperCase();
    
    return tubeClusters.filter(cluster => {
      const [origin, dest] = cluster.key.split('_');
      const matchesOrigin = !hasOriginQuery || origin.toUpperCase().includes(originQuery);
      const matchesDestination = !hasDestQuery || dest.toUpperCase().includes(destQuery);
      return matchesOrigin && matchesDestination;
    });
  }, [tubeClusters, tubeOriginSearchQuery, tubeDestSearchQuery]);

  // Filter paths based on selected cluster
  // Note: Backend now filters out Unknown and applies member_count thresholds
  const filteredPaths = useMemo(() => {
    if (!learnedLayers?.paths) return [];
    
    if (selectedPathCluster === 'all') return learnedLayers.paths;
    
    const [origin, dest] = selectedPathCluster.split('_');
    return learnedLayers.paths.filter(path => {
      const pathOrigin = path.origin || 'Unknown';
      const pathDest = path.destination || 'Unknown';
      return pathOrigin === origin && pathDest === dest;
    });
  }, [learnedLayers?.paths, selectedPathCluster]);

  // Filter tubes based on selected cluster
  // Note: Backend now filters out Unknown and applies member_count thresholds
  const filteredTubes = useMemo(() => {
    if (!learnedLayers?.tubes) return [];
    
    if (selectedTubeCluster === 'all') return learnedLayers.tubes;
    
    const [origin, dest] = selectedTubeCluster.split('_');
    return learnedLayers.tubes.filter(tube => {
      const tubeOrigin = tube.origin || 'Unknown';
      const tubeDest = tube.destination || 'Unknown';
      return tubeOrigin === origin && tubeDest === dest;
    });
  }, [learnedLayers?.tubes, selectedTubeCluster]);

  // Filter union tubes based on search queries
  const filteredUnionTubes = useMemo(() => {
    if (!unionTubes?.union_tubes) return [];
    
    const hasOriginQuery = unionTubeOriginSearchQuery.trim().length > 0;
    const hasDestQuery = unionTubeDestSearchQuery.trim().length > 0;
    
    if (!hasOriginQuery && !hasDestQuery) {
      return unionTubes.union_tubes;
    }
    
    const originQuery = unionTubeOriginSearchQuery.trim().toUpperCase();
    const destQuery = unionTubeDestSearchQuery.trim().toUpperCase();
    
    return unionTubes.union_tubes.filter(tube => {
      const tubeOrigin = (tube.origin || '').toUpperCase();
      const tubeDest = (tube.destination || '').toUpperCase();
      
      const matchesOrigin = !hasOriginQuery || tubeOrigin.includes(originQuery);
      const matchesDest = !hasDestQuery || tubeDest.includes(destQuery);
      
      return matchesOrigin && matchesDest;
    });
  }, [unionTubes, unionTubeOriginSearchQuery, unionTubeDestSearchQuery]);

  // Expose imperative handle for parent components
  useImperativeHandle(ref, () => ({
    getContainer: () => mapContainer.current,
    
    captureScreenshot: async (): Promise<string | null> => {
        if (!map.current || !mapContainer.current) return null;
        
        try {
            // Wait for any pending renders to complete
            await new Promise<void>(resolve => {
                if (map.current!.loaded()) {
                    resolve();
                } else {
                    map.current!.once('idle', () => resolve());
                }
            });
            
            // Force a render
            map.current.triggerRepaint();
            
            // Wait a frame for the repaint
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Get the WebGL canvas
            const mapCanvas = map.current.getCanvas();
            
            // Create a combined canvas with the map and overlays
            const rect = mapContainer.current.getBoundingClientRect();
            const combinedCanvas = document.createElement('canvas');
            combinedCanvas.width = rect.width;
            combinedCanvas.height = rect.height;
            const ctx = combinedCanvas.getContext('2d');
            
            if (!ctx) return null;
            
            // Draw the map canvas
            try {
                ctx.drawImage(mapCanvas, 0, 0, rect.width, rect.height);
            } catch (e) {
                console.error('Failed to draw map canvas (CORS issue?):', e);
                // Fill with dark background as fallback
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, rect.width, rect.height);
            }
            
            // Draw markers manually since they're DOM elements
            // Get all marker elements and draw them
            const markers = mapContainer.current.querySelectorAll('.maplibregl-marker');
            markers.forEach(marker => {
                const markerEl = marker as HTMLElement;
                const markerRect = markerEl.getBoundingClientRect();
                const containerRect = mapContainer.current!.getBoundingClientRect();
                
                // Calculate position relative to container
                const x = markerRect.left - containerRect.left + markerRect.width / 2;
                const y = markerRect.top - containerRect.top + markerRect.height;
                
                // Draw a simple marker representation
                ctx.beginPath();
                ctx.arc(x, y - 15, 10, 0, Math.PI * 2);
                
                // Check marker color (green for start, red for end)
                const svg = markerEl.querySelector('svg');
                if (svg) {
                    const fill = svg.getAttribute('fill') || '#ef4444';
                    ctx.fillStyle = fill;
                } else {
                    ctx.fillStyle = '#ef4444';
                }
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
            
            return combinedCanvas.toDataURL('image/png');
        } catch (e) {
            console.error('Screenshot capture failed:', e);
            return null;
        }
    },
    
    flyTo: (lat: number, lon: number, zoom?: number) => {
        if (map.current) {
            map.current.flyTo({
                center: [lon, lat],
                zoom: zoom ?? map.current.getZoom(),
                duration: 1000
            });
        }
    },
    
    fitBounds: (north: number, south: number, east: number, west: number) => {
        if (map.current) {
            map.current.fitBounds(
                [[west, south], [east, north]],
                { padding: 50, duration: 1000 }
            );
        }
    },
    
    highlightPoint: (lat: number, lon: number, label?: string) => {
        if (!map.current) return;
        
        // Remove existing AI marker
        if (aiMarkerRef.current) {
            aiMarkerRef.current.remove();
        }
        
        // Create pulsing marker element
        const el = document.createElement('div');
        el.className = 'ai-highlight-marker';
        el.innerHTML = `
            <div class="ai-marker-pulse"></div>
            <div class="ai-marker-center"></div>
        `;
        
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat]);
        
        if (label) {
            marker.setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(
                `<div class="text-gray-900 p-2 text-sm font-sans font-bold">${label}</div>`
            ));
        }
        
        marker.addTo(map.current);
        aiMarkerRef.current = marker;
        
        // Fly to the point
        map.current.flyTo({
            center: [lon, lat],
            zoom: Math.max(map.current.getZoom(), 10),
            duration: 1000
        });
    },
    
    highlightSegment: (startIndex: number, endIndex: number) => {
        if (!map.current || !points || points.length === 0) return;
        
        const source = map.current.getSource('ai-highlight-segment') as maplibregl.GeoJSONSource;
        if (!source) return;
        
        const start = Math.max(0, startIndex);
        const end = Math.min(points.length - 1, endIndex);
        
        const segmentPoints = points.slice(start, end + 1);
        
        source.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: segmentPoints.map(p => [p.lon, p.lat])
                }
            }]
        });
        
        // Fit to segment bounds
        if (segmentPoints.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            segmentPoints.forEach(p => bounds.extend([p.lon, p.lat]));
            map.current.fitBounds(bounds, { padding: 100, duration: 1000 });
        }
    },
    
    clearHighlights: () => {
        // Remove AI marker
        if (aiMarkerRef.current) {
            aiMarkerRef.current.remove();
            aiMarkerRef.current = null;
        }
        
        // Clear AI segment highlight
        if (map.current) {
            const source = map.current.getSource('ai-highlight-segment') as maplibregl.GeoJSONSource;
            if (source) {
                source.setData({ type: 'FeatureCollection', features: [] });
            }
        }
    }
  }), [points]);

  useEffect(() => {
    fetchLearnedLayers()
        .then(data => {
            setLearnedLayers(data);
            console.log("[MapComponent] Loaded learned layers:", {
                paths: data.paths?.length || 0,
                turns: data.turns?.length || 0,
                sids: data.sids?.length || 0,
                stars: data.stars?.length || 0,
                tubes: data.tubes?.length || 0
            });
        })
        .catch(err => console.error("[MapComponent] Failed to load learned layers", err));
  }, []);

  useEffect(() => {
    fetchUnionTubes()
        .then(data => {
            setUnionTubes(data);
            console.log("[MapComponent] Loaded union tubes:", {
                union_tubes: data.union_tubes?.length || 0
            });
        })
        .catch(err => console.error("[MapComponent] Failed to load union tubes", err));
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/darkmatter/style.json?key=${apiKey}`,
      center: [34.8516, 31.0461], // Israel center
      zoom: 6,
      // @ts-expect-error - preserveDrawingBuffer is a valid WebGL option for screenshot capture
      preserveDrawingBuffer: true
    });

    map.current.on('load', () => {
      if (!map.current) return;

      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        },
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
        },
      });

      // Secondary Route (Proximity)
      map.current.addSource('secondary-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'secondary-route-line',
        type: 'line',
        source: 'secondary-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#fb923c', // Orange-400
          'line-width': 3,
          'line-dasharray': [2, 2]
        },
      });

      // Secondary Points (for hover tooltip)
      map.current.addSource('secondary-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'secondary-route-points',
        type: 'circle',
        source: 'secondary-points',
        paint: {
          'circle-radius': 3,
          'circle-color': '#fb923c',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });

      map.current.addSource('points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        },
      });

      map.current.addLayer({
        id: 'route-points',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });

      // AI Highlight Segment Layer
      map.current.addSource('ai-highlight-segment', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'ai-highlight-segment-line',
        type: 'line',
        source: 'ai-highlight-segment',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#f59e0b', // Amber-500
          'line-width': 8,
          'line-opacity': 0.8
        }
      });

      // AI Highlight Segment Glow (underneath)
      map.current.addLayer({
        id: 'ai-highlight-segment-glow',
        type: 'line',
        source: 'ai-highlight-segment',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#fbbf24',
          'line-width': 16,
          'line-opacity': 0.3,
          'line-blur': 4
        }
      }, 'ai-highlight-segment-line'); // Insert below the main line

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
      });

      const showPopup = (e: any) => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = 'pointer';

        const coordinates = (e.features![0].geometry as any).coordinates.slice();
        const props = e.features![0].properties;

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        const timeStr = new Date(props.timestamp * 1000).toLocaleTimeString();

        popup.setLngLat(coordinates)
            .setHTML(`
                <div class="text-gray-900 p-1 text-xs font-sans">
                    <div class="font-bold border-b border-gray-300 pb-1 mb-1">${timeStr}</div>
                    <div>Alt: <span class="font-mono font-bold">${props.alt}</span> ft</div>
                    <div>Hdg: <span class="font-mono font-bold">${props.track}°</span></div>
                </div>
            `)
            .addTo(map.current);
      };

      const hidePopup = () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = '';
        popup.remove();
      };

      map.current.on('mouseenter', 'route-points', showPopup);
      map.current.on('mouseleave', 'route-points', hidePopup);
      
      map.current.on('mouseenter', 'secondary-route-points', showPopup);
      map.current.on('mouseleave', 'secondary-route-points', hidePopup);
      
      // Mark map as loaded
      setMapLoaded(true);
    });

    return () => {
       // Cleanup handled by React refs mostly
    };
  }, []);

  // Effect to handle AI highlighted point from props
  useEffect(() => {
    if (!map.current) return;
    
    if (aiHighlightedPoint) {
        // Remove existing AI marker
        if (aiMarkerRef.current) {
            aiMarkerRef.current.remove();
        }
        
        // Create pulsing marker element
        const el = document.createElement('div');
        el.className = 'ai-highlight-marker';
        el.innerHTML = `
            <div class="ai-marker-pulse"></div>
            <div class="ai-marker-center"></div>
        `;
        
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([aiHighlightedPoint.lon, aiHighlightedPoint.lat]);
        
        if (aiHighlightedPoint.label) {
            marker.setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(
                `<div class="text-gray-900 p-2 text-sm font-sans font-bold">${aiHighlightedPoint.label}</div>`
            ));
        }
        
        marker.addTo(map.current);
        aiMarkerRef.current = marker;
        
        // Fly to the point
        map.current.flyTo({
            center: [aiHighlightedPoint.lon, aiHighlightedPoint.lat],
            zoom: Math.max(map.current.getZoom(), 10),
            duration: 1000
        });
    } else {
        // Clear marker
        if (aiMarkerRef.current) {
            aiMarkerRef.current.remove();
            aiMarkerRef.current = null;
        }
    }
  }, [aiHighlightedPoint]);

  // Effect to handle AI highlighted segment from props
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    
    const source = map.current.getSource('ai-highlight-segment') as maplibregl.GeoJSONSource;
    if (!source) return;
    
    if (aiHighlightedSegment && points && points.length > 0) {
        const start = Math.max(0, aiHighlightedSegment.startIndex);
        const end = Math.min(points.length - 1, aiHighlightedSegment.endIndex);
        
        const segmentPoints = points.slice(start, end + 1);
        
        source.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: segmentPoints.map(p => [p.lon, p.lat])
                }
            }]
        });
        
        // Fit to segment bounds
        if (segmentPoints.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            segmentPoints.forEach(p => bounds.extend([p.lon, p.lat]));
            map.current.fitBounds(bounds, { padding: 100, duration: 1000 });
        }
    } else {
        // Clear segment
        source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [aiHighlightedSegment, points]);

  // Effect to display ML anomaly point markers
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Remove existing ML markers
    mlMarkersRef.current.forEach(marker => marker.remove());
    mlMarkersRef.current = [];

    if (!showMLPoints || !mlAnomalyPoints || mlAnomalyPoints.length === 0) return;

    // Layer color mapping
    const layerColors: Record<string, string> = {
        'Deep Dense': '#8b5cf6',    // Purple
        'Deep CNN': '#f97316',      // Orange
        'Transformer': '#06b6d4',   // Cyan
        'Hybrid': '#ec4899'         // Pink
    };

    mlAnomalyPoints.forEach((pt) => {
        const color = layerColors[pt.layer] || '#f59e0b';
        
        // Create marker element
        const el = document.createElement('div');
        el.className = 'ml-anomaly-marker';
        el.style.cssText = `
            width: 16px;
            height: 16px;
            background: ${color};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 0 8px ${color}80;
            cursor: pointer;
        `;
        
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([pt.lon, pt.lat])
            .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`
                <div class="text-gray-900 p-2 text-xs font-sans">
                    <div class="font-bold border-b border-gray-300 pb-1 mb-1" style="color: ${color}">
                        ${pt.layer} Anomaly
                    </div>
                    <div>Time: <span class="font-mono">${new Date(pt.timestamp * 1000).toLocaleTimeString()}</span></div>
                    <div>Score: <span class="font-mono font-bold">${pt.point_score.toFixed(4)}</span></div>
                    <div class="text-gray-500 mt-1">${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}</div>
                </div>
            `))
            .addTo(map.current!);
        
        mlMarkersRef.current.push(marker);
    });
  }, [mlAnomalyPoints, showMLPoints]);

  // Learned Layers Visualization (Paths, Turns, SIDs, STARs)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Helper to add a source and layer safely
    const addLayerSafe = (id: string, color: string, dashArray: number[], type: 'line' | 'fill' = 'line') => {
        // Add source if it doesn't exist
        if (!map.current!.getSource(id)) {
            try {
                map.current!.addSource(id, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            } catch (e) {
                // Source already exists - ignore
            }
        }
        
        // Add layer if it doesn't exist (separate check from source)
        if (!map.current!.getLayer(`${id}-layer`)) {
            try {
                const beforeId = map.current!.getLayer('route-line') ? 'route-line' : undefined;

                const paint: any = type === 'line' ? {
                    'line-color': color,
                    'line-width': 2,
                    'line-opacity': 0.7,
                } : {
                    'fill-color': color,
                    'fill-opacity': 0.2,
                    'fill-outline-color': color
                };

                if (type === 'line' && dashArray && dashArray.length > 0) {
                    paint['line-dasharray'] = dashArray;
                }

                map.current!.addLayer({
                    id: `${id}-layer`,
                    type: type,
                    source: id,
                    layout: { 'visibility': 'visible' },
                    paint: paint
                } as any, beforeId);
            } catch (e) {
                // Layer already exists or other error - ignore
            }
        }
    };

    // Create all layer sources
    addLayerSafe('learned-paths', '#4CAF50', [], 'line');           // Green solid for paths
    addLayerSafe('learned-turns', '#FF9800', [], 'fill');           // Orange fill for turns
    addLayerSafe('learned-sids', '#2196F3', [5, 5], 'line');        // Blue dashed for SIDs
    addLayerSafe('learned-stars', '#E91E63', [5, 5], 'line');       // Pink dashed for STARs
    addLayerSafe('learned-tubes', '#9C27B0', [], 'fill');           // Purple fill for tubes
    addLayerSafe('union-tubes', '#00BCD4', [], 'fill');             // Cyan fill for union tubes

    // Register click handlers immediately after layer creation
    const mapInstance = map.current as any;
    if (!mapInstance._pathClickHandlersRegistered) {
      // Click handler for learned paths
      if (map.current.getLayer('learned-paths-layer')) {
        map.current.on('click', 'learned-paths-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: props?.origin,
            destination: props?.destination,
            member_count: props?.member_count,
            type: 'path'
          });
        });

        map.current.on('mouseenter', 'learned-paths-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'learned-paths-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for SIDs
      if (map.current.getLayer('learned-sids-layer')) {
        map.current.on('click', 'learned-sids-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: props?.airport,
            destination: 'SID Departure',
            member_count: props?.member_count,
            type: 'sid'
          });
        });

        map.current.on('mouseenter', 'learned-sids-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'learned-sids-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for STARs
      if (map.current.getLayer('learned-stars-layer')) {
        map.current.on('click', 'learned-stars-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: 'STAR Arrival',
            destination: props?.airport,
            member_count: props?.member_count,
            type: 'star'
          });
        });

        map.current.on('mouseenter', 'learned-stars-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'learned-stars-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for Turns
      if (map.current.getLayer('learned-turns-layer')) {
        map.current.on('click', 'learned-turns-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: `Turn Zone (${props?.avg_alt_ft?.toFixed(0) || '?'} ft)`,
            destination: `Radius: ${props?.radius_nm?.toFixed(1) || '?'} nm`,
            member_count: props?.member_count,
            type: 'turn'
          });
        });

        map.current.on('mouseenter', 'learned-turns-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'learned-turns-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for Tubes
      if (map.current.getLayer('learned-tubes-layer')) {
        map.current.on('click', 'learned-tubes-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: props?.origin || 'Unknown',
            destination: props?.destination || 'Unknown',
            member_count: props?.member_count,
            type: 'tube'
          });
        });

        map.current.on('mouseenter', 'learned-tubes-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'learned-tubes-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      // Click handler for Union Tubes
      if (map.current.getLayer('union-tubes-layer')) {
        map.current.on('click', 'union-tubes-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          
          const props = e.features[0].properties;
          setClickedPathInfo({
            id: props?.id || 'Unknown',
            origin: props?.origin || 'Unknown',
            destination: props?.destination || 'Unknown',
            member_count: props?.member_count,
            type: 'union_tube'
          });
        });

        map.current.on('mouseenter', 'union-tubes-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'union-tubes-layer', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }

      mapInstance._pathClickHandlersRegistered = true;
    }

    // Helper to create circle polygon from center and radius
    const createCirclePolygon = (lat: number, lon: number, radiusNm: number) => {
        const radiusKm = radiusNm * 1.852;
        const numPoints = 32;
        const coords: [number, number][] = [];
        const distanceX = radiusKm / (111.320 * Math.cos(lat * Math.PI / 180));
        const distanceY = radiusKm / 110.574;

        for (let i = 0; i < numPoints; i++) {
            const theta = (i / numPoints) * (2 * Math.PI);
            const x = distanceX * Math.cos(theta);
            const y = distanceY * Math.sin(theta);
            coords.push([lon + x, lat + y]);
        }
        coords.push(coords[0]); // Close the polygon
        return coords;
    };

    // Update paths source
    const updatePaths = () => {
        const source = map.current!.getSource('learned-paths') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showPaths && filteredPaths && filteredPaths.length > 0) {
            const features = filteredPaths
                .filter(path => path.centerline && path.centerline.length >= 2)
                .map(path => ({
                    type: 'Feature' as const,
                    properties: { 
                        id: path.id,
                        origin: path.origin,
                        destination: path.destination,
                        member_count: path.member_count
                    },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: path.centerline.map(p => [p.lon, p.lat])
                    }
                }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update turns source
    const updateTurns = () => {
        const source = map.current!.getSource('learned-turns') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showTurns && learnedLayers?.turns && learnedLayers.turns.length > 0) {
            const features = learnedLayers.turns.map(turn => ({
                type: 'Feature' as const,
                properties: { 
                    id: turn.id,
                    avg_alt_ft: turn.avg_alt_ft,
                    radius_nm: turn.radius_nm,
                    member_count: turn.member_count
                },
                geometry: {
                    type: 'Polygon' as const,
                    coordinates: [createCirclePolygon(turn.lat, turn.lon, turn.radius_nm)]
                }
            }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update SIDs source
    const updateSids = () => {
        const source = map.current!.getSource('learned-sids') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showSids && learnedLayers?.sids && learnedLayers.sids.length > 0) {
            const features = learnedLayers.sids
                .filter(proc => proc.centerline && proc.centerline.length >= 2)
                .map(proc => ({
                    type: 'Feature' as const,
                    properties: { 
                        id: proc.id,
                        airport: proc.airport,
                        type: proc.type,
                        member_count: proc.member_count
                    },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: proc.centerline.map(p => [p.lon, p.lat])
                    }
                }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update STARs source
    const updateStars = () => {
        const source = map.current!.getSource('learned-stars') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showStars && learnedLayers?.stars && learnedLayers.stars.length > 0) {
            const features = learnedLayers.stars
                .filter(proc => proc.centerline && proc.centerline.length >= 2)
                .map(proc => ({
                    type: 'Feature' as const,
                    properties: { 
                        id: proc.id,
                        airport: proc.airport,
                        type: proc.type,
                        member_count: proc.member_count
                    },
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: proc.centerline.map(p => [p.lon, p.lat])
                    }
                }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update Tubes source
    const updateTubes = () => {
        const source = map.current!.getSource('learned-tubes') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showTubes && filteredTubes && filteredTubes.length > 0) {
            const features = filteredTubes
                .filter(tube => tube.geometry && tube.geometry.length >= 3)
                .map(tube => ({
                    type: 'Feature' as const,
                    properties: { 
                        id: tube.id,
                        origin: tube.origin,
                        destination: tube.destination,
                        min_alt_ft: tube.min_alt_ft,
                        max_alt_ft: tube.max_alt_ft,
                        member_count: tube.member_count
                    },
                    geometry: {
                        type: 'Polygon' as const,
                        coordinates: [tube.geometry.map(coord => [coord[1], coord[0]])] // Convert [lat, lon] to [lon, lat]
                    }
                }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update Union Tubes source
    const updateUnionTubes = () => {
        const source = map.current!.getSource('union-tubes') as maplibregl.GeoJSONSource;
        if (!source) return;

        if (showUnionTubes && filteredUnionTubes && filteredUnionTubes.length > 0) {
            const features = filteredUnionTubes
                .filter(tube => tube.geometry && tube.geometry.length >= 3)
                .map(tube => ({
                    type: 'Feature' as const,
                    properties: { 
                        id: tube.id,
                        origin: tube.origin,
                        destination: tube.destination,
                        min_alt_ft: tube.min_alt_ft,
                        max_alt_ft: tube.max_alt_ft,
                        tube_count: tube.tube_count,
                        member_count: tube.member_count
                    },
                    geometry: {
                        type: 'Polygon' as const,
                        coordinates: [tube.geometry.map(coord => [coord[1], coord[0]])] // Convert [lat, lon] to [lon, lat]
                    }
                }));
            source.setData({ type: 'FeatureCollection', features });
        } else {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
    };

    // Update all sources
    updatePaths();
    updateTurns();
    updateSids();
    updateStars();
    updateTubes();
    updateUnionTubes();
  }, [mapLoaded, showPaths, showTurns, showSids, showStars, showTubes, showUnionTubes, learnedLayers, filteredPaths, selectedPathCluster, filteredTubes, selectedTubeCluster, filteredUnionTubes]);

  useEffect(() => {
    if (!map.current) return;
    
    if (!map.current.getSource('route')) {
        return;
    }

    const source = map.current.getSource('route') as maplibregl.GeoJSONSource;
    const pointsSource = map.current.getSource('points') as maplibregl.GeoJSONSource;
    const secondarySource = map.current.getSource('secondary-route') as maplibregl.GeoJSONSource;
    const secondaryPointsSource = map.current.getSource('secondary-points') as maplibregl.GeoJSONSource;
    
    // Reset markers (but preserve AI marker)
    const markers = document.getElementsByClassName('maplibregl-marker');
    const markersToRemove: Element[] = [];
    for (let i = 0; i < markers.length; i++) {
        if (!markers[i].classList.contains('ai-highlight-marker') && 
            !markers[i].querySelector('.ai-highlight-marker')) {
            markersToRemove.push(markers[i]);
        }
    }
    markersToRemove.forEach(m => m.remove());

    if (points.length === 0) {
        source.setData({
            type: 'FeatureCollection',
            features: []
        });
        if (pointsSource) {
            pointsSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        if (secondarySource) {
            secondarySource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        if (secondaryPointsSource) {
            secondaryPointsSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        return;
    }

    // Update Secondary Track
    if (secondarySource) {
        if (secondaryPoints && secondaryPoints.length > 0) {
            secondarySource.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: secondaryPoints.map(p => [p.lon, p.lat])
                    }
                }] as any
            });

            if (secondaryPointsSource) {
                 secondaryPointsSource.setData({
                    type: 'FeatureCollection',
                    features: secondaryPoints.map(p => ({
                        type: 'Feature',
                        properties: {
                            timestamp: p.timestamp,
                            alt: p.alt,
                            track: p.track ?? 0
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [p.lon, p.lat]
                        }
                    })) as any
                });
            }

        } else {
            secondarySource.setData({
                type: 'FeatureCollection',
                features: []
            });
            if (secondaryPointsSource) {
                secondaryPointsSource.setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
        }
    }

    // Fit bounds (include secondary points if available)
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend([p.lon, p.lat]));
    if (secondaryPoints && secondaryPoints.length > 0) {
        secondaryPoints.forEach((p) => bounds.extend([p.lon, p.lat]));
    }
    map.current.fitBounds(bounds, { padding: 50 });

    // Add Start Marker
    new maplibregl.Marker({ color: "#10b981" })
      .setLngLat([points[0].lon, points[0].lat])
      .setPopup(new maplibregl.Popup().setHTML("Start"))
      .addTo(map.current);

    // Add End Marker
    new maplibregl.Marker({ color: "#ef4444" })
        .setLngLat([points[points.length - 1].lon, points[points.length - 1].lat])
        .setPopup(new maplibregl.Popup().setHTML("End"))
        .addTo(map.current);

    // Create segments
    const features: any[] = [];
    
    // Create a Set for O(1) lookup
    const anomalySet = new Set(anomalyTimestamps);

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        
        // Check if this segment involves an anomaly
        // We consider the segment anomalous if either point is anomalous
        const isAnomaly = anomalySet.has(p1.timestamp) || anomalySet.has(p2.timestamp);
        
        features.push({
            type: 'Feature',
            properties: {
                color: isAnomaly ? '#ef4444' : '#3b82f6' // Red if anomaly, Blue otherwise
            },
            geometry: {
                type: 'LineString',
                coordinates: [
                    [p1.lon, p1.lat],
                    [p2.lon, p2.lat]
                ]
            }
        });
    }

    source.setData({
        type: 'FeatureCollection',
        features: features
    });

    if (pointsSource) {
        const pointFeatures = points.map(p => {
            const isAnomaly = anomalySet.has(p.timestamp);
            return {
                type: 'Feature',
                properties: {
                    color: isAnomaly ? '#ef4444' : '#3b82f6',
                    timestamp: p.timestamp,
                    alt: p.alt,
                    track: p.track ?? 0
                },
                geometry: {
                    type: 'Point',
                    coordinates: [p.lon, p.lat]
                }
            };
        });

        pointsSource.setData({
            type: 'FeatureCollection',
            features: pointFeatures as any
        });
    }

  }, [points, secondaryPoints, anomalyTimestamps]);

  return (
    <div className="relative w-full h-full" id="map-root">
        <div ref={mapContainer} className="w-full h-full" />
        
        {/* Clear AI Highlights Button */}
        {(aiHighlightedPoint || aiHighlightedSegment) && onClearAIHighlights && (
            <button
                onClick={onClearAIHighlights}
                className="absolute top-4 left-4 z-10 px-3 py-2 rounded-lg shadow-lg text-xs font-medium 
                           bg-amber-500 text-white hover:bg-amber-600 transition-colors
                           flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Clear AI Highlight
            </button>
        )}
        
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <div className="relative">
                <button 
                    onClick={() => {
                        if (!showPaths) {
                            setShowPaths(true);
                        }
                        setShowPathSelector(!showPathSelector);
                    }}
                    className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors flex items-center gap-1 ${
                        showPaths ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    title={`${filteredPaths?.length || 0} / ${totalValidPaths} flight paths`}
                >
                    <span>{showPaths ? "Paths" : "Show Paths"}</span>
                    {showPaths && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                            {filteredPaths?.length || 0}
                        </span>
                    )}
                    <svg className={`w-3 h-3 transition-transform ${showPathSelector ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                
                {/* Path Cluster Dropdown */}
                {showPathSelector && showPaths && (
                    <div className="absolute right-0 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                        <div className="p-2 border-b border-gray-700 space-y-2">
                            <div className="text-xs text-gray-400 mb-2">Search by Airport Code</div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Origin (e.g., LLBG)"
                                    value={originSearchQuery}
                                    onChange={(e) => setOriginSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Dest (e.g., JFK)"
                                    value={destSearchQuery}
                                    onChange={(e) => setDestSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                                />
                            </div>
                            {currentFlightOrigin && currentFlightDestination && (
                                <button
                                    onClick={() => {
                                        setOriginSearchQuery(currentFlightOrigin);
                                        setDestSearchQuery(currentFlightDestination);
                                        // Find and select the matching cluster
                                        const matchingKey = `${currentFlightOrigin}_${currentFlightDestination}`;
                                        const matchingCluster = pathClusters.find(c => c.key === matchingKey);
                                        if (matchingCluster) {
                                            setSelectedPathCluster(matchingKey);
                                        }
                                    }}
                                    className="w-full px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1"
                                    title={`Focus on ${currentFlightOrigin} → ${currentFlightDestination}`}
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Focus on Current Flight Route
                                </button>
                            )}
                        </div>
                        <div className="p-2 border-b border-gray-700">
                            <div className="text-xs text-gray-400 mb-2">Filter by Route</div>
                            <button
                                onClick={() => {
                                    setSelectedPathCluster('all');
                                    setOriginSearchQuery('');
                                    setDestSearchQuery('');
                                    setShowPathSelector(false);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                                    selectedPathCluster === 'all' 
                                        ? 'bg-green-600 text-white' 
                                        : 'text-gray-300 hover:bg-gray-800'
                                }`}
                            >
                                All Routes ({totalValidPaths})
                            </button>
                        </div>
                        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                            {filteredPathClusters.length > 0 ? (
                                filteredPathClusters.map(cluster => (
                                    <button
                                        key={cluster.key}
                                        onClick={() => {
                                            setSelectedPathCluster(cluster.key);
                                            setShowPathSelector(false);
                                        }}
                                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex justify-between items-center ${
                                            selectedPathCluster === cluster.key 
                                                ? 'bg-green-600 text-white' 
                                                : 'text-gray-300 hover:bg-gray-800'
                                        }`}
                                    >
                                        <span className="truncate">{cluster.label}</span>
                                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                                            selectedPathCluster === cluster.key 
                                                ? 'bg-white/20' 
                                                : 'bg-gray-700'
                                        }`}>
                                            {cluster.count}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className="text-xs text-gray-500 text-center py-4">
                                    No routes found
                                    {(originSearchQuery || destSearchQuery) && (
                                        <div className="mt-1">
                                            {originSearchQuery && <div>Origin: "{originSearchQuery}"</div>}
                                            {destSearchQuery && <div>Dest: "{destSearchQuery}"</div>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {showPaths && (
                            <div className="p-2 border-t border-gray-700">
                                <button
                                    onClick={() => {
                                        setShowPaths(false);
                                        setShowPathSelector(false);
                                        setSelectedPathCluster('all');
                                        setOriginSearchQuery('');
                                        setDestSearchQuery('');
                                    }}
                                    className="w-full px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                                >
                                    Hide All Paths
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <button 
                onClick={() => setShowTurns(!showTurns)}
                className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors ${
                    showTurns ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={`${learnedLayers?.turns?.length || 0} turn zones`}
            >
                {showTurns ? "Hide Turns" : "Show Turns"}
            </button>
            <button 
                onClick={() => setShowSids(!showSids)}
                className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors ${
                    showSids ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={`${learnedLayers?.sids?.length || 0} SID procedures`}
            >
                {showSids ? "Hide SIDs" : "Show SIDs"}
            </button>
            <button 
                onClick={() => setShowStars(!showStars)}
                className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors ${
                    showStars ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={`${learnedLayers?.stars?.length || 0} STAR procedures`}
            >
                {showStars ? "Hide STARs" : "Show STARs"}
            </button>
            <div className="relative">
                <button 
                    onClick={() => {
                        if (!showTubes) {
                            setShowTubes(true);
                        }
                        setShowTubeSelector(!showTubeSelector);
                    }}
                    className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors flex items-center gap-1 ${
                        showTubes ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    title={`${filteredTubes?.length || 0} / ${totalValidTubes} flight tubes`}
                >
                    <span>{showTubes ? "Tubes" : "Show Tubes"}</span>
                    {showTubes && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                            {filteredTubes?.length || 0}
                        </span>
                    )}
                    <svg className={`w-3 h-3 transition-transform ${showTubeSelector ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                
                {/* Tube Cluster Dropdown */}
                {showTubeSelector && showTubes && (
                    <div className="absolute right-0 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                        <div className="p-2 border-b border-gray-700 space-y-2">
                            <div className="text-xs text-gray-400 mb-2">Search by Airport Code</div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Origin (e.g., LLBG)"
                                    value={tubeOriginSearchQuery}
                                    onChange={(e) => setTubeOriginSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Dest (e.g., JFK)"
                                    value={tubeDestSearchQuery}
                                    onChange={(e) => setTubeDestSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                />
                            </div>
                            {currentFlightOrigin && currentFlightDestination && (
                                <button
                                    onClick={() => {
                                        setTubeOriginSearchQuery(currentFlightOrigin);
                                        setTubeDestSearchQuery(currentFlightDestination);
                                        // Find and select the matching cluster
                                        const matchingKey = `${currentFlightOrigin}_${currentFlightDestination}`;
                                        const matchingCluster = tubeClusters.find(c => c.key === matchingKey);
                                        if (matchingCluster) {
                                            setSelectedTubeCluster(matchingKey);
                                        }
                                    }}
                                    className="w-full px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1"
                                    title={`Focus on ${currentFlightOrigin} → ${currentFlightDestination}`}
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Focus on Current Flight Route
                                </button>
                            )}
                        </div>
                        <div className="p-2 border-b border-gray-700">
                            <div className="text-xs text-gray-400 mb-2">Filter by Route</div>
                            <button
                                onClick={() => {
                                    setSelectedTubeCluster('all');
                                    setTubeOriginSearchQuery('');
                                    setTubeDestSearchQuery('');
                                    setShowTubeSelector(false);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                                    selectedTubeCluster === 'all' 
                                        ? 'bg-purple-600 text-white' 
                                        : 'text-gray-300 hover:bg-gray-800'
                                }`}
                            >
                                All Routes ({totalValidTubes})
                            </button>
                        </div>
                        <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                            {filteredTubeClusters.length > 0 ? (
                                filteredTubeClusters.map(cluster => (
                                    <button
                                        key={cluster.key}
                                        onClick={() => {
                                            setSelectedTubeCluster(cluster.key);
                                            setShowTubeSelector(false);
                                        }}
                                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex justify-between items-center ${
                                            selectedTubeCluster === cluster.key 
                                                ? 'bg-purple-600 text-white' 
                                                : 'text-gray-300 hover:bg-gray-800'
                                        }`}
                                    >
                                        <span className="truncate">{cluster.label}</span>
                                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                                            selectedTubeCluster === cluster.key 
                                                ? 'bg-white/20' 
                                                : 'bg-gray-700'
                                        }`}>
                                            {cluster.count}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className="text-xs text-gray-500 text-center py-4">
                                    No routes found
                                    {(tubeOriginSearchQuery || tubeDestSearchQuery) && (
                                        <div className="mt-1">
                                            {tubeOriginSearchQuery && <div>Origin: "{tubeOriginSearchQuery}"</div>}
                                            {tubeDestSearchQuery && <div>Dest: "{tubeDestSearchQuery}"</div>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {showTubes && (
                            <div className="p-2 border-t border-gray-700">
                                <button
                                    onClick={() => {
                                        setShowTubes(false);
                                        setShowTubeSelector(false);
                                        setSelectedTubeCluster('all');
                                        setTubeOriginSearchQuery('');
                                        setTubeDestSearchQuery('');
                                    }}
                                    className="w-full px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                                >
                                    Hide All Tubes
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="relative">
                <button 
                    onClick={() => {
                        if (!showUnionTubes) {
                            setShowUnionTubes(true);
                        }
                        setShowUnionTubeSelector(!showUnionTubeSelector);
                    }}
                    className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors flex items-center gap-1 ${
                        showUnionTubes ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    title={`${filteredUnionTubes?.length || 0} / ${unionTubes?.union_tubes?.length || 0} unified tubes (1 per OD pair)`}
                >
                    <span>{showUnionTubes ? "Union Tubes" : "Show Union Tubes"}</span>
                    {showUnionTubes && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                            {filteredUnionTubes?.length || 0}
                        </span>
                    )}
                    <svg className={`w-3 h-3 transition-transform ${showUnionTubeSelector ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                
                {/* Union Tube Search Dropdown */}
                {showUnionTubeSelector && showUnionTubes && (
                    <div className="absolute right-0 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                        <div className="p-2 border-b border-gray-700 space-y-2">
                            <div className="text-xs text-gray-400 mb-2">Search by Airport Code</div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Origin (e.g., LLBG)"
                                    value={unionTubeOriginSearchQuery}
                                    onChange={(e) => setUnionTubeOriginSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Dest (e.g., JFK)"
                                    value={unionTubeDestSearchQuery}
                                    onChange={(e) => setUnionTubeDestSearchQuery(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                                />
                            </div>
                            {currentFlightOrigin && currentFlightDestination && (
                                <button
                                    onClick={() => {
                                        setUnionTubeOriginSearchQuery(currentFlightOrigin);
                                        setUnionTubeDestSearchQuery(currentFlightDestination);
                                    }}
                                    className="w-full px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1"
                                    title={`Focus on ${currentFlightOrigin} → ${currentFlightDestination}`}
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Focus on Current Flight Route
                                </button>
                            )}
                        </div>
                        {filteredUnionTubes && filteredUnionTubes.length > 0 && (
                            <div className="p-2 border-b border-gray-700">
                                <div className="text-xs text-gray-400 mb-2">
                                    Showing {filteredUnionTubes.length} of {unionTubes?.union_tubes?.length || 0} routes
                                    {(unionTubeOriginSearchQuery || unionTubeDestSearchQuery) && (
                                        <div className="mt-1 text-cyan-400">
                                            {unionTubeOriginSearchQuery && <div>Origin: "{unionTubeOriginSearchQuery}"</div>}
                                            {unionTubeDestSearchQuery && <div>Dest: "{unionTubeDestSearchQuery}"</div>}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        setUnionTubeOriginSearchQuery('');
                                        setUnionTubeDestSearchQuery('');
                                    }}
                                    className="w-full px-2 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 transition-colors"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        )}
                        {(!filteredUnionTubes || filteredUnionTubes.length === 0) && (unionTubeOriginSearchQuery || unionTubeDestSearchQuery) && (
                            <div className="p-2 text-xs text-gray-400 text-center">
                                No routes found
                                {(unionTubeOriginSearchQuery || unionTubeDestSearchQuery) && (
                                    <div className="mt-1">
                                        {unionTubeOriginSearchQuery && <div>Origin: "{unionTubeOriginSearchQuery}"</div>}
                                        {unionTubeDestSearchQuery && <div>Dest: "{unionTubeDestSearchQuery}"</div>}
                                    </div>
                                )}
                            </div>
                        )}
                        {showUnionTubes && (
                            <div className="p-2 border-t border-gray-700">
                                <button
                                    onClick={() => {
                                        setShowUnionTubes(false);
                                        setShowUnionTubeSelector(false);
                                        setUnionTubeOriginSearchQuery('');
                                        setUnionTubeDestSearchQuery('');
                                    }}
                                    className="w-full px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                                >
                                    Hide All Union Tubes
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {mlAnomalyPoints && mlAnomalyPoints.length > 0 && (
                <button 
                    onClick={() => setShowMLPoints(!showMLPoints)}
                    className={`px-3 py-2 rounded shadow text-xs font-medium opacity-90 transition-colors ${
                        showMLPoints ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                    {showMLPoints ? "Hide ML Points" : "Show ML Points"}
                </button>
            )}
        </div>
        
        {/* Clicked Path Info Panel */}
        {clickedPathInfo && (
            <div className="absolute bottom-4 left-4 z-10 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-3 max-w-xs backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
                        {clickedPathInfo.type === 'tube' ? 'Tube Info' : 
                         clickedPathInfo.type === 'union_tube' ? 'Union Tube Info' : 
                         clickedPathInfo.type === 'sid' ? 'SID Info' :
                         clickedPathInfo.type === 'star' ? 'STAR Info' :
                         clickedPathInfo.type === 'turn' ? 'Turn Zone Info' :
                         'Path Info'}
                    </span>
                    <button 
                        onClick={() => setClickedPathInfo(null)}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">ID:</span>
                        <span className="text-white text-xs font-mono bg-gray-800 px-2 py-0.5 rounded select-all">{clickedPathInfo.id}</span>
                    </div>
                    {clickedPathInfo.origin && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">From:</span>
                            <span className="text-white text-xs">{clickedPathInfo.origin}</span>
                        </div>
                    )}
                    {clickedPathInfo.destination && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">To:</span>
                            <span className="text-white text-xs">{clickedPathInfo.destination}</span>
                        </div>
                    )}
                    {clickedPathInfo.member_count && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">Flights:</span>
                            <span className="text-white text-xs">{clickedPathInfo.member_count}</span>
                        </div>
                    )}
                    {clickedPathInfo.type === 'tube' && clickedPathInfo.member_count && clickedPathInfo.member_count > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-700">
                            <button 
                                onClick={() => {
                                    console.log('Show all flights from tube:', clickedPathInfo.id);
                                    alert(`Feature coming soon: Display ${clickedPathInfo.member_count} flights from tube ${clickedPathInfo.id}\n\nNote: This requires backend API support to fetch all flights in this tube cluster.`);
                                }}
                                className="w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                            >
                                Show All {clickedPathInfo.member_count} Flights
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* CSS for AI Highlight Marker Animation */}
        <style>{`
            .ai-highlight-marker {
                position: relative;
                width: 24px;
                height: 24px;
            }
            
            .ai-marker-center {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 12px;
                height: 12px;
                background: #f59e0b;
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);
            }
            
            .ai-marker-pulse {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 24px;
                height: 24px;
                background: rgba(245, 158, 11, 0.4);
                border-radius: 50%;
                animation: ai-pulse 1.5s ease-out infinite;
            }
            
            @keyframes ai-pulse {
                0% {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translate(-50%, -50%) scale(2.5);
                    opacity: 0;
                }
            }
        `}</style>
    </div>
  );
});

// Display name for debugging
MapComponent.displayName = 'MapComponent';
