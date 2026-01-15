import { 
    AnomalyReport, FlightTrack, TrackPoint, DataFlight, AIReasoningResponse,
    AnomalyDNA, PatternCluster, SafetyForecast,
    OverviewStats, EmergencyCodeStat, NearMissEvent, GoAroundStat,
    FlightPerDay, SignalLossLocation, SignalLossMonthly, SignalLossHourly,
    AirlineEfficiency, HoldingPatternAnalysis,
    GPSJammingPoint, MilitaryPattern, AirspaceRisk, BusiestAirport
} from './types';
import type { AIAction } from './utils/aiActions';
import type { ChatMessage } from './chatTypes';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

// ============================================================
// AI Analyze Types
// ============================================================

export interface AIAnalyzeRequest {
    screenshot: string;  // base64 PNG (with or without data URL prefix)
    question: string;
    flight_id: string;
    flight_data: TrackPoint[];
    anomaly_report: any;
    selected_point?: { lat: number; lon: number; timestamp?: number };
    history?: { role: string; content: string }[];  // Conversation history
    length?: 'short' | 'medium' | 'long'; // Desired response length
    language?: 'en' | 'he'; // Output language
}

export interface AIAnalyzeResponse {
    response: string;
    actions: AIAction[];
}

export const fetchLiveAnomalies = async (startTs: number, endTs: number): Promise<AnomalyReport[]> => {
    const response = await fetch(`${API_BASE}/live/anomalies?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) {
        throw new Error('Failed to fetch anomalies');
    }
    return response.json();
};

export const fetchLiveTrack = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/live/track/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch track');
    }
    return response.json();
};

export const fetchResearchAnomalies = async (startTs: number, endTs: number): Promise<AnomalyReport[]> => {
    const response = await fetch(`${API_BASE}/research/anomalies?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) {
        throw new Error('Failed to fetch research anomalies');
    }
    return response.json();
};

// Fetch all flights for dashboard (normal from research + all from feedback_tagged)
export const fetchDashboardFlights = async (startTs: number, endTs: number): Promise<AnomalyReport[]> => {
    const response = await fetch(`${API_BASE}/dashboard/flights?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard flights');
    }
    return response.json();
};

export const fetchAnalyzeFlight = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/analyze/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to analyze flight');
    }
    const result = await response.json();
    if (result.track) {
        return result.track;
    }
    throw new Error('Track data missing in analysis result');
};

export const fetchAnalyzeFlightFromDB = async (flightId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/analyze/from-db/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to analyze flight from DB');
    }
    return response.json();
};

export const fetchUnifiedTrack = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/track/unified/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch flight track');
    }
    return response.json();
};

export const fetchResearchTrack = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/research/track/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch research track');
    }
    return response.json();
};

export const fetchFeedbackTrack = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/feedback/track/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch feedback track');
    }
    return response.json();
};

export const fetchLearnedPaths = async (): Promise<any> => {
    const response = await fetch(`${API_BASE}/paths`);
    if (!response.ok) {
        throw new Error('Failed to fetch learned paths');
    }
    return response.json();
};

// ============================================================
// Learned Layers Types (SID, STAR, Turns, Paths)
// ============================================================

export interface LearnedPathPoint {
    lat: number;
    lon: number;
    alt: number;
}

export interface LearnedPath {
    id: string;
    origin: string | null;
    destination: string | null;
    centerline: LearnedPathPoint[];
    width_nm?: number;
    member_count: number;
}

export interface LearnedTurnZone {
    id: number;
    lat: number;
    lon: number;
    radius_nm: number;
    avg_alt_ft: number;
    angle_range_deg: [number, number];
    avg_speed_kts: number;
    member_count: number;
    directions: { left: number; right: number };
}

export interface LearnedProcedure {
    id: string;
    airport: string;
    type: 'SID' | 'STAR';
    centerline: LearnedPathPoint[];
    width_nm?: number;
    member_count: number;
}

export interface LearnedTube {
    id: string;
    origin: string | null;
    destination: string | null;
    min_alt_ft: number;
    max_alt_ft: number;
    member_count: number;
    geometry: Array<[number, number]>; // Array of [lat, lon] coordinates
}

export interface LearnedLayers {
    paths: LearnedPath[];
    turns: LearnedTurnZone[];
    sids: LearnedProcedure[];
    stars: LearnedProcedure[];
    tubes: LearnedTube[];
}

export interface UnionTube {
    id: string;
    origin: string;
    destination: string;
    min_alt_ft: number | null;
    max_alt_ft: number | null;
    tube_count: number;
    member_count: number;
    geometry: Array<[number, number]>; // Array of [lat, lon] coordinates
}

export interface UnionTubesResponse {
    union_tubes: UnionTube[];
}

export const fetchLearnedLayers = async (origin?: string, destination?: string): Promise<LearnedLayers> => {
    const params = new URLSearchParams();
    if (origin) params.append('origin', origin);
    if (destination) params.append('destination', destination);
    
    const url = params.toString() 
        ? `${API_BASE}/learned-layers?${params.toString()}`
        : `${API_BASE}/learned-layers`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch learned layers');
    }
    return response.json();
};

export const fetchUnionTubes = async (origin?: string, destination?: string): Promise<UnionTubesResponse> => {
    const params = new URLSearchParams();
    if (origin) params.append('origin', origin);
    if (destination) params.append('destination', destination);
    
    const url = params.toString() 
        ? `${API_BASE}/union-tubes?${params.toString()}`
        : `${API_BASE}/union-tubes`;
    
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch union tubes');
    }
    return response.json();
};

export const fetchRules = async (): Promise<{ id: number; name: string; description: string }[]> => {
    const response = await fetch(`${API_BASE}/rules`);
    if (!response.ok) {
        throw new Error('Failed to fetch rules');
    }
    return response.json();
};

export const fetchFlightsByRule = async (ruleId: number, signal?: AbortSignal): Promise<AnomalyReport[]> => {
    const response = await fetch(`${API_BASE}/rules/${ruleId}/flights`, { signal });
    if (!response.ok) {
        throw new Error('Failed to fetch flights by rule');
    }
    return response.json();
};

export const fetchCallsignFromResearch = async (flightId: string): Promise<string | null> => {
    try {
        const response = await fetch(`${API_BASE}/research/callsign/${flightId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.callsign || null;
    } catch (error) {
        console.warn('Failed to fetch callsign', error);
        return null;
    }
};

export interface FeedbackParams {
    flightId: string;
    isAnomaly: boolean;
    comments?: string;
    ruleId?: number | null;  // Legacy single rule - kept for backward compatibility
    ruleIds?: number[];      // New: array of rule IDs for multiple selection
    otherDetails?: string;   // Used when ruleId is null/Other
}

export interface FeedbackHistoryItem {
    feedback_id: number;
    flight_id: string;
    timestamp: number;
    callsign?: string;
    comments: string;
    rule_id?: number | null;
    other_details?: string;
    model_version?: string;
    full_report?: any;
    is_anomaly: boolean;
}

export interface UpdateFeedbackParams {
    ruleId?: number | null;  // null means "Other" option
    comments?: string;
    otherDetails?: string;   // Used when ruleId is null
}

export const submitFeedback = async (params: FeedbackParams): Promise<void> => {
    const { flightId, isAnomaly, comments = "", ruleId, ruleIds, otherDetails = "" } = params;
    
    // Support both old (ruleId) and new (ruleIds) format
    // If ruleIds is provided, use it; otherwise convert ruleId to array
    const finalRuleIds = ruleIds ?? (ruleId !== null && ruleId !== undefined ? [ruleId] : undefined);
    
    const response = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            flight_id: flightId,
            is_anomaly: isAnomaly,
            comments: comments,
            rule_ids: finalRuleIds,  // Send as array
            rule_id: ruleId,  // Keep for backward compatibility
            other_details: otherDetails
        }),
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to submit feedback');
    }
};

export const fetchFeedbackHistory = async (startTs: number = 0, endTs?: number, limit: number = 100): Promise<AnomalyReport[]> => {
    const params = new URLSearchParams({
        start_ts: startTs.toString(),
        limit: limit.toString()
    });
    
    if (endTs !== undefined) {
        params.append('end_ts', endTs.toString());
    }
    
    const response = await fetch(`${API_BASE}/feedback/history?${params}`);
    if (!response.ok) {
        throw new Error('Failed to fetch feedback history');
    }
    return response.json();
};

// Fetch from the new feedback_tagged.db (clean database)
export const fetchTaggedFeedbackHistory = async (startTs: number = 0, endTs?: number, limit: number = 100, includeNormal: boolean = true): Promise<AnomalyReport[]> => {
    const params = new URLSearchParams({
        start_ts: startTs.toString(),
        limit: limit.toString(),
        include_normal: includeNormal.toString()
    });
    
    if (endTs !== undefined) {
        params.append('end_ts', endTs.toString());
    }
    
    const response = await fetch(`${API_BASE}/feedback/tagged/history?${params}`);
    if (!response.ok) {
        throw new Error('Failed to fetch tagged feedback history');
    }
    return response.json();
};

// Fetch track from feedback_tagged.db
export const fetchTaggedFeedbackTrack = async (flightId: string): Promise<FlightTrack> => {
    const response = await fetch(`${API_BASE}/feedback/tagged/track/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch tagged feedback track');
    }
    return response.json();
};

// Flight Metadata type
export interface FlightMetadata {
    flight_id: string;
    callsign?: string;
    flight_number?: string;
    airline?: string;
    airline_code?: string;
    aircraft_type?: string;
    aircraft_model?: string;
    aircraft_registration?: string;
    origin_airport?: string;
    origin_lat?: number;
    origin_lon?: number;
    destination_airport?: string;
    dest_lat?: number;
    dest_lon?: number;
    first_seen_ts?: number;
    last_seen_ts?: number;
    scheduled_departure?: string;
    scheduled_arrival?: string;
    flight_duration_sec?: number;
    total_distance_nm?: number;
    total_points?: number;
    min_altitude_ft?: number;
    max_altitude_ft?: number;
    avg_altitude_ft?: number;
    cruise_altitude_ft?: number;
    min_speed_kts?: number;
    max_speed_kts?: number;
    avg_speed_kts?: number;
    start_lat?: number;
    start_lon?: number;
    end_lat?: number;
    end_lon?: number;
    squawk_codes?: string;
    emergency_squawk_detected?: boolean;
    is_anomaly?: boolean;
    is_military?: boolean;
    military_type?: string;
    flight_phase_summary?: string;
    nearest_airport_start?: string;
    nearest_airport_end?: string;
    crossed_borders?: string;
    signal_loss_events?: number;
    severity_cnn?: number;
    severity_dense?: number;
    data_quality_score?: number;
    feedback?: {
        rule_id?: number;  // Legacy single rule
        rule_name?: string;  // Legacy single rule name
        rule_ids?: number[];  // Multiple rules
        rule_names?: string[];  // Multiple rule names
        comments?: string;
        other_details?: string;
        tagged_at?: number;
    };
}

// Fetch flight metadata from feedback_tagged.db
export const fetchTaggedFlightMetadata = async (flightId: string): Promise<FlightMetadata> => {
    const response = await fetch(`${API_BASE}/feedback/tagged/metadata/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch flight metadata');
    }
    return response.json();
};

// Fetch flight metadata from research.db
export const fetchResearchFlightMetadata = async (flightId: string): Promise<FlightMetadata> => {
    const response = await fetch(`${API_BASE}/research/metadata/${flightId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch research flight metadata');
    }
    return response.json();
};

export const updateFeedback = async (feedbackId: number, params: UpdateFeedbackParams): Promise<void> => {
    const { ruleId, comments = "", otherDetails = "" } = params;
    
    const response = await fetch(`${API_BASE}/feedback/${feedbackId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            rule_id: ruleId,
            comments: comments,
            other_details: otherDetails
        }),
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update feedback');
    }
};

