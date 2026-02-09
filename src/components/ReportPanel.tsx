import React, { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, CheckCircle, PlayCircle, Radio, Plane, Navigation, MapPin, RotateCcw, Compass, ShieldAlert, Wifi, RefreshCw, Loader2, ExternalLink, ChevronDown, Skull, CircleDot, Target, GraduationCap, Shield, Eye, Satellite, Gauge, UserX, Clock, WifiOff, Building2 } from 'lucide-react';
import type { AnomalyReport } from '../types';
import { submitFeedback, fetchCallsignFromResearch, reanalyzeFeedbackFlight } from '../api';
import clsx from 'clsx';
import { ReplayModal, ReplayEvent } from './ReplayModal';
import { useLanguage } from '../contexts/LanguageContext';

// Available rules type
interface Rule {
    id: number;
    name: string;
    nameHe: string;
    description: string;
    category: 'emergency' | 'flight_ops' | 'technical' | 'military' | 'other';
    color: string;
}

// Hardcoded tagging rules list
const TAGGING_RULES: Rule[] = [
    // Emergency & Safety (Red)
    { id: 1, name: 'Emergency Squawks', nameHe: 'קודי חירום', description: 'Aircraft transmitting emergency squawk codes (7500, 7600, 7700)', category: 'emergency', color: 'red' },
    { id: 2, name: 'Crash', nameHe: 'התרסקות', description: 'Aircraft crash or suspected crash event', category: 'emergency', color: 'red' },
    { id: 3, name: 'Proximity Alert', nameHe: 'התראת קרבה', description: 'Dangerous proximity between aircraft', category: 'emergency', color: 'red' },
    
    // Flight Operations (Blue)
    { id: 4, name: 'Holding Pattern', nameHe: 'דפוס המתנה', description: 'Aircraft in holding pattern', category: 'flight_ops', color: 'blue' },
    { id: 5, name: 'Go Around', nameHe: 'גו-אראונד', description: 'Aborted landing and go-around maneuver', category: 'flight_ops', color: 'blue' },
    { id: 6, name: 'Return to Land', nameHe: 'חזרה לנחיתה', description: 'Aircraft returning to departure airport', category: 'flight_ops', color: 'blue' },
    { id: 7, name: 'Unplanned Landing', nameHe: 'נחיתה לא מתוכננת', description: 'Landing at unplanned airport', category: 'flight_ops', color: 'blue' },
    
    // Technical (Purple)
    { id: 8, name: 'Signal Loss', nameHe: 'אובדן אות', description: 'Loss of ADS-B signal', category: 'technical', color: 'purple' },
    { id: 9, name: 'Off Course', nameHe: 'סטייה ממסלול', description: 'Significant deviation from expected flight path', category: 'technical', color: 'purple' },
    { id: 18, name: 'GPS Jamming', nameHe: 'שיבוש GPS', description: 'GPS jamming indicators detected (altitude oscillation, spoofed values, MLAT-only)', category: 'technical', color: 'purple' },
    
    // Military (Green)
    { id: 10, name: 'Military Flight', nameHe: 'טיסה צבאית', description: 'Identified military aircraft', category: 'military', color: 'green' },
    { id: 11, name: 'Operational Military Flight', nameHe: 'טיסה צבאית מבצעית', description: 'Military aircraft on operational mission', category: 'military', color: 'green' },
    { id: 12, name: 'Suspicious Behavior', nameHe: 'התנהגות חשודה', description: 'Unusual or suspicious flight behavior', category: 'military', color: 'green' },
    { id: 13, name: 'Flight Academy', nameHe: 'בית ספר לטיסה', description: 'Training flight from flight school', category: 'military', color: 'green' },
    { id: 14, name: 'Circular Surveillance', nameHe: 'טיסה מעגלית חשודה', description: 'Non-commercial off-route circular flight pattern', category: 'military', color: 'green' },
    { id: 15, name: 'Distance Trend Diversion', nameHe: 'הסטה מיעד', description: 'Consistent distancing from planned destination', category: 'flight_ops', color: 'blue' },
    { id: 16, name: 'Performance Mismatch', nameHe: 'אי-התאמת ביצועים', description: 'Turn rate exceeds physical limits for declared aircraft type', category: 'military', color: 'green' },
    { id: 17, name: 'Identity Spoofing', nameHe: 'התחזות זהות', description: 'Speed/climb rate exceeds physical envelope of declared aircraft', category: 'military', color: 'green' },
    { id: 19, name: 'Endurance Breach', nameHe: 'חריגת סיבולת זמן', description: 'Flight duration exceeds 120% of aircraft type max endurance', category: 'military', color: 'green' },
    { id: 20, name: 'Signal Dropout', nameHe: 'ניתוק אות טקטי', description: 'Suspicious in-flight signal discontinuity with stable conditions', category: 'technical', color: 'purple' },
    { id: 21, name: 'Military Airport Usage', nameHe: 'שימוש בשדה צבאי', description: 'Commercial aircraft at military-only airport', category: 'military', color: 'green' },
];

// Rule icon mapping
const getRuleIcon = (ruleId: number) => {
    const iconMap: Record<number, React.ComponentType<any>> = {
        1: Radio,           // Emergency Squawks
        2: Skull,           // Crash
        3: ShieldAlert,     // Proximity Alert
        4: CircleDot,       // Holding Pattern
        5: Plane,           // Go Around
        6: RotateCcw,       // Return to Land
        7: MapPin,          // Unplanned Landing
        8: Wifi,            // Signal Loss
        9: Compass,         // Off Course
        10: Shield,         // Military Flight
        11: Target,         // Operational Military Flight
        12: Eye,            // Suspicious Behavior
        13: GraduationCap,  // Flight Academy
        14: RefreshCw,      // Circular Surveillance
        15: Navigation,     // Distance Trend Diversion
        16: Gauge,          // Performance Mismatch
        17: UserX,          // Identity Spoofing
        18: Satellite,      // GPS Jamming
        19: Clock,          // Endurance Breach
        20: WifiOff,        // Signal Dropout
        21: Building2,      // Military Airport Usage
    };
    return iconMap[ruleId] || AlertTriangle;
};

interface ReportPanelProps {
    anomaly: AnomalyReport | null;
    onClose: () => void;
    className?: string;
    mode?: 'historical' | 'realtime' | 'research' | 'rules' | 'feedback' | 'ai-results';
    onFlyTo?: (lat: number, lon: number, zoom?: number) => void;
}

// Layer color mapping for ML models
const LAYER_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
    'Layer 3: Deep Dense Autoencoder': { bg: 'bg-purple-500/15', border: 'border-purple-400', text: 'text-purple-300', accent: 'bg-purple-500/30' },
    'Layer 4: Deep CNN': { bg: 'bg-orange-500/15', border: 'border-orange-400', text: 'text-orange-300', accent: 'bg-orange-500/30' },
    'Layer 5: Transformer': { bg: 'bg-cyan-500/15', border: 'border-cyan-400', text: 'text-cyan-300', accent: 'bg-cyan-500/30' },
    'Layer 6: Hybrid CNN-Transformer': { bg: 'bg-pink-500/15', border: 'border-pink-400', text: 'text-pink-300', accent: 'bg-pink-500/30' },
};

