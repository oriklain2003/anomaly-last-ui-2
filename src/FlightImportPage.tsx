import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    Search, Plane, ArrowLeft, Calendar, Clock, MapPin, 
    CheckCircle, X, AlertTriangle, Loader2, Navigation,
    Radio, RotateCcw, Compass, ShieldAlert, Wifi, Shield,
    Target, GraduationCap, Satellite
} from 'lucide-react';
import { MapComponent, type MapComponentHandle } from './components/MapComponent';
import { 
    searchFlightsByCallsign, 
    fetchImportFlightTracks, 
    importFlightToFeedback,
    type FlightSearchResult,
    type TrackPoint 
} from './api';
import clsx from 'clsx';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// Rule definition type
interface Rule {
    id: number;
    name: string;
    nameHe: string;
    description: string;
    category: 'emergency' | 'flight_ops' | 'technical' | 'military' | 'other';
    color: string;
}

// Hardcoded tagging rules list (same as ReportPanel)
const TAGGING_RULES: Rule[] = [
    // Emergency & Safety (Red)
    { id: 1, name: "Emergency Squawk", nameHe: "קוד חירום", description: "7500/7600/7700", category: "emergency", color: "#ef4444" },
    { id: 2, name: "Altitude Change", nameHe: "שינוי גובה חריג", description: "Extreme altitude change", category: "emergency", color: "#ef4444" },
    { id: 4, name: "Proximity Alert", nameHe: "התקרבות מסוכנת", description: "Near collision", category: "emergency", color: "#ef4444" },
    // Flight Operations (Blue)
    { id: 3, name: "Abrupt Turn", nameHe: "פנייה חדה", description: "180°/360° turn", category: "flight_ops", color: "#3b82f6" },
    { id: 6, name: "Go-Around", nameHe: "הליכה סביב", description: "Aborted landing", category: "flight_ops", color: "#3b82f6" },
    { id: 7, name: "Return to Field", nameHe: "חזרה לשדה", description: "Quick return", category: "flight_ops", color: "#3b82f6" },
    { id: 8, name: "Diversion", nameHe: "הסטה", description: "Alternate landing", category: "flight_ops", color: "#3b82f6" },
    // Technical (Purple)
    { id: 9, name: "Low Altitude", nameHe: "גובה נמוך", description: "Below minimum", category: "technical", color: "#a855f7" },
    { id: 10, name: "Signal Loss", nameHe: "אובדן אות", description: "ADS-B gaps", category: "technical", color: "#a855f7" },
    { id: 11, name: "Off Course", nameHe: "חריגה מנתיב", description: "Route deviation", category: "technical", color: "#a855f7" },
    // Military & Security (Green)
    { id: 12, name: "Unplanned Landing", nameHe: "נחיתה לא מתוכננת", description: "Israel specific", category: "military", color: "#22c55e" },
];

// Get icon for rule
const getRuleIcon = (ruleId: number) => {
    switch (ruleId) {
        case 1: return Radio;        // Emergency Squawk
        case 2: return Navigation;   // Altitude Change
        case 3: return RotateCcw;    // Abrupt Turn
        case 4: return Target;       // Proximity
        case 6: return Compass;      // Go-Around
        case 7: return ShieldAlert;  // Return to Field
        case 8: return MapPin;       // Diversion
        case 9: return Navigation;   // Low Altitude
        case 10: return Wifi;        // Signal Loss
        case 11: return GraduationCap; // Off Course
        case 12: return Shield;      // Unplanned Landing
        default: return AlertTriangle;
    }
};

