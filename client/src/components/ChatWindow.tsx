import React, { useState, useEffect, useRef } from "react";
import { 
  subscribeToMessages, 
  sendMessage, 
  markMessagesRead 
} from "../services/chatService";
import { useToast } from "@/hooks/use-toast";
import { isToday, isYesterday } from "date-fns";
import { toJSDate, safeFormat } from "@/lib/date-utils";
import { X, Send } from "lucide-react";

interface ChatWindowProps {
  chatId: string;
  currentUserId: string;
  currentUserRole: "driver" | "owner";
  currentUserName: string;
  recipientName: string;
  stationName: string;
  onClose: () => void;
  readOnly?: boolean;
}

const QUICK_REPLIES = {
  driver: [
    "Is the station open right now?",
    "Is CCS2 connector available?",
    "I am running 10 minutes late",
    "How do I start charging?",
    "Is parking available?",
    "What is the WiFi password?"
  ],
  owner: [
    "Yes, the station is ready for you",
    "Please arrive on time for your slot",
    "The connector is available and working",
    "Parking is available at the front",
    "Please call us if you need help",
    "Station is temporarily unavailable"
  ]
};

const ChatWindow: React.FC<ChatWindowProps> = ({
  chatId,
  currentUserId,
  currentUserRole,
  currentUserName,
  recipientName,
  stationName,
  onClose,
  readOnly = false
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSendTime, setLastSendTime] = useState<number>(0);
  const messageTimestamps = useRef<number[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // 1. Mark as read on mount
    markMessagesRead(chatId, currentUserRole);

    // 2. Subscribe to messages
    const unsubscribe = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      // Mark as read whenever new messages arrive while window is open
      markMessagesRead(chatId, currentUserRole);
    });

    return () => unsubscribe();
  }, [chatId, currentUserRole]);

  useEffect(() => {
    // Scroll to bottom on message change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const now = Date.now();
    
    // 1. Cooldown Check (2 seconds)
    if (now - lastSendTime < 2000) {
      toast({
        title: "Slow down",
        description: "Please wait a moment between messages.",
      });
      return;
    }

    // 2. Sliding Window Rate Limit (10 messages per minute)
    const oneMinuteAgo = now - 60000;
    messageTimestamps.current = messageTimestamps.current.filter(t => t > oneMinuteAgo);
    
    if (messageTimestamps.current.length >= 10) {
      toast({
        variant: "destructive",
        title: "Rate limit reached",
        description: "You've sent too many messages. Please wait a minute.",
      });
      return;
    }

    setSending(true);
    try {
      await sendMessage(
        chatId,
        currentUserId,
        currentUserRole,
        currentUserName,
        input.trim()
      );
      setInput("");
      setLastSendTime(Date.now());
      messageTimestamps.current.push(Date.now());
    } catch (err) {
      console.error("Chat send error:", err);
      toast({
        variant: "destructive",
        title: "Message failed",
        description: "Could not deliver your message. Please try again."
      });
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = toJSDate(timestamp);
    
    if (isToday(date)) {
      return safeFormat(date, "h:mm a");
    } else if (isYesterday(date)) {
      return `Yesterday ${safeFormat(date, "h:mm a")}`;
    } else {
      return safeFormat(date, "MMM dd");
    }
  };

  return (
    <div className="chat-window shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
      <style>{`
        .chat-window {
          display: flex;
          flex-direction: column;
          height: 480px;
          width: 360px;
          background: #0f172a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          overflow: hidden;
          color: white;
          z-index: 1000;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.02);
          flex-shrink: 0;
        }

        .chat-station-name {
          font-weight: 800;
          font-size: 14px;
          color: white;
          display: block;
          letter-spacing: -0.01em;
        }

        .chat-recipient-label {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .chat-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 12px;
          border: none;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .chat-close-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .chat-messages::-webkit-scrollbar {
          width: 4px;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }

        .msg-system {
          align-self: center;
          max-width: 90%;
          text-align: center;
          margin: 8px 0;
        }

        .msg-system span {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.05);
          padding: 4px 12px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .msg-sent {
          align-self: flex-end;
          max-width: 82%;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .msg-received {
          align-self: flex-start;
          max-width: 82%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .msg-bubble-text {
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
          word-break: break-word;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .msg-sent .msg-bubble-text {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          border-radius: 18px 18px 4px 18px;
        }

        .msg-received .msg-bubble-text {
          background: #1e293b;
          color: white;
          border-radius: 18px 18px 18px 4px;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .msg-time {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.3);
          margin-top: 4px;
          padding: 0 4px;
        }

        .msg-status {
          font-size: 9px;
          font-weight: 800;
          color: #22c55e;
          text-transform: uppercase;
          margin-left: 4px;
          opacity: 0.8;
        }

        .quick-replies {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 10px 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.01);
          scrollbar-width: none;
          flex-shrink: 0;
        }

        .quick-replies::-webkit-scrollbar {
          display: none;
        }

        .qr-chip {
          white-space: nowrap;
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.7);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .qr-chip:hover {
          border-color: #22c55e;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          transform: translateY(-1px);
        }

        .chat-input-row {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          background: #0f172a;
          border-top: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }

        .chat-input-field {
          flex: 1;
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          padding: 10px 14px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input-field:focus {
          border-color: #22c55e;
        }

        .chat-send-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #22c55e;
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(34,197,94,0.3);
        }

        .chat-send-btn:hover:not(:disabled) {
          background: #16a34a;
          transform: scale(1.05);
        }

        .chat-send-btn:disabled {
          opacity: 0.3;
          background: #1e293b;
          box-shadow: none;
          cursor: not-allowed;
        }

        .chat-readonly-banner {
          text-align: center;
          padding: 12px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .chat-char-count {
          font-size: 10px;
          font-weight: 800;
          color: rgba(255,255,255,0.2);
          margin-bottom: 4px;
          display: flex;
          justify-content: flex-end;
          padding-right: 16px;
          transition: color 0.2s;
        }

        .chat-char-count.warning {
          color: #f59e0b;
        }

        .chat-char-count.error {
          color: #ef4444;
        }
      `}</style>
      
      <div className="chat-header">
        <div>
          <span className="chat-station-name">{stationName}</span>
          <span className="chat-recipient-label">{recipientName}</span>
        </div>
        <button onClick={onClose} className="chat-close-btn">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => {
          if (msg.senderRole === "system") {
            return (
              <div key={msg.id || idx} className="msg-system">
                <span>{msg.text}</span>
              </div>
            );
          }

          const isMe = msg.senderId === currentUserId;
          return (
            <div key={msg.id || idx} className={isMe ? "msg-sent" : "msg-received"}>
              <div className="msg-bubble-text">
                {msg.text}
              </div>
              <div className="msg-time">
                {formatTime(msg.sentAt)}
                {isMe && <span className="msg-status">Sent</span>}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {!readOnly && (
        <>
          <div className="quick-replies">
            {QUICK_REPLIES[currentUserRole].map((reply, idx) => (
              <button 
                key={idx} 
                className="qr-chip"
                onClick={() => setInput(reply)}
              >
                {reply}
              </button>
            ))}
          </div>

          <div className="chat-char-count-row">
            <span className={`chat-char-count ${input.length > 450 ? 'error' : input.length > 400 ? 'warning' : ''}`}>
              {input.length}/500
            </span>
          </div>

          <div className="chat-input-row">
            <input 
              type="text" 
              className="chat-input-field" 
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              maxLength={500}
            />
            <button 
              className="chat-send-btn"
              disabled={!input.trim() || sending}
              onClick={handleSend}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </>
      )}

      {readOnly && (
        <div className="chat-readonly-banner">
          Session ended - Read only
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