export const reanalyzeFeedbackFlight = async (flightId: string): Promise<AnomalyReport> => {
    const response = await fetch(`${API_BASE}/feedback/reanalyze/${flightId}`, {
        method: 'POST',
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to re-analyze flight');
    }
    
    return response.json();
};

// ============================================================
// AI Analyze Endpoint
// ============================================================

/**
 * Send a screenshot and question to the AI co-pilot for analysis.
 * Returns the AI's response text and optional map actions.
 */
export const analyzeWithAI = async (request: AIAnalyzeRequest, signal?: AbortSignal): Promise<AIAnalyzeResponse> => {
    const response = await fetch(`${API_BASE}/ai/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            screenshot: request.screenshot,
            question: request.question,
            flight_id: request.flight_id,
            flight_data: request.flight_data,
            anomaly_report: request.anomaly_report,
            selected_point: request.selected_point,
            history: request.history || [],
            length: request.length || 'medium',
            language: request.language || 'en'
        }),
        signal,
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'AI analysis failed');
    }
    
    return response.json();
};

export const fetchDataFlights = async (startTs: number, endTs: number): Promise<DataFlight[]> => {
    const response = await fetch(`${API_BASE}/data/flights?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) {
        throw new Error('Failed to fetch data flights');
    }
    return response.json();
};

// ============================================================
// AI Reasoning Endpoint
// ============================================================

export interface ReasoningFlightContext {
    flightId: string;
    points: TrackPoint[];
    anomalyReport?: any;
}

/**
 * Send a message to the AI reasoning agent.
 * The agent can query the flight database and return either:
 * - A text response (type: 'message')
 * - A list of flights to display (type: 'flights')
 * 
 * Optionally pass flight context for visual analysis with map image.
 */
export const sendReasoningQuery = async (
    message: string,
    history: ChatMessage[],
    flightContext?: ReasoningFlightContext,
    signal?: AbortSignal
): Promise<AIReasoningResponse> => {
    const body: any = {
        message,
        history: history.map(m => ({ role: m.role, content: m.content }))
    };
    
    // Add flight context if provided
    if (flightContext) {
        body.flight_id = flightContext.flightId;
        body.points = flightContext.points;
        body.anomaly_report = flightContext.anomalyReport;
    }
    
    const response = await fetch(`${API_BASE}/ai/reasoning`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'AI reasoning failed');
    }
    
    return response.json();
};

// ============================================================
// Intelligence Dashboard API Functions
// ============================================================

// Cache Management
export const clearCache = async (): Promise<{ status: string; cleared_entries: number }> => {
    const response = await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to clear cache');
    return response.json();
};

export const getCacheInfo = async (): Promise<{ total_entries: number; valid_entries: number; expiry_seconds: number }> => {
    const response = await fetch(`${API_BASE}/cache/info`);
    if (!response.ok) throw new Error('Failed to get cache info');
    return response.json();
};

// Level 1: Statistics
export const fetchStatsOverview = async (startTs: number, endTs: number, forceRefresh = false): Promise<OverviewStats> => {
    const url = `${API_BASE}/stats/overview?start_ts=${startTs}&end_ts=${endTs}${forceRefresh ? '&force_refresh=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch overview stats');
    return response.json();
};

export const fetchEmergencyCodes = async (startTs: number, endTs: number): Promise<EmergencyCodeStat[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/emergency-codes?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch emergency codes');
    return response.json();
};

export const fetchNearMissEvents = async (startTs: number, endTs: number, severity?: string): Promise<NearMissEvent[]> => {
    const url = severity 
        ? `${API_BASE}/stats/safety/near-miss?start_ts=${startTs}&end_ts=${endTs}&severity=${severity}`
        : `${API_BASE}/stats/safety/near-miss?start_ts=${startTs}&end_ts=${endTs}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch near-miss events');
    return response.json();
};

export const fetchGoArounds = async (startTs: number, endTs: number, airport?: string): Promise<GoAroundStat[]> => {
    const url = airport 
        ? `${API_BASE}/stats/safety/go-arounds?start_ts=${startTs}&end_ts=${endTs}&airport=${airport}`
        : `${API_BASE}/stats/safety/go-arounds?start_ts=${startTs}&end_ts=${endTs}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch go-arounds');
    return response.json();
};

// Go-around hourly distribution
export interface GoAroundHourly {
    hour: number;
    count: number;
    airports: Record<string, number>;
}

export const fetchGoAroundsHourly = async (startTs: number, endTs: number): Promise<GoAroundHourly[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/go-arounds/hourly?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch go-arounds hourly');
    return response.json();
};

// Monthly safety events breakdown
export interface SafetyMonthly {
    month: string;
    emergency_codes: number;
    near_miss: number;
    go_arounds: number;
    total_events: number;
    affected_flights: number;
}

export const fetchSafetyMonthly = async (startTs: number, endTs: number): Promise<SafetyMonthly[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/monthly?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch monthly safety stats');
    return response.json();
};

// Near-miss geographic locations
export interface NearMissLocation {
    lat: number;
    lon: number;
    count: number;
    severity_high: number;
    severity_medium: number;
    sample_flight_ids?: string[];  // Up to 5 sample flight IDs from this location
}

export const fetchNearMissLocations = async (startTs: number, endTs: number, limit = 50): Promise<NearMissLocation[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/near-miss/locations?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch near-miss locations');
    return response.json();
};

// Flights missing callsign/destination
export interface FlightsMissingInfo {
    no_callsign: number;
    no_destination: number;
    total_flights: number;
}

export const fetchFlightsMissingInfo = async (startTs: number, endTs: number): Promise<FlightsMissingInfo> => {
    const response = await fetch(`${API_BASE}/stats/traffic/missing-info?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch missing info stats');
    return response.json();
};

// Safety events by flight phase
export interface SafetyByPhase {
    phases: {
        cruise: { count: number; emergency: number; near_miss: number; go_around: number };
        descent_climb: { count: number; emergency: number; near_miss: number; go_around: number };
        approach: { count: number; emergency: number; near_miss: number; go_around: number };
        unknown: { count: number; emergency: number; near_miss: number; go_around: number };
    };
    total_events: number;
    percentages: Record<string, number>;
}

