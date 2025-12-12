import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { applyTheme, DEFAULT_THEME, loadSavedTheme, PRESET_THEMES, ThemeConfig } from '../theme';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const humanizePresetName = (key: string) =>
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);

    // Hydrate with saved colors on open
    useEffect(() => {
        if (!isOpen) return;
        const saved = loadSavedTheme();
        setTheme(saved);
        applyTheme(saved);
    }, [isOpen]);

    // Live preview while adjusting
    useEffect(() => {
        if (!isOpen) return;
        applyTheme(theme);
    }, [theme, isOpen]);

    const handleReset = () => {
        setTheme(DEFAULT_THEME);
        applyTheme(DEFAULT_THEME);
    };

    const presets = useMemo(() => Object.entries(PRESET_THEMES), []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-white/10 rounded-xl p-6 w-[440px] shadow-2xl relative">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Theme Settings</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                        <X className="size-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Primary color (app background)</label>
                        <div className="flex gap-3">
                            <input
                                type="color"
                                value={theme.background}
                                onChange={(e) => setTheme((cur) => ({ ...cur, background: e.target.value }))}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input
                                type="text"
                                value={theme.background}
                                onChange={(e) => setTheme((cur) => ({ ...cur, background: e.target.value }))}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Secondary color (items & cards)</label>
                        <div className="flex gap-3">
                            <input
                                type="color"
                                value={theme.surface}
                                onChange={(e) => setTheme((cur) => ({ ...cur, surface: e.target.value }))}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input
                                type="text"
                                value={theme.surface}
                                onChange={(e) => setTheme((cur) => ({ ...cur, surface: e.target.value }))}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Third color (tabs & highlights)</label>
                        <div className="flex gap-3">
                            <input
                                type="color"
                                value={theme.accent}
                                onChange={(e) => setTheme((cur) => ({ ...cur, accent: e.target.value }))}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input
                                type="text"
                                value={theme.accent}
                                onChange={(e) => setTheme((cur) => ({ ...cur, accent: e.target.value }))}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm font-medium text-white/80">
                            <span>Presets</span>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                <RotateCcw className="size-4" />
                                Reset defaults
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {presets.map(([key, preset]) => (
                                <button
                                    key={key}
                                    onClick={() => setTheme(preset)}
                                    className="group flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-background-dark/50 hover:border-primary/60 hover:bg-white/5 transition-colors text-left"
                                >
                                    <div className="flex gap-1.5">
                                        <span className="h-6 w-6 rounded-md border border-white/10" style={{ backgroundColor: preset.background }} />
                                        <span className="h-6 w-6 rounded-md border border-white/10" style={{ backgroundColor: preset.surface }} />
                                        <span className="h-6 w-6 rounded-md border border-white/10" style={{ backgroundColor: preset.accent }} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                                            {humanizePresetName(key)}
                                        </p>
                                        <p className="text-xs text-white/60">Background / Items / Tabs</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-8 pt-6 border-t border-white/10">
                    <div className="flex-1"></div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
