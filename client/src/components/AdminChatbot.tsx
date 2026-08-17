import React, { useState, useRef, useEffect } from "react";
import { getAdminBotResponse, AdminData } from "@/utils/adminChatbot";
import { Send, X, Bot, Zap, TrendingUp, Users, ShieldAlert, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
}

interface AdminChatbotProps {
  platformData: AdminData;
}

const AdminChatbot: React.FC<AdminChatbotProps> = ({ platformData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "bot",
      text: `👋 Hi Admin! I can answer questions about your platform data.
Ask me about revenue, stations, users, or bookings!`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const quickChips = [
    { label: "Revenue this month?", icon: <TrendingUp className="w-3 h-3" /> },
    { label: "Pending approvals?", icon: <ShieldAlert className="w-3 h-3" /> },
    { label: "Active sessions?", icon: <Zap className="w-3 h-3" /> },
    { label: "Top station?", icon: <Award className="w-3 h-3" /> },
    { label: "User count?", icon: <Users className="w-3 h-3" /> },
  ];

  const handleSend = (text: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: messageText,
      timestamp: new Date(),
    };

    const botResponse = getAdminBotResponse(messageText, platformData);

    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "bot",
      text: botResponse,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
  };

  return (
    <>
      <style>{`
        .chat-panel {
          position: fixed;
          bottom: 90px;
          right: 24px;
          width: 380px;
          height: 520px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          z-index: 999;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .chat-messages::-webkit-scrollbar {
          width: 4px;
        }
        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }

        .quick-chips::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* FAB Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/40 z-[1000] border-none cursor-pointer"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-8 h-8" />}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="chat-panel"
          >
            {/* Header */}
            <div className="p-4 bg-indigo-600/10 border-b border-indigo-500/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-tight">Admin Assistant</h3>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Local Insight Engine</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed",
                    msg.role === "user"
                      ? "self-end bg-indigo-600 text-white rounded-tr-none px-4"
                      : "self-start bg-white/5 text-slate-200 rounded-tl-none border border-white/5 whitespace-pre-wrap"
                  )}
                >
                  {msg.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Chips */}
            <div className="px-4 py-2 flex gap-2 overflow-x-auto quick-chips border-t border-white/5">
              {quickChips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => handleSend(chip.label)}
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/20 transition-all active:scale-95"
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend("")}
                placeholder="Ask about revenue, stations..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              <button
                onClick={() => handleSend("")}
                className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminChatbot;