function FlightImportContent() {
    const { isHebrew } = useLanguage();
    const mapRef = useRef<MapComponentHandle>(null);
    
    // Search state
    const [callsign, setCallsign] = useState('');
    const [searchDate, setSearchDate] = useState(() => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    });
    const [searchTime, setSearchTime] = useState('12:00');
    const [searchRange, setSearchRange] = useState(12); // Hours
    
    // Results state
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<FlightSearchResult[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    
    // Selected flight state
    const [selectedFlight, setSelectedFlight] = useState<FlightSearchResult | null>(null);
    const [flightTracks, setFlightTracks] = useState<TrackPoint[]>([]);
    const [loadingTracks, setLoadingTracks] = useState(false);
    
    // Rule selection state
    const [showRuleSelector, setShowRuleSelector] = useState(false);
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<number>>(new Set());
    const [isOtherSelected, setIsOtherSelected] = useState(false);
    const [otherDetails, setOtherDetails] = useState('');
    const [comments, setComments] = useState('');
    
    // Import state
    const [importing, setImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    // Handle search
    const handleSearch = async () => {
        if (!callsign.trim()) return;
        
        setSearching(true);
        setSearchError(null);
        setSearchResults([]);
        setSelectedFlight(null);
        setFlightTracks([]);
        
        try {
            // Calculate time range
            const [hours, minutes] = searchTime.split(':').map(Number);
            const baseDate = new Date(searchDate);
            baseDate.setHours(hours, minutes, 0, 0);
            
            const startTs = Math.floor(baseDate.getTime() / 1000) - (searchRange * 3600);
            const endTs = Math.floor(baseDate.getTime() / 1000) + (searchRange * 3600);
            
            const result = await searchFlightsByCallsign(callsign.trim().toUpperCase(), startTs, endTs);
            setSearchResults(result.flights);
            
            if (result.flights.length === 0) {
                setSearchError(isHebrew ? 'לא נמצאו טיסות' : 'No flights found');
            }
        } catch (err: any) {
            setSearchError(err.message || 'Search failed');
        } finally {
            setSearching(false);
        }
    };

    // Handle flight selection
    const handleSelectFlight = async (flight: FlightSearchResult) => {
        setSelectedFlight(flight);
        setLoadingTracks(true);
        setImportSuccess(false);
        setImportError(null);
        
        try {
            const result = await fetchImportFlightTracks(flight.flight_id);
            setFlightTracks(result.points);
        } catch (err: any) {
            setSearchError(err.message || 'Failed to load tracks');
            setFlightTracks([]);
        } finally {
            setLoadingTracks(false);
        }
    };

    // Toggle rule selection
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
    };

    // Handle import
    const handleImport = async () => {
        if (!selectedFlight) return;
        if (selectedRuleIds.size === 0 && !isOtherSelected) {
            setShowRuleSelector(true);
            return;
        }
        
        setImporting(true);
        setImportError(null);
        
        try {
            const allComments = isOtherSelected && otherDetails 
                ? `${comments}\n[Other]: ${otherDetails}`.trim()
                : comments;
            
            await importFlightToFeedback(
                selectedFlight.flight_id,
                Array.from(selectedRuleIds),
                allComments,
                true, // isAnomaly
                true  // runPipeline
            );
            
            setImportSuccess(true);
            setSelectedRuleIds(new Set());
            setIsOtherSelected(false);
            setOtherDetails('');
            setComments('');
        } catch (err: any) {
            setImportError(err.message || 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark text-white">
            {/* Header */}
            <header className="h-16 bg-surface border-b border-white/10 flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <Link 
                        to="/" 
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className={`size-5 ${isHebrew ? 'rotate-180' : ''}`} />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20">
                            <Plane className="size-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold">
                                {isHebrew ? 'יבוא טיסה' : 'Flight Import'}
                            </h1>
                            <p className="text-xs text-white/60">
                                {isHebrew ? 'חפש וייבא טיסות למסד הנתונים' : 'Search and import flights to database'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex h-[calc(100vh-4rem)]">
                {/* Left Panel - Search & Results */}
                <div className="w-96 bg-surface border-r border-white/10 flex flex-col">
                    {/* Search Form */}
                    <div className="p-4 border-b border-white/10 space-y-4">
                        <div>
                            <label className="text-xs text-white/60 font-medium mb-1 block">
                                {isHebrew ? 'קוד קריאה (Callsign)' : 'Callsign'}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={callsign}
                                    onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                                    placeholder="e.g. LY001"
                                    className="flex-1 px-3 py-2 rounded-lg bg-background-dark border border-white/10 
                                               text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button
                                    onClick={handleSearch}
                                    disabled={searching || !callsign.trim()}
                                    className="px-4 py-2 rounded-lg bg-primary text-white font-medium 
                                               hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed
                                               flex items-center gap-2"
                                >
                                    {searching ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Search className="size-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-white/60 font-medium mb-1 flex items-center gap-1">
                                    <Calendar className="size-3" />
                                    {isHebrew ? 'תאריך' : 'Date'}
                                </label>
                                <input
                                    type="date"
                                    value={searchDate}
                                    onChange={(e) => setSearchDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-background-dark border border-white/10 
                                               text-white focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/60 font-medium mb-1 flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {isHebrew ? 'שעה' : 'Time'}
                                </label>
                                <input
                                    type="time"
                                    value={searchTime}
                                    onChange={(e) => setSearchTime(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-background-dark border border-white/10 
                                               text-white focus:outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-white/60 font-medium mb-1 block">
                                {isHebrew ? `טווח חיפוש: ±${searchRange} שעות` : `Search range: ±${searchRange} hours`}
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="48"
                                value={searchRange}
                                onChange={(e) => setSearchRange(Number(e.target.value))}
                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </div>

                    {/* Search Results */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {searchError && (
                            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm mb-4">
                                {searchError}
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-white/60 mb-2">
                                    {isHebrew ? `נמצאו ${searchResults.length} טיסות` : `Found ${searchResults.length} flight(s)`}
                                </p>
                                {searchResults.map((flight) => (
                                    <div
                                        key={flight.flight_id}
                                        onClick={() => handleSelectFlight(flight)}
                                        className={clsx(
                                            "p-3 rounded-lg cursor-pointer transition-all border",
                                            selectedFlight?.flight_id === flight.flight_id
                                                ? "bg-primary/20 border-primary"
                                                : "bg-background-dark border-white/10 hover:border-white/30"
                                        )}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-bold text-sm">{flight.callsign || flight.flight_id}</p>
                                                <p className="text-xs text-white/50">ID: {flight.flight_id}</p>
                                            </div>
                                            {flight.status && (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10">
                                                    {flight.status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-white/70">
                                            <span>{flight.origin || '?'}</span>
                                            <span className="text-white/30">→</span>
                                            <span>{flight.destination || '?'}</span>
                                        </div>
                                        {flight.airline && (
                                            <p className="text-xs text-white/50 mt-1">{flight.airline}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {!searching && searchResults.length === 0 && !searchError && (
                            <div className="text-center text-white/40 py-8">
                                <Search className="size-12 mx-auto mb-3 opacity-50" />
                                <p>{isHebrew ? 'הזן קוד קריאה וחפש' : 'Enter a callsign to search'}</p>
                            </div>
                        )}
                    </div>

                    {/* Selected Flight Actions */}
                    {selectedFlight && (
                        <div className="p-4 border-t border-white/10 space-y-3">
                            {importSuccess ? (
                                <div className="p-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm flex items-center gap-2">
                                    <CheckCircle className="size-5" />
                                    {isHebrew ? 'הטיסה יובאה בהצלחה!' : 'Flight imported successfully!'}
                                </div>
                            ) : (
                                <>
                                    {/* Comment Input */}
                                    <textarea
                                        value={comments}
                                        onChange={(e) => setComments(e.target.value)}
                                        placeholder={isHebrew ? "הערות (אופציונלי)..." : "Comments (optional)..."}
                                        className="w-full px-3 py-2 rounded-lg bg-background-dark border border-white/10 
                                                   text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-primary
                                                   resize-none h-20"
                                    />
                                    
                                    {/* Selected Rules Preview */}
                                    {selectedRuleIds.size > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {Array.from(selectedRuleIds).map(id => {
                                                const rule = TAGGING_RULES.find(r => r.id === id);
                                                return rule ? (
                                                    <span 
                                                        key={id}
                                                        className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                                                        style={{ 
                                                            backgroundColor: `${rule.color}20`,
                                                            color: rule.color,
                                                            border: `1px solid ${rule.color}40`
                                                        }}
                                                    >
                                                        {isHebrew ? rule.nameHe : rule.name}
                                                        <X 
                                                            className="size-3 cursor-pointer" 
                                                            onClick={() => toggleRuleSelection(id)}
                                                        />
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowRuleSelector(true)}
                                            className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/80
                                                       hover:bg-white/5 transition-colors text-sm font-medium"
                                        >
                                            {isHebrew ? 'בחר חוקים' : 'Select Rules'}
                                            {selectedRuleIds.size > 0 && (
                                                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary text-xs">
                                                    {selectedRuleIds.size}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            onClick={handleImport}
                                            disabled={importing || (selectedRuleIds.size === 0 && !isOtherSelected)}
                                            className="flex-1 py-2.5 rounded-lg bg-primary text-white font-medium
                                                       hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed
                                                       flex items-center justify-center gap-2 text-sm"
                                        >
                                            {importing ? (
                                                <>
                                                    <Loader2 className="size-4 animate-spin" />
                                                    {isHebrew ? 'מייבא...' : 'Importing...'}
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="size-4" />
                                                    {isHebrew ? 'יבא למסד' : 'Import'}
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {importError && (
                                        <p className="text-xs text-red-400">{importError}</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Map Area */}
                <div className="flex-1 relative">
                    {loadingTracks && (
                        <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="size-8 animate-spin text-primary" />
                                <p className="text-white/80">{isHebrew ? 'טוען מסלול...' : 'Loading track...'}</p>
                            </div>
                        </div>
                    )}
                    
                    <MapComponent
                        ref={mapRef}
                        points={flightTracks}
                        anomalyTimestamps={[]}
                    />

                    {/* Flight Info Overlay */}
                    {selectedFlight && flightTracks.length > 0 && (
                        <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm rounded-lg p-4 border border-white/10 max-w-xs">
                            <div className="flex items-center gap-3 mb-3">
                                <Plane className="size-5 text-primary" />
                                <div>
                                    <p className="font-bold">{selectedFlight.callsign || selectedFlight.flight_id}</p>
                                    <p className="text-xs text-white/60">{selectedFlight.airline}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="text-white/50">{isHebrew ? 'מוצא' : 'Origin'}</p>
                                    <p className="font-medium">{selectedFlight.origin || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-white/50">{isHebrew ? 'יעד' : 'Destination'}</p>
                                    <p className="font-medium">{selectedFlight.destination || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-white/50">{isHebrew ? 'נקודות' : 'Points'}</p>
                                    <p className="font-medium">{flightTracks.length}</p>
                                </div>
                                <div>
                                    <p className="text-white/50">{isHebrew ? 'מטוס' : 'Aircraft'}</p>
                                    <p className="font-medium">{selectedFlight.aircraft_type || '-'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Rule Circles Modal */}
            {showRuleSelector && (
                <div 
                    className="fixed inset-0 z-50 flex items-end justify-center pb-12"
                    onClick={() => setShowRuleSelector(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/70 animate-in fade-in" />
                    
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
                                    className="px-4 py-2 rounded-full transition-all hover:scale-105 font-medium text-sm flex items-center gap-2
                                               bg-primary text-white shadow-lg"
                                >
                                    <CheckCircle className="size-4" />
                                    {isHebrew ? `סיום (${selectedRuleIds.size + (isOtherSelected ? 1 : 0)})` : `Done (${selectedRuleIds.size + (isOtherSelected ? 1 : 0)})`}
                                </button>
                            )}
                            <button
                                onClick={() => setShowRuleSelector(false)}
                                className="p-3 rounded-full transition-all hover:scale-110 hover:rotate-90
                                           bg-surface/90 text-white backdrop-blur-sm"
                            >
                                <X className="size-6" />
                            </button>
                        </div>
                        
                        {/* Title */}
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold mb-2 text-white drop-shadow-lg">
                                {isHebrew ? "בחר סוגי חוקים" : "Select Rule Types"}
                            </h3>
                            <p className="text-sm text-white/70 drop-shadow-md">
                                {isHebrew ? "לחץ על החוקים שמתארים את האנומליה (ניתן לבחור מספר חוקים)" : "Click on the rules that describe this anomaly (multiple selection allowed)"}
                            </p>
                            {selectedRuleIds.size > 0 && (
                                <p className="text-xs mt-2 text-primary drop-shadow-md">
                                    {isHebrew ? `${selectedRuleIds.size} חוקים נבחרו` : `${selectedRuleIds.size} rule(s) selected`}
                                </p>
                            )}
                        </div>
                        
                        {/* Floating Rules */}
                        <div className="flex flex-wrap gap-6 justify-center items-center">
                            {TAGGING_RULES.map((rule, idx) => {
                                const Icon = getRuleIcon(rule.id);
                                const isSelected = selectedRuleIds.has(rule.id);
                                const categoryColors: Record<string, string> = {
                                    emergency: 'rgb(239, 68, 68)',
                                    flight_ops: 'rgb(59, 130, 246)',
                                    technical: 'rgb(168, 85, 247)',
                                    military: 'rgb(34, 197, 94)',
                                    other: 'rgb(234, 179, 8)'
                                };
                                const color = categoryColors[rule.category];
                                
                                return (
                                    <button
                                        key={rule.id}
                                        onClick={() => toggleRuleSelection(rule.id)}
                                        className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                        style={{
                                            animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                            animationDelay: `${idx * 0.08}s`
                                        }}
                                    >
                                        <div 
                                            className="w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:shadow-2xl relative"
                                            style={{
                                                background: isSelected 
                                                    ? `linear-gradient(135deg, ${color}66, ${color}99)` 
                                                    : `linear-gradient(135deg, ${color}4D, ${color}33)`,
                                                border: isSelected ? `4px solid ${color}` : `3px solid ${color}80`,
                                                boxShadow: isSelected 
                                                    ? `0 10px 40px ${color}99, inset 0 2px 10px rgba(255,255,255,0.1)` 
                                                    : `0 5px 20px ${color}4D`,
                                                backdropFilter: 'blur(10px)'
                                            }}
                                        >
                                            <Icon className="size-8 group-hover:scale-110 transition-transform" style={{ color: `${color}CC` }} />
                                            {isSelected && (
                                                <CheckCircle 
                                                    className="size-6 text-white absolute -top-1 -right-1 animate-in zoom-in rounded-full p-0.5" 
                                                    style={{ backgroundColor: color }}
                                                />
                                            )}
                                        </div>
                                        <div className="text-center max-w-[100px]">
                                            <p className="text-xs font-bold text-white drop-shadow-md">
                                                {isHebrew ? rule.nameHe : rule.name}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                            
                            {/* Other / Custom (Yellow) */}
                            <button
                                onClick={() => setIsOtherSelected(!isOtherSelected)}
                                className="flex flex-col items-center gap-2 transition-all hover:scale-110 group relative opacity-0"
                                style={{
                                    animation: 'jumpIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
                                    animationDelay: `${TAGGING_RULES.length * 0.08}s`
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
                                    <p className="text-xs font-bold text-white drop-shadow-md">
                                        {isHebrew ? "אחר" : "Other"}
                                    </p>
                                </div>
                            </button>
                        </div>
                        
                        {/* Other Details Input */}
                        {isOtherSelected && (
                            <div className="mt-6 max-w-md mx-auto animate-in slide-in-from-bottom-4">
                                <textarea
                                    value={otherDetails}
                                    onChange={(e) => setOtherDetails(e.target.value)}
                                    placeholder={isHebrew ? "תאר את סוג האנומליה..." : "Describe the anomaly type..."}
                                    className="w-full px-4 py-3 rounded-xl bg-surface/80 backdrop-blur-sm border border-white/20
                                               text-white placeholder:text-white/40 focus:outline-none focus:border-yellow-500
                                               resize-none h-24"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Animation keyframes */}
            <style>{`
                @keyframes jumpIn {
                    0% {
                        opacity: 0;
                        transform: scale(0.3) translateY(40px);
                    }
                    50% {
                        transform: scale(1.05) translateY(-10px);
                    }
                    70% {
                        transform: scale(0.95) translateY(5px);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

export function FlightImportPage() {
    return (
        <LanguageProvider>
            <FlightImportContent />
        </LanguageProvider>
    );
}