export const fetchSafetyByPhase = async (startTs: number, endTs: number): Promise<SafetyByPhase> => {
    const response = await fetch(`${API_BASE}/stats/safety/by-phase?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch safety by phase');
    return response.json();
};

// Deviations by aircraft type
export interface DeviationByType {
    aircraft_type: string;
    deviation_count: number;
    avg_deviation_nm: number;
    large_deviations: number;
    unique_flights: number;
    flights: string[];
}

export const fetchDeviationsByType = async (startTs: number, endTs: number): Promise<DeviationByType[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/deviations-by-type?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch deviations by type');
    return response.json();
};

// Emergency aftermath analysis
export interface EmergencyAftermath {
    flight_id: string;
    callsign: string;
    emergency_code: string;
    code_description: string;
    timestamp: number;
    outcome: 'landed_at_destination' | 'diverted' | 'returned_to_base' | 'go_around_then_landed' | 'continued_flight' | 'unknown';
    landing_airport: string | null;
    origin: string;
    destination: string;
    had_go_around: boolean;
}

export interface EmergencyClusters {
    multi_incident_days: Array<{
        date: string;
        count: number;
        events: Array<{
            callsign: string;
            code: string;
            time: string;
        }>;
        cluster_detected: boolean;
    }>;
    geographic_clusters: Array<{
        area_name: string;
        lat: number;
        lon: number;
        count: number;
        dates: string[];
        unique_days: number;
    }>;
    total_cluster_days: number;
    total_multi_incident_days: number;
    insights: string[];
}

export const fetchEmergencyAftermath = async (startTs: number, endTs: number): Promise<EmergencyAftermath[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/emergency-aftermath?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch emergency aftermath');
    return response.json();
};

// Bottleneck zones
export interface BottleneckZone {
    lat: number;
    lon: number;
    density_score: number;
    flight_count: number;
    holding_count: number;
    avg_altitude: number;
    flights_per_hour: number;
    congestion_level: 'critical' | 'high' | 'moderate' | 'low';
    polygon?: [number, number][]; // [[lon, lat], ...] for polygon rendering
}

export const fetchBottleneckZones = async (startTs: number, endTs: number, limit = 20): Promise<BottleneckZone[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/bottlenecks?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch bottleneck zones');
    return response.json();
};

export const fetchFlightsPerDay = async (startTs: number, endTs: number, forceRefresh = false): Promise<FlightPerDay[]> => {
    const url = `${API_BASE}/stats/traffic/flights-per-day?start_ts=${startTs}&end_ts=${endTs}${forceRefresh ? '&force_refresh=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch flights per day');
    return response.json();
};

export const fetchBusiestAirports = async (startTs: number, endTs: number, limit = 10, forceRefresh = false): Promise<any[]> => {
    const url = `${API_BASE}/stats/traffic/busiest-airports?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}${forceRefresh ? '&force_refresh=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch busiest airports');
    return response.json();
};

export const fetchSignalLoss = async (startTs: number, endTs: number): Promise<SignalLossLocation[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/signal-loss?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch signal loss');
    return response.json();
};

export const fetchSignalLossMonthly = async (startTs: number, endTs: number): Promise<SignalLossMonthly[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/signal-loss/monthly?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch monthly signal loss');
    return response.json();
};

export const fetchSignalLossHourly = async (startTs: number, endTs: number): Promise<SignalLossHourly[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/signal-loss/hourly?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch hourly signal loss');
    return response.json();
};

// ============================================================================
// Tagged Dashboard API (Optimized for feedback_tagged.db)
// These endpoints use pre-computed fields and indexes for fast queries
// ============================================================================

// Tagged Overview Stats
export interface TaggedOverviewStats {
    total_flights: number;
    total_anomalies: number;
    safety_events: number;
    go_arounds: number;
    emergency_codes: number;
    near_miss: number;
    holding_patterns: number;
    military_flights: number;
    return_to_field: number;
    unplanned_landing: number;
    avg_severity: number;
}

export const fetchTaggedStatsOverview = async (startTs: number, endTs: number, forceRefresh = false): Promise<TaggedOverviewStats> => {
    const url = `${API_BASE}/stats/tagged/overview?start_ts=${startTs}&end_ts=${endTs}${forceRefresh ? '&force_refresh=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch tagged overview stats');
    return response.json();
};

// Tagged Flights Per Day
export interface TaggedFlightPerDay {
    date: string;
    count: number;
    military_count: number;
    civilian_count: number;
    anomaly_count: number;
}

export const fetchTaggedFlightsPerDay = async (startTs: number, endTs: number, forceRefresh = false): Promise<TaggedFlightPerDay[]> => {
    const url = `${API_BASE}/stats/tagged/flights-per-day?start_ts=${startTs}&end_ts=${endTs}${forceRefresh ? '&force_refresh=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch tagged flights per day');
    return response.json();
};

// Tagged Busiest Airports
export interface TaggedAirportStats {
    airport: string;
    arrivals: number;
    departures: number;
    total: number;
}

export const fetchTaggedBusiestAirports = async (startTs: number, endTs: number, limit = 10): Promise<TaggedAirportStats[]> => {
    const response = await fetch(`${API_BASE}/stats/tagged/busiest-airports?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch tagged busiest airports');
    return response.json();
};

// Tagged Safety by Rule
export interface TaggedSafetyByRule {
    by_rule: Array<{ rule_id: number | string; rule_name: string; count: number }>;
    by_category: Record<string, number>;
    total_events: number;
}

export const fetchTaggedSafetyByRule = async (startTs: number, endTs: number): Promise<TaggedSafetyByRule> => {
    const response = await fetch(`${API_BASE}/stats/tagged/safety-by-rule?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tagged safety by rule');
    return response.json();
};

// Tagged Emergency Codes
export interface TaggedEmergencyCode {
    code: string;
    count: number;
    airlines: Record<string, number>;
    flights: string[];
}

export const fetchTaggedEmergencyCodes = async (startTs: number, endTs: number): Promise<TaggedEmergencyCode[]> => {
    const response = await fetch(`${API_BASE}/stats/tagged/emergency-codes?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tagged emergency codes');
    return response.json();
};

// Tagged Military Stats
export interface TaggedMilitaryStats {
    total_military: number;
    by_type: Record<string, number>;
    by_country: Record<string, number>;
    flights: Array<{
        flight_id: string;
        callsign: string;
        type: string;
        country: string;
        route: string;
    }>;
}

export const fetchTaggedMilitaryStats = async (startTs: number, endTs: number): Promise<TaggedMilitaryStats> => {
    const response = await fetch(`${API_BASE}/stats/tagged/military?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tagged military stats');
    return response.json();
};

// Tagged Signal Loss Stats
export interface TaggedSignalLossStats {
    total_events: number;
    affected_flights: number;
    avg_events_per_flight: number;
    flights_with_loss: Array<{
        flight_id: string;
        callsign: string;
        signal_loss_count: number;
        route: string;
    }>;
}

export const fetchTaggedSignalLossStats = async (startTs: number, endTs: number): Promise<TaggedSignalLossStats> => {
    const response = await fetch(`${API_BASE}/stats/tagged/signal-loss?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tagged signal loss stats');
    return response.json();
};

// Tagged Severity Distribution
export interface TaggedSeverityDistribution {
    distribution: Array<{ severity_range: string; count: number }>;
    avg_cnn: number;
    avg_dense: number;
    max_cnn: number;
    max_dense: number;
}

export const fetchTaggedSeverityDistribution = async (startTs: number, endTs: number): Promise<TaggedSeverityDistribution> => {
    const response = await fetch(`${API_BASE}/stats/tagged/severity-distribution?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tagged severity distribution');
    return response.json();
};

// Tagged Airline Stats
export interface TaggedAirlineStats {
    airline: string;
    flight_count: number;
    avg_duration_hours: number;
    avg_distance_nm: number;
    avg_speed_kts: number;
    anomaly_count: number;
    anomaly_rate: number;
}

export const fetchTaggedAirlineStats = async (startTs: number, endTs: number, limit = 20): Promise<TaggedAirlineStats[]> => {
    const response = await fetch(`${API_BASE}/stats/tagged/airlines?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch tagged airline stats');
    return response.json();
};

// Tagged Routes Stats
export interface TaggedRouteStats {
    route: string;
    origin: string;
    destination: string;
    flight_count: number;
    avg_duration_hours: number;
    avg_distance_nm: number;
    anomaly_count: number;
    anomaly_rate: number;
}

export const fetchTaggedRoutesStats = async (startTs: number, endTs: number, limit = 20): Promise<TaggedRouteStats[]> => {
    const response = await fetch(`${API_BASE}/stats/tagged/routes?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch tagged routes stats');
    return response.json();
};

// ============================================================================
// BATCH APIs - Reduces multiple API calls to single requests for better performance
// ============================================================================

// Airline Safety Scorecard
export interface AirlineSafetyScorecardEntry {
    airline: string;
    airline_name: string;
    total_flights: number;
    emergencies: number;
    near_miss: number;
    go_arounds: number;
    diversions: number;
    safety_score: number;
    weighted_score?: number;          // Score adjusted for statistical confidence
    confidence?: 'high' | 'medium' | 'low' | 'very_low';  // Statistical reliability
    market_share?: number;            // Percentage of total flights
    is_priority?: boolean;            // Key airline for TLV
    safety_grade: 'A' | 'B' | 'C' | 'D' | 'F';
    trend: 'improving' | 'declining' | 'stable';
    issues: string[];
}

export interface AirlineSafetyScorecard {
    scorecards: AirlineSafetyScorecardEntry[];
    summary: {
        total_airlines: number;
        average_score: number;
        best_performer: { airline: string; airline_name: string; score: number; flights?: number } | null;
        needs_attention: Array<{ airline: string; airline_name: string; issues: string[]; flights?: number }>;
    };
}

export interface SafetyBatchResponse {
    emergency_codes?: EmergencyCodeStat[];
    near_miss?: NearMissEvent[];
    go_arounds?: GoAroundStat[];
    go_arounds_hourly?: GoAroundHourly[];
    safety_monthly?: SafetyMonthly[];
    near_miss_locations?: NearMissLocation[];
    safety_by_phase?: SafetyByPhase;
    emergency_aftermath?: EmergencyAftermath[];
    top_airline_emergencies?: TopAirlineEmergency[];
    near_miss_by_country?: NearMissByCountry;
    emergency_clusters?: EmergencyClusters;
    // NEW: Additional precomputed safety data
    weather_impact?: WeatherImpactAnalysis;
    daily_incident_clusters?: DailyIncidentClusters;
    // Airline Safety Scorecard
    airline_scorecard?: AirlineSafetyScorecard;
    // Near-miss polygon clusters (convex hull)
    near_miss_clusters?: NearMissClustersResponse;
}

// Military by Country - Country-specific military intelligence
export interface MilitaryCountryData {
    country_name: string;
    total_flights: number;
    by_type: Record<string, number>;
    anomalies: Array<{
        callsign: string;
        type: string;
        duration_hours: number;
        reason: string;
        timestamp: number;
    }>;
    anomaly_count: number;
    avg_duration_hours: number;
    crossed_borders: number;
    primary_region: string;
    recent_flights: Array<{
        callsign: string;
        type: string;
        timestamp: number;
        duration_hours: number;
    }>;
}

export interface MilitaryAlert {
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    details?: any;
}

export interface MilitaryByCountryResponse {
    countries: Record<string, MilitaryCountryData>;
    summary: {
        total_military_flights: number;
        countries_detected: number;
        top_countries: Array<{ country: string; flights: number }>;
        alerts: MilitaryAlert[];
        analysis_period_days: number;
    };
}

// Bilateral Proximity Events - Russian-American etc.
export interface BilateralProximityEvent {
    country1: string;
    country2: string;
    callsign1: string;
    callsign2: string;
    type1: string;
    type2: string;
    min_distance_nm: number;
    timestamp: number;
    location: { lat: number; lon: number };
    severity: 'critical' | 'high' | 'medium' | 'low';
    severity_score: number;
    pair_name: string;
    is_high_interest: boolean;
}

export interface BilateralProximityResponse {
    events: BilateralProximityEvent[];
    by_pair: Record<string, number>;
    total_events: number;
    high_risk_events: number;
    alerts: MilitaryAlert[];
    proximity_threshold_nm: number;
    time_window_sec?: number;  // Time window for considering "same time" proximity
}

// Military by Destination - Syria filter, etc.
export interface MilitaryDestinationFlight {
    callsign: string;
    country: string;
    type: string;
    destination_region: string;
    origin_region: string;
    heading: number | null;
    altitude: number | null;
    timestamp: number;
    last_position: { lat: number; lon: number } | null;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
}

export interface SyriaFlight {
    callsign: string;
    country: string;
    type: string;
    origin_region: string;
    is_from_east: boolean;
    concern_level: 'medium' | 'high';
    origin_airport?: string;
    destination_airport?: string;
}

export interface MilitaryByDestinationResponse {
    by_destination: Record<string, number>;
    by_origin: Record<string, number>;
    syria_flights: SyriaFlight[];
    total_flights: number;
    syria_from_east_count: number;
}

// Combined Threat Assessment Widget
export interface ThreatComponent {
    score: number;
    weight: number;
    description: string;
    raw_count?: number;
    high_severity_count?: number;
    total_flights?: number;
    russian_flights?: number;
    russian_anomalies?: number;
    cluster_count?: number;
    high_risk_count?: number;
    syria_flights?: number;
    syria_from_east?: number;
    high_risk_destinations?: number;
    error?: string;
}

export interface ThreatConcern {
    name: string;
    score: number;
    description: string;
}

export interface ThreatAssessmentResponse {
    overall_score: number;
    threat_level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
    threat_color: string;
    components: {
        gps_jamming?: ThreatComponent;
        military_activity?: ThreatComponent;
        unusual_patterns?: ThreatComponent;
        conflict_zone_activity?: ThreatComponent;
    };
    top_concerns: ThreatConcern[];
    alerts: MilitaryAlert[];
    recommendations: string[];
    trend: 'increasing' | 'stable' | 'decreasing';
    analysis_period: {
        start_ts: number;
        end_ts: number;
        duration_days: number;
    };
}

// Jamming Source Triangulation
export interface EstimatedJammingSource {
    lat: number;
    lon: number;
    confidence_radius_nm: number;
    affected_flights_count: number;
    affected_flights: string[];
    confidence_level: 'high' | 'medium' | 'low';
    estimated_power: 'high' | 'medium' | 'low';
    first_detected: number | null;
    last_detected: number | null;
    avg_severity: number;
    detection_points: number;
    region: string;
}

export interface JammingTriangulationResponse {
    estimated_sources: EstimatedJammingSource[];
    total_affected_flights: number;
    total_detection_points: number;
    triangulation_quality: 'high' | 'medium' | 'low' | 'insufficient_data' | 'error';
    methodology: string;
    message?: string;
}

// Military flight with full track for map visualization
export interface MilitaryFlightWithTrack {
    flight_id: string;
    callsign: string;
    country: string;
    type: string;  // tanker, ISR, transport, fighter, etc.
    type_name: string;
    first_seen: number;
    track: [number, number][];  // [[lon, lat], ...] GeoJSON format
    track_points: number;
}

export interface MilitaryFlightsWithTracksResponse {
    flights: MilitaryFlightWithTrack[];
    by_country: Record<string, number>;
    total_flights: number;
    countries: string[];
}

export interface IntelligenceBatchResponse {
    airline_efficiency?: AirlineEfficiency[];
    holding_patterns?: HoldingPatternAnalysis;
    gps_jamming?: GPSJammingPoint[];
    military_patterns?: MilitaryPattern[];
    pattern_clusters?: PatternCluster[];
    military_routes?: MilitaryRoutes | null;
    airline_activity?: AirlineActivityTrends | null;
    // NEW: Additional precomputed intelligence data
    gps_jamming_temporal?: GPSJammingTemporal;
    gps_jamming_clusters?: GPSJammingClustersResponse;
    route_efficiency?: RouteEfficiencyComparison | RoutesSummary;
    signal_loss_zones?: SignalLossLocation[];
    // NEW: GPS Jamming Zones - predictive areas with expanded polygons
    gps_jamming_zones?: GPSJammingZonesResponse;
    // Country-specific military breakdown
    military_by_country?: MilitaryByCountryResponse;
    // Bilateral proximity detection
    bilateral_proximity?: BilateralProximityResponse;
    // Military by destination (Syria filter)
    military_by_destination?: MilitaryByDestinationResponse;
    // Combined Threat Assessment
    threat_assessment?: ThreatAssessmentResponse;
    // Jamming Source Triangulation
    jamming_triangulation?: JammingTriangulationResponse;
    // Military flights with full tracks for map visualization
    military_flights_with_tracks?: MilitaryFlightsWithTracksResponse;
}

/**
 * Fetch all safety statistics in a single request.
 * Replaces 10 parallel API calls with 1 for much faster loading.
 */
export const fetchSafetyBatch = async (
    startTs: number, 
    endTs: number, 
    include?: string[]
): Promise<SafetyBatchResponse> => {
    const response = await fetch(`${API_BASE}/stats/safety/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs),
            include: include || [
                'emergency_codes', 'near_miss', 'go_arounds', 'hourly',
                'monthly', 'locations', 'phase', 'aftermath', 'top_airlines', 'by_country',
                'emergency_clusters', 'daily_incident_clusters', 'airline_scorecard',
                'near_miss_clusters'  // Near-miss polygon clusters
            ]
        })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch safety batch');
    }
    return response.json();
};

/**
 * Fetch all intelligence statistics in a single request.
 * Replaces 7 parallel API calls with 1 for much faster loading.
 */
export const fetchIntelligenceBatch = async (
    startTs: number, 
    endTs: number, 
    include?: string[]
): Promise<IntelligenceBatchResponse> => {
    const response = await fetch(`${API_BASE}/intel/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs),
            include: include || [
                'efficiency', 'holding', 'gps_jamming', 'military',
                'clusters', 'routes', 'activity',
                // Additional intelligence data
                'gps_jamming_temporal', 'gps_jamming_clusters', 'gps_jamming_zones', 'route_efficiency', 'signal_loss_zones',
                // Country-specific military breakdown
                'military_by_country',
                // Bilateral proximity detection
                'bilateral_proximity',
                // Military by destination (Syria filter)
                'military_by_destination',
                // Combined Threat Assessment
                'threat_assessment',
                // Jamming Source Triangulation
                'jamming_triangulation',
                // Military flights with full tracks for map visualization
                'military_flights_with_tracks'
            ]
        })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch intelligence batch');
    }
    return response.json();
};

// Overview Batch Response
export interface OverviewBatchResponse {
    stats?: OverviewStats;
    flights_per_day?: FlightPerDay[];
    gps_jamming?: GPSJammingPoint[];
    military_patterns?: MilitaryPattern[];
    airspace_risk?: AirspaceRisk;
    monthly_flights?: MonthlyFlightStats[];
}

/**
 * Fetch all overview statistics in a single request.
 * Replaces 6 parallel API calls with 1 for much faster loading.
 */
export const fetchOverviewBatch = async (
    startTs: number, 
    endTs: number, 
    include?: string[]
): Promise<OverviewBatchResponse> => {
    const response = await fetch(`${API_BASE}/stats/overview/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs),
            include: include || [
                'stats', 'flights_per_day', 'gps_jamming', 'military',
                'airspace_risk', 'monthly_flights'
            ]
        })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch overview batch');
    }
    return response.json();
};

