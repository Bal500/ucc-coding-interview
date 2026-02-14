"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function HelpDesk() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Session ID kezelés (Vendég vs. Bejelentkezett)
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    // 1. Megnézzük, van-e bejelentkezett user
    const storedUser = localStorage.getItem("username");
    if (storedUser) {
        setSessionId(storedUser);
    } else {
        // 2. Ha nincs, megnézzük van-e már elmentett Guest ID
        let guestId = localStorage.getItem("guest_session_id");
        if (!guestId) {
            // 3. Ha nincs, generálunk egyet
            guestId = "guest_" + Math.random().toString(36).substring(2, 9);
            localStorage.setItem("guest_session_id", guestId);
        }
        setSessionId(guestId);
    }
  }, []);

  const fetchMessages = async () => {
    if (!sessionId) return;
    try {
      // Itt már nem kell Auth fejléc, csak a session_id az URL-ben
      const res = await fetch(`https://localhost:8000/chat/history/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 3000); // Polling
      return () => clearInterval(interval);
    }
  }, [isOpen, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;
    
    const tempMsg = { sender: "user", message: input, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, tempMsg]);
    const txt = input;
    setInput("");

    // Új endpoint hívás (Auth nélkül, body-ban a session_id)
    await fetch("https://localhost:8000/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: txt })
    });
    
    fetchMessages();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="bg-zinc-900 border border-zinc-700 w-80 h-96 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4"
          >
            <div className="bg-zinc-800 p-3 border-b border-zinc-700 flex justify-between items-center">
              <span className="font-bold text-white text-sm">
                💬 Helpdesk {sessionId.startsWith("guest") ? "(Vendég)" : ""}
              </span>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/50">
              {messages.length === 0 && <p className="text-zinc-500 text-xs text-center">AI Asszisztens online.<br/>Írj be valamit!</p>}
              
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-2 rounded-lg text-sm ${
                    msg.sender === "user" ? "bg-red-700 text-white rounded-br-none" : 
                    msg.sender === "admin" ? "bg-blue-600 text-white rounded-bl-none border border-blue-400" : 
                    "bg-zinc-800 text-zinc-200 rounded-bl-none"
                  }`}>
                    {msg.sender === "admin" && <div className="text-[10px] font-bold text-blue-200 mb-1">SUPPORT</div>}
                    {msg.sender === "bot" && <div className="text-[10px] font-bold text-purple-400 mb-1">AI</div>}
                    {msg.message}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-zinc-800 border-t border-zinc-700 flex gap-2">
              <input
                className="flex-1 bg-black border border-zinc-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-red-500"
                placeholder="Üzenet..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button onClick={sendMessage} className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">Küldés</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-red-700 hover:bg-red-600 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 flex items-center justify-center"
      >
        {isOpen ? "✕" : "💬"}
      </button>
    </div>
  );
}
