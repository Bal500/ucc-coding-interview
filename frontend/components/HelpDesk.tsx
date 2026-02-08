"use client";

import { useState, useRef, useEffect, SyntheticEvent } from 'react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  isSystem?: boolean;
}

export default function HelpDesk() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Üdvözlöm! Én az Ön AI asszisztense vagyok. Miben segíthetek ma?", sender: 'bot' }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const generateAIResponse = async (userText: string) => {
    setIsTyping(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      if (!response.ok) throw new Error("Hálózati hiba");

      const data = await response.json();
      const responseText = data.text;

      if (responseText && responseText.includes("HUMAN_TRANSFER")) {
        setMessages((prev) => [
          ...prev, 
          { id: Date.now(), text: "Értem, kapcsolom az egyik kollégát. Kis türelmet...", sender: 'bot', isSystem: true }
        ]);
      } else {
        setMessages((prev) => [
          ...prev, 
          { id: Date.now(), text: responseText, sender: 'bot' }
        ]);
      }

    } catch (error) {
      console.error("Chat Hiba:", error);
      setMessages((prev) => [
        ...prev, 
        { id: Date.now(), text: "Bocsi, most nem érem el a szervert. Próbáld később!", sender: 'bot', isSystem: true }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    
    setMessages((prev) => [...prev, { id: Date.now(), text: userMsg, sender: 'user' }]);
    setInputValue("");

    await generateAIResponse(userMsg);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      
      {/* 1. asszisztens megnyitasa */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-red-700 hover:bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 animate-bounce-slow group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 group-hover:rotate-12 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </button>
      )}

      {/* 2. chat */}
      {isOpen && (
        <div className="w-80 sm:w-96 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[500px] animate-in slide-in-from-bottom-10 fade-in duration-300">
          
          {/* header */}
          <div className="bg-gradient-to-r from-red-800 to-red-600 p-4 flex justify-between items-center shadow-md">
            <div>
              <h3 className="text-white font-bold text-sm">Ügyfélszolgálat (AI)</h3>
              <p className="text-red-100 text-xs flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span> Online
              </p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors">✖</button>
          </div>
          
          {/* uzenetek */}
          <div className="flex-1 p-4 overflow-y-auto bg-black space-y-3 scrollbar-thin scrollbar-thumb-zinc-700">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 text-sm leading-relaxed shadow-sm rounded-2xl ${
                    msg.isSystem 
                      ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 w-full text-center italic rounded-lg'
                      : msg.sender === 'user' 
                        ? 'bg-red-700 text-white rounded-tr-none' 
                        : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700'
                  }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {/* gepeles */}
            {isTyping && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-zinc-800 p-3 rounded-2xl rounded-tl-none border border-zinc-700 flex space-x-1 items-center h-8">
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-0"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-150"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-300"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* input */}
          <form onSubmit={handleSend} className="p-3 bg-zinc-900 border-t border-zinc-800 flex gap-2">
            <input 
              type="text"
              placeholder="Kérdezzen bátran..."
              className="flex-1 bg-black border border-zinc-700 rounded-full px-4 py-2 text-sm text-white focus:border-red-600 outline-none focus:ring-1 focus:ring-red-600 transition-all placeholder-zinc-600"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <button type="submit" disabled={!inputValue.trim()} className="bg-red-700 text-white p-2 rounded-full w-10 h-10 flex justify-center items-center hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              ➤
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