// Traffic Batch Response
export interface TrafficBatchResponse {
    flights_per_day?: FlightPerDay[];
    busiest_airports?: BusiestAirport[];
    signal_loss?: SignalLossLocation[];
    signal_loss_monthly?: SignalLossMonthly[];
    signal_loss_hourly?: SignalLossHourly[];
    signal_loss_clusters?: SignalLossClustersResponse;  // NEW: Precomputed polygon clusters
    // NEW: Coverage Gap Zones - predictive areas where flights disappear
    coverage_gap_zones?: CoverageGapZonesResponse;
    peak_hours?: PeakHoursAnalysis;
    diversion_stats?: DiversionStats;
    diversions_monthly?: DiversionMonthly[];
    alternate_airports?: AlternateAirport[];
    rtb_events?: RTBEvent[];
    missing_info?: FlightsMissingInfo;
    deviations_by_type?: DeviationByType[];
    bottleneck_zones?: BottleneckZone[];
    runway_usage?: Record<string, RunwayUsage[]>;
    // NEW: Seasonal analysis endpoints
    seasonal_year_comparison?: SeasonalYearComparison;
    traffic_safety_correlation?: TrafficSafetyCorrelation;
    special_events_impact?: SpecialEventsImpact;
    signal_loss_anomalies?: SignalLossAnomalyResponse;
    diversions_seasonal?: DiversionsSeasonal;
    // Holding patterns (moved from intelligence tab)
    holding_patterns?: HoldingPatternAnalysis;
}

/**
 * Fetch all traffic statistics in a single request.
 * Replaces 13 parallel API calls with 1 for much faster loading.
 */
export const fetchTrafficBatch = async (
    startTs: number, 
    endTs: number, 
    include?: string[]
): Promise<TrafficBatchResponse> => {
    const response = await fetch(`${API_BASE}/stats/traffic/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs),
            include: include || [
                'flights_per_day', 'airports', 'signal_loss', 'signal_monthly',
                'signal_hourly', 'signal_loss_clusters', 'peak_hours', 'diversions', 'diversions_monthly',
                'alternates', 'rtb', 'missing_info', 'deviations', 'bottlenecks',
                // runway_usage is loaded separately - not in pre-computed cache
                // Seasonal analysis endpoints
                'seasonal_year_comparison', 'traffic_safety_correlation', 'special_events_impact',
                'signal_loss_anomalies', 'diversions_seasonal',
                // Holding patterns (moved from intelligence tab)
                'holding_patterns'
            ]
        })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch traffic batch');
    }
    return response.json();
};

// Level 2: Insights
export const fetchAirlineEfficiency = async (startTs?: number, endTs?: number, route?: string): Promise<AirlineEfficiency[]> => {
    const params = new URLSearchParams();
    if (startTs) params.append('start_ts', startTs.toString());
    if (endTs) params.append('end_ts', endTs.toString());
    if (route) params.append('route', route);
    
    const url = params.toString() 
        ? `${API_BASE}/insights/airline-efficiency?${params.toString()}`
        : `${API_BASE}/insights/airline-efficiency`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch airline efficiency');
    return response.json();
};

export const fetchHoldingPatterns = async (startTs: number, endTs: number): Promise<HoldingPatternAnalysis> => {
    const response = await fetch(`${API_BASE}/insights/holding-patterns?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch holding patterns');
    return response.json();
};

export const fetchAlternateAirports = async (airport: string, eventDate?: number): Promise<any[]> => {
    const url = eventDate 
        ? `${API_BASE}/insights/alternate-airports?airport=${airport}&event_date=${eventDate}`
        : `${API_BASE}/insights/alternate-airports?airport=${airport}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch alternate airports');
    return response.json();
};

// Level 3: Intelligence
export const fetchGPSJamming = async (startTs: number, endTs: number): Promise<GPSJammingPoint[]> => {
    const response = await fetch(`${API_BASE}/intel/gps-jamming?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch GPS jamming');
    return response.json();
};

// Flight-specific GPS jamming analysis
export interface FlightJammingAnalysis {
    flight_id: string;
    jamming_score: number;
    jamming_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNLIKELY';
    indicators: {
        altitude_jumps: number;
        spoofed_altitude_hits: number;
        impossible_altitude_rates: number;
        speed_anomalies: number;
        position_teleports: number;
        mlat_ratio: number;
        anomaly_clusters: number;
    };
    anomaly_details: Array<{
        type: string;
        timestamp: number;
        [key: string]: any;
    }>;
    unique_altitudes: number[];
    summary: string;
}

export const fetchFlightJammingAnalysis = async (flightId: string): Promise<FlightJammingAnalysis> => {
    const response = await fetch(`${API_BASE}/intel/flight-jamming/${flightId}`);
    if (!response.ok) throw new Error('Failed to fetch flight jamming analysis');
    return response.json();
};

export const fetchMilitaryPatterns = async (startTs: number, endTs: number, country?: string, aircraftType?: string): Promise<MilitaryPattern[]> => {
    let url = `${API_BASE}/intel/military-patterns?start_ts=${startTs}&end_ts=${endTs}`;
    if (country) url += `&country=${country}`;
    if (aircraftType) url += `&aircraft_type=${aircraftType}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch military patterns');
    return response.json();
};

// Military routes analysis
export interface MilitaryRoutes {
    by_country: Record<string, {
        total_flights: number;
        routes: Array<{ route: string; count: number }>;
    }>;
    by_type: Record<string, {
        total_flights: number;
        common_areas: Array<{ area: string; count: number }>;
    }>;
    route_segments: Array<{
        lat: number;
        lon: number;
        count: number;
        countries: string[];
        types: string[];
    }>;
    total_military_flights: number;
}

export const fetchMilitaryRoutes = async (startTs: number, endTs: number, country?: string): Promise<MilitaryRoutes> => {
    let url = `${API_BASE}/intel/military-routes?start_ts=${startTs}&end_ts=${endTs}`;
    if (country) url += `&country=${country}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch military routes');
    return response.json();
};

// Level 4: Predictive
export const fetchAirspaceRisk = async (): Promise<AirspaceRisk> => {
    const response = await fetch(`${API_BASE}/predict/airspace-risk`);
    if (!response.ok) throw new Error('Failed to fetch airspace risk');
    return response.json();
};

export const predictHostileIntent = async (flightId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/predict/hostile-intent/${flightId}`, {
        method: 'POST',
    });
    if (!response.ok) {
        if (response.status === 404) throw new Error('Flight not found - no track data available');
        throw new Error('Failed to analyze flight');
    }
    return response.json();
};

export const predictTrajectory = async (flightId: string, currentPosition: any): Promise<any> => {
    const response = await fetch(`${API_BASE}/predict/trajectory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_id: flightId, current_position: currentPosition })
    });
    if (!response.ok) throw new Error('Failed to predict trajectory');
    return response.json();
};

export const fetchSafetyForecast = async (hoursAhead = 24): Promise<SafetyForecast> => {
    const response = await fetch(`${API_BASE}/predict/safety-forecast?hours_ahead=${hoursAhead}`);
    if (!response.ok) throw new Error('Failed to fetch safety forecast');
    return response.json();
};

// Anomaly DNA endpoints
export const fetchAnomalyDNA = async (flightId: string, lookbackDays = 30): Promise<AnomalyDNA> => {
    const response = await fetch(`${API_BASE}/intelligence/anomaly-dna/${flightId}?lookback_days=${lookbackDays}`);
    if (!response.ok) throw new Error('Failed to fetch anomaly DNA');
    return response.json();
};

export const fetchPatternClusters = async (startTs: number, endTs: number, minOccurrences = 3): Promise<PatternCluster[]> => {
    const params = new URLSearchParams({
        start_ts: startTs.toString(),
        end_ts: endTs.toString(),
        min_occurrences: minOccurrences.toString()
    });
    const response = await fetch(`${API_BASE}/intelligence/pattern-clusters?${params}`);
    if (!response.ok) throw new Error('Failed to fetch pattern clusters');
    return response.json();
};

// ============================================================
// Additional Analytics Endpoints (New UI Features)
// ============================================================

// Peak Hours Analysis with correlation
export interface PeakHoursAnalysis {
    peak_traffic_hours: number[];
    peak_safety_hours: number[];
    correlation_score: number;
    hourly_data: { 
        hour: number; 
        traffic: number;           // Daily average ALL flights at this hour
        safety_events: number;     // Daily average ANOMALY flights at this hour
        normal_flights?: number;   // Daily average NORMAL flights at this hour
        traffic_total?: number;    // Total flights across period
        safety_total?: number;     // Total anomaly flights across period
        traffic_pct?: number;
        safety_pct?: number;
    }[];
    // Context fields
    total_flights?: number;
    total_normal_flights?: number;
    total_anomaly_flights?: number;
    anomaly_rate_pct?: number;      // Percentage of flights that are anomalies
    num_days?: number;              // Number of days in the period
    explanation?: {
        traffic: string;
        safety_events: string;
        correlation: string;
    };
}

