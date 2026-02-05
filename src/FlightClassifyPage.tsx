import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapComponent, type MapComponentHandle } from './components/MapComponent';
import { 
  fetchResearchTrack, 
  fetchResearchFlightMetadata,
  fetchResearchAnomaly,
  classifyFlight,
  type FlightMetadata,
  type ClassifyFlightResponse 
} from './api';
import type { FlightTrack, AnomalyReport } from './types';
import { ArrowLeft, Search, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export function FlightClassifyPage() {
  const [flightId, setFlightId] = useState('');
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightTrack | null>(null);
  const [metadata, setMetadata] = useState<FlightMetadata | null>(null);
  const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null);
  const [classificationResult, setClassificationResult] = useState<ClassifyFlightResponse | null>(null);
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
    setAnomalyReport(null);
    setClassificationResult(null);

    try {
      // Fetch track, metadata, and anomaly report in parallel (same as main app)
      const [track, meta, anomaly] = await Promise.all([
        fetchResearchTrack(flightId.trim()),
        fetchResearchFlightMetadata(flightId.trim()),
        fetchResearchAnomaly(flightId.trim())
      ]);

      setFlightData(track);
      setMetadata(meta);
      setAnomalyReport(anomaly);
    } catch (err) {
      console.error('Failed to fetch flight data:', err);
      setError(`Failed to load flight data: ${flightId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClassify = async () => {
    if (!flightData || !metadata || !anomalyReport) {
      setError('Flight data not fully loaded');
      return;
    }

    setClassifying(true);
    setError(null);
    setClassificationResult(null);

    try {
      // Use the timestamp from the anomaly report (same as main app)
      const result = await classifyFlight({
        flight_id: metadata.flight_id,
        flight_data: flightData.points,
        anomaly_report: anomalyReport.full_report, // Use full_report field
        flight_time: anomalyReport.timestamp
      });

      setClassificationResult(result);
    } catch (err) {
      console.error('Failed to classify flight:', err);
      setError(`Classification failed: ${err}`);
    } finally {
      setClassifying(false);
    }
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
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="text-white text-xl font-bold leading-tight tracking-[-0.015em]">
            Flight Classifier
          </h2>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-6 overflow-hidden">
        {/* Left Panel: Search & Classification */}
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

          {/* Classify Button */}
          {metadata && flightData && anomalyReport && !classificationResult && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">AI Classification</h3>
              <button
                onClick={handleClassify}
                disabled={classifying}
                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-purple-600/40 disabled:to-blue-600/40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                {classifying ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Classifying...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Classify Flight
                  </>
                )}
              </button>
              <p className="mt-2 text-xs text-white/50 text-center">
                AI will analyze the flight pattern and classify it
              </p>
            </div>
          )}

          {/* Classification Result */}
          {classificationResult && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Classification Result</h3>
              </div>

              {/* Main Classification */}
              <div className="mb-4 p-4 rounded-lg bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs text-white/60 mb-1">Rule</div>
                    <div className="text-lg font-bold text-white">
                      {classificationResult.classification.rule_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/60 mb-1">Confidence</div>
                    <div className={`text-sm font-semibold px-2 py-1 rounded ${
                      classificationResult.classification.confidence === 'High'
                        ? 'bg-green-600/30 text-green-400 border border-green-500/50'
                        : classificationResult.classification.confidence === 'Medium'
                        ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/50'
                        : 'bg-red-600/30 text-red-400 border border-red-500/50'
                    }`}>
                      {classificationResult.classification.confidence}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-white/80 leading-relaxed">
                  {classificationResult.classification.reasoning}
                </div>
              </div>

              {/* Rule Details */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Rule Details
                </div>
                <div className="space-y-1.5">
                  <DetailRow 
                    label="Rule ID" 
                    value={classificationResult.rule_details.id.toString()} 
                  />
                  <DetailRow 
                    label="Name (English)" 
                    value={classificationResult.rule_details.name} 
                  />
                  <DetailRow 
                    label="Name (Hebrew)" 
                    value={classificationResult.rule_details.nameHe} 
                  />
                  <DetailRow 
                    label="Description" 
                    value={classificationResult.rule_details.description} 
                  />
                  <DetailRow 
                    label="Category" 
                    value={classificationResult.rule_details.category} 
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Color:</span>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: classificationResult.rule_details.color }}
                      />
                      <span className="text-white font-mono text-xs">
                        {classificationResult.rule_details.color}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Re-classify button */}
              <button
                onClick={() => setClassificationResult(null)}
                className="w-full mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white text-sm font-medium transition-colors"
              >
                Classify Again
              </button>
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

                {/* Route */}
                <MetadataSection title="Route">
                  <MetadataField label="Origin" value={metadata.origin_airport} />
                  <MetadataField label="Destination" value={metadata.destination_airport} />
                </MetadataSection>

                {/* Anomaly Info */}
                {anomalyReport && (
                  <MetadataSection title="Anomaly Information">
                    <MetadataField 
                      label="Is Anomaly" 
                      value={anomalyReport.is_anomaly ? 'Yes' : 'No'}
                      highlight={anomalyReport.is_anomaly}
                    />
                    {anomalyReport.is_anomaly && (
                      <>
                        <MetadataField 
                          label="Severity (CNN)" 
                          value={anomalyReport.severity_cnn !== undefined ? anomalyReport.severity_cnn.toFixed(2) : undefined} 
                        />
                        <MetadataField 
                          label="Severity (Dense)" 
                          value={anomalyReport.severity_dense !== undefined ? anomalyReport.severity_dense.toFixed(2) : undefined} 
                        />
                      </>
                    )}
                  </MetadataSection>
                )}

                {/* Track Info */}
                {flightData && (
                  <MetadataSection title="Track">
                    <MetadataField 
                      label="Total Points" 
                      value={flightData.points.length.toString()} 
                    />
                    {flightData.points.length > 0 && (
                      <>
                        <MetadataField 
                          label="First Point" 
                          value={new Date(flightData.points[0].timestamp * 1000).toLocaleString()} 
                        />
                        <MetadataField 
                          label="Last Point" 
                          value={new Date(flightData.points[flightData.points.length - 1].timestamp * 1000).toLocaleString()} 
                        />
                      </>
                    )}
                  </MetadataSection>
                )}
              </div>
            </div>
          )}

          {/* Anomaly Report */}
          {anomalyReport && anomalyReport.is_anomaly && anomalyReport.full_report && (
            <div className="bg-surface rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <h3 className="text-lg font-semibold text-white">Anomaly Report</h3>
              </div>
              
              {anomalyReport.full_report.layer_1_rules?.report?.matched_rules?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-white/60">Triggered Rules</div>
                  {anomalyReport.full_report.layer_1_rules.report.matched_rules.map((rule: any, idx: number) => (
                    <div 
                      key={idx} 
                      className="px-3 py-2 bg-red-600/20 text-red-400 rounded border border-red-500/30 text-sm"
                    >
                      <div className="font-semibold">
                        {rule.name || rule.rule_name || `Rule ${rule.id}`}
                      </div>
                      {rule.description && (
                        <div className="text-xs text-red-300/80 mt-1">
                          {rule.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/60">{label}:</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
