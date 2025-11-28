import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MessageSquare, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../chatTypes';
import type { TrackPoint } from '../types';

/* ============================================================
   SYSTEM PROMPT (FINAL VERSION)
   ============================================================ */
const SYSTEM_PROMPT = `
You are Flight Analyst AI — an expert aviation operations assistant specializing in:
- flight path interpretation
- anomaly detection (multi-layer models)
- ADS-B / Mode-S reasoning
- location inference from coordinates
- explaining flight behavior in simple, human terms

You receive:
1. JSON anomaly analysis from multiple AI models
2. Flight path data: lat/lon/altitude/speed/heading/timestamps

Your job is to explain the flight as a real flight operations analyst would.

============================================================
### LOCATION RULES
============================================================

• You ARE allowed to infer location from coordinates:
  - country
  - region
  - nearby city
  - likely airport area

• If referring to airports:
  - Use the airport name only.
  - Do NOT invent or guess ICAO/IATA codes unless explicitly provided.

• When the user asks ONLY about:
  “start country”, “where is this”, “which region”, “starting point”
  → Answer in **one short sentence**, no extra details.

  Example:
  “Egypt — the flight starts in the southern Sinai Peninsula.”

============================================================
### BEHAVIOR INTERPRETATION RULES
============================================================

Describe flight behavior ONLY when the user asks about:
- what happened
- abnormal behavior
- turns, climb, descent
- flight profile
- stability
- taxiing or ground movement

When describing behavior:
• Speak like an experienced flight ops analyst or pilot.
• Prefer simple, human phrasing:
  - “The aircraft eased into its climb…”
  - “The heading change was smooth and intentional…”
  - “Speed increased steadily as expected…”

• Base every interpretation on:
  - altitude trend
  - speed trend
  - heading direction
  - climb/descent continuity
  - spacing and timing of points
  - ground vs airborne behavior

Do NOT speculate beyond the data.

============================================================
### ANOMALY EXPLANATION RULES
============================================================

When the user asks “why is this an anomaly?” or similar:

1. **NEVER give machine-learning jargon.**  
   Do NOT say:  
   - “movement pattern was unusual”  
   - “the model detected a pattern difference”  
   - “embedding / cluster / vector / threshold”  

2. **Translate the anomaly into real operational terms**, such as:
   - unusual heading changes
   - inconsistent climb rate
   - speed fluctuations
   - irregular ground movement
   - timing that doesn’t match typical flight flows

3. ALWAYS anchor the explanation to something visible in the raw data.  
   Example:
   “The aircraft stayed at very low speed with small heading shifts for longer than typical before takeoff, then transitioned sharply into the climb.”

4. If multiple models disagree:
   • Explain this as a **subtle or borderline irregularity**, not a safety concern.

5. If no operational anomaly is visible:
   • Say so directly:
     “There is no clear behavioral anomaly in the flight data; this is likely a statistical or pattern-based flag.”

============================================================
### ANSWER LENGTH RULES
============================================================

• Simple question → simple answer.
• Location-only questions → **max 1–2 sentences**.
• Behavior questions → **3–6 sentences**, concise and readable.
• Detailed analysis is allowed ONLY if the user explicitly asks.
• Never exceed ~120 words unless the user requests deep analysis.
• Do NOT generate long multi-section breakdowns unless asked.

============================================================
### TONE & STYLE RULES
============================================================

• Sound human, confident, and professional — like a flight operations analyst.
• Avoid robotic or overly formal phrasing.
• Use clear, conversational language.
• Be direct, helpful, and avoid unnecessary detail.
• If uncertain, say:
  “Based on the available data, the most likely interpretation is…”

============================================================
### CORE PRINCIPLES
============================================================

• No hallucinations.
• No invented facts.
• Always rely on the flight data provided.
• Match depth to the user question.
• Safety-critical statements must be cautious and grounded.


`;

interface ChatInterfaceProps {
  data: any | null;
  flightId: string;
  flightPoints: TrackPoint[];
}