const LayerCard: React.FC<{ title: string; data: any; type: 'rules' | 'model'; resolvedCallsigns?: Record<string, string>; onFlyTo?: (lat: number, lon: number, zoom?: number) => void; isHebrew?: boolean }> = ({ title, data, type, resolvedCallsigns, onFlyTo, isHebrew }) => {
    const [anomalyLocationsCollapsed, setAnomalyLocationsCollapsed] = useState(true);
    
    if (!data) return null;

    const isAnomaly = type === 'rules' ? data.status === 'ANOMALY' : data.is_anomaly;
    const statusColor = isAnomaly ? 'text-red-400' : 'text-green-400';
    const Icon = isAnomaly ? AlertTriangle : CheckCircle;
    
    // Get layer-specific colors for ML models
    const layerColor = LAYER_COLORS[title] || { bg: 'bg-orange-500/15', border: 'border-orange-400', text: 'text-orange-300', accent: 'bg-orange-500/30' };

    // Distinct styling for anomalies
    const cardStyle = isAnomaly 
        ? "bg-red-500/10 border-red-500/30" 
        : "bg-surface border-white/10";

    // Special handling for "Dangerous Proximity" (ID 4)
    const renderProximityEvents = (rule: any) => {
        if (!rule.details?.events?.length) return null;
        return (
            <div className="mt-2 space-y-2">
                <p className="text-xs font-bold text-red-300">{isHebrew ? "פרטי קונפליקט:" : "Conflict Details:"}</p>
                {rule.details.events.map((ev: any, idx: number) => {
                    const callsign = ev.other_callsign || (resolvedCallsigns && resolvedCallsigns[ev.other_flight]);
                    return (
                        <div key={idx} className="bg-red-500/10 p-2 rounded border border-red-500/20 text-[10px] text-red-200">
                            <div className="flex justify-between">
                                <span>{isHebrew ? "טיסה אחרת: " : "Other Flight: "}<span className="font-bold font-mono">{callsign ? `${callsign} (${ev.other_flight})` : ev.other_flight}</span></span>
                                <span className="font-mono text-white/60">
                                    {new Date(ev.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>
                            <div className="flex justify-between mt-1 text-white/40">
                                <span>{isHebrew ? "מרחק: " : "Dist: "}{ev.distance_nm} NM</span>
                                <span>{isHebrew ? "הפרש גובה: " : "Alt Diff: "}{ev.altitude_diff_ft} ft</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Special handling for "Path Deviation" (ID 11)
    const renderPathDeviation = (rule: any) => {
        const details = rule.details || {};
        
        return (
            <div className="mt-2 space-y-2">
                {details.deviations && details.deviations.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-white/60">{isHebrew ? `סטיות (${details.deviations.length}):` : `Deviations (${details.deviations.length}):`}</p>
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                             {details.deviations.slice(0, 50).map((dev: any, idx: number) => (
                                <div key={idx} className="bg-red-500/10 p-2 rounded border border-red-500/20 text-[10px] text-red-200">
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono opacity-70">
                                            {new Date(dev.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        <span className="font-bold">{dev.dist_nm} {isHebrew ? "מייל סטייה" : "NM off"}</span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1 opacity-60">
                                        <span>{isHebrew ? "גובה: " : "Alt: "}{dev.alt} ft</span>
                                        <span>{dev.lat.toFixed(2)}, {dev.lon.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                            {details.deviations.length > 50 && (
                                <p className="text-[10px] text-center text-white/40 italic">
                                    {isHebrew ? `+ עוד ${details.deviations.length - 50} נקודות...` : `+ ${details.deviations.length - 50} more points...`}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {details.segments && (
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-white/60">{isHebrew ? "ניתוח מקטעים:" : "Segment Analysis:"}</p>
                        {Object.entries(details.segments).map(([phase, data]: [string, any]) => {
                            // Check if phase was skipped
                            const isSkipped = data === "skipped_phase" || data === "skipped_short" || data === "skipped_resample";
                            
                            if (isSkipped) {
                                return (
                                     <div key={phase} className="bg-white/5 p-2 rounded border border-white/10 text-[10px] text-white/60 opacity-50">
                                        <div className="flex justify-between mb-1">
                                            <span className="font-bold uppercase text-white/40">{phase}</span>
                                            <span className="text-white/40">SKIPPED</span>
                                        </div>
                                        <span className="italic text-white/30">Not analyzed (not cruise or too short)</span>
                                     </div>
                                );
                            }

                            return (
                                <div key={phase} className="bg-white/5 p-2 rounded border border-white/10 text-[10px] text-white/60">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold uppercase text-white/40">{phase}</span>
                                        <span className={data.match_found ? "text-green-400" : "text-red-400"}>
                                            {data.match_found ? (isHebrew ? "תואם" : "MATCH") : (isHebrew ? "לא תואם" : "NO MATCH")}
                                        </span>
                                    </div>
                                    {data.match_found ? (
                                        <div className="flex flex-col gap-0.5">
                                            <span>{isHebrew ? "זרימה: " : "Flow: "}{data.flow_id} ({data.layer})</span>
                                            <span>{isHebrew ? "מרחק: " : "Dist: "}{data.dist_nm} NM</span>
                                        </div>
                                    ) : (
                                        <span className="italic">{isHebrew ? "אין מסלול תואם" : "No matching path"}</span>
                                    )}
                                    {data.closest_loose_dist_nm !== undefined && (
                                         <div className="mt-1 pt-1 border-t border-white/10 text-blue-300">
                                             {isHebrew ? "מרחק גס: " : "Loose Dist: "}{data.closest_loose_dist_nm} NM
                                         </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={clsx("rounded-lg p-3 border transition-all", cardStyle)}>
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-white">{title}</h4>
                <Icon className={clsx("size-4", statusColor)} />
            </div>
            
            <div className="space-y-1">
                {type === 'rules' && (
                    <>
                        <p className="text-xs text-white/60">{isHebrew ? "סטטוס: " : "Status: "}<span className={statusColor}>{data.status}</span></p>
                        {data.triggers && data.triggers.length > 0 && (
                            <div className="mt-1">
                                <p className="text-xs text-white/60 mb-1">{isHebrew ? "טריגרים:" : "Triggers:"}</p>
                                <ul className="list-disc list-inside text-xs text-white/80">
                                    {data.triggers.map((t: string, i: number) => (
                                        <li key={i}>{t}</li>
                                    ))}
                                </ul>
                                
                                {/* Show details for each matched rule */}
                                {data.report?.matched_rules?.map((rule: any) => {
                                    // Special rendering for proximity and path deviation
                                    if (rule.id === 4) return <div key={rule.id}>{renderProximityEvents(rule)}</div>;
                                    if (rule.id === 11) return <div key={rule.id}>{renderPathDeviation(rule)}</div>;
                                    // Generic rendering for all other matched rules (show summary + key details)
                                    if (rule.summary) {
                                        return (
                                            <div key={rule.id} className="mt-1 bg-white/5 p-2 rounded border border-white/10 text-[10px] text-white/70">
                                                <div className="flex items-center gap-1 mb-0.5">
                                                    <span className="font-bold text-white/90">#{rule.id}</span>
                                                    {rule.category && <span className="text-white/40">({rule.category})</span>}
                                                </div>
                                                <p>{rule.summary}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        )}
                    </>
                )}

                {type === 'model' && (
                    <>
                         <p className="text-xs text-white/60">
                            {isHebrew ? "חיזוי: " : "Prediction: "}<span className={statusColor}>{isAnomaly ? (isHebrew ? 'אנומליה' : 'Anomaly') : (isHebrew ? 'תקין' : 'Normal')}</span>
                         </p>
                         {data.severity !== undefined && (
                            <div className="mt-1">
                                <p className="text-xs text-white/60">{isHebrew ? "ציון חומרה" : "Severity Score"}</p>
                                <div className="h-1.5 w-full bg-white/10 rounded-full mt-1 overflow-hidden">
                                    <div 
                                        className={clsx("h-full rounded-full", isAnomaly ? "bg-red-500" : "bg-green-500")} 
                                        style={{ width: `${Math.min(100, data.severity * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-right text-white/40 mt-0.5">{data.severity.toFixed(3)}</p>
                            </div>
                         )}
                         {data.score !== undefined && (
                             <p className="text-xs text-white/60">{isHebrew ? "ציון: " : "Score: "}{data.score.toFixed(3)}</p>
                         )}
                         
                         {/* ML Anomaly Points - Always show section with layer-specific colors */}
                         <div className="mt-3 pt-2 border-t border-white/10">
                            <div 
                                className="flex items-center justify-between mb-2 cursor-pointer hover:bg-white/5 -mx-1 px-1 py-1 rounded transition-colors"
                                onClick={() => setAnomalyLocationsCollapsed(!anomalyLocationsCollapsed)}
                            >
                                <p className="text-xs font-bold flex items-center gap-1.5">
                                    <ChevronDown className={clsx("size-3 transition-transform", isAnomaly ? layerColor.text : "text-white/40", anomalyLocationsCollapsed && "-rotate-90")} />
                                    <MapPin className={clsx("size-3", isAnomaly ? layerColor.text : "text-white/40")} />
                                    <span className={isAnomaly ? layerColor.text : "text-white/40"}>
                                        {isHebrew ? "מיקומי אנומליה שזוהו" : "Detected Anomaly Locations"}
                                    </span>
                                </p>
                                {data.anomaly_points && data.anomaly_points.length > 0 && (
                                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-bold", layerColor.accent, layerColor.text)}>
                                        {data.anomaly_points.length} {isHebrew ? "נקודות" : "points"}
                                    </span>
                                )}
                            </div>
                            
                            {!anomalyLocationsCollapsed && (
                                data.anomaly_points && data.anomaly_points.length > 0 ? (
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                        {data.anomaly_points.map((pt: any, idx: number) => (
                                            <div 
                                                key={idx} 
                                                className={clsx(
                                                    "p-2.5 rounded-lg border-l-2 text-[10px] transition-all",
                                                    layerColor.bg, layerColor.border,
                                                    onFlyTo && "cursor-pointer hover:brightness-125 hover:scale-[1.02]"
                                                )}
                                                onClick={() => onFlyTo?.(pt.lat, pt.lon, 14)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={clsx("w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px]", layerColor.accent, layerColor.text)}>
                                                            {idx + 1}
                                                        </span>
                                                        <span className="font-mono text-white/80">
                                                            {new Date(pt.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-white/40">{isHebrew ? "ציון:" : "Score:"}</span>
                                                        <span className={clsx("font-mono font-bold", layerColor.text)}>{pt.point_score.toFixed(4)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between mt-1.5 pl-7">
                                                    <span className="text-white/50 font-mono text-[9px]">
                                                        {pt.lat.toFixed(4)}°, {pt.lon.toFixed(4)}°
                                                    </span>
                                                    <span className="text-white/30 text-[9px]">
                                                        {isHebrew ? "שגיאת שחזור" : "reconstruction error"}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-white/30 italic text-center py-2 bg-white/5 rounded">
                                        {isAnomaly ? (isHebrew ? "לא זוהו נקודות ספציפיות" : "No specific points identified") : (isHebrew ? "לא זוהו אנומליות" : "No anomalies detected")}
                                    </div>
                                )
                            )}
                         </div>
                    </>
                )}
            </div>
        </div>
    );
};

export const ReportPanel: React.FC<ReportPanelProps> = ({ anomaly, onClose, className, mode, onFlyTo }) => {
    const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [comment, setComment] = useState('');
    const [copied, setCopied] = useState(false);
    const [frStatus, _setFrStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
    const [showReplay, setShowReplay] = useState(false);
    const [resolvedCallsigns, setResolvedCallsigns] = useState<Record<string, string>>({});
    const { isHebrew } = useLanguage();
    
    // Rule selection state - use hardcoded rules list - NOW SUPPORTS MULTIPLE SELECTION
    const rules = TAGGING_RULES;
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<number>>(new Set());
    const [isOtherSelected, setIsOtherSelected] = useState(false);
    const [otherDetails, setOtherDetails] = useState('');
    const [ruleError, setRuleError] = useState(false);
    const [showRuleSelector, setShowRuleSelector] = useState(false);
    
    // Helper to toggle rule selection
    const toggleRuleSelection = (ruleId: number) => {
        setSelectedRuleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ruleId)) {
                newSet.delete(ruleId);
            } else {
                newSet.add(ruleId);
            }
            return newSet;
        });
        setRuleError(false);
    };
    
    // Actions dropdown state
    const [showActions, setShowActions] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);

    // Close actions menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
                setShowActions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    // Re-analysis state
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [localAnomaly, setLocalAnomaly] = useState<AnomalyReport | null>(anomaly);

    // Sync prop to local state when prop changes
    useEffect(() => {
        setLocalAnomaly(anomaly);
    }, [anomaly]);
    

    useEffect(() => {
        if (!localAnomaly) return;

        // Find missing callsigns for proximity rules
        const checkAndFetchCallsigns = async () => {
            const rules = localAnomaly.full_report?.matched_rules || 
                          localAnomaly.full_report?.layer_1_rules?.report?.matched_rules || [];
            
            const missingIds = new Set<string>();
            
            rules.forEach((rule: any) => {
                if (rule.id === 4 && rule.details?.events) {
                     rule.details.events.forEach((ev: any) => {
                         if (!ev.other_callsign && ev.other_flight && !resolvedCallsigns[ev.other_flight]) {
                             missingIds.add(ev.other_flight);
                         }
                     });
                }
            });

            if (missingIds.size > 0) {
                const newResolved: Record<string, string> = {};
                await Promise.all(Array.from(missingIds).map(async (fid) => {
                    const callsign = await fetchCallsignFromResearch(fid);
                    if (callsign) {
                        newResolved[fid] = callsign;
                    }
                }));
                
                if (Object.keys(newResolved).length > 0) {
                    setResolvedCallsigns(prev => ({ ...prev, ...newResolved }));
                }
            }
        };

        checkAndFetchCallsigns();
    }, [localAnomaly]);

    const frUrl = React.useMemo(() => {
        if (!localAnomaly?.flight_id) return '';
        
        // Prefer flight_number directly from the anomaly object (e.g., "LY123", "J9253")
        const flightNumber = localAnomaly.flight_number || localAnomaly.full_report?.summary?.flight_number;
        if (flightNumber) {
            return `https://www.flightradar24.com/data/flights/${flightNumber}#${localAnomaly.flight_id}`;
        }
        
        // Fallback to transformed callsign if no flight_number available
        if (!localAnomaly.callsign) return '';
        
        let callsignForUrl = localAnomaly.callsign;
        const upperCallsign = callsignForUrl.toUpperCase();

        if (upperCallsign.startsWith('RJA')) {
            callsignForUrl = 'RJ' + callsignForUrl.substring(3);
        } else if (upperCallsign.startsWith('ELY')) {
            callsignForUrl = 'LY' + callsignForUrl.substring(3);
        } else if (upperCallsign.startsWith('ISR')) {
            callsignForUrl = '6H' + callsignForUrl.substring(4);
        }
        
        return `https://www.flightradar24.com/data/flights/${callsignForUrl}#${localAnomaly.flight_id}`;
    }, [localAnomaly?.callsign, localAnomaly?.flight_id, localAnomaly?.flight_number, localAnomaly?.full_report?.summary?.flight_number]);



    if (!localAnomaly) return null;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReanalyze = async () => {
        if (!localAnomaly) return;
        setIsReanalyzing(true);
        try {
            const updatedReport = await reanalyzeFeedbackFlight(localAnomaly.flight_id);
            // Merge the updated report with existing local state (preserving feedback IDs etc if not returned)
            setLocalAnomaly(prev => prev ? ({
                ...prev,
                ...updatedReport,
                // Ensure we keep the feedback context if the API didn't return it fully populated
                feedback_id: prev.feedback_id,
                user_label: prev.user_label
            }) : updatedReport);
        } catch (error) {
            console.error("Re-analysis failed:", error);
        } finally {
            setIsReanalyzing(false);
        }
    };


    const handleFeedback = async (isAnomaly: boolean) => {
        // If marking as anomaly, validate rule selection
        if (isAnomaly) {
            // Must have at least one rule selected OR other details provided
            if (selectedRuleIds.size === 0 && !isOtherSelected) {
                setRuleError(true);
                return;
            }
            if (isOtherSelected && !otherDetails.trim() && selectedRuleIds.size === 0) {
                setRuleError(true);
                return;
            }
        }
        
        setRuleError(false);
        setFeedbackStatus('submitting');
        try {
            await submitFeedback({
                flightId: localAnomaly.flight_id,
                isAnomaly,
                comments: comment,
                ruleIds: isAnomaly && selectedRuleIds.size > 0 ? Array.from(selectedRuleIds) : undefined,
                otherDetails: isAnomaly && isOtherSelected ? otherDetails : undefined
            });
            setFeedbackStatus('success');
            setComment('');
            setSelectedRuleIds(new Set());
            setIsOtherSelected(false);
            setOtherDetails('');
            
            if (!isAnomaly) {
                // If confirmed normal, wait a moment then close/remove
                setTimeout(() => {
                    onClose();
                    // Optionally trigger a refresh of the list if parent passed a callback
                    // but onClose should handle removing selection from UI
                }, 1000);
            } else {
                // Reset status after 3 seconds for anomalies (keep panel open)
                setTimeout(() => setFeedbackStatus('idle'), 3000);
            }
        } catch (e) {
            setFeedbackStatus('error');
        }
    };

    const report = localAnomaly.full_report || {};
    const summary = report.summary || {};

    // Use top-level is_anomaly (from DB) as authoritative source,
    // falling back to summary.is_anomaly from the full_report.
    // This ensures flights flagged as anomalies in DB show correctly
    // even if the full_report summary has is_anomaly=false (e.g. confidence < 80%).
    const effectiveIsAnomaly = localAnomaly.is_anomaly ?? summary.is_anomaly ?? false;

    // Derive confidence score: use summary if available, otherwise infer from DB anomaly flag
    const effectiveConfidence = summary.confidence_score ?? (effectiveIsAnomaly ? 100 : 0);

    // Derive triggers: prefer specific layer_1 rule names over generic summary triggers
    const effectiveTriggers = (() => {
        // Priority 1: Specific rule names from layer_1_rules.triggers
        const layerTriggers = report.layer_1_rules?.triggers || [];
        if (layerTriggers.length > 0) return layerTriggers;
        // Priority 2: Extract from matched_rules objects
        const matchedRules = report.layer_1_rules?.report?.matched_rules || report.matched_rules || [];
        if (matchedRules.length > 0) return matchedRules.map((r: any) => r.name || `Rule ${r.id}`);
        // Priority 3: Denormalized rule names from API (PostgreSQL columns)
        const dbRuleNames = localAnomaly.matched_rule_names;
        if (dbRuleNames && typeof dbRuleNames === 'string') {
            const names = dbRuleNames.split(', ').filter(Boolean);
            if (names.length > 0) return names;
        }
        // Priority 4: Summary triggers (may be generic like "Rules")
        if (summary.triggers && summary.triggers.length > 0) return summary.triggers;
        // Fallback: If DB says anomaly but no triggers found
        if (effectiveIsAnomaly) return ['Rules'];
        return [];
    })();

    const getConfidenceColor = (score: number) => {
        if (score > 85) return "text-red-500";
        if (score > 70) return "text-purple-500";
        if (score > 20) return "text-yellow-500";
        return "text-pink-500";
    };

    const confidenceColor = getConfidenceColor(effectiveConfidence);

    // Extract secondary flight IDs for proximity rule (ID 4)
    const getSecondaryFlightIds = () => {
        // Look in both the main report and layer 1 rules
        const rules = localAnomaly.full_report?.matched_rules || 
                     localAnomaly.full_report?.layer_1_rules?.report?.matched_rules || [];
                     
        const proximityRule = rules.find((r: any) => r.id === 4);
        
        if (!proximityRule?.details?.events) return [];
        return proximityRule.details.events
            .map((e: any) => e.other_flight)
            .filter((id: string) => id && id !== localAnomaly.flight_id);
    };

    const getReplayEvents = (): ReplayEvent[] => {
        const events: ReplayEvent[] = [];
        const rules = localAnomaly.full_report?.matched_rules || 
                     localAnomaly.full_report?.layer_1_rules?.report?.matched_rules || [];

        rules.forEach((rule: any) => {
            if (rule.id === 4 && rule.details?.events) {
                // Dangerous Proximity
                rule.details.events.forEach((ev: any) => {
                    events.push({
                        timestamp: ev.timestamp,
                        type: 'proximity',
                        description: `Conflict with ${ev.other_callsign || ev.other_flight}. Dist: ${ev.distance_nm} NM, Alt Diff: ${ev.altitude_diff_ft} ft`,
                        // Lat/Lon might not be in the event record for proximity, but timestamp is key
                    });
                });
            } else if (rule.id === 11 && rule.details?.deviations) {
                // Path Deviation
                rule.details.deviations.forEach((dev: any) => {
                    events.push({
                        timestamp: dev.timestamp,
                        type: 'deviation',
                        description: `Path deviation: ${dev.dist_nm} NM off course.`,
                        lat: dev.lat,
                        lon: dev.lon
                    });
                });
            }
        });

        // Only show rule-based events, no ML anomaly points

        // Also add the main anomaly timestamp as a generic event if not covered
        if (!events.find(e => Math.abs(e.timestamp - localAnomaly.timestamp) < 5)) {
             events.push({
                timestamp: localAnomaly.timestamp,
                type: 'other',
                description: 'Anomaly Detection Time',
            });
        }

        return events.sort((a, b) => a.timestamp - b.timestamp);
    };

    return (
        <>
        <aside className={clsx("bg-surface rounded-xl flex flex-col h-full overflow-hidden border border-white/5 animate-in slide-in-from-right-4", className || "col-span-3")}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-surface-highlight/50" dir={isHebrew ? "rtl" : "ltr"}>
                <div>
                    <h3 className="text-white font-bold">{isHebrew ? "דו\"ח ניתוח" : "Analysis Report"}</h3>
                    <p className="text-xs text-white/60">{localAnomaly.flight_id}</p>
                    
                    <div className="mt-3 flex flex-col gap-2">
                        {localAnomaly.callsign && (
                            <p className="text-[10px] text-pink-300 mb-0.5 animate-pulse font-medium">
                                {isHebrew ? "✨ לחץ להעתקה" : "✨ click me to copy"}
                            </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                            {localAnomaly.callsign && (
                                <button 
                                    onClick={() => handleCopy(localAnomaly.callsign!)}
                                    className={clsx(
                                        "text-sm font-mono font-bold px-3 py-1 rounded border transition-all duration-200",
                                        copied 
                                            ? "bg-green-500/20 text-green-300 border-green-500/30" 
                                            : "bg-white/10 text-white hover:bg-white/20 border-white/10 hover:border-white/30"
                                    )}
                                >
                                    {copied ? (isHebrew ? "!הועתק" : "Copied!") : localAnomaly.callsign}
                                </button>
                            )}

                            {/* Actions Dropdown */}
                            <div className="relative" ref={actionsRef}>
                                <button
                                    onClick={() => setShowActions(!showActions)}
                                    className="text-sm font-mono font-bold px-3 py-1 rounded border bg-white/10 text-white hover:bg-white/20 border-white/10 hover:border-white/30 transition-all duration-200 flex items-center gap-1"
                                >
                                    <span>{isHebrew ? "פעולות" : "Follow Up"}</span>
                                    <ChevronDown className="size-3" />
                                </button>

                                {showActions && (
                                    <div className={clsx(
                                        "absolute top-full mt-2 w-52 bg-surface/95 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200",
                                        isHebrew ? "right-0" : "left-0"
                                    )}>
                                        <div className="p-1.5 space-y-1">
                                            {localAnomaly.callsign && (
                                                 <a 
                                                    href={frUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={clsx(
                                                        "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-md transition-all duration-200 no-underline group",
                                                        isHebrew ? "text-right flex-row-reverse" : "text-left",
                                                        "hover:bg-green-500/10 hover:text-green-300",
                                                        frStatus === 'valid' ? "text-green-400" : "text-white/80"
                                                    )}
                                                >
                                                    <div className="p-1.5 rounded bg-white/5 group-hover:bg-green-500/20 transition-colors">
                                                        <ExternalLink className="size-3.5 group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <span className="font-medium">{isHebrew ? "פתח ב-FR24" : "Open in FR24"}</span>
                                                </a>
                                            )}
                                            
                                            <button
                                                onClick={() => {
                                                    setShowReplay(true);
                                                    setShowActions(false);
                                                }}
                                                className={clsx(
                                                    "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-md transition-all duration-200 group",
                                                    isHebrew ? "text-right flex-row-reverse" : "text-left",
                                                    "text-white/80 hover:text-blue-300 hover:bg-blue-500/10"
                                                )}
                                            >
                                                <div className="p-1.5 rounded bg-white/5 group-hover:bg-blue-500/20 transition-colors">
                                                    <PlayCircle className="size-3.5 group-hover:scale-110 transition-transform" />
                                                </div>
                                                <span className="font-medium">{isHebrew ? "נגן טיסה" : "Replay Flight"}</span>
                                            </button>

                                            {mode === 'feedback' && (
                                                <button
                                                    onClick={() => {
                                                        handleReanalyze();
                                                        setShowActions(false);
                                                    }}
                                                    disabled={isReanalyzing}
                                                    className={clsx(
                                                        "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-md transition-all duration-200 group disabled:opacity-50",
                                                        isHebrew ? "text-right flex-row-reverse" : "text-left",
                                                        "text-white/80 hover:text-purple-300 hover:bg-purple-500/10"
                                                    )}
                                                >
                                                    <div className="p-1.5 rounded bg-white/5 group-hover:bg-purple-500/20 transition-colors">
                                                        {isReanalyzing ? (
                                                            <Loader2 className="size-3.5 animate-spin" /> 
                                                        ) : (
                                                            <RefreshCw className="size-3.5 group-hover:rotate-180 transition-transform duration-500" />
                                                        )}
                                                    </div>
                                                    <span className="font-medium">
                                                        {isReanalyzing ? (isHebrew ? "מנתח..." : "Analyzing...") : (isHebrew ? "נתח מחדש" : "Re-Analyze")}
                                                    </span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-col gap-2 items-end">
                    <button onClick={onClose} className="text-white/60 hover:text-white p-1 rounded hover:bg-white/10">
                        <X className="size-5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
                
                {/* Re-analyzing Overlay */}
                {isReanalyzing && (
                    <div className="absolute inset-0 bg-surface/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center animate-in fade-in duration-200">
                        <div className="bg-surface border border-white/10 p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-purple-500/30 blur-xl rounded-full animate-pulse"></div>
                                <Loader2 className="size-10 text-purple-400 animate-spin relative z-10" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-white text-lg">{isHebrew ? "מנתח טיסה מחדש" : "Re-analyzing Flight"}</p>
                                <p className="text-sm text-white/60">{isHebrew ? "מריץ צנרת זיהוי אנומליות..." : "Running anomaly detection pipeline..."}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Overall Summary */}
                <div className="bg-primary/10 rounded-lg p-3 border border-primary/20" dir={isHebrew ? "rtl" : "ltr"}>
                    <p className="text-xs text-primary font-bold uppercase mb-1">{isHebrew ? "פסיקת מערכת" : "System Verdict"}</p>
                    <div className="flex items-center gap-2 mb-2">
                        <span className={clsx("text-lg font-bold", effectiveIsAnomaly ? "text-red-400" : "text-green-400")}>
                            {effectiveIsAnomaly 
                                ? (isHebrew ? "זוהתה אנומליה" : "ANOMALY DETECTED") 
                                : (isHebrew ? "טיסה תקינה" : "NORMAL FLIGHT")}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-xs text-white/80">
                            {isHebrew ? "ציון ביטחון: " : "Confidence Score: "}<span className={clsx("font-mono font-bold", confidenceColor)}>{effectiveConfidence}%</span>
                        </p>
                        <p className="text-xs text-white/60">
                            {isHebrew ? "זוהה ב: " : "Detected At: "}<span className="font-mono">{new Date(localAnomaly.timestamp * 1000).toLocaleString()}</span>
                        </p>
                        {effectiveTriggers.length > 0 && (
                            <p className="text-xs text-white/60">
                                {isHebrew ? "שכבות שזיהו: " : "Triggered by: "}<span className="font-mono text-yellow-400">{effectiveTriggers.join(', ')}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Layers */}
                <div className="space-y-3" dir={isHebrew ? "rtl" : "ltr"}>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider">{isHebrew ? "ניתוח שכבות" : "Layer Analysis"}</p>
                    
                    <LayerCard 
                        title={isHebrew ? "שכבה 1: מנוע חוקים" : "Layer 1: Rule Engine"}
                        data={report.layer_1_rules} 
                        type="rules" 
                        resolvedCallsigns={resolvedCallsigns}
                        isHebrew={isHebrew}
                    />
                    
                    <LayerCard 
                        title={isHebrew ? "שכבה 2: XGBoost" : "Layer 2: XGBoost"}
                        data={report.layer_2_xgboost} 
                        type="model"
                        onFlyTo={onFlyTo}
                        isHebrew={isHebrew}
                    />

                    <LayerCard 
                        title={isHebrew ? "שכבה 3: מקודד אוטומטי עמוק" : "Layer 3: Deep Dense Autoencoder"}
                        data={report.layer_3_deep_dense} 
                        type="model"
                        onFlyTo={onFlyTo}
                        isHebrew={isHebrew}
                    />

                    <LayerCard 
                        title={isHebrew ? "שכבה 4: CNN עמוק" : "Layer 4: Deep CNN"}
                        data={report.layer_4_deep_cnn} 
                        type="model"
                        onFlyTo={onFlyTo}
                        isHebrew={isHebrew}
                    />

                    <LayerCard 
                        title={isHebrew ? "שכבה 5: טרנספורמר" : "Layer 5: Transformer"}
                        data={report.layer_5_transformer} 
                        type="model"
                        onFlyTo={onFlyTo}
                        isHebrew={isHebrew}
                    />

                    <LayerCard 
                        title={isHebrew ? "שכבה 6: CNN-טרנספורמר היברידי" : "Layer 6: Hybrid CNN-Transformer"}
                        data={report.layer_6_hybrid} 
                        type="model"
                        onFlyTo={onFlyTo} 
                        isHebrew={isHebrew}
                    />
                </div>

                {/* Feedback Section */}
                <div className="rounded-xl p-4 border shadow-lg mt-4" style={{
                    background: 'rgb(var(--color-surface) / 0.8)',
                    borderColor: 'rgb(var(--color-primary) / 0.2)'
                }} dir={isHebrew ? "rtl" : "ltr"}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-8 w-1 rounded-full" style={{
                            background: 'rgb(var(--color-primary))'
                        }}></div>
                        <p className="text-sm font-bold uppercase tracking-wide" style={{
                            color: 'rgb(var(--color-text))'
                        }}>{isHebrew ? "משוב אנושי" : "Human Feedback"}</p>
                    </div>
                    
                    {feedbackStatus === 'success' ? (
                        <div className="rounded-xl p-4 border-2 animate-in fade-in slide-in-from-top-2 shadow-lg" style={{
                            background: 'rgb(34 197 94 / 0.15)',
                            borderColor: 'rgb(34 197 94 / 0.4)'
                        }}>
                            <div className="flex items-center gap-3">
                                <div className="rounded-full p-2" style={{
                                    background: 'rgb(34 197 94 / 0.3)'
                                }}>
                                    <CheckCircle className="size-6" style={{
                                        color: 'rgb(134 239 172)'
                                    }} />
                                </div>
                                <div>
                                    <p className="font-bold" style={{
                                        color: 'rgb(134 239 172)'
                                    }}>{isHebrew ? "משוב נשלח!" : "Feedback Submitted!"}</p>
                                    <p className="text-xs mt-0.5" style={{
                                        color: 'rgb(var(--color-text-muted))'
                                    }}>{isHebrew ? "תודה שעזרת לשפר את המערכת" : "Thank you for helping improve our system"}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-lg p-3 border-l-4" style={{
                                background: 'rgb(var(--color-primary) / 0.1)',
                                borderColor: 'rgb(var(--color-primary) / 0.5)'
                            }}>
                                <p className="text-sm font-medium" style={{
                                    color: 'rgb(var(--color-text))'
                                }}>{isHebrew ? "תייג אנומליה זו" : "Tag this anomaly"}</p>
                                <p className="text-xs mt-1" style={{
                                    color: 'rgb(var(--color-text-muted))'
                                }}>{isHebrew ? "בחר את סוג החוק ושלח את המשוב שלך" : "Select the rule type and submit your feedback"}</p>
                            </div>
                            
                            {/* Rule Selection Button - Required for anomaly */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium flex items-center gap-1" style={{
                                    color: 'rgb(var(--color-text) / 0.9)'
                                }}>
                                    {isHebrew ? "איזה חוק הפעיל אנומליה זו?" : "Which rule triggered this anomaly?"}
                                    <span className="text-red-400 text-sm">*</span>
                                </label>
                                
                                <button
                                    type="button"
                                    onClick={() => setShowRuleSelector(true)}
                                    className="w-full border-2 rounded-lg p-4 transition-all flex items-center justify-between group"
                                    style={{
                                        background: (selectedRuleIds.size > 0 || isOtherSelected)
                                            ? 'rgb(var(--color-primary) / 0.1)' 
                                            : 'rgb(var(--color-background) / 0.5)',
                                        borderColor: ruleError && selectedRuleIds.size === 0 && !isOtherSelected
                                            ? 'rgb(239 68 68 / 0.5)' 
                                            : (selectedRuleIds.size > 0 || isOtherSelected)
                                                ? 'rgb(var(--color-primary) / 0.5)'
                                                : 'rgb(var(--color-border) / 0.3)',
                                    }}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {selectedRuleIds.size > 0 ? (
                                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {Array.from(selectedRuleIds).slice(0, 3).map(ruleId => {
                                                        const rule = rules.find(r => r.id === ruleId);
                                                        const Icon = getRuleIcon(ruleId);
                                                        return (
                                                            <span 
                                                                key={ruleId}
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                                                                style={{
                                                                    background: 'rgb(var(--color-primary) / 0.2)',
                                                                    color: 'rgb(var(--color-text))'
                                                                }}
                                                            >
                                                                <Icon className="size-3" />
                                                                {isHebrew ? rule?.nameHe : rule?.name}
                                                            </span>
                                                        );
                                                    })}
                                                    {selectedRuleIds.size > 3 && (
                                                        <span className="text-xs" style={{ color: 'rgb(var(--color-text-muted))' }}>
                                                            +{selectedRuleIds.size - 3} {isHebrew ? "נוספים" : "more"}
                                                        </span>
                                                    )}
                                                    {isOtherSelected && (
                                                        <span 
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300"
                                                        >
                                                            <AlertTriangle className="size-3" />
                                                            {isHebrew ? "אחר" : "Other"}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs" style={{ color: 'rgb(var(--color-text-muted))' }}>
                                                    {isHebrew 
                                                        ? `${selectedRuleIds.size + (isOtherSelected ? 1 : 0)} חוקים נבחרו - לחץ לעריכה`
                                                        : `${selectedRuleIds.size + (isOtherSelected ? 1 : 0)} rule(s) selected - click to edit`}
                                                </p>
                                            </div>
                                        ) : isOtherSelected ? (
                                            <>
                                                <AlertTriangle className="size-5 text-yellow-400" />
                                                <div className={isHebrew ? "text-right" : "text-left"}>
                                                    <p className="font-medium" style={{ color: 'rgb(var(--color-text))' }}>
                                                        {isHebrew ? "אחר / אנומליה מותאמת" : "Other / Custom Anomaly"}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'rgb(var(--color-text-muted))' }}>
                                                        {isHebrew ? "סוג אנומליה מותאם אישית" : "Custom anomaly type"}
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className={isHebrew ? "text-right" : "text-left"}>
                                                <p className="font-medium" style={{ color: 'rgb(var(--color-text-muted))' }}>
                                                    {isHebrew ? "...בחר חוקים" : "Select rules..."}
                                                </p>
                                                <p className="text-xs" style={{ color: 'rgb(var(--color-text-muted) / 0.6)' }}>
                                                    {isHebrew ? "לחץ כדי לבחור חוקים (ניתן לבחור מספר חוקים)" : "Click to choose rules (multiple selection allowed)"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <Navigation className={clsx(
                                        "size-5 transition-transform flex-shrink-0", 
                                        isHebrew ? "group-hover:-translate-x-1 rotate-180" : "group-hover:translate-x-1"
                                    )} style={{
                                        color: 'rgb(var(--color-text-muted))'
                                    }} />
                                </button>
                                
                                {ruleError && selectedRuleIds.size === 0 && !isOtherSelected && (
                                    <div className="flex items-center gap-1.5 text-xs text-red-400 animate-in slide-in-from-top-1">
                                        <AlertTriangle className="size-3" />
                                        <span>{isHebrew ? "אנא בחר לפחות חוק אחד כדי לשלוח משוב" : "Please select at least one rule to submit feedback"}</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Other Details Textbox - Shows when "Other" is selected */}
                            {isOtherSelected && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <div className="rounded-lg p-3 border border-yellow-500/30" style={{
                                        background: 'rgb(234 179 8 / 0.1)'
                                    }}>
                                        <label className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{
                                            color: 'rgb(250 204 21)'
                                        }}>
                                            <AlertTriangle className="size-3.5" />
                                            {isHebrew ? "תאר את סוג האנומליה המותאם" : "Describe the custom anomaly type"}
                                            <span className="text-red-400 text-sm">*</span>
                                        </label>
                                        <textarea
                                            value={otherDetails}
                                            onChange={(e) => {
                                                setOtherDetails(e.target.value);
                                                setRuleError(false);
                                            }}
                                            placeholder={isHebrew 
                                                ? "לדוגמה: דפוס תקשורת חריג, תבנית המתנה לא צפויה, סטייה חשודה מהמסלול, וכו'..." 
                                                : "E.g., Unusual communication pattern, unexpected holding pattern, suspicious route deviation, etc..."
                                            }
                                            rows={4}
                                            style={{
                                                background: 'rgb(var(--color-background) / 0.5)',
                                                borderColor: ruleError && !otherDetails.trim() 
                                                    ? 'rgb(239 68 68 / 0.5)' 
                                                    : 'rgb(234 179 8 / 0.3)',
                                                color: 'rgb(var(--color-text))'
                                            }}
                                            className={clsx(
                                                "w-full border rounded-lg p-3 text-sm placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none transition-all",
                                                ruleError && !otherDetails.trim() && "ring-2 ring-red-500/20"
                                            )}
                                        />
                                        <p className="text-[10px] mt-2 italic" style={{
                                            color: 'rgb(var(--color-text-muted))'
                                        }}>
                                            {isHebrew ? "💡 היה ספציפי לגבי מה הופך טיסה זו לחריגה" : "💡 Be specific about what makes this flight anomalous"}
                                        </p>
                                    </div>
                                    {ruleError && !otherDetails.trim() && (
                                        <div className="flex items-center gap-1.5 text-xs text-red-400 animate-in slide-in-from-top-1">
                                            <AlertTriangle className="size-3" />
                                            <span>{isHebrew ? "אנא תאר את סוג האנומליה כדי להמשיך" : "Please describe the anomaly type to continue"}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Feedback Buttons - Anomaly and Normal */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleFeedback(true)}
                                    disabled={feedbackStatus === 'submitting'}
                                    className="flex-1 flex items-center justify-center gap-3 p-4 rounded-lg border-2 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 hover:shadow-xl"
                                    style={{
                                        background: 'rgb(239 68 68 / 0.15)',
                                        borderColor: 'rgb(239 68 68 / 0.5)',
                                        color: 'rgb(248 113 113)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgb(239 68 68 / 0.25)';
                                        e.currentTarget.style.borderColor = 'rgb(239 68 68 / 0.7)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgb(239 68 68 / 0.15)';
                                        e.currentTarget.style.borderColor = 'rgb(239 68 68 / 0.5)';
                                    }}
                                >
                                    {feedbackStatus === 'submitting' ? (
                                        <Loader2 className="size-5 animate-spin" />
                                    ) : (
                                        <AlertTriangle className="size-5" />
                                    )}
                                    <span className="text-sm font-bold">
                                        {feedbackStatus === 'submitting' ? (isHebrew ? "שולח..." : "Submitting...") : (isHebrew ? "אנומליה" : "Anomaly")}
                                    </span>
                                </button>
                                
                                <button
                                    onClick={() => handleFeedback(false)}
                                    disabled={feedbackStatus === 'submitting'}
                                    className="flex-1 flex items-center justify-center gap-3 p-4 rounded-lg border-2 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 hover:shadow-xl"
                                    style={{
                                        background: 'rgb(34 197 94 / 0.15)',
                                        borderColor: 'rgb(34 197 94 / 0.5)',
                                        color: 'rgb(74 222 128)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgb(34 197 94 / 0.25)';
                                        e.currentTarget.style.borderColor = 'rgb(34 197 94 / 0.7)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgb(34 197 94 / 0.15)';
                                        e.currentTarget.style.borderColor = 'rgb(34 197 94 / 0.5)';
                                    }}
                                >
                                    {feedbackStatus === 'submitting' ? (
                                        <Loader2 className="size-5 animate-spin" />
                                    ) : (
                                        <CheckCircle className="size-5" />
                                    )}
                                    <span className="text-sm font-bold">
                                        {feedbackStatus === 'submitting' ? (isHebrew ? "שולח..." : "Submitting...") : (isHebrew ? "תקין" : "Normal")}
                                    </span>
                                </button>
                            </div>

                            <div className="relative">
                                <label className="text-xs mb-1.5 block" style={{
                                    color: 'rgb(var(--color-text-muted))'
                                }}>{isHebrew ? "הערות נוספות (אופציונלי)" : "Additional Comments (Optional)"}</label>
                                <input
                                    type="text"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder={isHebrew ? "הוסף הערות או הקשר נוסף..." : "Add any additional notes or context..."}
                                    style={{
                                        background: 'rgb(var(--color-background) / 0.5)',
                                        borderColor: 'rgb(var(--color-border) / 0.3)',
                                        color: 'rgb(var(--color-text))'
                                    }}
                                    className="w-full border rounded-lg p-3 text-sm placeholder:opacity-40 focus:outline-none focus:ring-2 transition-all"
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'rgb(var(--color-primary) / 0.5)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = 'rgb(var(--color-border) / 0.3)';
                                    }}
                                />
                            </div>
                            
                            {feedbackStatus === 'error' && (
                                <p className="text-xs text-red-400">{isHebrew ? "שליחת המשוב נכשלה. נסה שנית." : "Failed to submit feedback. Try again."}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </aside>

        {showReplay && (
            <ReplayModal 
                mainFlightId={localAnomaly.flight_id}
                secondaryFlightIds={getSecondaryFlightIds()}
                events={getReplayEvents()}
                onClose={() => setShowReplay(false)} 
            />
        )}
        
        {/* Floating Rule Circles - Multi-Select */}
        {showRuleSelector && (
            <div 
                className="fixed inset-0 z-50 flex items-end justify-center pb-12"
                onClick={() => setShowRuleSelector(false)}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/70  animate-in fade-in" />
                
                {/* Floating Circles Container */}
                <div 
                    className="relative w-full max-w-7xl px-8 animate-in slide-in-from-bottom-12 duration-500"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Close/Done Button */}
                    <div className="absolute -top-16 right-8 flex items-center gap-3">
                        {(selectedRuleIds.size > 0 || isOtherSelected) && (
                            <button
                                onClick={() => setShowRuleSelector(false)}
                                className="px-4 py-2 rounded-full transition-all hover:scale-105 font-medium text-sm flex items-center gap-2"
                                style={{
                                    background: 'rgb(var(--color-primary))',
                                    color: 'white',
                                    boxShadow: '0 4px 15px rgb(var(--color-primary) / 0.4)'
                                }}
                            >
                                <CheckCircle className="size-4" />
                                {isHebrew ? `סיום (${selectedRuleIds.size + (isOtherSelected ? 1 : 0)})` : `Done (${selectedRuleIds.size + (isOtherSelected ? 1 : 0)})`}
                            </button>
                        )}
                        <button
                            onClick={() => setShowRuleSelector(false)}
                            className="p-3 rounded-full transition-all hover:scale-110 hover:rotate-90"
                            style={{
                                background: 'rgb(var(--color-surface) / 0.9)',
                                color: 'rgb(var(--color-text))',
                                backdropFilter: 'blur(10px)'
                            }}
                        >
                            <X className="size-6" />
                        </button>
                    </div>
                    
                    {/* Title */}
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-bold mb-2" style={{ 
                            color: 'rgb(var(--color-text))',
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                        }}>
                            {isHebrew ? "בחר סוגי חוקים" : "Select Rule Types"}
                        </h3>
                        <p className="text-sm" style={{ 
                            color: 'rgb(var(--color-text-muted))',
                            textShadow: '0 1px 5px rgba(0,0,0,0.5)'
                        }}>
                            {isHebrew ? "לחץ על החוקים שמתארים את האנומליה (ניתן לבחור מספר חוקים)" : "Click on the rules that describe this anomaly (multiple selection allowed)"}
                        </p>
                        {selectedRuleIds.size > 0 && (
                            <p className="text-xs mt-2" style={{ 
                                color: 'rgb(var(--color-primary))',
                                textShadow: '0 1px 5px rgba(0,0,0,0.5)'
                            }}>
                                {isHebrew ? `${selectedRuleIds.size} חוקים נבחרו` : `${selectedRuleIds.size} rule(s) selected`}
                            </p>
                        )}
                    </div>
                    
                    {/* Floating Rules - Organized by Category */}
                    <div className="space-y-6">
                        <div className="flex flex-wrap gap-6 justify-center items-center">
                                {/* Emergency & Safety (Red) */}
                                {rules.filter(r => r.category === 'emergency').map((rule, idx) => {
                                    const Icon = getRuleIcon(rule.id);
                                    const isSelected = selectedRuleIds.has(rule.id);
                                    return (
                                        <button
                                            key={rule.id}
                                            onClick={() => toggleRuleSelection(rule.id)}
                                            className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                            style={{
                                                animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                                animationDelay: `${idx * 0.1}s`
                                            }}
                                        >
                                            <div 
                                                className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                                style={{
                                                    background: isSelected 
                                                        ? 'linear-gradient(135deg, rgb(239 68 68 / 0.4), rgb(220 38 38 / 0.6))' 
                                                        : 'linear-gradient(135deg, rgb(239 68 68 / 0.3), rgb(220 38 38 / 0.2))',
                                                    border: isSelected ? '4px solid rgb(239 68 68)' : '3px solid rgb(239 68 68 / 0.5)',
                                                    boxShadow: isSelected 
                                                        ? '0 10px 40px rgb(239 68 68 / 0.6), inset 0 2px 10px rgb(255 255 255 / 0.1)' 
                                                        : '0 5px 20px rgb(239 68 68 / 0.3)',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                            >
                                                <Icon className="size-8 text-red-300 group-hover:scale-110 transition-transform" />
                                                {isSelected && (
                                                    <CheckCircle className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in bg-red-500 rounded-full p-0.5" />
                                                )}
                                            </div>
                                            <div className="text-center max-w-[100px]">
                                                <p className="text-xs font-bold" style={{ 
                                                    color: 'rgb(var(--color-text))',
                                                    textShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                }}>
                                                    {isHebrew ? rule.nameHe : rule.name}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                        
                                {/* Flight Operations (Blue) */}
                                {rules.filter(r => r.category === 'flight_ops').map((rule, idx) => {
                                    const Icon = getRuleIcon(rule.id);
                                    const isSelected = selectedRuleIds.has(rule.id);
                                    const baseDelay = 3;
                                    return (
                                        <button
                                            key={rule.id}
                                            onClick={() => toggleRuleSelection(rule.id)}
                                            className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                            style={{
                                                animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                                animationDelay: `${(baseDelay + idx) * 0.1}s`
                                            }}
                                        >
                                            <div 
                                                className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                                style={{
                                                    background: isSelected 
                                                        ? 'linear-gradient(135deg, rgb(59 130 246 / 0.4), rgb(37 99 235 / 0.6))' 
                                                        : 'linear-gradient(135deg, rgb(59 130 246 / 0.3), rgb(37 99 235 / 0.2))',
                                                    border: isSelected ? '4px solid rgb(59 130 246)' : '3px solid rgb(59 130 246 / 0.5)',
                                                    boxShadow: isSelected 
                                                        ? '0 10px 40px rgb(59 130 246 / 0.6), inset 0 2px 10px rgb(255 255 255 / 0.1)' 
                                                        : '0 5px 20px rgb(59 130 246 / 0.3)',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                            >
                                                <Icon className="size-8 text-blue-300 group-hover:scale-110 transition-transform" />
                                                {isSelected && (
                                                    <CheckCircle className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in bg-blue-500 rounded-full p-0.5" />
                                                )}
                                            </div>
                                            <div className="text-center max-w-[100px]">
                                                <p className="text-xs font-bold" style={{ 
                                                    color: 'rgb(var(--color-text))',
                                                    textShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                }}>
                                                    {isHebrew ? rule.nameHe : rule.name}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                        
                                {/* Technical (Purple) */}
                                {rules.filter(r => r.category === 'technical').map((rule, idx) => {
                                    const Icon = getRuleIcon(rule.id);
                                    const isSelected = selectedRuleIds.has(rule.id);
                                    const baseDelay = 7;
                                    return (
                                        <button
                                            key={rule.id}
                                            onClick={() => toggleRuleSelection(rule.id)}
                                            className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                            style={{
                                                animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                                animationDelay: `${(baseDelay + idx) * 0.1}s`
                                            }}
                                        >
                                            <div 
                                                className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                                style={{
                                                    background: isSelected 
                                                        ? 'linear-gradient(135deg, rgb(168 85 247 / 0.4), rgb(147 51 234 / 0.6))' 
                                                        : 'linear-gradient(135deg, rgb(168 85 247 / 0.3), rgb(147 51 234 / 0.2))',
                                                    border: isSelected ? '4px solid rgb(168 85 247)' : '3px solid rgb(168 85 247 / 0.5)',
                                                    boxShadow: isSelected 
                                                        ? '0 10px 40px rgb(168 85 247 / 0.6), inset 0 2px 10px rgb(255 255 255 / 0.1)' 
                                                        : '0 5px 20px rgb(168 85 247 / 0.3)',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                            >
                                                <Icon className="size-8 text-purple-300 group-hover:scale-110 transition-transform" />
                                                {isSelected && (
                                                    <CheckCircle className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in bg-purple-500 rounded-full p-0.5" />
                                                )}
                                            </div>
                                            <div className="text-center max-w-[100px]">
                                                <p className="text-xs font-bold" style={{ 
                                                    color: 'rgb(var(--color-text))',
                                                    textShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                }}>
                                                    {isHebrew ? rule.nameHe : rule.name}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                        
                                {/* Military & Security (Green) */}
                                {rules.filter(r => r.category === 'military').map((rule, idx) => {
                                    const Icon = getRuleIcon(rule.id);
                                    const isSelected = selectedRuleIds.has(rule.id);
                                    const baseDelay = 9;
                                    return (
                                        <button
                                            key={rule.id}
                                            onClick={() => toggleRuleSelection(rule.id)}
                                            className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                            style={{
                                                animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                                animationDelay: `${(baseDelay + idx) * 0.1}s`
                                            }}
                                        >
                                            <div 
                                                className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                                style={{
                                                    background: isSelected 
                                                        ? 'linear-gradient(135deg, rgb(34 197 94 / 0.4), rgb(22 163 74 / 0.6))' 
                                                        : 'linear-gradient(135deg, rgb(34 197 94 / 0.3), rgb(22 163 74 / 0.2))',
                                                    border: isSelected ? '4px solid rgb(34 197 94)' : '3px solid rgb(34 197 94 / 0.5)',
                                                    boxShadow: isSelected 
                                                        ? '0 10px 40px rgb(34 197 94 / 0.6), inset 0 2px 10px rgb(255 255 255 / 0.1)' 
                                                        : '0 5px 20px rgb(34 197 94 / 0.3)',
                                                    backdropFilter: 'blur(10px)'
                                                }}
                                            >
                                                <Icon className="size-8 text-green-300 group-hover:scale-110 transition-transform" />
                                                {isSelected && (
                                                    <CheckCircle className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in bg-green-500 rounded-full p-0.5" />
                                                )}
                                            </div>
                                            <div className="text-center max-w-[100px]">
                                                <p className="text-xs font-bold" style={{ 
                                                    color: 'rgb(var(--color-text))',
                                                    textShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                                }}>
                                                    {isHebrew ? rule.nameHe : rule.name}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                        
                        {/* Other / Custom (Yellow) */}
                            <button
                                onClick={() => {
                                    setIsOtherSelected(!isOtherSelected);
                                    setRuleError(false);
                                }}
                                className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                style={{
                                    animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                    animationDelay: '1.2s'
                                }}
                            >
                                <div 
                                    className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                    style={{
                                        background: isOtherSelected 
                                            ? 'linear-gradient(135deg, rgb(234 179 8 / 0.4), rgb(202 138 4 / 0.6))' 
                                            : 'linear-gradient(135deg, rgb(234 179 8 / 0.3), rgb(202 138 4 / 0.2))',
                                        border: isOtherSelected ? '4px solid rgb(234 179 8)' : '3px solid rgb(234 179 8 / 0.5)',
                                        boxShadow: isOtherSelected 
                                            ? '0 10px 40px rgb(234 179 8 / 0.6), inset 0 2px 10px rgb(255 255 255 / 0.1)' 
                                            : '0 5px 20px rgb(234 179 8 / 0.3)',
                                        backdropFilter: 'blur(10px)'
                                    }}
                                >
                                    <AlertTriangle className="size-8 text-yellow-300 group-hover:scale-110 transition-transform" />
                                    {isOtherSelected && (
                                        <CheckCircle className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in bg-yellow-500 rounded-full p-0.5" />
                                    )}
                                </div>
                                <div className="text-center max-w-[100px]">
                                    <p className="text-xs font-bold" style={{ 
                                        color: 'rgb(var(--color-text))',
                                        textShadow: '0 2px 5px rgba(0,0,0,0.5)'
                                    }}>
                                        {isHebrew ? "אחר" : "Other"}
                                    </p>
                                </div>
                            </button>
                    </div>
                </div>
            </div>
            </div>
        )}
        </>
    );
};

