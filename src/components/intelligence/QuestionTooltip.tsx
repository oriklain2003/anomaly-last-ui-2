import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface QuestionTooltipProps {
  question: string;
  questionEn?: string;
  level?: string;
}

export function QuestionTooltip({ question, questionEn, level }: QuestionTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const levelColors: Record<string, string> = {
    'L1': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    'L2': 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    'L3': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    'L4': 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  const levelDescriptions: Record<string, string> = {
    'L1': 'Basic Statistics',
    'L2': 'Operational Insights',
    'L3': 'Deep Intelligence',
    'L4': 'Predictive Analytics',
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full hover:bg-white/10 transition-colors group"
        title="What question does this answer?"
      >
        <HelpCircle className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Tooltip */}
          <div className="absolute z-50 top-full left-0 mt-2 w-80 bg-surface-highlight border border-white/20 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-primary/20 to-accent/20 border-b border-white/10 flex items-center justify-between">
              <span className="text-white/80 text-sm font-medium">שאלה נענית</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Hebrew Question */}
              <div className="text-right" dir="rtl">
                <p className="text-white text-sm leading-relaxed">{question}</p>
              </div>

              {/* English Translation */}
              {questionEn && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-white/60 text-xs italic">{questionEn}</p>
                </div>
              )}

              {/* Level Badge */}
              {level && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded border ${levelColors[level] || 'bg-white/10 text-white/60 border-white/20'}`}>
                    {level}
                  </span>
                  <span className="text-white/40 text-xs">
                    {levelDescriptions[level] || ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

