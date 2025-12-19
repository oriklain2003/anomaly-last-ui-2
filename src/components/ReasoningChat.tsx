import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, ChevronRight, ChevronLeft, Trash2, Plane, Bot, MonitorUp, MonitorOff, Eye, Camera, Clock, ScanEye, Globe, Target, StopCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../chatTypes';
import type { AnomalyReport, TrackPoint, AIReasoningResponse } from '../types';
import { sendReasoningQuery, analyzeWithAI } from '../api';
import { TypewriterMarkdown } from '../utils/markdown';
import { useLanguage } from '../contexts/LanguageContext';
import { stripDataUrlPrefix } from '../utils/screenshot';
import { parseActionsFromResponse, stripActionsFromText, processActions, type ProcessedActions } from '../utils/aiActions';

interface ReasoningChatProps {
    isOpen: boolean;
    onToggle: () => void;
    onFlightsReceived: (flights: AnomalyReport[]) => void;
    onAIActions?: (actions: ProcessedActions) => void;
    selectedFlight?: {
        flightId: string;
        callsign?: string;
        points: TrackPoint[];
        report?: any;
    } | null;
    className?: string;
}

type ChatMode = 'general' | 'current';

export const ReasoningChat: React.FC<ReasoningChatProps> = ({
    isOpen,
    onToggle,
    onFlightsReceived,
    onAIActions,
    selectedFlight,
    className
}) => {
    const { isHebrewAnalyst, analystLanguage } = useLanguage();
    const [chatMode, setChatMode] = useState<ChatMode>('general');
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: isHebrewAnalyst 
            ? '✈️ **עוזר AI לטיסות**\n\n**חיפוש טיסות:**\n• "חריגות סיבוב מהשבוע האחרון"\n• "Go-arounds מאתמול"\n\n**שאלות כלליות:**\n• "מהו שדה LLBG?"'
            : '✈️ **AI Flight Assistant**\n\n**Search flights:**\n• "Turn anomalies from last week"\n• "Go-arounds yesterday"\n\n**General questions:**\n• "What airport is LLBG?"' 
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [responseLength, setResponseLength] = useState<'short' | 'medium' | 'long'>('medium');
    const abortControllerRef = useRef<AbortController | null>(null);
    
    // Screen sharing state (for current flight mode)
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
    const [lastCaptureTime, setLastCaptureTime] = useState<Date | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [captureCountdown, setCaptureCountdown] = useState(5);
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    // Reset messages when mode changes
    useEffect(() => {
        if (chatMode === 'general') {
            setMessages([
                { role: 'assistant', content: isHebrewAnalyst 
                    ? '✈️ **עוזר AI לטיסות**\n\n**חיפוש טיסות:**\n• "חריגות סיבוב מהשבוע האחרון"\n• "Go-arounds מאתמול"\n\n**שאלות כלליות:**\n• "מהו שדה LLBG?"'
                    : '✈️ **AI Flight Assistant**\n\n**Search flights:**\n• "Turn anomalies from last week"\n• "Go-arounds yesterday"\n\n**General questions:**\n• "What airport is LLBG?"' 
                }
            ]);
        } else {
            setMessages([
                { role: 'assistant', content: isHebrewAnalyst 
                    ? '👁️ **אנליסט טיסה נוכחית**\n\nאני מנתח את הטיסה שנבחרה. שתף את המסך שלך לניתוח חזותי, או שאל שאלות על הטיסה הנוכחית.'
                    : '👁️ **Current Flight Analyst**\n\nI analyze the selected flight. Share your screen for visual analysis, or ask questions about the current flight.'
                }
            ]);
        }
    }, [chatMode, isHebrewAnalyst]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopScreenSharing();
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    // ============================================================
    // Screen Sharing with Continuous Capture
    // ============================================================

    const captureFrame = useCallback(() => {
        if (!videoRef.current || !screenStreamRef.current) return;
        
        const video = videoRef.current;
        if (video.readyState < 2) return;
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                ctx.drawImage(video, 0, 0);
                const screenshot = canvas.toDataURL('image/png');
                setLatestScreenshot(screenshot);
                setLastCaptureTime(new Date());
            }
        } catch (e) {
            console.error('Failed to capture frame:', e);
        }
    }, []);

    const startScreenSharing = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser'
                } as MediaTrackConstraints,
                audio: false
            });
            
            screenStreamRef.current = stream;
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            await video.play();
            videoRef.current = video;
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            captureFrame();
            setCaptureCountdown(5);
            
            countdownIntervalRef.current = setInterval(() => {
                setCaptureCountdown(prev => {
                    if (prev <= 1) {
                        captureFrame();
                        return 5;
                    }
                    return prev - 1;
                });
            }, 1000);
            
            setIsScreenSharing(true);
            
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenSharing();
            });
            
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: isHebrewAnalyst 
                    ? "✅ שיתוף מסך פעיל! אני מצלם כל 5 שניות. שאל אותי על מה שאתה רואה במפה."
                    : "✅ Screen sharing active! I'm capturing every 5 seconds. Ask me about anything you see on the map."
            }]);
            
        } catch (e) {
            console.error('Screen sharing failed:', e);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: isHebrewAnalyst 
                    ? "שיתוף המסך בוטל. לחץ על 'שתף מסך' כשתהיה מוכן."
                    : "Screen sharing was cancelled. Click 'Share Screen' when you're ready."
            }]);
        }
    };

    const stopScreenSharing = () => {
        if (captureIntervalRef.current) {
            clearInterval(captureIntervalRef.current);
            captureIntervalRef.current = null;
        }
        
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }
        
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
            videoRef.current = null;
        }
        
        setIsScreenSharing(false);
        setLatestScreenshot(null);
        setLastCaptureTime(null);
        setCaptureCountdown(5);
    };
    
    const captureNow = useCallback(() => {
        if (isScreenSharing) {
            captureFrame();
            setCaptureCountdown(5);
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
            countdownIntervalRef.current = setInterval(() => {
                setCaptureCountdown(prev => {
                    if (prev <= 1) {
                        captureFrame();
                        return 5;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [isScreenSharing, captureFrame]);

    const toggleScreenSharing = () => {
        if (isScreenSharing) {
            stopScreenSharing();
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: isHebrewAnalyst 
                    ? "שיתוף המסך הופסק. לחץ על 'התחל שיתוף' כדי להמשיך."
                    : "Screen sharing stopped. Click 'Start Sharing' to resume."
            }]);
        } else {
            startScreenSharing();
        }
    };

    // ============================================================
    // Send Message
    // ============================================================

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || loading) return;

        const screenshotToSend = chatMode === 'current' ? latestScreenshot : null;

        const userMsg: ChatMessage = { 
            role: 'user', 
            content: input
        };
        
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            if (chatMode === 'current' && selectedFlight) {
                // Use the flight analyst API (same as AnalysisPanel)
                const historyToSend = messages
                    .map(m => ({ role: m.role, content: m.content }));

                const response = await analyzeWithAI({
                    screenshot: screenshotToSend ? stripDataUrlPrefix(screenshotToSend) : '',
                    question: input,
                    flight_id: selectedFlight.flightId,
                    flight_data: selectedFlight.points,
                    anomaly_report: selectedFlight.report,
                    history: historyToSend,
                    length: responseLength,
                    language: analystLanguage
                }, signal);

                const actions = response.actions || parseActionsFromResponse(response.response);
                const cleanedText = actions.length > 0 
                    ? stripActionsFromText(response.response) 
                    : response.response;

                // Process and apply AI actions to highlight the map
                if (actions.length > 0 && onAIActions && selectedFlight?.points) {
                    const processedActions = processActions(actions, selectedFlight.points);
                    
                    // Auto-calculate zoom bounds if we have highlights but no explicit zoom
                    if (!processedActions.zoomBounds) {
                        const points = selectedFlight.points;
                        
                        if (processedActions.highlightedSegment) {
                            // Calculate bbox from segment points
                            const { startIndex, endIndex } = processedActions.highlightedSegment;
                            const start = Math.max(0, startIndex);
                            const end = Math.min(points.length - 1, endIndex);
                            const segmentPoints = points.slice(start, end + 1);
                            
                            if (segmentPoints.length > 0) {
                                const lats = segmentPoints.map(p => p.lat);
                                const lons = segmentPoints.map(p => p.lon);
                                const padding = 0.01; // ~1km padding
                                processedActions.zoomBounds = {
                                    north: Math.max(...lats) + padding,
                                    south: Math.min(...lats) - padding,
                                    east: Math.max(...lons) + padding,
                                    west: Math.min(...lons) - padding
                                };
                            }
                        } else if (processedActions.highlightedPoint) {
                            // Calculate bbox around the single point
                            const { lat, lon } = processedActions.highlightedPoint;
                            const padding = 0.02; // ~2km padding for single point
                            processedActions.zoomBounds = {
                                north: lat + padding,
                                south: lat - padding,
                                east: lon + padding,
                                west: lon - padding
                            };
                        }
                    }
                    
                    onAIActions(processedActions);
                }

                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: cleanedText
                }]);

            } else {
                // Use the general reasoning API
                const flightContext = selectedFlight && selectedFlight.points.length >= 2 ? {
                    flightId: selectedFlight.flightId,
                    points: selectedFlight.points,
                    anomalyReport: selectedFlight.report
                } : undefined;

                const response: AIReasoningResponse = await sendReasoningQuery(
                    input,
                    messages.filter(m => m.role !== 'system'),
                    flightContext,
                    signal
                );

                if (response.type === 'flights' && response.flights && response.flights.length > 0) {
                    onFlightsReceived(response.flights);
                    
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `${response.response}\n\n✨ ${isHebrewAnalyst ? `נמצאו ${response.flights?.length} טיסות - בדוק את לשונית **תוצאות AI** בסרגל הצד.` : `Found ${response.flights?.length} flight(s) - check the **AI Results** tab in the sidebar to view them.`}`
                    }]);
                } else {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: response.response
                    }]);
                }
            }

        } catch (err: any) {
            // Don't show error message if request was cancelled
            if (err.name === 'AbortError') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: isHebrewAnalyst ? '⏹️ הבקשה בוטלה.' : '⏹️ Request cancelled.'
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `${isHebrewAnalyst ? 'מצטער, נתקלתי בשגיאה:' : 'Sorry, I encountered an error:'} ${err.message}`
                }]);
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const clearChat = () => {
        if (chatMode === 'general') {
            setMessages([
                { role: 'assistant', content: isHebrewAnalyst 
                    ? '✈️ **עוזר AI לטיסות**\n\n**חיפוש טיסות:**\n• "חריגות סיבוב מהשבוע האחרון"\n• "Go-arounds מאתמול"\n\n**שאלות כלליות:**\n• "מהו שדה LLBG?"'
                    : '✈️ **AI Flight Assistant**\n\n**Search flights:**\n• "Turn anomalies from last week"\n• "Go-arounds yesterday"\n\n**General questions:**\n• "What airport is LLBG?"' 
                }
            ]);
        } else {
            setMessages([
                { role: 'assistant', content: isScreenSharing 
                    ? (isHebrewAnalyst ? "הצ'אט נוקה! עדיין צופה במסך שלך - שאל אותי כל דבר." : "Chat cleared! Still watching your screen - ask me anything.")
                    : (isHebrewAnalyst 
                        ? '👁️ **אנליסט טיסה נוכחית**\n\nאני מנתח את הטיסה שנבחרה. שתף את המסך שלך לניתוח חזותי, או שאל שאלות על הטיסה הנוכחית.'
                        : '👁️ **Current Flight Analyst**\n\nI analyze the selected flight. Share your screen for visual analysis, or ask questions about the current flight.')
                }
            ]);
        }
    };

    // Collapsed state - show expand tab
    if (!isOpen) {
        return (
            <button
                onClick={onToggle}
                className={clsx(
                    "fixed right-0 top-1/2 -translate-y-1/2 z-40",
                    "flex items-center gap-2 px-2 py-4",
                    "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
                    "rounded-l-xl shadow-lg hover:shadow-xl",
                    "transition-all hover:px-3",
                    className
                )}
            >
                <ChevronLeft className="h-5 w-5" />
                <div className="flex flex-col items-center gap-1">
                    <Bot className="h-5 w-5" />
                    <span className="text-xs font-bold writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                        {isHebrewAnalyst ? 'עוזר AI' : 'AI Assistant'}
                    </span>
                </div>
            </button>
        );
    }

    return (
        <div className={clsx(
            "flex flex-col h-full bg-surface rounded-xl border border-white/10 overflow-hidden",
            "animate-in slide-in-from-right-4 duration-300",
            className
        )}>
            {/* Header */}
            <div className="border-b border-white/10 bg-surface-highlight/50">
                {/* Title Row */}
                <div className="p-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                            <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold flex items-center gap-2">
                                {isHebrewAnalyst ? "עוזר AI" : "AI Assistant"}
                            </h3>
                            <p className="text-xs text-white/60">
                                {chatMode === 'general' 
                                    ? (isHebrewAnalyst ? "חיפוש, ניתוח ושאלות" : "Search, analyze & ask questions")
                                    : (isHebrewAnalyst ? "ניתוח טיסה נוכחית" : "Current flight analysis")
                                }
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={clearChat}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors group"
                            title={isHebrewAnalyst ? "נקה צ'אט" : "Clear Chat"}
                        >
                            <Trash2 className="h-4 w-4 text-white/50 group-hover:text-white" />
                        </button>
                        <button 
                            onClick={onToggle}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                            title={isHebrewAnalyst ? "כווץ פאנל" : "Collapse Panel"}
                        >
                            <ChevronRight className="h-5 w-5 text-white/70" />
                        </button>
                    </div>
                </div>
                
                {/* Mode Toggle Switch */}
                <div className="px-4 pb-3">
                    <div className="flex items-center gap-1 p-1 bg-black/30 rounded-xl">
                        <button
                            onClick={() => setChatMode('general')}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                                chatMode === 'general'
                                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                            )}
                        >
                            <Globe className="h-4 w-4" />
                            <span>{isHebrewAnalyst ? "כללי" : "General"}</span>
                        </button>
                        <button
                            onClick={() => setChatMode('current')}
                            disabled={!selectedFlight}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                                chatMode === 'current'
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/5",
                                !selectedFlight && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            <Target className="h-4 w-4" />
                            <span>{isHebrewAnalyst ? "טיסה נוכחית" : "Current"}</span>
                            {selectedFlight && chatMode !== 'current' && (
                                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Flight Context Banner */}
            {selectedFlight && (
                <div className={clsx(
                    "px-4 py-2 border-b flex items-center justify-between transition-colors duration-200",
                    chatMode === 'current' 
                        ? "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/20"
                        : "bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20"
                )}>
                    <div className="flex items-center gap-2">
                        <Plane className={clsx("h-4 w-4", chatMode === 'current' ? "text-cyan-400" : "text-amber-400")} />
                        <span className="text-xs text-white/90">
                            <span className="text-white font-bold">{selectedFlight.callsign || selectedFlight.flightId}</span>
                        </span>
                    </div>
                    <span className={clsx("text-[10px]", chatMode === 'current' ? "text-cyan-300/70" : "text-amber-300/70")}>
                        {chatMode === 'current' 
                            ? (isHebrewAnalyst ? "מנתח טיסה זו" : "Analyzing this flight")
                            : (isHebrewAnalyst ? "טיסה נבחרה" : "Flight selected")
                        }
                    </span>
                </div>
            )}

            {/* Screen Sharing Status Bar - Only for Current mode */}
            {chatMode === 'current' && isScreenSharing && (
                <div className="px-4 py-3 bg-gradient-to-r from-green-500/10 to-cyan-500/10 border-b border-green-500/20">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Eye className="size-4 text-green-400" />
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-ping" />
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                            </div>
                            <span className="text-xs text-green-300 font-bold">LIVE</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={captureNow}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-medium hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
                                title={isHebrewAnalyst ? "צלם כעת" : "Capture now"}
                            >
                                <Camera className="size-3" />
                                {isHebrewAnalyst ? "צלם" : "Capture"}
                            </button>
                            <div className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-white/60 text-[10px]">
                                <Clock className="size-3" />
                                <span className="font-mono w-3 text-center">{captureCountdown}</span>s
                            </div>
                        </div>
                    </div>
                    {latestScreenshot && (
                        <div className="relative group">
                            <img 
                                src={latestScreenshot} 
                                alt="Latest capture" 
                                className="w-full h-20 object-cover rounded-lg border border-white/10 opacity-90 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/70">
                                {lastCaptureTime?.toLocaleTimeString()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={clsx(
                            "flex gap-3 items-start max-w-[90%]",
                            // For user messages: align to end, for assistant: align to start
                            // In RTL mode, don't use flex-row-reverse as RTL already handles direction
                            msg.role === 'user' 
                                ? isHebrewAnalyst 
                                    ? "self-start" // In RTL, start is on the right
                                    : "self-end flex-row-reverse" 
                                : isHebrewAnalyst 
                                    ? "self-end flex-row-reverse" // In RTL, bot messages go to left (end)
                                    : "self-start"
                        )}
                    >
                        <div
                            className={clsx(
                                "h-8 w-8 rounded-full flex items-center justify-center shadow-md shrink-0",
                                msg.role === 'user'
                                    ? "bg-primary/20 text-primary"
                                    : chatMode === 'current'
                                        ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400"
                                        : "bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400"
                            )}
                        >
                            {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>

                        <div
                            className={clsx(
                                "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                                msg.role === 'user'
                                    ? clsx(
                                        "bg-primary text-white whitespace-pre-wrap",
                                        // Round the corner where the avatar is
                                        isHebrewAnalyst ? "rounded-tl-none" : "rounded-tr-none"
                                    )
                                    : clsx(
                                        "bg-white/5 border border-white/10 text-white/90",
                                        // Round the corner where the avatar is
                                        isHebrewAnalyst ? "rounded-tr-none" : "rounded-tl-none"
                                    )
                            )}
                            dir={isHebrewAnalyst ? "rtl" : "ltr"}
                        >
                            {msg.role === 'assistant' ? (
                                <TypewriterMarkdown 
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
                    <div className={clsx(
                        "flex gap-3 items-start",
                        // Loading indicator is for assistant, so same positioning as assistant messages
                        isHebrewAnalyst ? "self-end flex-row-reverse" : "self-start"
                    )}>
                        <div className={clsx(
                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                            chatMode === 'current'
                                ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20"
                                : "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
                        )}>
                            <Bot className={clsx(
                                "h-4 w-4 animate-pulse",
                                chatMode === 'current' ? "text-cyan-400" : "text-amber-400"
                            )} />
                        </div>

                        <div className={clsx(
                            "px-4 py-3 rounded-2xl bg-white/5 border border-white/10 shadow-sm",
                            isHebrewAnalyst ? "rounded-tr-none" : "rounded-tl-none"
                        )}>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className={clsx(
                                        "w-2 h-2 rounded-full animate-bounce",
                                        chatMode === 'current' ? "bg-cyan-400" : "bg-amber-400"
                                    )} style={{ animationDelay: '0ms' }}></span>
                                    <span className={clsx(
                                        "w-2 h-2 rounded-full animate-bounce",
                                        chatMode === 'current' ? "bg-cyan-400" : "bg-amber-400"
                                    )} style={{ animationDelay: '150ms' }}></span>
                                    <span className={clsx(
                                        "w-2 h-2 rounded-full animate-bounce",
                                        chatMode === 'current' ? "bg-cyan-400" : "bg-amber-400"
                                    )} style={{ animationDelay: '300ms' }}></span>
                                </div>
                                <span className="text-xs text-white/50">
                                    {isHebrewAnalyst ? "חושב..." : "Thinking..."}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-white/10 bg-surface-highlight/30">
                {/* Length Switch - Compact */}
                <div className="flex justify-end mb-2">
                    <div className="flex items-center gap-2 bg-black/20 rounded-lg p-0.5 px-2">
                        <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">
                            {isHebrewAnalyst ? "גודל הודעה" : "Message Size"}
                        </span>
                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                        <div className="flex gap-0.5">
                            {(['short', 'medium', 'long'] as const).map((len) => (
                                <button
                                    key={len}
                                    onClick={() => setResponseLength(len)}
                                    className={clsx(
                                        "w-6 h-6 flex items-center justify-center text-[10px] font-bold rounded transition-all",
                                        responseLength === len
                                            ? chatMode === 'current'
                                                ? "bg-cyan-500 text-white shadow-sm scale-110"
                                                : "bg-amber-500 text-white shadow-sm scale-110"
                                            : "text-white/30 hover:text-white/60 hover:bg-white/5"
                                    )}
                                    title={`${len.charAt(0).toUpperCase() + len.slice(1)} response`}
                                >
                                    {len.charAt(0).toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
   
                {/* Screen Sharing Toggle - Only for Current mode */}
                {chatMode === 'current' && (
                    <>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={toggleScreenSharing}
                                disabled={!selectedFlight}
                                className={clsx(
                                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                                    !selectedFlight && "opacity-40 cursor-not-allowed",
                                    isScreenSharing
                                        ? "bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-300 border border-green-500/40 hover:from-red-500/20 hover:to-red-600/20 hover:text-red-300 hover:border-red-500/40"
                                        : "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 hover:from-cyan-500/30 hover:to-blue-500/30"
                                )}
                            >
                                {isScreenSharing ? (
                                    <>
                                        <MonitorOff className="size-4" />
                                        {isHebrewAnalyst ? "הפסק שיתוף" : "Stop Sharing"}
                                    </>
                                ) : (
                                    <>
                                        <MonitorUp className="size-4" />
                                        {isHebrewAnalyst ? "שתף מסך" : "Share Screen"}
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Hint when not sharing in current mode */}
                        {!isScreenSharing && selectedFlight && (
                            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20" dir={isHebrewAnalyst ? "rtl" : "ltr"}>
                                <ScanEye className="size-4 text-cyan-400 shrink-0" />
                                <p className="text-[10px] text-cyan-300/80">
                                    {isHebrewAnalyst 
                                        ? "שתף את המסך כדי שאוכל לנתח את מה שאתה רואה"
                                        : "Share your screen so I can analyze what you're looking at"
                                    }
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* No flight selected hint for current mode */}
                {chatMode === 'current' && !selectedFlight && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20" dir={isHebrewAnalyst ? "rtl" : "ltr"}>
                        <Plane className="size-4 text-yellow-400 shrink-0" />
                        <p className="text-[10px] text-yellow-300/80">
                            {isHebrewAnalyst 
                                ? "בחר טיסה מהרשימה כדי להשתמש במצב זה"
                                : "Select a flight from the list to use this mode"
                            }
                        </p>
                    </div>
                )}

                {/* Text Input */}
                <form onSubmit={handleSend} className="flex gap-2" dir={isHebrewAnalyst ? "rtl" : "ltr"}>
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={
                            chatMode === 'current'
                                ? (isScreenSharing 
                                    ? (isHebrewAnalyst ? "מה אתה רואה במפה?" : "What do you see on the map?") 
                                    : (isHebrewAnalyst ? "שאל על הטיסה הנוכחית..." : "Ask about the current flight..."))
                                : (isHebrewAnalyst ? "חפש טיסות או שאל שאלה..." : "Search flights or ask a question...")
                        }
                        className={clsx(
                            "flex-1 px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none transition-all",
                            chatMode === 'current'
                                ? "focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                                : "focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20",
                            isHebrewAnalyst ? "text-right" : "text-left"
                        )}
                        disabled={loading || (chatMode === 'current' && !selectedFlight)}
                    />
                    {loading ? (
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="p-3 rounded-xl text-white transition-all bg-gradient-to-r from-red-500 to-red-600 hover:opacity-90"
                            title={isHebrewAnalyst ? "בטל בקשה" : "Cancel request"}
                        >
                            <StopCircle className="h-5 w-5" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!input.trim() || (chatMode === 'current' && !selectedFlight)}
                            className={clsx(
                                "p-3 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                                chatMode === 'current'
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90"
                                    : "bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90"
                            )}
                        >
                            <Send className="h-5 w-5" />
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};
