import { useEffect, useMemo, useState } from 'react';
import { X, Search, BookOpen } from 'lucide-react';
import { fetchIntelligenceDashboardHelp } from '../../api';
import type { IntelligenceDashboardHelpPayload } from '../../api';

type HelpLang = 'en' | 'he';
type HelpView = 'panels' | 'demands';

function tabLabel(tab: IntelligenceDashboardHelpPayload['panels'][number]['tab']) {
  switch (tab) {
    case 'overview': return 'Overview';
    case 'safety': return 'Safety';
    case 'traffic': return 'Traffic';
    case 'intelligence': return 'Intelligence';
    case 'predict': return 'Predict';
  }
}

function prettyValue(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function StatusBadge(props: { status: 'implemented' | 'not_implemented_yet' }) {
  const { status } = props;
  if (status === 'implemented') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        Implemented
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
      Not in UI yet
    </span>
  );
}

export function IntelligenceHelpModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [view, setView] = useState<HelpView>('panels');
  const [lang, setLang] = useState<HelpLang>('en');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<IntelligenceDashboardHelpPayload | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchIntelligenceDashboardHelp();
        if (cancelled) return;
        setData(payload);
        setSelectedPanelId((prev) => prev ?? payload.panels[0]?.panel_id ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load help');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredPanels = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.panels;
    return data.panels.filter(p => {
      const hay = `${p.panel_id} ${p.tab} ${p.title[lang]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, lang]);

  const filteredDemands = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.demands_coverage;
    return data.demands_coverage.filter(d => {
      const hay = `${d.id} ${d.question_en} ${d.question_he}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query]);

  const panelsByTab = useMemo(() => {
    const map = new Map<string, typeof filteredPanels>();
    for (const p of filteredPanels) {
      const k = p.tab;
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return map;
  }, [filteredPanels]);

  const selected = useMemo(() => {
    if (!data || !selectedPanelId) return null;
    return data.panels.find(p => p.panel_id === selectedPanelId) ?? null;
  }, [data, selectedPanelId]);

  if (!open) return null;

  const isHebrew = lang === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close help"
      />

      {/* Modal */}
      <div
        className="absolute left-1/2 top-1/2 w-[min(1100px,95vw)] h-[min(80vh,900px)] -translate-x-1/2 -translate-y-1/2 bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-white font-bold text-lg">Dashboard Help</div>
              <div className="text-white/50 text-xs">Intelligence Dashboard panels and calculations</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 mr-2">
              <button
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'panels' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setView('panels')}
              >
                {isHebrew ? 'פאנלים' : 'Panels'}
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'demands' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setView('demands')}
              >
                {isHebrew ? 'דרישות' : 'Demands'}
              </button>
            </div>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                lang === 'en'
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-transparent text-white/60 border-white/10 hover:text-white hover:bg-white/5'
              }`}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                lang === 'he'
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-transparent text-white/60 border-white/10 hover:text-white hover:bg-white/5'
              }`}
              onClick={() => setLang('he')}
            >
              עברית
            </button>
            <button
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-surface-highlight border border-white/10 rounded-lg px-3 py-2 w-full">
              <Search className="w-4 h-4 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isHebrew ? 'חיפוש…' : 'Search…'}
                className="w-full bg-transparent outline-none text-white placeholder-white/40 text-sm"
              />
            </div>
            {data && (
              <div className="text-white/40 text-xs whitespace-nowrap">
                {view === 'panels'
                  ? `${filteredPanels.length}/${data.panels.length}`
                  : `${filteredDemands.length}/${data.demands_coverage.length}`}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] h-[calc(80vh-140px)]">
          {/* Left: panel list */}
          <div className="border-r border-white/10 overflow-auto">
            {loading && (
              <div className="p-6 text-white/60 text-sm">Loading help…</div>
            )}
            {error && (
              <div className="p-6 text-red-400 text-sm">{error}</div>
            )}
            {!loading && !error && view === 'panels' && filteredPanels.length === 0 && (
              <div className="p-6 text-white/40 text-sm">
                {isHebrew ? 'לא נמצאו פאנלים התואמים לחיפוש.' : 'No panels match your search.'}
              </div>
            )}
            {!loading && !error && view === 'demands' && filteredDemands.length === 0 && (
              <div className="p-6 text-white/40 text-sm">
                {isHebrew ? 'לא נמצאו דרישות התואמות לחיפוש.' : 'No demands match your search.'}
              </div>
            )}

            {!loading && !error && view === 'panels' && (
              <div className="p-3 space-y-4">
                {Array.from(panelsByTab.entries()).map(([tab, items]) => (
                  <div key={tab}>
                    <div className="px-3 py-2 text-white/50 text-xs font-semibold uppercase tracking-wide">
                      {tabLabel(tab as any)}
                    </div>
                    <div className="space-y-1">
                      {items.map((p) => (
                        <button
                          key={p.panel_id}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            selectedPanelId === p.panel_id
                              ? 'bg-primary/15 border-primary/30 text-white'
                              : 'bg-transparent border-transparent hover:bg-white/5 text-white/70 hover:text-white'
                          }`}
                          onClick={() => setSelectedPanelId(p.panel_id)}
                        >
                          <div className="text-sm font-medium">{p.title[lang]}</div>
                          <div className="text-xs text-white/40 mt-0.5 font-mono">{p.panel_id}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && !error && view === 'demands' && data && (
              <div className="p-3 space-y-2">
                {filteredDemands.map((d) => (
                  <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-white text-sm font-semibold">
                          {isHebrew ? d.question_he : d.question_en}
                        </div>
                        <div className="text-white/40 text-xs font-mono mt-1">{d.id}</div>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    {d.status !== 'implemented' && (d.notes_en || d.notes_he) && (
                      <div className="text-white/50 text-xs mt-3">
                        {isHebrew ? d.notes_he : d.notes_en}
                      </div>
                    )}
                    {d.panels?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {d.panels.map(pid => {
                          const p = data.panels.find(x => x.panel_id === pid);
                          const label = p ? p.title[lang] : pid;
                          return (
                            <button
                              key={pid}
                              className="px-2 py-1 rounded-lg bg-black/20 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-xs transition-colors"
                              onClick={() => {
                                setView('panels');
                                setSelectedPanelId(pid);
                              }}
                              title={pid}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: details */}
          <div className="overflow-auto" dir={dir}>
            {!selected && (
              <div className="p-6 text-white/40 text-sm">
                {isHebrew ? 'בחר/י פאנל משמאל כדי לראות פירוט.' : 'Select a panel on the left to see details.'}
              </div>
            )}

            {view === 'panels' && selected && (
              <div className={`p-6 space-y-6 ${isHebrew ? 'text-right' : 'text-left'}`}>
                <div>
                  <div className="text-white text-xl font-bold">{selected.title[lang]}</div>
                  <div className="text-white/40 text-xs font-mono mt-1">{selected.panel_id}</div>
                </div>

                {/* Endpoints */}
                {selected.endpoints?.length > 0 && (
                  <div className="bg-surface-highlight border border-white/10 rounded-xl p-4">
                    <div className="text-white/70 text-sm font-semibold mb-2">
                      {isHebrew ? 'נקודות קצה (API)' : 'API Endpoints'}
                    </div>
                    <div className="space-y-2">
                      {selected.endpoints.map((ep, idx) => (
                        <div key={idx} className="text-sm text-white/80">
                          <span className="font-mono text-white">{ep.method}</span>{' '}
                          <span className="font-mono text-white/80">{ep.path}</span>
                          {ep.params?.length > 0 && (
                            <div className="text-xs text-white/50 mt-0.5">
                              {isHebrew ? 'פרמטרים: ' : 'Params: '}
                              <span className="font-mono">{ep.params.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Calculation */}
                <div>
                  <div className="text-white/80 text-sm font-semibold mb-2">
                    {isHebrew ? 'חישוב' : 'Calculation'}
                  </div>
                  <ul className="space-y-2 text-white/70 text-sm">
                    {(selected.calculation?.[lang] ?? []).map((line, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Meaning */}
                <div>
                  <div className="text-white/80 text-sm font-semibold mb-2">
                    {isHebrew ? 'משמעות' : 'Meaning'}
                  </div>
                  <div className="text-white/70 text-sm leading-relaxed">
                    {selected.meaning?.[lang] ?? ''}
                  </div>
                </div>

                {/* Hard-coded values */}
                <div>
                  <div className="text-white/80 text-sm font-semibold mb-2">
                    {isHebrew ? 'ערכים מקודדים (Hard-coded)' : 'Hard-coded values'}
                  </div>
                  {(selected.hard_coded_values?.[lang] ?? []).length === 0 ? (
                    <div className="text-white/40 text-sm">
                      {isHebrew ? 'אין ערכים מקודדים ידועים לפאנל הזה.' : 'No known hard-coded values for this panel.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(selected.hard_coded_values?.[lang] ?? []).map((item, idx) => (
                        <div key={idx} className="bg-black/20 border border-white/10 rounded-xl p-4">
                          <div className="text-white font-medium text-sm mb-2">{item.name}</div>
                          <pre className="text-xs text-white/70 overflow-auto whitespace-pre-wrap">
                            {prettyValue(item.value)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Related demands */}
                {data && (
                  <div>
                    <div className="text-white/80 text-sm font-semibold mb-2">
                      {isHebrew ? 'דרישות קשורות' : 'Related demands'}
                    </div>
                    {data.demands_coverage.filter(d => d.panels?.includes(selected.panel_id)).length === 0 ? (
                      <div className="text-white/40 text-sm">
                        {isHebrew ? 'אין מיפוי דרישות לפאנל הזה.' : 'No mapped demands for this panel.'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {data.demands_coverage
                          .filter(d => d.panels?.includes(selected.panel_id))
                          .map((d) => (
                            <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-white/80 text-sm">
                                  {isHebrew ? d.question_he : d.question_en}
                                  <div className="text-white/40 text-xs font-mono mt-1">{d.id}</div>
                                </div>
                                <StatusBadge status={d.status} />
                              </div>
                              {d.status !== 'implemented' && (d.notes_en || d.notes_he) && (
                                <div className="text-white/50 text-xs mt-2">
                                  {isHebrew ? d.notes_he : d.notes_en}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {view === 'demands' && (
              <div className={`p-6 ${isHebrew ? 'text-right' : 'text-left'}`}>
                <div className="text-white text-xl font-bold">
                  {isHebrew ? 'כיסוי דרישות' : 'Demand coverage'}
                </div>
                <div className="text-white/60 text-sm mt-2">
                  {isHebrew
                    ? 'רשימת הדרישות העסקיות והאם הן מכוסות בדשבורד. ניתן ללחוץ על תגית פאנל כדי לקפוץ להסבר שלו.'
                    : 'List of business demands and whether they are covered by the dashboard. Click a panel tag to jump to its explanation.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


