import React, { useState, useRef, useEffect } from "react";
import { handleUserMessage, ChatContext } from "@/utils/geminiChatbot";
import { 
  Send, X, Bot, Zap, MapPin, 
  Leaf, Calendar, Mic, MicOff, 
  Loader2, Sparkles, Navigation,
  ChevronDown, BarChart3, TrendingUp,
  Activity, Star
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import VoiceInputButton from "@/components/VoiceInputButton";

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
}

interface UserChatbotProps {
  chatContext: ChatContext;
  hideFab?: boolean;
}

const UserChatbot: React.FC<UserChatbotProps> = ({ chatContext, hideFab = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!chatContext) return null; // Safe guard
  
  const isOwner = chatContext.role === "owner";
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "bot",
      text: isOwner 
        ? `📈 Hello ${chatContext.fullName || "Owner"}! Ready to review your station performance or revenue today?`
        : `👋 Hi ${chatContext.fullName || "there"}! I'm your EV assistant. How can I help you with charging today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const quickChips = isOwner ? [
    { label: "Today's Revenue", icon: <TrendingUp className="w-3 h-3" /> },
    { label: "Station Status", icon: <Activity className="w-3 h-3" /> },
    { label: "Review Summary", icon: <Star className="w-3 h-3" /> },
    { label: "Peak Load Hours", icon: <BarChart3 className="w-3 h-3" /> },
  ] : [
    { label: "Find CCS2 near me", icon: <MapPin className="w-3 h-3" /> },
    { label: "Find all chargers near me", icon: <Zap className="w-3 h-3" /> },
    { label: "My next booking", icon: <Calendar className="w-3 h-3" /> },
    { label: "CO2 saved", icon: <Leaf className="w-3 h-3" /> },
    { label: "Plan a trip", icon: <Navigation className="w-3 h-3" /> },
  ];

  const handleSend = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await handleUserMessage(messageText, chatContext);
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        text: response,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error("Chatbot Error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <style>{`
        .user-chat-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 80vh;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 32px 32px 0 0;
          display: flex;
          flex-direction: column;
          z-index: 1000;
          box-shadow: 0 -20px 40px rgba(0, 0, 0, 0.4);
        }

        @media (min-width: 768px) {
          .user-chat-panel {
            bottom: 90px;
            right: 24px;
            left: auto;
            width: 380px;
            height: 520px;
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
        }

        .chat-messages-container::-webkit-scrollbar {
          width: 4px;
        }
        .chat-messages-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* FAB Button */}
      <AnimatePresence>
        {(!hideFab || isOpen) && (
          <motion.button
            key="chatbot-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "fixed right-4 md:bottom-8 md:right-8 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-[900] cursor-pointer overflow-hidden backdrop-blur-[20px] border",
              isOwner ? "bottom-24" : "bottom-[232px]",
              isOpen 
                ? "bg-[#0a0a0a]/80 text-white border-white/10" 
                : isOwner 
                  ? "bg-[#f59e0b]/80 text-white shadow-[#f59e0b]/20 border-[#f59e0b]/30" 
                  : "bg-[#22c55e]/80 text-white shadow-[#22c55e]/20 border-[#22c55e]/30"
            )}
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                  <X className="w-6 h-6 text-white" />
                </motion.div>
              ) : (
                <motion.div key="bot" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="relative">
                  {isOwner ? <BarChart3 className="w-7 h-7" /> : <Bot className="w-8 h-8" />}
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={cn(
                      "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2",
                      isOwner ? "bg-[#f59e0b] border-[#0a0a0a]" : "bg-[#22c55e] border-[#0a0a0a]"
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999] md:hidden"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="user-chat-panel"
            >
              {/* Header */}
              <div className={cn(
                "p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-transparent",
                isOwner ? "to-amber-500/10" : "to-primary/10"
              )}>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shadow-xl",
                    isOwner ? "bg-amber-500 shadow-amber-500/20" : "bg-primary shadow-primary/20"
                  )}>
                    {isOwner ? <TrendingUp className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-primary-foreground" />}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white tracking-tight">
                      {isOwner ? "Business Intelligence" : "EV Intelligence"}
                    </h3>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5",
                      isOwner ? "text-[#f59e0b]" : "text-[#22c55e]"
                    )}>
                      <Zap className={cn("w-3 h-3", isOwner ? "fill-[#f59e0b]" : "fill-[#22c55e]")} /> Powered by Gemini 2.5 Flash
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-white/50" />
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 chat-messages-container">
                {messages.map((msg) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={msg.id}
                    className={cn(
                      "max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed shadow-lg",
                      msg.role === "user"
                        ? cn("self-end rounded-tr-none px-5", isOwner ? "bg-[#f59e0b] text-white" : "bg-[#22c55e] text-white")
                        : "self-start bg-[rgba(255,255,255,0.05)] text-[#ffffff] rounded-tl-none border border-[rgba(255,255,255,0.1)] backdrop-blur-[20px]"
                    )}
                  >
                    {msg.text}
                  </motion.div>
                ))}
                
                {isTyping && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="self-start bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] p-4 rounded-3xl rounded-tl-none flex gap-1 items-center"
                  >
                    <Loader2 className={cn("w-4 h-4 animate-spin", isOwner ? "text-[#f59e0b]" : "text-[#22c55e]")} />
                    <span className="text-xs font-bold text-[rgba(255,255,255,0.60)] px-1">Analyzing...</span>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Chips */}
              <div className="px-6 py-4 flex gap-3 overflow-x-auto no-scrollbar border-t border-[rgba(255,255,255,0.1)] bg-[rgba(10,10,10,0.5)]">
                {quickChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => handleSend(chip.label)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-[#ffffff] text-[11px] font-black transition-all active:scale-95",
                      isOwner ? "hover:bg-[#f59e0b]/20 hover:border-[#f59e0b]/30" : "hover:bg-[#22c55e]/20 hover:border-[#22c55e]/30"
                    )}
                  >
                    {chip.icon}
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="p-6 pt-2 bg-[#0a0a0a]/80 backdrop-blur-[20px] border-t border-[rgba(255,255,255,0.1)] flex flex-col gap-2 pb-[max(24px,env(safe-area-inset-bottom))]">
                <div className="flex gap-3">
                  <VoiceInputButton
                    onTranscript={(text) => {
                      setInput(text);
                      setVoiceError(null);
                      setTimeout(() => handleSend(text), 500);
                    }}
                    onError={setVoiceError}
                    lang="en-IN"
                    className="w-12 h-12 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] rounded-2xl border border-[rgba(255,255,255,0.1)]"
                  />
                  
                  <div className="flex-1 relative">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSend()}
                    placeholder={isOwner ? "Ask Business Assistant..." : "Ask EV Assistant..."}
                    className="w-full h-12 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-2xl px-5 text-sm text-[#ffffff] placeholder-[rgba(255,255,255,0.35)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,255,255,0.2)] transition-all"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isTyping}
                    className={cn(
                      "absolute right-2 top-2 w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:grayscale",
                      isOwner ? "bg-[#f59e0b] text-[#ffffff] hover:bg-[#f59e0b]/90" : "bg-[#22c55e] text-[#ffffff] hover:bg-[#22c55e]/90"
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                </div>
                {voiceError && (
                  <p className="text-xs text-destructive px-1">{voiceError}</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default UserChatbot;
