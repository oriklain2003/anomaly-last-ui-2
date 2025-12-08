import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Default colors
const DEFAULTS = {
    primary: '#00E5FF',
    surface: '#18181b',
    background: '#09090b'
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [primary, setPrimary] = useState(DEFAULTS.primary);
    const [surface, setSurface] = useState(DEFAULTS.surface);
    const [background, setBackground] = useState(DEFAULTS.background);

    useEffect(() => {
        if (isOpen) {
            // Load saved settings or use defaults
            const savedConfig = localStorage.getItem('app-theme-colors');
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    if (parsed.primary) setPrimary(parsed.primary);
                    if (parsed.surface) setSurface(parsed.surface);
                    if (parsed.background) setBackground(parsed.background);
                    
                    // Apply immediately on load in case they weren't applied yet (though usually app init does this)
                    applyColors(parsed.primary || DEFAULTS.primary, parsed.surface || DEFAULTS.surface, parsed.background || DEFAULTS.background);
                } catch (e) {
                    console.error("Failed to parse saved theme settings", e);
                }
            } else {
                // First time or reset: Ensure defaults are applied
                setPrimary(DEFAULTS.primary);
                setSurface(DEFAULTS.surface);
                setBackground(DEFAULTS.background);
            }
        }
    }, [isOpen]);

    const hexToRgb = (hex: string) => {
        // Handle shorthand hex
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function(_m, r, g, b) {
            return r + r + g + g + b + b;
        });

        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` 
            : null;
    };

    const applyColors = (p: string, s: string, b: string) => {
        const root = document.documentElement;
        
        const pRgb = hexToRgb(p);
        const sRgb = hexToRgb(s);
        const bRgb = hexToRgb(b);

        if (pRgb) root.style.setProperty('--color-primary', pRgb);
        if (sRgb) root.style.setProperty('--color-surface', sRgb);
        if (bRgb) root.style.setProperty('--color-background', bRgb);
        
        localStorage.setItem('app-theme-colors', JSON.stringify({ primary: p, surface: s, background: b }));
    };

    const handleReset = () => {
        setPrimary(DEFAULTS.primary);
        setSurface(DEFAULTS.surface);
        setBackground(DEFAULTS.background);
        applyColors(DEFAULTS.primary, DEFAULTS.surface, DEFAULTS.background);
    };
    
    // Live preview
    useEffect(() => {
        if (isOpen) {
             applyColors(primary, surface, background);
        }
    }, [primary, surface, background]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-white/10 rounded-xl p-6 w-[400px] shadow-2xl relative">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Theme Settings</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                        <X className="size-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Primary Color (Accent)</label>
                        <div className="flex gap-3">
                            <input 
                                type="color" 
                                value={primary}
                                onChange={(e) => setPrimary(e.target.value)}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input 
                                type="text" 
                                value={primary}
                                onChange={(e) => setPrimary(e.target.value)}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Secondary Color (Surface)</label>
                        <div className="flex gap-3">
                            <input 
                                type="color" 
                                value={surface}
                                onChange={(e) => setSurface(e.target.value)}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input 
                                type="text" 
                                value={surface}
                                onChange={(e) => setSurface(e.target.value)}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">Third Color (Background)</label>
                        <div className="flex gap-3">
                            <input 
                                type="color" 
                                value={background}
                                onChange={(e) => setBackground(e.target.value)}
                                className="h-10 w-20 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                            />
                            <input 
                                type="text" 
                                value={background}
                                onChange={(e) => setBackground(e.target.value)}
                                className="flex-1 bg-background-dark border border-white/10 rounded px-3 text-white text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-8 pt-6 border-t border-white/10">
                    <button 
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
                    >
                        <RotateCcw className="size-4" />
                        Reset
                    </button>
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

