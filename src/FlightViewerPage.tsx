import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapComponent, type MapComponentHandle } from './components/MapComponent';
import { fetchResearchTrack, fetchResearchFlightMetadata, fetchAnalyzeFlightFromDB, type FlightMetadata } from './api';
import type { FlightTrack } from './types';
import { ArrowLeft, Search, Loader2, Plane, ThumbsUp, ThumbsDown, Copy, Trash2, Activity } from 'lucide-react';

export function FlightViewerPage() {
  const [flightId, setFlightId] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightTrack | null>(null);
  const [metadata, setMetadata] = useState<FlightMetadata | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [goodFlightIds, setGoodFlightIds] = useState<string[]>([]);
  const [badFlightIds, setBadFlightIds] = useState<string[]>([]);
  const [copiedGood, setCopiedGood] = useState(false);
  const [copiedBad, setCopiedBad] = useState(false);
  const mapRef = useRef<MapComponentHandle>(null);

  const handleSearch = async () => {
    if (!flightId.trim()) {
      setError('Please enter a flight ID');
      return;
    }

    setLoading(true);
    setError(null);
    setFlightData(null);
    setMetadata(null);

    try {
      // Fetch track and metadata in parallel
      const [track, meta] = await Promise.all([
        fetchResearchTrack(flightId.trim()),
        fetchResearchFlightMetadata(flightId.trim())
      ]);

      setFlightData(track);
      setMetadata(meta);
    } catch (err) {
      console.error('Failed to fetch flight data:', err);
      setError(`Flight not found: ${flightId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleMarkGood = () => {
    if (metadata?.flight_id && !goodFlightIds.includes(metadata.flight_id)) {
      setGoodFlightIds([...goodFlightIds, metadata.flight_id]);
      // Remove from bad list if present
      setBadFlightIds(badFlightIds.filter(id => id !== metadata.flight_id));
    }
  };

  const handleMarkBad = () => {
    if (metadata?.flight_id && !badFlightIds.includes(metadata.flight_id)) {
      setBadFlightIds([...badFlightIds, metadata.flight_id]);
      // Remove from good list if present
      setGoodFlightIds(goodFlightIds.filter(id => id !== metadata.flight_id));
    }
  };

  const handleAnalyzeFromDB = async () => {
    if (!metadata?.flight_id) return;

    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      const result = await fetchAnalyzeFlightFromDB(metadata.flight_id);
      setAnalysisResult(result);
      console.log('Analysis result:', result);
    } catch (err) {
      console.error('Failed to analyze flight from DB:', err);
      setError(`Analysis failed: ${err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string, type: 'good' | 'bad') => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'good') {
        setCopiedGood(true);
        setTimeout(() => setCopiedGood(false), 2000);
      } else {
        setCopiedBad(true);
        setTimeout(() => setCopiedBad(false), 2000);
      }
    });
  };

  const formatAsPythonList = (ids: string[]) => {
    if (ids.length === 0) return '[]';
    return `["${ids.join('","')}"`;
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background-light dark:bg-background-dark text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-white/10 px-6 py-3 shrink-0 bg-surface">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors no-underline"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <Plane className="h-6 w-6 text-primary" />
          <h2 className="text-white text-xl font-bold leading-tight tracking-[-0.015em]">
            Flight Viewer
          </h2>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-6 overflow-hidden">
        {/* Left Panel: Search & Metadata */}
        <div className="w-96 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Search Box */}
          <div className="bg-surface rounded-xl p-4 border border-white/5">
            <label className="block text-sm font-medium text-white/60 mb-2">
              Flight ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={flightId}
                onChange={(e) => setFlightId(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter flight ID..."
                className="flex-1 px-3 py-2 bg-surface-highlight border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-primary hover:bg-primary/80 disabled:bg-primary/40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </button>
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          {/* Good/Bad Buttons */}
          {metadata && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Mark Flight</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleMarkGood}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    goodFlightIds.includes(metadata.flight_id)
                      ? 'bg-green-600 text-white'
                      : 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30'
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  Good
                </button>
                <button
                  onClick={handleMarkBad}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    badFlightIds.includes(metadata.flight_id)
                      ? 'bg-red-600 text-white'
                      : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30'
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" />
                  Bad
                </button>
              </div>
            </div>
          )}

          {/* Analyze from DB */}
          {metadata && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Analysis</h3>
              <button
                onClick={handleAnalyzeFromDB}
                disabled={analyzing}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-600/80 disabled:bg-blue-600/40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4" />
                    Analyze from DB
                  </>
                )}
              </button>
              {analysisResult && (
                <div className="mt-3 p-3 bg-surface-highlight rounded-lg border border-white/10">
                  <div className="text-xs font-medium text-white/60 mb-2">Analysis Results</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Is Anomaly:</span>
                      <span className={`font-medium ${analysisResult.is_anomaly ? 'text-red-400' : 'text-green-400'}`}>
                        {analysisResult.is_anomaly ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {analysisResult.is_anomaly && (
                      <>
                        {analysisResult.severity_cnn !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Severity (CNN):</span>
                            <span className="text-white font-medium">{analysisResult.severity_cnn.toFixed(2)}</span>
                          </div>
                        )}
                        {analysisResult.severity_dense !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Severity (Dense):</span>
                            <span className="text-white font-medium">{analysisResult.severity_dense.toFixed(2)}</span>
                          </div>
                        )}
                        {analysisResult.layer_1_rules?.report?.matched_rules?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <div className="text-xs font-medium text-white/60 mb-1">Triggered Rules:</div>
                            <div className="space-y-1">
                              {analysisResult.layer_1_rules.report.matched_rules.map((rule: any, idx: number) => (
                                <div key={idx} className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded border border-red-500/30">
                                  {rule.name || rule.rule_name || `Rule ${rule.id}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata Display */}
          {metadata && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-3">Flight Metadata</h3>
              <div className="space-y-3">
                {/* Basic Info */}
                <MetadataSection title="Basic Information">
                  <MetadataField label="Flight ID" value={metadata.flight_id} />
                  <MetadataField label="Callsign" value={metadata.callsign} />
                  <MetadataField label="Flight Number" value={metadata.flight_number} />
                  <MetadataField label="Airline" value={metadata.airline} />
                </MetadataSection>

                {/* Aircraft Info */}
                <MetadataSection title="Aircraft">
                  <MetadataField label="Type" value={metadata.aircraft_type} />
                  <MetadataField label="Model" value={metadata.aircraft_model} />
                  <MetadataField label="Registration" value={metadata.aircraft_registration} />
                </MetadataSection>

                {/* Route */}
                <MetadataSection title="Route">
                  <MetadataField label="Origin" value={metadata.origin_airport} />
                  <MetadataField label="Destination" value={metadata.destination_airport} />
                  <MetadataField 
                    label="Scheduled Departure" 
                    value={metadata.scheduled_departure ? new Date(metadata.scheduled_departure).toLocaleString() : undefined} 
                  />
                  <MetadataField 
                    label="Scheduled Arrival" 
                    value={metadata.scheduled_arrival ? new Date(metadata.scheduled_arrival).toLocaleString() : undefined} 
                  />
                </MetadataSection>

                {/* Flight Stats */}
                <MetadataSection title="Flight Statistics">
                  <MetadataField 
                    label="Duration" 
                    value={metadata.flight_duration_sec ? formatDuration(metadata.flight_duration_sec) : undefined} 
                  />
                  <MetadataField 
                    label="Distance" 
                    value={metadata.total_distance_nm ? `${metadata.total_distance_nm.toFixed(1)} nm` : undefined} 
                  />
                  <MetadataField label="Total Points" value={metadata.total_points?.toString()} />
                  <MetadataField 
                    label="Altitude Range" 
                    value={metadata.min_altitude_ft && metadata.max_altitude_ft 
                      ? `${metadata.min_altitude_ft.toFixed(0)} - ${metadata.max_altitude_ft.toFixed(0)} ft` 
                      : undefined} 
                  />
                  <MetadataField 
                    label="Cruise Altitude" 
                    value={metadata.cruise_altitude_ft ? `${metadata.cruise_altitude_ft.toFixed(0)} ft` : undefined} 
                  />
                  <MetadataField 
                    label="Speed Range" 
                    value={metadata.min_speed_kts && metadata.max_speed_kts 
                      ? `${metadata.min_speed_kts.toFixed(0)} - ${metadata.max_speed_kts.toFixed(0)} kts` 
                      : undefined} 
                  />
                </MetadataSection>

                {/* Special Flags */}
                <MetadataSection title="Flags">
                  <MetadataField 
                    label="Military" 
                    value={metadata.is_military ? 'Yes' : 'No'} 
                    highlight={metadata.is_military}
                  />
                  <MetadataField 
                    label="Emergency Squawk" 
                    value={metadata.emergency_squawk_detected ? 'Detected' : 'None'} 
                    highlight={metadata.emergency_squawk_detected}
                  />
                  <MetadataField label="Squawk Codes" value={metadata.squawk_codes} />
                  <MetadataField label="Signal Loss Events" value={metadata.signal_loss_events?.toString()} />
                </MetadataSection>

                {/* Anomaly Info */}
                {metadata.is_anomaly && (
                  <MetadataSection title="Anomaly Information">
                    <MetadataField 
                      label="Is Anomaly" 
                      value="Yes" 
                      highlight={true}
                    />
                    <MetadataField 
                      label="Severity (CNN)" 
                      value={metadata.severity_cnn?.toFixed(2)} 
                    />
                    <MetadataField 
                      label="Severity (Dense)" 
                      value={metadata.severity_dense?.toFixed(2)} 
                    />
                  </MetadataSection>
                )}

                {/* Geographic Info */}
                <MetadataSection title="Geographic">
                  <MetadataField 
                    label="Start Position" 
                    value={metadata.start_lat && metadata.start_lon 
                      ? `${metadata.start_lat.toFixed(4)}°, ${metadata.start_lon.toFixed(4)}°` 
                      : undefined} 
                  />
                  <MetadataField 
                    label="End Position" 
                    value={metadata.end_lat && metadata.end_lon 
                      ? `${metadata.end_lat.toFixed(4)}°, ${metadata.end_lon.toFixed(4)}°` 
                      : undefined} 
                  />
                  <MetadataField label="Nearest Airport (Start)" value={metadata.nearest_airport_start} />
                  <MetadataField label="Nearest Airport (End)" value={metadata.nearest_airport_end} />
                </MetadataSection>
              </div>
            </div>
          )}

          {/* Track Info */}
          {flightData && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-3">Track Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Total Points:</span>
                  <span className="text-white font-medium">{flightData.points.length}</span>
                </div>
                {flightData.points.length > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-white/60">First Point:</span>
                      <span className="text-white font-medium">
                        {new Date(flightData.points[0].timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Last Point:</span>
                      <span className="text-white font-medium">
                        {new Date(flightData.points[flightData.points.length - 1].timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center Panel: Map */}
        <div className="flex-1 bg-surface rounded-xl relative overflow-hidden border border-white/5">
          <MapComponent 
            ref={mapRef}
            points={flightData?.points || []}
            anomalyTimestamps={[]}
            mlAnomalyPoints={[]}
            currentFlightOrigin={metadata?.origin_airport}
            currentFlightDestination={metadata?.destination_airport}
          />
        </div>

        {/* Right Panel: Lists */}
        <div className="w-80 flex flex-col gap-4 overflow-y-auto shrink-0">
          {/* Good Flights List */}
          <div className="bg-surface rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2">
                <ThumbsUp className="h-4 w-4" />
                Good Flights ({goodFlightIds.length})
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => copyToClipboard(formatAsPythonList(goodFlightIds), 'good')}
                  disabled={goodFlightIds.length === 0}
                  className="p-1.5 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Copy as Python list"
                >
                  {copiedGood ? (
                    <span className="text-xs text-green-400">✓</span>
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-white/60" />
                  )}
                </button>
                <button
                  onClick={() => setGoodFlightIds([])}
                  disabled={goodFlightIds.length === 0}
                  className="p-1.5 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Clear list"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white/60" />
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-white/80 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all">
                {formatAsPythonList(goodFlightIds)}
              </pre>
            </div>
            {goodFlightIds.length > 0 && (
              <div className="mt-2 space-y-1">
                {goodFlightIds.map((id, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-2 py-1 bg-green-600/10 rounded text-xs"
                  >
                    <span className="font-mono text-green-400">{id}</span>
                    <button
                      onClick={() => setGoodFlightIds(goodFlightIds.filter(fid => fid !== id))}
                      className="text-white/40 hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bad Flights List */}
          <div className="bg-surface rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <ThumbsDown className="h-4 w-4" />
                Bad Flights ({badFlightIds.length})
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => copyToClipboard(formatAsPythonList(badFlightIds), 'bad')}
                  disabled={badFlightIds.length === 0}
                  className="p-1.5 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Copy as Python list"
                >
                  {copiedBad ? (
                    <span className="text-xs text-green-400">✓</span>
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-white/60" />
                  )}
                </button>
                <button
                  onClick={() => setBadFlightIds([])}
                  disabled={badFlightIds.length === 0}
                  className="p-1.5 rounded hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Clear list"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white/60" />
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-white/80 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all">
                {formatAsPythonList(badFlightIds)}
              </pre>
            </div>
            {badFlightIds.length > 0 && (
              <div className="mt-2 space-y-1">
                {badFlightIds.map((id, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-2 py-1 bg-red-600/10 rounded text-xs"
                  >
                    <span className="font-mono text-red-400">{id}</span>
                    <button
                      onClick={() => setBadFlightIds(badFlightIds.filter(fid => fid !== id))}
                      className="text-white/40 hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Helper Components
function MetadataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-semibold text-white/80 mb-2">{title}</h4>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function MetadataField({ 
  label, 
  value, 
  highlight = false 
}: { 
  label: string; 
  value?: string; 
  highlight?: boolean;
}) {
  if (!value || value === 'undefined' || value === 'null') return null;
  
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/60">{label}:</span>
      <span className={`font-medium ${highlight ? 'text-red-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