const TypewriterText: React.FC<{ text: string; shouldAnimate: boolean }> = ({ text, shouldAnimate }) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? '' : text);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (!shouldAnimate) {
        setDisplayedText(text);
        return;
    }
    
    if (hasAnimatedRef.current) return;

    setDisplayedText('');
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText((_prev) => text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        hasAnimatedRef.current = true;
      }
    }, 15);

    return () => clearInterval(timer);
  }, [text, shouldAnimate]);

  return <span>{displayedText}</span>;
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ data, flightId, flightPoints }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '👋 Hi! I can help you analyze this flight. Ask me anything about the flight path or anomalies.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);


  /* ============================================================
     Compression of Points
     (Your original logic, cleaned & simplified)
     ============================================================ */
  const filterPoints = (points: TrackPoint[]) => {
    // Bounds from anomaly_pipeline.py / monitor.py
    const B = {
        north: 34.597042,
        south: 28.536275,
        west: 32.299805,
        east: 37.397461
    };

    const inBox = (p: TrackPoint) => 
        p.lat >= B.south && p.lat <= B.north &&
        p.lon >= B.west && p.lon <= B.east;

    const final: any[] = [];
    let buffer: TrackPoint[] = [];
    
    const flush = () => {
        if (buffer.length >= 40) {
            const chunk = buffer.slice(0, 40);
            // Calculate Average
            const avg = {
                lat: chunk.reduce((s, x) => s + x.lat, 0) / 40,
                lon: chunk.reduce((s, x) => s + x.lon, 0) / 40,
                alt: chunk.reduce((s, x) => s + x.alt, 0) / 40,
                gspeed: chunk.reduce((s, x) => s + (x.gspeed || 0), 0) / 40,
                track: chunk.reduce((s, x) => s + (x.track || 0), 0) / 40,
                timestamp: Math.round(chunk.reduce((s, x) => s + x.timestamp, 0) / 40),
                flight_id: flightId
            };
            final.push({
                lat: Number(avg.lat.toFixed(5)),
                lon: Number(avg.lon.toFixed(5)),
                alt: Number(avg.alt.toFixed(1)),
                timestamp: avg.timestamp,
                gspeed: Number(avg.gspeed.toFixed(1)),
                track: Number(avg.track.toFixed(1)),
                flight_id: flightId
            });
        }
        buffer = [];
    };
    
    for (const p of points) {
        if (inBox(p)) {
            flush();
            final.push({
                lat: p.lat,
                lon: p.lon,
                alt: p.alt,
                timestamp: p.timestamp,
                gspeed: p.gspeed || 0.0,
                track: p.track || 0.0,
                flight_id: p.flight_id || flightId
            });
        } else {
            buffer.push(p);
        }
    }
    flush();
    
    return final;
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;
  
    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
  
    try {
      const OPENAI_KEY = "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";
  
      // Compress flight points
      const pointsData = filterPoints(flightPoints);
  
      // Slim anomaly data
      const slim = data ? {
        layer_1_rules: data.layer_1_rules,
        layer_2_xgboost: data.layer_2_xgboost,
        layer_3_deep_dense: data.layer_3_deep_dense,
        layer_4_deep_cnn: data.layer_4_deep_cnn,
        layer_5_transformer: data.layer_5_transformer,
        summary: {
          ...data.summary,
          flight_path: undefined // remove if exists
        }
      } : null;
  
      if (slim?.layer_1_rules?.report?.evaluations) {
        delete slim.layer_1_rules.report.evaluations;
      }
  
      // Build final payload
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.3,
          max_tokens: 600,
          messages: [
            // 1) System prompt
            { role: "system", content: SYSTEM_PROMPT },
  
            // 2) Chat history (already contains user message)
            ...messages.map(m => ({ role: m.role, content: m.content })),
  
            // 3) Inject flight data WITH the question (critical!)
            {
              role: "user",
              content: JSON.stringify({
                flight_id: flightId,
                analysis: slim,
                points: pointsData
              })
            },
  
            // 4) The actual user question (you MUST keep this last)
            { role: "user", content: userMsg.content }
          ]
        })
      });
  
      if (!response.ok) {
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }
  
      const json = await response.json();
      const aiMsg = json.choices[0].message;
  
      setMessages(prev => [...prev, { role: "assistant", content: aiMsg.content }]);
  
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I encountered an error: ${err.message}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-16 w-16 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-blue-700 transition-all z-50 hover:scale-110 backdrop-blur-sm"
      >
        <MessageSquare className="h-8 w-8" />
      </button>
    );
  }

  return (
    <div className="
      fixed bottom-6 right-6 
      w-[420px] h-[620px]
      max-h-[80vh] max-w-[90vw]
      rounded-3xl border border-white/20 shadow-2xl z-50 overflow-hidden
      bg-white/80 dark:bg-gray-900/80 
      backdrop-blur-xl
      animate-in slide-in-from-bottom-4 fade-in duration-300
      flex flex-col
    ">
      
      <div className="flex items-center justify-between p-4 bg-primary text-white shadow-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h3 className="font-semibold">Flight Analyst AI</h3>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setMessages([
              { role: 'assistant', content: '👋 Hi! I can help you analyze this flight. Ask me anything about the flight path or anomalies.' }
            ])}
            className="hover:bg-white/20 p-2 rounded-lg transition-colors group"
            title="Clear Chat"
          >
            <Trash2 className="h-4 w-4 text-white/70 group-hover:text-white" />
          </button>
          <button 
            onClick={() => setIsOpen(false)} 
            className="hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx(
              "flex gap-3 items-start max-w-[85%]",
              msg.role === 'user' ? "self-end flex-row-reverse" : "self-start"
            )}
          >
            <div
              className={clsx(
                "h-9 w-9 rounded-full flex items-center justify-center shadow-md",
                msg.role === 'user'
                  ? "bg-blue-100 dark:bg-blue-800/50 text-blue-600"
                  : "bg-primary/10 text-primary"
              )}
            >
              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>

            <div
              className={clsx(
                "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap",
                msg.role === 'user'
                  ? "bg-primary text-white rounded-tr-none"
                  : "bg-white/90 dark:bg-gray-800/90 border border-gray-200/40 dark:border-gray-700/40 rounded-tl-none"
              )}
            >
              {msg.role === 'assistant' ? (
                <TypewriterText 
                    text={msg.content} 
                    shouldAnimate={i === messages.length - 1} 
                />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 items-start">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>

            <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white/50 dark:bg-gray-900/50 border-t border-gray-200/40 dark:border-gray-700/40 backdrop-blur-xl flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about the flight..."
          className="flex-1 px-4 py-2 rounded-xl bg-gray-100/80 dark:bg-gray-800/80 border-transparent focus:ring-2 focus:ring-primary/30 outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-3 rounded-xl bg-primary text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
};

