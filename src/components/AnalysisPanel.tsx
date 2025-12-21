import React, { useState, useEffect } from 'react';
import { X, FileText, Loader2, Info, Plane, MapPin, Gauge, Calendar } from 'lucide-react';
import type { AnomalyReport, TrackPoint } from '../types';
import { fetchTaggedFlightMetadata, fetchResearchFlightMetadata, type FlightMetadata } from '../api';
import type { ProcessedActions } from '../utils/aiActions';
import clsx from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';

// Import the original ReportPanel content component
import { ReportPanel } from './ReportPanel';

// ============================================================
// Types
// ============================================================

interface AnalysisPanelProps {
    anomaly: AnomalyReport | null;
    flightPoints: TrackPoint[];
    onClose: () => void;
    onAIActions: (actions: ProcessedActions) => void;
    onFlyTo?: (lat: number, lon: number, zoom?: number) => void;
    className?: string;
    mode?: 'historical' | 'realtime' | 'research' | 'rules' | 'feedback' | 'ai-results';
}

// ============================================================
// Flight Metadata Panel Component
// ============================================================

interface FlightMetadataPanelProps {
    metadata: FlightMetadata | null;
    loading: boolean;
    isHebrew: boolean;
}

const FlightMetadataPanel: React.FC<FlightMetadataPanelProps> = ({ metadata, loading, isHebrew }) => {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="size-8 animate-spin text-cyan-500" />
            </div>
        );
    }

    if (!metadata) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-white/40 p-8">
                <Info className="size-12 mb-4" />
                <p className="text-center">
                    {isHebrew ? "אין מידע זמין עבור טיסה זו" : "No metadata available for this flight"}
                </p>
            </div>
        );
    }

    const formatDuration = (seconds?: number) => {
        if (!seconds) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const formatTimestamp = (ts?: number) => {
        if (!ts) return '-';
        return new Date(ts * 1000).toLocaleString();
    };

    const formatNumber = (num?: number, decimals = 0) => {
        if (num === undefined || num === null) return '-';
        return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
    };

    const MetadataRow = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
        <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-2 text-white/60 text-sm">
                {icon}
                <span>{label}</span>
            </div>
            <span className="text-white font-medium text-sm">{value || '-'}</span>
        </div>
    );

    const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div className="mb-6">
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">{title}</h4>
            <div className="bg-white/5 rounded-lg px-4">
                {children}
            </div>
        </div>
    );

    return (
        <div className="h-full overflow-y-auto p-4 space-y-2">
            {/* Flight Identity */}
            <Section title={isHebrew ? "זיהוי טיסה" : "Flight Identity"}>
                <MetadataRow label={isHebrew ? "מזהה טיסה" : "Flight ID"} value={metadata.flight_id} />
                <MetadataRow label={isHebrew ? "קריאה" : "Callsign"} value={metadata.callsign} icon={<Plane className="size-3" />} />
                <MetadataRow label={isHebrew ? "מספר טיסה" : "Flight Number"} value={metadata.flight_number} />
                <MetadataRow label={isHebrew ? "חברת תעופה" : "Airline"} value={metadata.airline} />
                <MetadataRow label={isHebrew ? "סוג מטוס" : "Aircraft Type"} value={metadata.aircraft_type} />
                <MetadataRow label={isHebrew ? "דגם" : "Model"} value={metadata.aircraft_model} />
                <MetadataRow label={isHebrew ? "רישום" : "Registration"} value={metadata.aircraft_registration} />
                {metadata.is_military && (
                    <MetadataRow 
                        label={isHebrew ? "צבאי" : "Military"} 
                        value={<span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">{metadata.military_type || 'Yes'}</span>} 
                    />
                )}
            </Section>

            {/* Route */}
            <Section title={isHebrew ? "מסלול" : "Route"}>
                <MetadataRow label={isHebrew ? "מקור" : "Origin"} value={metadata.origin_airport} icon={<MapPin className="size-3" />} />
                <MetadataRow label={isHebrew ? "יעד" : "Destination"} value={metadata.destination_airport} icon={<MapPin className="size-3" />} />
                <MetadataRow label={isHebrew ? "שדה קרוב (התחלה)" : "Nearest Airport (Start)"} value={metadata.nearest_airport_start} />
                <MetadataRow label={isHebrew ? "שדה קרוב (סיום)" : "Nearest Airport (End)"} value={metadata.nearest_airport_end} />
                <MetadataRow label={isHebrew ? "חצה גבולות" : "Crossed Borders"} value={metadata.crossed_borders} />
            </Section>

            {/* Time */}
            <Section title={isHebrew ? "זמנים" : "Timing"}>
                <MetadataRow label={isHebrew ? "נראה לראשונה" : "First Seen"} value={formatTimestamp(metadata.first_seen_ts)} icon={<Calendar className="size-3" />} />
                <MetadataRow label={isHebrew ? "נראה לאחרונה" : "Last Seen"} value={formatTimestamp(metadata.last_seen_ts)} icon={<Calendar className="size-3" />} />
                <MetadataRow label={isHebrew ? "משך טיסה" : "Flight Duration"} value={formatDuration(metadata.flight_duration_sec)} />
                <MetadataRow label={isHebrew ? "המראה מתוכננת" : "Scheduled Departure"} value={metadata.scheduled_departure} />
                <MetadataRow label={isHebrew ? "נחיתה מתוכננת" : "Scheduled Arrival"} value={metadata.scheduled_arrival} />
            </Section>

            {/* Performance */}
            <Section title={isHebrew ? "ביצועים" : "Performance"}>
                <MetadataRow label={isHebrew ? "גובה מינימלי" : "Min Altitude"} value={`${formatNumber(metadata.min_altitude_ft)} ft`} icon={<Gauge className="size-3" />} />
                <MetadataRow label={isHebrew ? "גובה מקסימלי" : "Max Altitude"} value={`${formatNumber(metadata.max_altitude_ft)} ft`} />
                <MetadataRow label={isHebrew ? "גובה ממוצע" : "Avg Altitude"} value={`${formatNumber(metadata.avg_altitude_ft)} ft`} />
                <MetadataRow label={isHebrew ? "גובה שיוט" : "Cruise Altitude"} value={`${formatNumber(metadata.cruise_altitude_ft)} ft`} />
                <MetadataRow label={isHebrew ? "מהירות מינימלית" : "Min Speed"} value={`${formatNumber(metadata.min_speed_kts)} kts`} />
                <MetadataRow label={isHebrew ? "מהירות מקסימלית" : "Max Speed"} value={`${formatNumber(metadata.max_speed_kts)} kts`} />
                <MetadataRow label={isHebrew ? "מהירות ממוצעת" : "Avg Speed"} value={`${formatNumber(metadata.avg_speed_kts)} kts`} />
            </Section>

            {/* Track Data */}
            <Section title={isHebrew ? "נתוני מסלול" : "Track Data"}>
                <MetadataRow label={isHebrew ? "סה״כ נקודות" : "Total Points"} value={formatNumber(metadata.total_points)} />
                <MetadataRow label={isHebrew ? "מרחק כולל" : "Total Distance"} value={`${formatNumber(metadata.total_distance_nm, 1)} NM`} />
                <MetadataRow label={isHebrew ? "קודי סקווק" : "Squawk Codes"} value={metadata.squawk_codes} />
                <MetadataRow 
                    label={isHebrew ? "סקווק חירום" : "Emergency Squawk"} 
                    value={metadata.emergency_squawk_detected 
                        ? <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">Yes</span>
                        : <span className="text-white/40">No</span>
                    } 
                />
                <MetadataRow label={isHebrew ? "אירועי איבוד אות" : "Signal Loss Events"} value={formatNumber(metadata.signal_loss_events)} />
                <MetadataRow label={isHebrew ? "ציון איכות נתונים" : "Data Quality Score"} value={metadata.data_quality_score ? `${(metadata.data_quality_score * 100).toFixed(0)}%` : '-'} />
            </Section>

            {/* User Feedback */}
            {metadata.feedback && (
                <Section title={isHebrew ? "משוב משתמש" : "User Feedback"}>
                    <MetadataRow label={isHebrew ? "תויג בתאריך" : "Tagged At"} value={formatTimestamp(metadata.feedback.tagged_at)} />
                    {/* Support both single rule (legacy) and multiple rules */}
                    {metadata.feedback.rule_names && metadata.feedback.rule_names.length > 0 ? (
                        <MetadataRow 
                            label={isHebrew ? "חוקים" : "Rules"} 
                            value={
                                <div className="flex flex-wrap gap-1">
                                    {metadata.feedback.rule_names.map((name, idx) => (
                                        <span 
                                            key={idx}
                                            className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs"
                                        >
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            } 
                        />
                    ) : metadata.feedback.rule_name || metadata.feedback.rule_id ? (
                        <MetadataRow label={isHebrew ? "חוק" : "Rule"} value={metadata.feedback.rule_name || `Rule ${metadata.feedback.rule_id}`} />
                    ) : null}
                    <MetadataRow label={isHebrew ? "הערות" : "Comments"} value={metadata.feedback.comments} />
                    {metadata.feedback.other_details && (
                        <MetadataRow label={isHebrew ? "פרטים נוספים" : "Other Details"} value={metadata.feedback.other_details} />
                    )}
                </Section>
            )}
        </div>
    );
};

// ============================================================
// Main Component
// ============================================================

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ 
    anomaly,
    flightPoints: _flightPoints,
    onClose,
    onAIActions: _onAIActions,
    onFlyTo,
    className,
    mode = 'historical' 
}) => {
    const [activeTab, setActiveTab] = useState<'report' | 'metadata'>('report');
    const [metadata, setMetadata] = useState<FlightMetadata | null>(null);
    const [loadingMetadata, setLoadingMetadata] = useState(false);
    const { isHebrew } = useLanguage();

    // Fetch metadata when anomaly changes - use appropriate endpoint based on mode
    useEffect(() => {
        if (anomaly?.flight_id) {
            setLoadingMetadata(true);
            
            // Choose the appropriate fetch function based on mode
            const fetchMetadata = async () => {
                // For research mode, try research endpoint first
                if (mode === 'research') {
                    try {
                        const data = await fetchResearchFlightMetadata(anomaly.flight_id);
                        return data;
                    } catch {
                        // Fall back to tagged metadata if research fails
                        return await fetchTaggedFlightMetadata(anomaly.flight_id);
                    }
                }
                
                // For feedback mode, use tagged endpoint
                if (mode === 'feedback') {
                    return await fetchTaggedFlightMetadata(anomaly.flight_id);
                }
                
                // For other modes (historical, realtime, rules, ai-results),
                // try tagged first, then research as fallback
                try {
                    return await fetchTaggedFlightMetadata(anomaly.flight_id);
                } catch {
                    return await fetchResearchFlightMetadata(anomaly.flight_id);
                }
            };
            
            fetchMetadata()
                .then(data => setMetadata(data))
                .catch(() => setMetadata(null))
                .finally(() => setLoadingMetadata(false));
        } else {
            setMetadata(null);
        }
    }, [anomaly?.flight_id, mode]);

    if (!anomaly) return null;

    // ============================================================
    // Render
    // ============================================================

    return (
        <aside className={clsx(
            "bg-surface rounded-xl flex flex-col h-full overflow-hidden border border-white/5 animate-in slide-in-from-right-4",
            className || "col-span-3"
        )}>
            {/* Header with Tabs */}
            <div className="border-b border-white/10 bg-surface-highlight/50">
                {/* Title Row */}
                <div className="p-4 pb-2 flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-bold flex items-center gap-2">
                            {isHebrew ? "ניתוח טיסה" : "Flight Analysis"}
                        </h3>
                        <p className="text-xs text-white/60">{anomaly.callsign || anomaly.flight_id}</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-white/60 hover:text-white p-1 rounded hover:bg-white/10"
                    >
                        <X className="size-5" />
                    </button>
                </div>
                
                {/* Tab Buttons */}
                <div className="flex px-4 gap-1">
                    <button
                        onClick={() => setActiveTab('report')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-b-2",
                            activeTab === 'report'
                                ? "bg-surface text-white border-primary"
                                : "text-white/60 hover:text-white border-transparent hover:bg-white/5"
                        )}
                    >
                        <FileText className="size-4" />
                        {isHebrew ? "דוח" : "Report"}
                    </button>
                    <button
                        onClick={() => setActiveTab('metadata')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-b-2",
                            activeTab === 'metadata'
                                ? "bg-surface text-white border-cyan-500"
                                : "text-white/60 hover:text-white border-transparent hover:bg-white/5"
                        )}
                    >
                        <Info className="size-4" />
                        {isHebrew ? "מידע טיסה" : "Flight Info"}
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'report' ? (
                    // Report Tab - Use existing ReportPanel content
                    <ReportPanelContent anomaly={anomaly} onClose={onClose} mode={mode} onFlyTo={onFlyTo} />
                ) : (
                    // Flight Metadata Tab
                    <FlightMetadataPanel metadata={metadata} loading={loadingMetadata} isHebrew={isHebrew} />
                )}
            </div>
        </aside>
    );
};

// ============================================================
// Report Panel Content (extracted from ReportPanel for embedding)
// ============================================================

const ReportPanelContent: React.FC<{ anomaly: AnomalyReport; onClose: () => void; mode?: 'historical' | 'realtime' | 'research' | 'rules' | 'feedback' | 'ai-results'; onFlyTo?: (lat: number, lon: number, zoom?: number) => void }> = ({ anomaly, onClose, mode, onFlyTo }) => {
    // This wraps the ReportPanel but removes its outer container for embedding
    return (
        <div className="h-full overflow-y-auto">
            <ReportPanel 
                anomaly={anomaly} 
                onClose={onClose} 
                className="!col-span-full !rounded-none !border-0 !animate-none"
                mode={mode}
                onFlyTo={onFlyTo}
            />
        </div>
    );
};
