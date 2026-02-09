"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface EventItem {
  id: number;
  title: string;
  date: string;
  description: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [showMFAModal, setShowMFAModal] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("username");
    
    if (!token) {
      router.push("/login");
    } else {
      setUser(storedUser);
      fetchEvents();
    }
  }, [router]);

  const fetchEvents = async () => {
    try {
      const res = await fetch("http://localhost:8000/events");
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("http://localhost:8000/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, date: newDate, description: newDesc }),
    });
    setNewTitle(""); setNewDate(""); setNewDesc("");
    fetchEvents();
  };

  const handleDelete = async (id: number) => {
    if(!confirm("Törlés?")) return;
    await fetch(`http://localhost:8000/events/${id}`, { method: "DELETE" });
    fetchEvents();
  };

  const startMfaSetup = async () => {
    const res = await fetch("http://localhost:8000/mfa/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user }),
    });
    const data = await res.json();
    setQrCode(data.qr_code);
    setShowMFAModal(true);
  };

  const verifyMfa = async () => {
    const res = await fetch("http://localhost:8000/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, code: verifyCode }),
    });

    if (res.ok) {
      alert("Sikeres aktiválás! A következő belépésnél már kérni fogja a kódot.");
      setIsMfaEnabled(true);
      setShowMFAModal(false);
    } else {
      alert("Hibás kód! Próbáld újra.");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans p-8 relative">
      
      {/* fejlec */}
      <header className="flex justify-between items-center mb-12 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Esemény<span className="text-red-600">Kezelő</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Belépve: <span className="text-white font-medium">{user}</span></p>
        </div>
        
        <div className="flex gap-3">
          {/* MFA gombja */}
          {!isMfaEnabled && (
            <button 
              onClick={startMfaSetup}
              className="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-400 rounded hover:bg-blue-900/50 transition-colors text-sm flex items-center gap-2"
            >
              🛡️ 2FA Bekapcsolása
            </button>
          )}

          <button onClick={handleLogout} className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded hover:border-red-600 text-sm text-white transition-colors">
            Kilépés
          </button>
        </div>
      </header>

      {/* tartalom */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* urlap */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-fit shadow-xl">
          <h2 className="text-xl font-bold mb-4 text-white">Új Esemény</h2>
          <form onSubmit={handleAddEvent} className="space-y-4">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white" placeholder="Cím" required />
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white" required />
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white h-24" placeholder="Leírás..." required />
            <button type="submit" className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded">Hozzáadás</button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {events.map((event) => (
              <div key={event.id} className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800 flex justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{event.title} <span className="text-xs font-normal text-zinc-500 ml-2">({event.date})</span></h3>
                  <p className="text-zinc-400 text-sm">{event.description}</p>
                </div>
                <button onClick={() => handleDelete(event.id)} className="text-zinc-600 hover:text-red-500">🗑️</button>
              </div>
            ))}
        </div>
      </main>

      {showMFAModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-white mb-4">Kétlépcsős Azonosítás</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Olvasd be ezt a QR kódot a Google Authenticator alkalmazással:
            </p>
            
            {/* QR kod */}
            <div className="bg-white p-4 rounded-xl inline-block mb-6">
              {qrCode && <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48" />}
            </div>

            <input 
              type="text" 
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Írd be a 6-jegyű kódot"
              className="w-full p-3 bg-black border border-zinc-600 rounded text-center text-white text-xl tracking-widest mb-4 focus:border-blue-500 outline-none"
            />

            <div className="flex gap-3">
              <button 
                onClick={() => setShowMFAModal(false)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors"
              >
                Mégse
              </button>
              <button 
                onClick={verifyMfa}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors"
              >
                Aktiválás
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