export const fetchPeakHoursAnalysis = async (startTs: number, endTs: number): Promise<PeakHoursAnalysis> => {
    const response = await fetch(`${API_BASE}/trends/peak-hours?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch peak hours analysis');
    return response.json();
};

// Diversion Statistics
export interface DiversionStats {
    total_diversions: number;
    total_large_deviations: number;
    total_holding_360s: number;
    by_airport: Record<string, number>;
    by_airline: Record<string, number>;
}

export const fetchDiversionStats = async (startTs: number, endTs: number): Promise<DiversionStats> => {
    const response = await fetch(`${API_BASE}/stats/diversions?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch diversion stats');
    return response.json();
};

// Alternate Airports
export interface AlternateAirport {
    airport: string;
    count: number;
    aircraft_types: string[];
    last_used: number;
    wide_body_count: number;
    narrow_body_count: number;
    body_type_preference: 'wide_body_preferred' | 'narrow_body_preferred' | 'mixed' | 'unknown';
}

export const fetchAlternateAirportsData = async (startTs: number, endTs: number): Promise<AlternateAirport[]> => {
    const response = await fetch(`${API_BASE}/trends/alternate-airports?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch alternate airports');
    return response.json();
};

// Runway Usage
export interface RunwayUsage {
    runway: string;
    airport: string;
    landings: number;
    takeoffs: number;
    total: number;
}

export const fetchRunwayUsage = async (airport: string, startTs: number, endTs: number): Promise<RunwayUsage[]> => {
    const response = await fetch(`${API_BASE}/stats/runway-usage?airport=${airport}&start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch runway usage');
    return response.json();
};

// ============================================================
// Seasonal Trends Types & Functions
// ============================================================

export interface YearComparison {
    year: number;
    total_flights: number;
    anomalies: number;
    safety_events: number;
    military_flights: number;
}

export interface MonthComparison {
    month: string;
    month_name: string;
    current_year: number;
    previous_year: number;
    change_percent: number;
}

export interface SeasonalYearComparison {
    years: YearComparison[];
    month_comparison: MonthComparison[];
    insights: string[];
    avg_daily_flights?: number;
    peak_day?: {
        date: string;
        flight_count: number;
    };
    lowest_day?: {
        date: string;
        flight_count: number;
    };
}

export interface HourlyCorrelation {
    hour: number;
    traffic_count: number;
    safety_count: number;
    safety_per_1000: number;
}

export interface TrafficSafetyCorrelation {
    hourly_correlation: HourlyCorrelation[];
    correlation_score: number;
    peak_risk_hours: number[];
    insights: string[];
}

export interface DetectedEvent {
    date: string;
    event_name: string;
    traffic_change_percent: number;
    flights: number;
    expected_flights: number;
}

export interface WeeklyPattern {
    day_of_week: number;
    day_name: string;
    avg_traffic: number;
    avg_anomalies: number;
}

export interface SpecialEvent {
    event_name: string;
    date: string;
    flight_count: number;
    change_percent: number;
}

export interface SpecialEventsImpact {
    detected_events: DetectedEvent[];
    weekly_pattern: WeeklyPattern[];
    insights: string[];
    events?: SpecialEvent[];
}

export const fetchSeasonalYearComparison = async (startTs: number, endTs: number): Promise<SeasonalYearComparison> => {
    const response = await fetch(`${API_BASE}/stats/seasonal/year-comparison?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch seasonal year comparison');
    return response.json();
};

export const fetchTrafficSafetyCorrelation = async (startTs: number, endTs: number): Promise<TrafficSafetyCorrelation> => {
    const response = await fetch(`${API_BASE}/stats/seasonal/traffic-safety-correlation?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch traffic-safety correlation');
    return response.json();
};

export const fetchSpecialEventsImpact = async (startTs: number, endTs: number): Promise<SpecialEventsImpact> => {
    const response = await fetch(`${API_BASE}/stats/seasonal/special-events?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch special events impact');
    return response.json();
};

// ============================================================
// Route Efficiency Types & Functions
// ============================================================

export interface AirlineEfficiencyData {
    airline: string;
    flights: number;
    avg_duration_min: number;
    avg_deviation_nm: number;
    anomaly_rate: number;
    efficiency_score: number;
}

export interface RouteEfficiencyComparison {
    route: string;
    airlines: AirlineEfficiencyData[];
    best_performer: string | null;
    worst_performer: string | null;
    time_difference_min: number;
    insights: string[];
}

export interface RoutesSummary {
    summary: string;
    routes: Array<{
        route: string;
        flight_count: number;
        avg_duration_min: number;
        anomaly_rate: number;
        airline_count: number;
    }>;
    note: string;
}

export const fetchRouteEfficiency = async (
    startTs: number, 
    endTs: number, 
    route?: string
): Promise<RouteEfficiencyComparison | RoutesSummary> => {
    let url = `${API_BASE}/stats/routes/efficiency?start_ts=${startTs}&end_ts=${endTs}`;
    if (route) {
        url += `&route=${encodeURIComponent(route)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch route efficiency');
    return response.json();
};

export const fetchAvailableRoutes = async (
    startTs: number, 
    endTs: number, 
    minFlights: number = 5
): Promise<string[]> => {
    const response = await fetch(`${API_BASE}/stats/routes/available?start_ts=${startTs}&end_ts=${endTs}&min_flights=${minFlights}`);
    if (!response.ok) throw new Error('Failed to fetch available routes');
    return response.json();
};

// ============================================================
// Weather Impact Types & Functions
// ============================================================

export interface WeatherDiversion {
    airport: string;
    count: number;
    dates: string[];
}

export interface WeatherGoAround {
    airport: string;
    count: number;
    peak_hour: number;
}

export interface MonthlyWeatherImpact {
    month: string;
    diversion_count: number;
    go_around_count: number;
    deviation_count: number;
}

export interface WeatherImpactAnalysis {
    weather_correlated_anomalies: number;
    diversions_likely_weather: WeatherDiversion[];
    go_arounds_weather_pattern: WeatherGoAround[];
    monthly_weather_impact: MonthlyWeatherImpact[];
    total_diversions: number;
    total_go_arounds: number;
    total_deviations: number;
    insights: string[];
}

export interface AirportWeatherData {
    airport: string;
    diversions_to: number;
    diversions_from: number;
    go_arounds: number;
    monthly_breakdown: Array<{ month: string; diversions: number; go_arounds: number }>;
    hourly_distribution: Array<{ hour: number; count: number }>;
}

export const fetchWeatherImpact = async (startTs: number, endTs: number): Promise<WeatherImpactAnalysis> => {
    const response = await fetch(`${API_BASE}/stats/weather/impact?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch weather impact analysis');
    return response.json();
};

export const fetchAirportWeather = async (airport: string, startTs: number, endTs: number): Promise<AirportWeatherData> => {
    const response = await fetch(`${API_BASE}/stats/weather/airport/${airport}?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch airport weather data');
    return response.json();
};

// ============================================================

// Trajectory Prediction with Restricted Zones
export interface TrajectoryPrediction {
    flight_id: string;
    predicted_path: { lat: number; lon: number; time_offset_s: number }[];
    breach_warning: boolean;
    breach_zone?: string;
    breach_severity?: string;
    closest_zone?: { name: string; distance_nm: number };
    prediction_confidence: number;
}

export const fetchTrajectoryPrediction = async (flightId: string): Promise<TrajectoryPrediction> => {
    const response = await fetch(`${API_BASE}/predict/trajectory/${flightId}`, {
        method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to fetch trajectory prediction');
    return response.json();
};

// Anomaly DNA (enhanced v2)
// Uses smart matching: time-of-day ±2hr buffer, rule-based or attribute-based matching
export const fetchAnomalyDNAEnhanced = async (flightId: string, lookbackDays = 30): Promise<AnomalyDNA> => {
    // Use the v2 endpoint with enhanced matching algorithm
    const response = await fetch(`${API_BASE}/intelligence/anomaly-dna-v2/${flightId}?lookback_days=${lookbackDays}`);
    if (!response.ok) throw new Error('Failed to fetch anomaly DNA');
    return response.json();
};

// Anomaly DNA (legacy v1) - for backwards compatibility
export const fetchAnomalyDNALegacy = async (flightId: string, lookbackDays = 30): Promise<AnomalyDNA> => {
    const response = await fetch(`${API_BASE}/intelligence/anomaly-dna/${flightId}?lookback_days=${lookbackDays}`);
    if (!response.ok) throw new Error('Failed to fetch anomaly DNA');
    return response.json();
};

// Monthly Diversions
export interface DiversionMonthly {
    month: string;
    diversions: number;
    holding_patterns: number;
    off_course: number;
    total_events: number;
    affected_flights: number;
}

export const fetchDiversionsMonthly = async (startTs: number, endTs: number): Promise<DiversionMonthly[]> => {
    const response = await fetch(`${API_BASE}/stats/diversions/monthly?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch monthly diversions');
    return response.json();
};

// RTB Events (Return-To-Base)
export interface RTBEvent {
    flight_id: string;
    callsign: string;
    departure_time: number;
    landing_time: number;
    duration_min: number;
    airport: string;
    max_outbound_nm?: number;  // How far the aircraft traveled before returning
}

export const fetchRTBEvents = async (startTs: number, endTs: number, maxDurationMin = 30): Promise<RTBEvent[]> => {
    const response = await fetch(`${API_BASE}/stats/rtb-events?start_ts=${startTs}&end_ts=${endTs}&max_duration_min=${maxDurationMin}`);
    if (!response.ok) throw new Error('Failed to fetch RTB events');
    return response.json();
};

// Airline Activity Trends
export interface AirlineActivityTrends {
    stopped_flying: {
        airline: string;
        last_seen: number;
        last_seen_date: string;
        flight_count_before: number;
    }[];
    started_flying: {
        airline: string;
        first_seen: number;
        first_seen_date: string;
        flight_count: number;
    }[];
    activity_changes: {
        airline: string;
        change_percent: number;
        before_count: number;
        after_count: number;
        trend: 'increasing' | 'decreasing';
    }[];
    analysis_period: {
        current_start: number;
        current_end: number;
        lookback_start: number;
        lookback_end: number;
        lookback_days: number;
    };
}

export const fetchAirlineActivityTrends = async (startTs: number, endTs: number, lookbackDays = 30): Promise<AirlineActivityTrends> => {
    const response = await fetch(`${API_BASE}/trends/airline-activity?start_ts=${startTs}&end_ts=${endTs}&lookback_days=${lookbackDays}`);
    if (!response.ok) throw new Error('Failed to fetch airline activity trends');
    return response.json();
};

export interface IntelligenceDashboardHelpPayload {
    version: number;
    generated_at_utc: string;
    default_language: 'en';
    languages: Array<'en' | 'he'>;
    hebrew_help_rtl: boolean;
    panels: Array<{
        panel_id: string;
        tab: 'overview' | 'safety' | 'traffic' | 'intelligence' | 'predict';
        title: Record<'en' | 'he', string>;
        endpoints: Array<{ method: string; path: string; params: string[] }>;
        calculation: Record<'en' | 'he', string[]>;
        meaning: Record<'en' | 'he', string>;
        hard_coded_values: Record<'en' | 'he', Array<{ name: string; value: any }>>;
    }>;
    demands_coverage: Array<{
        id: string;
        status: 'implemented' | 'not_implemented_yet';
        question_en: string;
        question_he: string;
        panels: string[];
        notes_en?: string;
        notes_he?: string;
    }>;
}

export const fetchIntelligenceDashboardHelp = async (): Promise<IntelligenceDashboardHelpPayload> => {
    const response = await fetch(`${API_BASE}/intelligence/help`);
    if (!response.ok) throw new Error('Failed to fetch dashboard help');
    return response.json();
};

// ============================================================
// New Dashboard Endpoints
// ============================================================

// Top Airline Emergencies
export interface TopAirlineEmergency {
    airline: string;
    emergency_count: number;
    total_flights: number;
    emergency_rate: number;
}

export const fetchTopAirlineEmergencies = async (startTs: number, endTs: number, limit = 10): Promise<TopAirlineEmergency[]> => {
    const response = await fetch(`${API_BASE}/stats/safety/top-airline-emergencies?start_ts=${startTs}&end_ts=${endTs}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch top airline emergencies');
    return response.json();
};

// Airport Hourly Traffic
export interface AirportHourlyTraffic {
    hour: number;
    departures: number;
    arrivals: number;
    total: number;
}

export const fetchAirportHourlyTraffic = async (airport: string, startTs: number, endTs: number): Promise<AirportHourlyTraffic[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/airport-hourly/${airport}?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch airport hourly traffic');
    return response.json();
};

// Monthly Flight Aggregation
export interface MonthlyFlightStats {
    month: string;
    total_flights: number;
    military_count: number;
    anomaly_count: number;
    avg_duration_hours: number;
}

export const fetchFlightsPerMonth = async (startTs: number, endTs: number): Promise<MonthlyFlightStats[]> => {
    const response = await fetch(`${API_BASE}/stats/traffic/flights-per-month?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch flights per month');
    return response.json();
};

// Near-Miss by Country
export interface NearMissByCountry {
    total_near_miss: number;
    by_country: Record<string, number>;
    events: Array<{
        flight_id: string;
        callsign: string;
        countries: string[];
        severity: number;
        timestamp: number;
    }>;
}

export const fetchNearMissByCountry = async (startTs: number, endTs: number, country?: string): Promise<NearMissByCountry> => {
    const url = country 
        ? `${API_BASE}/stats/safety/near-miss/by-country?start_ts=${startTs}&end_ts=${endTs}&country=${country}`
        : `${API_BASE}/stats/safety/near-miss/by-country?start_ts=${startTs}&end_ts=${endTs}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch near-miss by country');
    return response.json();
};

// ============================================================
// Route Planning API
// ============================================================

export interface RouteAirport {
    code: string;
    name: string;
    lat: number;
    lon: number;
    elevation_ft?: number;
    has_origin_paths?: boolean;
    has_destination_paths?: boolean;
}

export interface RouteAirportsResponse {
    airports: RouteAirport[];
    total: number;
    origins_with_paths: string[];
    destinations_with_paths: string[];
}

export interface RouteCenterlinePoint {
    lat: number;
    lon: number;
    alt?: number;
}

export interface PlannedRoute {
    path_id: string;
    origin: string | null;
    destination: string | null;
    centerline: RouteCenterlinePoint[];
    width_nm: number;
    distance_nm: number;
    score: number;
    distance_score: number;
    safety_score: number;
    coverage_score: number;
    recommendation: 'best' | 'excellent' | 'good' | 'alternative' | '';
    waypoint_count: number;
}

export interface RoutePlanResponse {
    routes: PlannedRoute[];
    best_route: PlannedRoute | null;
    total_routes: number;
    origins: string[];
    destination: string;
    error?: string;
}

export interface RoutePathResponse {
    path_id: string;
    origin: string | null;
    destination: string | null;
    centerline: RouteCenterlinePoint[];
    width_nm: number;
    distance_nm: number;
    waypoint_count: number;
}

/**
 * Get list of available airports for route planning.
 */
export const fetchRouteAirports = async (): Promise<RouteAirportsResponse> => {
    const response = await fetch(`${API_BASE}/route/airports`);
    if (!response.ok) throw new Error('Failed to fetch airports');
    return response.json();
};

/**
 * Plan routes from multiple origins to a destination.
 * Uses learned path library to find and score routes.
 */
export const planRoute = async (origins: string[], destination: string): Promise<RoutePlanResponse> => {
    const response = await fetch(`${API_BASE}/route/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origins, destination })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to plan route');
    }
    
    return response.json();
};

/**
 * Get detailed path geometry for a specific path ID.
 */
export const fetchRoutePath = async (pathId: string): Promise<RoutePathResponse> => {
    const response = await fetch(`${API_BASE}/route/path/${encodeURIComponent(pathId)}`);
    if (!response.ok) throw new Error('Failed to fetch path details');
    return response.json();
};

// ============================================================
// Advanced Route Planning API
// ============================================================

export interface AircraftProfile {
    name: string;
    type: 'fighter' | 'civil';
    min_speed_kts: number;
    max_speed_kts: number;
    cruise_speed_kts: number;
    min_altitude_ft: number;
    max_altitude_ft: number;
    cruise_altitude_ft: number;
    climb_rate_ft_min: number;
    descent_rate_ft_min: number;
    turn_rate_deg_sec: number;
}

export interface RouteWaypoint {
    lat: number;
    lon: number;
    alt_ft?: number;
    name?: string;
    airport_code?: string;
    is_airport?: boolean;
}

export interface TrafficAircraft {
    flight_id: string;
    callsign: string | null;
    lat: number;
    lon: number;
    alt_ft: number;
    heading_deg: number;
    speed_kts: number;
    vspeed_fpm: number;
    timestamp: number;
    is_simulated: boolean;
    track_points: Array<{ lat: number; lon: number; alt?: number; timestamp?: number }>;
}

export interface TrafficCacheInfo {
    real_aircraft_count: number;
    simulated_aircraft_count: number;
    total_count: number;
    cache_timestamp: number;
    cache_age_seconds: number | null;
}

export interface Conflict {
    severity: 'none' | 'warning' | 'conflict' | 'critical';
    planned_lat: number;
    planned_lon: number;
    planned_alt_ft: number;
    planned_time_offset_min: number;
    traffic_flight_id: string;
    traffic_callsign: string | null;
    traffic_lat: number;
    traffic_lon: number;
    traffic_alt_ft: number;
    horizontal_distance_nm: number;
    vertical_distance_ft: number;
}

export interface PlannedPathPoint {
    lat: number;
    lon: number;
    alt_ft: number;
    time_offset_min: number;
    cumulative_distance_nm: number;
}

export interface AdvancedPlannedRoute {
    path_id: string;
    origin: string | null;
    destination: string | null;
    centerline: RouteCenterlinePoint[];
    width_nm: number;
    distance_nm: number;
    score: number;
    distance_score: number;
    safety_score: number;
    coverage_score: number;
    conflict_score: number;
    recommendation: string;
    waypoint_count: number;
    conflicts: Conflict[];
    conflict_count: number;
    warning_count: number;
    planned_path: PlannedPathPoint[];
    eta_minutes: number;
    corridor_ids: string[];  // IDs of learned corridors used to build this route
}

export interface AdvancedRoutePlanResponse {
    routes: AdvancedPlannedRoute[];
    best_route: AdvancedPlannedRoute | null;
    total_routes: number;
    origin: RouteWaypoint;
    destination: RouteWaypoint;
    waypoints: RouteWaypoint[];
    aircraft_profile: AircraftProfile;
    traffic_count: number;
}

export interface TrafficResponse {
    traffic: TrafficAircraft[];
    cache_info: TrafficCacheInfo;
    message?: string;
}

export interface ConflictCheckResponse {
    conflicts: Conflict[];
    summary: {
        total: number;
        critical: number;
        conflict: number;
        warning: number;
    };
    is_clear: boolean;
    traffic_count: number;
}

export interface PredictedPosition {
    flight_id: string;
    lat: number;
    lon: number;
    alt_ft: number;
    time_offset_min: number;
    timestamp: number;
}

export interface PredictionResponse {
    flight_id: string;
    callsign: string | null;
    current_position: {
        lat: number;
        lon: number;
        alt_ft: number;
        heading_deg: number;
        speed_kts: number;
    };
    predictions: PredictedPosition[];
}

// Tactical Zone for route planning
export interface TacticalZoneRequest {
    id: string;
    type: 'low-altitude' | 'high-altitude' | 'slow-speed' | 'high-speed' | 'no-fly';
    points: Array<{ lat: number; lon: number }>;
    altitude?: number;
    speed?: number;
}

// Attack Target for mission planning
export interface AttackTargetRequest {
    id: string;
    lat: number;
    lon: number;
    name: string;
    priority: 'high' | 'medium' | 'low';
    ammoRequired: number;
}

// Mission Aircraft for strike planning
export interface MissionAircraftRequest {
    id: string;
    callsign: string;
    ammoCapacity: number;
    color?: string;
    type?: 'F-16' | 'F-35';
}

// Strike waypoint in a planned route
export interface StrikeWaypoint {
    lat: number;
    lon: number;
    alt_ft: number;
    time_offset_min: number;
    waypoint_type: 'origin' | 'ingress' | 'target' | 'egress' | 'return';
    name?: string;
    risk_score: number;
}

// Strike phase (ingress, strike, egress)
export interface StrikePhase {
    name: string;
    waypoints: StrikeWaypoint[];
    distance_nm: number;
    duration_min: number;
    avg_risk: number;
}

// Strike route for an aircraft
export interface StrikeRoute {
    route_id: string;
    origin: { lat: number; lon: number; name?: string };
    targets: AttackTargetRequest[];
    phases: StrikePhase[];
    total_distance_nm: number;
    total_duration_min: number;
    total_risk_score: number;
    planned_path: Array<{
        lat: number;
        lon: number;
        alt_ft: number;
        time_offset_min: number;
    }>;
    centerline: Array<{
        lat: number;
        lon: number;
        alt_ft: number;
        time_offset_min?: number;
    }>;
    width_nm: number;
}

// Aircraft with assigned route
export interface StrikeAircraftResult {
    id: string;
    callsign: string;
    ammoCapacity: number;
    color: string;
    assignedTargets: string[];
    route: StrikeRoute | null;
}

// Strike plan response
export interface StrikePlanResponse {
    aircraft: StrikeAircraftResult[];
    summary: {
        total_aircraft: number;
        aircraft_with_routes: number;
        total_targets: number;
        targets_assigned: number;
        total_distance_nm: number;
        max_duration_min: number;
        avg_risk_score: number;
    };
    origin: { lat: number; lon: number; name?: string };
    targets: AttackTargetRequest[];
}

/**
 * Get available aircraft profiles (Fighter Jet vs Civil Aircraft).
 */
export const fetchAircraftProfiles = async (): Promise<{ profiles: Record<string, AircraftProfile> }> => {
    const response = await fetch(`${API_BASE}/route/profiles`);
    if (!response.ok) throw new Error('Failed to fetch aircraft profiles');
    return response.json();
};

/**
 * Advanced route planning with custom waypoints, zones, and conflict detection.
 */
export const planAdvancedRoute = async (
    origin: RouteWaypoint,
    destination: RouteWaypoint,
    options: {
        waypoints?: RouteWaypoint[];
        aircraft_type?: 'fighter' | 'civil';
        altitude_ft?: number;
        speed_kts?: number;
        check_conflicts?: boolean;
        tactical_zones?: TacticalZoneRequest[];
    } = {}
): Promise<AdvancedRoutePlanResponse> => {
    const response = await fetch(`${API_BASE}/route/plan-advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin,
            destination,
            waypoints: options.waypoints || [],
            aircraft_type: options.aircraft_type || 'civil',
            altitude_ft: options.altitude_ft,
            tactical_zones: options.tactical_zones || [],
            speed_kts: options.speed_kts,
            check_conflicts: options.check_conflicts ?? true,
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to plan advanced route');
    }
    
    return response.json();
};

/**
 * Plan strike routes for attack missions.
 * Creates direct tactical routes to targets with risk assessment.
 */
export const planStrikeRoute = async (
    origin: RouteWaypoint,
    targets: AttackTargetRequest[],
    aircraft: MissionAircraftRequest[],
    options: {
        aircraft_type?: 'fighter' | 'civil';
        tactical_zones?: TacticalZoneRequest[];
        return_to_base?: boolean;
    } = {}
): Promise<StrikePlanResponse> => {
    const response = await fetch(`${API_BASE}/route/plan-strike`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin,
            targets,
            aircraft,
            aircraft_type: options.aircraft_type || 'fighter',
            tactical_zones: options.tactical_zones || [],
            return_to_base: options.return_to_base ?? true,
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to plan strike route');
    }
    
    return response.json();
};

/**
 * Get current traffic in the airspace (cached data).
 */
export const fetchRouteTraffic = async (): Promise<TrafficResponse> => {
    const response = await fetch(`${API_BASE}/route/traffic`);
    if (!response.ok) throw new Error('Failed to fetch traffic');
    return response.json();
};

/**
 * Refresh traffic data from FR24 API.
 */
export const refreshRouteTraffic = async (): Promise<TrafficResponse> => {
    const response = await fetch(`${API_BASE}/route/traffic/refresh`, {
        method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to refresh traffic');
    return response.json();
};

/**
 * Add a simulated aircraft to the traffic.
 */
export const addSimulatedAircraft = async (
    flight_id: string,
    path: Array<{ lat: number; lon: number }>,
    speed_kts: number,
    altitude_ft: number,
    callsign?: string
): Promise<{ aircraft: TrafficAircraft; message: string }> => {
    const response = await fetch(`${API_BASE}/route/traffic/simulated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_id, path, speed_kts, altitude_ft, callsign })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to add simulated aircraft');
    }
    
    return response.json();
};

/**
 * Clear all simulated aircraft from the traffic.
 */
export const clearSimulatedAircraft = async (): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/route/traffic/simulated`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to clear simulated aircraft');
    return response.json();
};

/**
 * Check a planned path for conflicts with current traffic.
 */
export const checkRouteConflicts = async (
    path: Array<{ lat: number; lon: number; alt?: number; time_offset_min?: number }>,
    aircraft_type: 'fighter' | 'civil' = 'civil'
): Promise<ConflictCheckResponse> => {
    const response = await fetch(`${API_BASE}/route/conflicts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, aircraft_type })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to check conflicts');
    }
    
    return response.json();
};

/**
 * Predict future position of a specific aircraft.
 */
export const predictAircraftPosition = async (
    flight_id: string,
    minutes_ahead: number = 30
): Promise<PredictionResponse> => {
    const response = await fetch(`${API_BASE}/route/traffic/predict/${encodeURIComponent(flight_id)}?minutes_ahead=${minutes_ahead}`);
    if (!response.ok) throw new Error('Failed to predict aircraft position');
    return response.json();
};

// ============================================================
// Flight Import API - Search and import flights to feedback_tagged.db
// ============================================================

export interface FlightSearchResult {
    flight_id: string;
    callsign: string | null;
    flight_number: string | null;
    origin: string | null;
    origin_name: string | null;
    origin_lat: number | null;
    origin_lon: number | null;
    destination: string | null;
    destination_name: string | null;
    dest_lat: number | null;
    dest_lon: number | null;
    airline: string | null;
    airline_code: string | null;
    aircraft_type: string | null;
    aircraft_model: string | null;
    aircraft_registration: string | null;
    scheduled_departure: string | null;
    scheduled_arrival: string | null;
    actual_departure: string | null;
    actual_arrival: string | null;
    status: string | null;
    is_military: boolean;
}

export interface FlightSearchResponse {
    flights: FlightSearchResult[];
    message: string;
}

export interface FlightTracksResponse {
    flight_id: string;
    points: TrackPoint[];
}

export interface FlightImportResponse {
    status: string;
    flight_id: string;
    track_count: number;
    rule_ids: number[];
    rule_names: string[];
    is_anomaly: boolean;
    pipeline_ran: boolean;
    callsign: string | null;
    origin: string | null;
    destination: string | null;
}

/**
 * Search for flights by callsign within a time range.
 */
export const searchFlightsByCallsign = async (
    callsign: string,
    startTs: number,
    endTs: number
): Promise<FlightSearchResponse> => {
    const response = await fetch(`${API_BASE}/import/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callsign,
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs)
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to search flights');
    }
    
    return response.json();
};

/**
 * Fetch tracks for a flight from FR24 (for preview before import).
 */
export const fetchImportFlightTracks = async (flightId: string): Promise<FlightTracksResponse> => {
    const response = await fetch(`${API_BASE}/import/tracks/${encodeURIComponent(flightId)}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to fetch flight tracks');
    }
    return response.json();
};

/**
 * Import a flight to feedback_tagged.db with selected rules.
 */
export const importFlightToFeedback = async (
    flightId: string,
    ruleIds: number[],
    comments: string = '',
    isAnomaly: boolean = true,
    runPipeline: boolean = true
): Promise<FlightImportResponse> => {
    const response = await fetch(`${API_BASE}/import/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            flight_id: flightId,
            rule_ids: ruleIds,
            comments,
            is_anomaly: isAnomaly,
            run_pipeline: runPipeline
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to import flight');
    }
    
    return response.json();
};


// ============================================================================
// NEW DASHBOARD DEMANDS TYPES AND FUNCTIONS
// ============================================================================

// Signal Loss Anomaly Detection
export interface SignalLossAnomaly {
    lat: number;
    lon: number;
    current_losses: number;
    baseline_losses: number;
    affected_flights: number;
    anomaly_score: number;
}

export interface SignalLossAnomalyResponse {
    anomalous_zones: SignalLossAnomaly[];
    total_anomalies: number;
    insights: string[];
}

export const fetchSignalLossAnomalies = async (
    startTs: number, 
    endTs: number, 
    lookbackDays: number = 30
): Promise<SignalLossAnomalyResponse> => {
    const response = await fetch(
        `${API_BASE}/stats/signal-loss/anomalies?start_ts=${startTs}&end_ts=${endTs}&lookback_days=${lookbackDays}`
    );
    if (!response.ok) throw new Error('Failed to fetch signal loss anomalies');
    return response.json();
};

// GPS Jamming Temporal Analysis
export interface GPSJammingTemporal {
    by_hour: { hour: number; count: number }[];
    by_day_of_week: { day: number; day_name: string; count: number }[];
    peak_hours: number[];
    peak_days: string[];
    total_events: number;
}

export const fetchGPSJammingTemporal = async (startTs: number, endTs: number): Promise<GPSJammingTemporal> => {
    const response = await fetch(`${API_BASE}/stats/gps-jamming/temporal?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch GPS jamming temporal data');
    return response.json();
};


// GPS Jamming Clusters with Polygons
export interface GPSJammingCluster {
    id: number;
    polygon: [number, number][] | null;  // [lon, lat] coordinates in GeoJSON format
    centroid: [number, number];  // [lon, lat]
    point_count: number;
    total_events: number;
    affected_flights: number;
    avg_intensity: number;
    points: Array<{
        lat: number;
        lon: number;
        event_count: number;
        intensity: number;
    }>;
}

export interface GPSJammingClustersResponse {
    clusters: GPSJammingCluster[];
    singles: Array<{
        lat: number;
        lon: number;
        event_count: number;
        intensity: number;
        jamming_score?: number;
        jamming_indicators?: string[];
        affected_flights?: number;
    }>;
    total_points: number;
    total_clusters: number;
}

// ============================================================================
// COVERAGE GAP ZONES - Predictive areas where flights disappear
// ============================================================================

export interface CoverageGapZone {
    id: number;
    polygon: [number, number][];  // [lon, lat] GeoJSON format - the estimated coverage gap area
    centroid: [number, number];  // [lon, lat]
    area_sq_nm: number;  // Estimated area in square nautical miles
    event_count: number;  // Number of signal loss events in this zone
    affected_flights: number;  // Unique flights affected
    avg_gap_duration_sec: number;  // Average signal gap duration
    max_gap_duration_sec: number;  // Longest gap observed
    risk_score: number;  // 0-100, likelihood of losing signal in this zone
    gap_type: 'brief' | 'medium' | 'extended';
    first_seen: number | null;  // First event timestamp
    last_seen: number | null;  // Last event timestamp
    points: Array<{
        lat: number;
        lon: number;
        gap_duration: number;
        timestamp: number;
        flight_id: string;
    }>;
}

export interface CoverageGapZonesResponse {
    zones: CoverageGapZone[];
    total_events: number;
    total_zones: number;
    coverage_summary: {
        total_gap_area_sq_nm: number;
        avg_zone_risk: number;
        hotspot_regions: string[];
    };
}

// ============================================================================
// GPS JAMMING ZONES - Predictive areas with GPS interference
// ============================================================================

export interface GPSJammingZone {
    id: number;
    polygon: [number, number][];  // [lon, lat] GeoJSON format - estimated jamming area
    centroid: [number, number];  // [lon, lat]
    area_sq_nm: number;
    event_count: number;
    affected_flights: number;
    jamming_score: number;  // 0-100, intensity of jamming
    jamming_type: 'spoofing' | 'denial' | 'mixed';
    indicators: {
        altitude_spikes: number;
        position_teleports: number;
        heading_anomalies: number;
        mlat_only: number;
    };
    first_seen: number | null;
    last_seen: number | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    points: Array<{
        lat: number;
        lon: number;
        jamming_score: number;
        event_count: number;
    }>;
}

export interface GPSJammingZonesResponse {
    zones: GPSJammingZone[];
    total_events: number;
    total_zones: number;
    jamming_summary: {
        total_jamming_area_sq_nm: number;
        avg_jamming_score: number;
        primary_type: string;
        hotspot_regions: string[];
    };
}

// Signal Loss Clusters (similar to GPS Jamming Clusters for Traffic Tab)
export interface SignalLossCluster {
    id: number;
    polygon: [number, number][] | null;  // [lon, lat] coordinates in GeoJSON format
    centroid: [number, number];  // [lon, lat]
    point_count: number;
    total_events: number;
    affected_flights: number;
    avg_duration: number;
    points: Array<{
        lat: number;
        lon: number;
        count: number;
        avgDuration: number;
        event_count: number;  // Alias for consistency
    }>;
}

export interface SignalLossClustersResponse {
    clusters: SignalLossCluster[];
    singles: SignalLossLocation[];
    total_points: number;
    total_clusters: number;
}

// Near-Miss Clusters with polygon boundaries (convex hull)
export interface NearMissCluster {
    id: number;
    polygon: [number, number][] | null;  // [lon, lat] coordinates in GeoJSON format
    centroid: [number, number];  // [lon, lat]
    point_count: number;
    total_events: number;
    severity_high: number;
    severity_medium: number;
    sample_flight_ids?: string[];  // Up to 5 sample flight IDs from this cluster
    points: Array<{
        lat: number;
        lon: number;
        count: number;
        severity_high: number;
        severity_medium: number;
        event_count: number;  // Alias for consistency
    }>;
}

export interface NearMissClustersResponse {
    clusters: NearMissCluster[];
    singles: NearMissLocation[];
    total_points: number;
    total_clusters: number;
}

export const fetchGPSJammingClusters = async (
    startTs: number, 
    endTs: number,
    clusterThresholdNm: number = 50,
    minPoints: number = 3
): Promise<GPSJammingClustersResponse> => {
    const params = new URLSearchParams({
        start_ts: startTs.toString(),
        end_ts: endTs.toString(),
        cluster_threshold_nm: clusterThresholdNm.toString(),
        min_points: minPoints.toString()
    });
    const response = await fetch(`${API_BASE}/stats/gps-jamming/clusters?${params}`);
    if (!response.ok) throw new Error('Failed to fetch GPS jamming clusters');
    return response.json();
};


// ============================================================================
// COMBINED SIGNAL MAP - GPS Jamming + Signal Loss unified visualization
// ============================================================================

export interface CombinedSignalPoint {
    type: 'jamming' | 'signal_loss';
    lat: number;
    lon: number;
    intensity: number;
    event_count: number;
    affected_flights: number;
    color: string;
    first_seen?: number;
    last_seen?: number;
    // Jamming-specific fields
    indicators?: string[];
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    // Signal loss-specific fields
    avg_gap_duration_sec?: number;
}

export interface CombinedSignalMapResponse {
    points: CombinedSignalPoint[];
    summary: {
        total_jamming_events: number;
        total_signal_loss_events: number;
        jamming_zones: number;
        signal_loss_zones: number;
        total_zones: number;
    };
    legend: {
        jamming: {
            color: string;
            label: string;
            description: string;
            icon: string;
        };
        signal_loss: {
            color: string;
            label: string;
            description: string;
            icon: string;
        };
    };
}

export const fetchCombinedSignalMap = async (
    startTs: number,
    endTs: number,
    limit: number = 50
): Promise<CombinedSignalMapResponse> => {
    const params = new URLSearchParams({
        start_ts: startTs.toString(),
        end_ts: endTs.toString(),
        limit: limit.toString()
    });
    const response = await fetch(`${API_BASE}/intel/combined-signal-map?${params}`);
    if (!response.ok) throw new Error('Failed to fetch combined signal map');
    return response.json();
};


// Diversions Seasonal Analysis
export interface DiversionsSeasonal {
    by_season: { season: string; count: number }[];
    by_quarter: { quarter: string; count: number }[];
    by_month: { month: number; month_name: string; count: number }[];
    peak_season: string;
    total_diversions: number;
    insights: string[];
}

export const fetchDiversionsSeasonal = async (startTs: number, endTs: number): Promise<DiversionsSeasonal> => {
    const response = await fetch(`${API_BASE}/stats/diversions/seasonal?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch diversions seasonal data');
    return response.json();
};

// Daily Incident Clusters
export interface HighIncidentDay {
    date: string;
    total_incidents: number;
    emergency_count: number;
    near_miss_count: number;
    go_around_count: number;
    diversion_count: number;
    geographic_spread_deg: number;
    geographically_clustered: boolean;
}

export interface DailyIncidentClusters {
    high_incident_days: HighIncidentDay[];
    average_daily_incidents: number;
    max_incidents_day: { date: string; count: number };
    total_days_analyzed: number;
    insights: string[];
}

export const fetchDailyIncidentClusters = async (startTs: number, endTs: number): Promise<DailyIncidentClusters> => {
    const response = await fetch(`${API_BASE}/stats/incidents/daily-clusters?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch daily incident clusters');
    return response.json();
};


// ============================================================================
// MILITARY INTELLIGENCE PANEL TYPES AND FUNCTIONS
// ============================================================================

// Operational Tempo Timeline
export interface OperationalTempoHourly {
    timestamp: number;
    hour: string;
    US: number;
    RU: number;
    GB: number;
    IL: number;
    NATO: number;
    other: number;
    total: number;
}

export interface OperationalTempoDaily {
    date: string;
    US: number;
    RU: number;
    GB: number;
    IL: number;
    NATO: number;
    other: number;
    total: number;
}

export interface ActivitySpike {
    timestamp: number;
    hour: string;
    country: string;
    count: number;
    average: number;
    increase_pct: number;
    description: string;
}

export interface OperationalTempoResponse {
    hourly_data: OperationalTempoHourly[];
    daily_data: OperationalTempoDaily[];
    by_country_total: Record<string, number>;
    peak_activity: {
        timestamp: number;
        hour: string;
        country: string;
        count: number;
        description: string;
    } | null;
    activity_spikes: ActivitySpike[];
    trend_analysis: Record<string, 'increasing' | 'stable' | 'decreasing'>;
    alerts: Array<{ type: string; severity: string; message: string; timestamp?: number }>;
    total_flights: number;
}

export const fetchOperationalTempo = async (startTs: number, endTs: number): Promise<OperationalTempoResponse> => {
    const response = await fetch(`${API_BASE}/intel/operational-tempo?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch operational tempo');
    return response.json();
};

// Tanker Activity
export interface TankerFlight {
    flight_id: string;
    callsign: string;
    country: string;
    holding_area: string;
    duration_min: number;
    orbit_count: number;
    point_count: number;
    start_time: number;
    end_time: number;
    last_position: { lat: number; lon: number; alt: number; timestamp: number } | null;
}

export interface TankerActivityResponse {
    active_tankers: TankerFlight[];
    by_holding_area: Record<string, number>;
    total_tanker_hours: number;
    tanker_count: number;
    alerts: Array<{ type: string; severity: string; message: string; area?: string }>;
}

export const fetchTankerActivity = async (startTs: number, endTs: number): Promise<TankerActivityResponse> => {
    const response = await fetch(`${API_BASE}/intel/tanker-activity?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch tanker activity');
    return response.json();
};

// Night Operations
export interface NightFlight {
    callsign: string;
    country: string;
    type: string;
    timestamp: number;
    hour: number;
    duration_min: number;
}

export interface NightOperationsResponse {
    day_vs_night: {
        day: number;
        night: number;
        total: number;
        night_pct: number;
    };
    night_flights: NightFlight[];
    by_country_night: Record<string, number>;
    unusual_night_activity: boolean;
    alerts: Array<{ type: string; severity: string; message: string }>;
}

export const fetchNightOperations = async (startTs: number, endTs: number): Promise<NightOperationsResponse> => {
    const response = await fetch(`${API_BASE}/intel/night-operations?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch night operations');
    return response.json();
};

// ISR Patterns
export interface ISRPattern {
    flight_id: string;
    callsign: string;
    country: string;
    pattern_type: string;
    orbit_center: { lat: number; lon: number };
    orbit_radius_nm: number;
    duration_min: number;
    likely_target: string;
    track_points_count: number;
    track_points: Array<{ lat: number; lon: number; timestamp: number }>;
}

export interface CollectionArea {
    lat: number;
    lon: number;
    flights_overhead: number;
    callsigns: string[];
    description: string;
}

export interface ISRPatternsResponse {
    patterns: ISRPattern[];
    by_pattern_type: Record<string, number>;
    by_country: Record<string, number>;
    likely_collection_areas: CollectionArea[];
    total_isr_flights: number;
    alerts: Array<{ type: string; severity: string; message: string }>;
}

export const fetchISRPatterns = async (startTs: number, endTs: number): Promise<ISRPatternsResponse> => {
    const response = await fetch(`${API_BASE}/intel/isr-patterns?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch ISR patterns');
    return response.json();
};

// Airspace Denial Zones
export interface DenialZone {
    lat: number;
    lon: number;
    area_name: string;
    radius_nm: number;
    normal_traffic: number;
    current_traffic: number;
    reduction_pct: number;
    likely_cause: string;
    military_flights_nearby: number;
}

export interface AirspaceDenialResponse {
    denial_zones: DenialZone[];
    total_zones: number;
    most_avoided_areas: Array<{ area_name: string; reduction_pct: number }>;
    alerts: Array<{ type: string; severity: string; message: string }>;
}

export const fetchAirspaceDenialZones = async (startTs: number, endTs: number): Promise<AirspaceDenialResponse> => {
    const response = await fetch(`${API_BASE}/intel/airspace-denial?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch airspace denial zones');
    return response.json();
};

// Border Crossings
export interface BorderCrossing {
    timestamp: number;
    hour: string;
    callsign: string;
    country: string;
    aircraft_type: string;
    from_region: string;
    to_region: string;
    lat: number;
    lon: number;
}

export interface BorderCrossingsResponse {
    crossings: BorderCrossing[];
    by_country_pair: Record<string, number>;
    timeline: Array<{ hour: string; crossings: BorderCrossing[]; count: number }>;
    high_interest_crossings: BorderCrossing[];
    total_crossings: number;
    alerts: Array<{ type: string; severity: string; message: string }>;
}

export const fetchBorderCrossings = async (startTs: number, endTs: number): Promise<BorderCrossingsResponse> => {
    const response = await fetch(`${API_BASE}/intel/border-crossings?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch border crossings');
    return response.json();
};

// EW Correlation
export interface EWJammingZone {
    lat: number;
    lon: number;
    radius_nm: number;
    severity: number;
    affected_flights: number;
    indicators: string[];
}

export interface EWMilitaryPath {
    callsign: string;
    country: string;
    type: string;
    distance_to_zone_nm: number;
}

export interface EWEstimatedSource {
    lat: number;
    lon: number;
    confidence: string;
    likely_operator: string;
    severity: number;
    military_correlation: number;
}

export interface EWCorrelationResponse {
    jamming_zones: EWJammingZone[];
    military_paths_in_zones: Array<{ zone: EWJammingZone; military_paths: EWMilitaryPath[] }>;
    correlation_score: number;
    estimated_ew_sources: EWEstimatedSource[];
    total_jamming_zones: number;
    zones_with_military: number;
    alerts: Array<{ type: string; severity: string; message: string }>;
}

export const fetchEWCorrelation = async (startTs: number, endTs: number): Promise<EWCorrelationResponse> => {
    const response = await fetch(`${API_BASE}/intel/ew-correlation?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch EW correlation');
    return response.json();
};

// Mission Readiness Indicators
export interface MissionIndicator {
    score: number;
    weight: number;
    description: string;
    status?: string;
    flights?: number;
    zones?: number;
    trend?: string;
    error?: string;
}

export interface MissionReadinessResponse {
    overall_readiness_score: number;
    readiness_level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'IMMINENT';
    indicators: {
        tanker_activity: MissionIndicator;
        isr_density: MissionIndicator;
        gps_jamming: MissionIndicator;
        military_buildup: MissionIndicator;
        syria_logistics: MissionIndicator;
    };
    prediction: string;
    confidence: 'low' | 'medium' | 'high';
    alerts: Array<{ type: string; severity: string; message: string }>;
    analysis_period: {
        start_ts: number;
        end_ts: number;
        duration_hours: number;
    };
}

export const fetchMissionReadiness = async (startTs: number, endTs: number): Promise<MissionReadinessResponse> => {
    const response = await fetch(`${API_BASE}/intel/mission-readiness?start_ts=${startTs}&end_ts=${endTs}`);
    if (!response.ok) throw new Error('Failed to fetch mission readiness');
    return response.json();
};

// ============================================================================
// MILITARY WOW PANELS BATCH ENDPOINT - Single call for all 8 panels
// ============================================================================

export interface MilitaryBatchResponse {
    operational_tempo?: OperationalTempoResponse;
    tanker_activity?: TankerActivityResponse;
    night_operations?: NightOperationsResponse;
    isr_patterns?: ISRPatternsResponse;
    airspace_denial?: AirspaceDenialResponse;
    border_crossings?: BorderCrossingsResponse;
    ew_correlation?: EWCorrelationResponse;
    mission_readiness?: MissionReadinessResponse;
}

/**
 * Fetch all military WOW panels in a single request.
 * Replaces 8 parallel API calls with 1 cached batch call.
 */
export const fetchMilitaryBatch = async (
    startTs: number,
    endTs: number,
    include?: string[]
): Promise<MilitaryBatchResponse> => {
    const response = await fetch(`${API_BASE}/intel/military/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start_ts: Math.floor(startTs),
            end_ts: Math.floor(endTs),
            include: include || [
                'operational_tempo', 'tanker_activity', 'night_operations', 'isr_patterns',
                'airspace_denial', 'border_crossings', 'ew_correlation', 'mission_readiness'
            ]
        })
    });
    if (!response.ok) {
        throw new Error('Failed to fetch military batch');
    }
    return response.json();
};

// ============================================================
// POLYGON SEARCH
// ============================================================

export interface PolygonSearchResult {
    flight_id: string;
    callsign: string;
    points_in_polygon: number;
    first_timestamp: number;
    last_timestamp: number;
}

export interface PolygonSearchResponse {
    count: number;
    flights: PolygonSearchResult[];
}

/**
 * Search for flights that pass through a polygon area.
 * @param polygon Array of [lon, lat] coordinates defining the polygon
 * @param startTs Optional start timestamp filter
 * @param endTs Optional end timestamp filter
 */
export const searchFlightsByPolygon = async (
    polygon: number[][],
    startTs?: number,
    endTs?: number
): Promise<PolygonSearchResponse> => {
    const response = await fetch(`${API_BASE}/research/polygon-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            polygon,
            start_ts: startTs,
            end_ts: endTs
        })
    });
    if (!response.ok) {
        throw new Error('Failed to search flights by polygon');
    }
    return response.json();
};

/**
 * Search for flights using a WKT polygon string.
 * @param wkt WKT polygon string (e.g., "POLYGON ((lon1 lat1, lon2 lat2, ...))")
 * @param startTs Optional start timestamp filter
 * @param endTs Optional end timestamp filter
 */
export const searchFlightsByWKT = async (
    wkt: string,
    startTs?: number,
    endTs?: number
): Promise<PolygonSearchResponse> => {
    const response = await fetch(`${API_BASE}/research/wkt-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wkt,
            start_ts: startTs,
            end_ts: endTs
        })
    });
    if (!response.ok) {
        throw new Error('Failed to search flights by WKT');
    }
    return response.json();
};
