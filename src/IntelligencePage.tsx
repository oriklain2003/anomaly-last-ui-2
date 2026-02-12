import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {  Home, HelpCircle, Zap } from 'lucide-react';
import { OverviewTab } from './components/intelligence/OverviewTab';
import { SafetyTab } from './components/intelligence/SafetyTab';
import { IntelligenceTab } from './components/intelligence/IntelligenceTab';
import { MilitaryTab } from './components/intelligence/MilitaryTab';
import { PredictTab } from './components/intelligence/PredictTab';
import { IntelligenceHelpModal } from './components/intelligence/IntelligenceHelpModal';
import { QuickQuestionsPanel } from './components/intelligence/QuickQuestionsPanel';
import { fetchTrafficBatch, type TrafficBatchResponse } from './api';
import type { FlightPerDay } from './types';

type TabType = 'overview' | 'safety' | 'intelligence' | 'military' | 'predict';

// Shared data that's lifted to parent to avoid redundant fetches
export interface SharedDashboardData {
  flightsPerDay: FlightPerDay[];
  trafficBatch: TrafficBatchResponse | null;
  loading: boolean;
}

// Fixed date range (Nov 1 - Dec 31, 2025) - pre-computed for instant loading
const CACHED_START_TS = 1761955200;
const CACHED_END_TS = 1767225599;

// Parse URL params for initial tab only
function getInitialTab(): TabType {
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  // Redirect old 'traffic' tab to 'safety' (merged)
  if (tabParam === 'traffic') return 'safety';
  const validTabs = ['overview', 'safety', 'intelligence', 'military', 'predict'];
  return validTabs.includes(tabParam || '') ? (tabParam as TabType) : 'overview';
}

export function IntelligencePage() {
  const [, setSearchParams] = useSearchParams();
  const initialTab = getInitialTab();
  
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [cacheKey] = useState(0); // Used to force refresh data
  const [lastRefresh] = useState<Date | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // OPTIMIZATION: Shared data lifted to parent to avoid redundant fetches
  const [sharedData, setSharedData] = useState<SharedDashboardData>({
    flightsPerDay: [],
    trafficBatch: null,
    loading: true
  });
  
  // Fixed date range - always use cached data
  const dateRange = { startTs: CACHED_START_TS, endTs: CACHED_END_TS };
  
  // OPTIMIZATION: Load shared data once at parent level
  useEffect(() => {
    const loadSharedData = async () => {
      setSharedData(prev => ({ ...prev, loading: true }));
      try {
        // Traffic batch contains flights_per_day and other data used by multiple tabs
        const trafficBatch = await fetchTrafficBatch(dateRange.startTs, dateRange.endTs);
        setSharedData({
          flightsPerDay: trafficBatch.flights_per_day || [],
          trafficBatch,
          loading: false
        });
      } catch (error) {
        console.error('Failed to load shared dashboard data:', error);
        setSharedData(prev => ({ ...prev, loading: false }));
      }
    };
    loadSharedData();
  }, [dateRange.startTs, dateRange.endTs, cacheKey]);
  
  // Update URL when tab changes
  useEffect(() => {
    const newParams = new URLSearchParams();
    newParams.set('tab', activeTab);
    setSearchParams(newParams, { replace: true });
  }, [activeTab, setSearchParams]);
  
  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'safety', label: 'Safety & Traffic' },  // Merged tab
    { id: 'intelligence', label: 'Intelligence' },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-background-light dark:bg-background-dark text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-white/10 px-6 py-3 shrink-0 bg-surface">
        <div className="flex items-center gap-4 text-white">

          <h2 className="text-white text-xl font-bold leading-tight tracking-[-0.015em]">Onyx Intelligence Dashboard</h2>
        </div>
        <div className="flex flex-1 justify-end gap-2">
          <Link
            to={import.meta.env.VITE_HOME || '/'}
            className="flex h-10 px-3 items-center justify-center rounded-lg bg-surface-highlight text-white/80 hover:text-white transition-colors border border-white/10 text-sm font-bold no-underline"
          >
            <Home className="h-4 w-4 mr-2" />
            Main
          </Link>



          <button
            onClick={() => setShowHelp(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-highlight text-white/80 hover:text-white transition-colors border border-white/10"
            title="Help: panel explanations (EN/HE)"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <div className="ml-2 size-10 rounded-full bg-gray-600" />
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-white/10 bg-surface px-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-primary text-white'
                    : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Range Selector with Display */}
          <div className="flex gap-3 items-center relative">
            {/* Refresh Button */}

            {/* Last Refresh Time */}
            {lastRefresh && (
              <span className="text-xs text-white/40">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            
            {/* Fixed Date Range Display */}
            <div className="flex items-center gap-3 bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/30">
              <Zap className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-300 font-medium text-sm">
                Jun 1 – Jun 30, 2026
              </span>
              <span className="text-emerald-400/60 text-xs">
                (Pre-computed • Instant Load)
              </span>
            </div>
          </div>
        </div>
      </div>


      {/* Tab Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[1600px] mx-auto">
          {activeTab === 'overview' && (
            <OverviewTab 
              startTs={dateRange.startTs} 
              endTs={dateRange.endTs} 
              cacheKey={cacheKey}
              sharedData={sharedData}
            />
          )}
          {activeTab === 'safety' && (
            <SafetyTab 
              startTs={dateRange.startTs} 
              endTs={dateRange.endTs} 
              cacheKey={cacheKey}
              sharedData={sharedData}
            />
          )}
          {activeTab === 'intelligence' && (
            <IntelligenceTab 
              startTs={dateRange.startTs} 
              endTs={dateRange.endTs} 
              cacheKey={cacheKey}
              sharedData={sharedData}
            />
          )}
          {activeTab === 'military' && <MilitaryTab startTs={dateRange.startTs} endTs={dateRange.endTs} cacheKey={cacheKey} />}
          {activeTab === 'predict' && <PredictTab />}
        </div>
      </main>

      <IntelligenceHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      
      {/* Quick Questions Floating Panel */}
      <QuickQuestionsPanel 
        onNavigateTab={(tab) => setActiveTab(tab as TabType)} 
      />
    </div>
  );
}

