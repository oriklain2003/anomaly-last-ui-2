import React, { useState } from 'react';
import { MessageCircle, X, Search, ChevronRight, Plane, Shield, Signal, TrendingUp, MapPin, AlertTriangle } from 'lucide-react';

interface QuickQuestion {
  id: string;
  question: string;
  category: string;
  icon: React.ReactNode;
  description?: string;
  tab?: string; // Which tab this relates to
}

const QUICK_QUESTIONS: QuickQuestion[] = [
  // Safety questions
  {
    id: 'emergency_count',
    question: 'How many emergency codes were declared this month?',
    category: 'Safety',
    icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
    tab: 'safety'
  },
  {
    id: 'go_arounds',
    question: 'Which airports have the most go-arounds?',
    category: 'Safety',
    icon: <Plane className="w-4 h-4 text-orange-400" />,
    tab: 'safety'
  },
  {
    id: 'near_miss',
    question: 'Where are near-miss events happening?',
    category: 'Safety',
    icon: <MapPin className="w-4 h-4 text-red-400" />,
    tab: 'safety'
  },
  
  // Traffic questions
  {
    id: 'busiest_day',
    question: 'Which day was the busiest?',
    category: 'Traffic',
    icon: <TrendingUp className="w-4 h-4 text-blue-400" />,
    tab: 'traffic'
  },
  {
    id: 'busiest_airport',
    question: 'What are the busiest airports?',
    category: 'Traffic',
    icon: <Plane className="w-4 h-4 text-blue-400" />,
    tab: 'traffic'
  },
  {
    id: 'signal_loss',
    question: 'Where is signal loss happening most?',
    category: 'Traffic',
    icon: <Signal className="w-4 h-4 text-yellow-400" />,
    tab: 'traffic'
  },
  
  // Intelligence questions
  {
    id: 'gps_jamming',
    question: 'Where is GPS jamming detected?',
    category: 'Intelligence',
    icon: <Shield className="w-4 h-4 text-purple-400" />,
    tab: 'intelligence'
  },
  {
    id: 'military_activity',
    question: 'What military aircraft are in the area?',
    category: 'Intelligence',
    icon: <Shield className="w-4 h-4 text-purple-400" />,
    tab: 'intelligence'
  },
  {
    id: 'tankers',
    question: 'Are there any tankers holding offshore?',
    category: 'Intelligence',
    icon: <Plane className="w-4 h-4 text-amber-400" />,
    tab: 'intelligence'
  },
  {
    id: 'isr',
    question: 'Identify ISR aircraft in scanning patterns',
    category: 'Intelligence',
    icon: <Search className="w-4 h-4 text-cyan-400" />,
    tab: 'intelligence'
  },
  
  // Airline efficiency
  {
    id: 'airline_efficiency',
    question: 'Which airline is most efficient on LLBG routes?',
    category: 'Intelligence',
    icon: <TrendingUp className="w-4 h-4 text-green-400" />,
    tab: 'intelligence'
  },
  {
    id: 'airline_compare',
    question: 'Why does Airline A fly longer than Airline B?',
    category: 'Intelligence',
    icon: <Plane className="w-4 h-4 text-blue-400" />,
    tab: 'intelligence'
  },
  
  // Seasonal
  {
    id: 'seasonal_trend',
    question: 'How does this month compare to last year?',
    category: 'Seasonal',
    icon: <TrendingUp className="w-4 h-4 text-indigo-400" />,
    tab: 'traffic'
  },
  {
    id: 'holiday_impact',
    question: 'Were there unusual traffic days (holidays)?',
    category: 'Seasonal',
    icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    tab: 'traffic'
  },
];

interface QuickQuestionsPanelProps {
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export function QuickQuestionsPanel({ onNavigateTab, className = '' }: QuickQuestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(QUICK_QUESTIONS.map(q => q.category))];
  
  const filteredQuestions = selectedCategory 
    ? QUICK_QUESTIONS.filter(q => q.category === selectedCategory)
    : QUICK_QUESTIONS;

  const handleQuestionClick = (question: QuickQuestion) => {
    if (question.tab && onNavigateTab) {
      onNavigateTab(question.tab);
    }
    setIsOpen(false);
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 ${className}`}>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen 
            ? 'bg-gray-700 rotate-0' 
            : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-96 max-h-[500px] bg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-b border-white/10 px-4 py-3">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-400" />
              Quick Questions
            </h3>
            <p className="text-white/60 text-xs mt-1">
              Click a question to navigate to the relevant data
            </p>
          </div>

          {/* Category Filters */}
          <div className="px-4 py-2 border-b border-white/10 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                !selectedCategory 
                  ? 'bg-white/20 text-white' 
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat 
                    ? 'bg-white/20 text-white' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Questions List */}
          <div className="max-h-[350px] overflow-y-auto">
            {filteredQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => handleQuestionClick(q)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5 text-left"
              >
                <div className="p-2 bg-surface-highlight rounded-lg">
                  {q.icon}
                </div>
                <div className="flex-1">
                  <div className="text-white text-sm">{q.question}</div>
                  <div className="text-white/40 text-xs">{q.category}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30" />
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-surface-highlight/30 border-t border-white/10">
            <p className="text-white/40 text-xs text-center">
              Questions are based on the demands specification
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

