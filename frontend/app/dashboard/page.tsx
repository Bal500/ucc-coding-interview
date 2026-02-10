"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Calendar, dateFnsLocalizer, View, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import hu from 'date-fns/locale/hu'; 
import "react-big-calendar/lib/css/react-big-calendar.css"; 

const locales = { 'hu': hu };
const localizer = dateFnsLocalizer({
  format, parse, startOfWeek, getDay, locales,
});

interface EventItem {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  description?: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource?: any;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [activeTab, setActiveTab] = useState<'list' | 'calendar'>('list');
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);

  // MFA
  const [showMFAModal, setShowMFAModal] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);

  // Navigáció
  const onNavigate = useCallback((newDate: Date) => setDate(newDate), [setDate]);
  const onView = useCallback((newView: View) => setView(newView), [setView]);

  // --- FORM ÁLLAPOTOK ---
  const [editId, setEditId] = useState<number | null>(null); // <--- EZ TÁROLJA, HOGY MIT SZERKESZTÜNK ÉPPEN
  const [newTitle, setNewTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newDesc, setNewDesc] = useState("");

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
      const data: EventItem[] = await res.json();
      setEvents(data);

      const formattedEvents: CalendarEvent[] = data.map(event => ({
        id: event.id,
        title: event.title,
        start: new Date(event.start_date),
        end: new Date(event.end_date),
        resource: event.description
      }));
      setCalendarEvents(formattedEvents);

    } catch (err) { console.error(err); }
  };

  // --- FORM SUBMIT (LÉTREHOZÁS VAGY MÓDOSÍTÁS) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (new Date(endDate) < new Date(startDate)) {
        alert("A befejezés nem lehet korábban, mint a kezdés!");
        return;
    }

    const payload = { 
        title: newTitle, 
        start_date: startDate, 
        end_date: endDate, 
        description: newDesc 
    };

    if (editId) {
        // --- MÓDOSÍTÁS (PUT) ---
        await fetch(`http://localhost:8000/events/${editId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        alert("Esemény sikeresen módosítva!");
    } else {
        // --- LÉTREHOZÁS (POST) ---
        await fetch("http://localhost:8000/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    
    // Reseteljük a formot és a szerkesztési módot
    resetForm();
    fetchEvents();
  };

  // --- SZERKESZTÉS ELINDÍTÁSA ---
  const handleEditClick = (event: EventItem) => {
      setEditId(event.id);
      setNewTitle(event.title);
      setStartDate(event.start_date);
      setEndDate(event.end_date);
      setNewDesc(event.description || "");
      
      // Opcionális: visszagörgetünk a formhoz mobil nézeten
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- MÉGSE GOMB ---
  const resetForm = () => {
      setEditId(null);
      setNewTitle("");
      setStartDate("");
      setEndDate("");
      setNewDesc("");
  };

  const handleDelete = async (id: number) => {
    if(!confirm("Biztosan törölni szeretnéd?")) return;
    await fetch(`http://localhost:8000/events/${id}`, { method: "DELETE" });
    fetchEvents();
  };

  // MFA (rövidítve, a lényeg változatlan)
  const startMfaSetup = async () => { /* ... */ 
    const res = await fetch("http://localhost:8000/mfa/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user }) });
    const data = await res.json(); setQrCode(data.qr_code); setShowMFAModal(true);
  };
  const verifyMfa = async () => { /* ... */ 
    const res = await fetch("http://localhost:8000/mfa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, code: verifyCode }) });
    if (res.ok) { alert("Sikeres aktiválás!"); setIsMfaEnabled(true); setShowMFAModal(false); } else { alert("Hibás kód!"); }
  };
  const handleLogout = () => { localStorage.clear(); router.push("/login"); };
  const formatListDate = (d: string) => { try { return format(new Date(d), "yyyy. MM. dd. HH:mm", { locale: hu }); } catch (e) { return d; } };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans p-8 relative">
      
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Esemény<span className="text-red-600">Kezelő</span></h1>
          <p className="text-zinc-500 text-sm mt-1">Belépve: <span className="text-white font-medium">{user}</span></p>
        </div>
        <div className="flex gap-3">
          <button onClick={startMfaSetup} className="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-400 rounded hover:bg-blue-900/50 transition-colors text-sm flex items-center gap-2">🛡️ 2FA Bekapcsolása</button>
          <button onClick={handleLogout} className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded hover:border-red-600 text-sm text-white transition-colors">Kilépés</button>
        </div>
      </header>

      <div className="flex justify-center mb-8">
        <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex gap-1">
            <button onClick={() => setActiveTab('list')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📋 Lista Nézet</button>
            <button onClick={() => setActiveTab('calendar')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📅 Naptár Nézet</button>
        </div>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-250px)]">
        
        {/* --- BAL OLDAL: ŰRLAP (OKOSÍTVA) --- */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-fit shadow-xl transition-all">
          <h2 className="text-xl font-bold mb-4 text-white flex justify-between items-center">
             {editId ? "Esemény Szerkesztése" : "Új Esemény"}
             {editId && <span className="text-xs bg-yellow-600/20 text-yellow-500 px-2 py-1 rounded border border-yellow-600/40">Szerkesztés mód</span>}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-xs text-zinc-400">Megnevezés</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" placeholder="Pl. Meeting" required />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs text-zinc-400">Kezdete</label>
                    <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required />
                </div>
                <div>
                    <label className="text-xs text-zinc-400">Vége</label>
                    <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required />
                </div>
            </div>

            <div>
                <label className="text-xs text-zinc-400">Leírás</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white h-24 mt-1" placeholder="Opcionális..." />
            </div>

            <div className="flex gap-2">
                <button type="submit" className={`flex-1 py-2 font-bold rounded text-white transition-colors ${editId ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-red-700 hover:bg-red-600'}`}>
                    {editId ? "Mentés" : "Hozzáadás"}
                </button>
                
                {editId && (
                    <button type="button" onClick={resetForm} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">
                        Mégse
                    </button>
                )}
            </div>
          </form>
        </div>

        {/* JOBB OLDAL */}
        <div className="lg:col-span-2 h-full overflow-hidden flex flex-col">
          {activeTab === 'list' ? (
            <div className="space-y-4 overflow-y-auto pr-2 pb-10">
               {events.length === 0 && <div className="text-center p-10 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">Nincs esemény rögzítve.</div>}
               
               {events.map((event) => (
                <div key={event.id} className={`bg-zinc-900/50 p-4 rounded-xl border flex justify-between items-center group transition-colors ${editId === event.id ? 'border-yellow-600 bg-yellow-900/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                  <div>
                    <h3 className="text-lg font-bold text-white">{event.title}</h3> 
                    <div className="flex gap-2 text-sm mt-1">
                        <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">{formatListDate(event.start_date)}</span>
                        <span className="text-zinc-500">➝</span>
                        <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">{formatListDate(event.end_date)}</span>
                    </div>
                    {event.description && <p className="text-zinc-400 text-sm mt-2">{event.description}</p>}
                  </div>
                  
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* --- SZERKESZTÉS GOMB --- */}
                      <button 
                        onClick={() => handleEditClick(event)} 
                        className="p-2 bg-zinc-800 hover:bg-yellow-600 hover:text-white rounded text-zinc-400 transition-colors"
                        title="Szerkesztés"
                      >
                        ✏️
                      </button>

                      {/* TÖRLÉS GOMB */}
                      <button 
                        onClick={() => handleDelete(event.id)} 
                        className="p-2 bg-zinc-800 hover:bg-red-600 hover:text-white rounded text-zinc-400 transition-colors"
                        title="Törlés"
                      >
                        🗑️
                      </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white text-black rounded-xl border border-zinc-800 p-4 h-full shadow-inner">
              <Calendar
                localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" style={{ height: '100%' }} culture='hu'
                date={date} view={view} onNavigate={onNavigate} onView={onView}
                messages={{ next: "Következő", previous: "Előző", today: "Ma", month: "Hónap", week: "Hét", day: "Nap" }}
                eventPropGetter={() => ({ style: { backgroundColor: '#b91c1c', color: 'white', borderRadius: '4px', border: '1px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' } })}
              />
            </div>
          )}
        </div>
      </main>

      {/* MFA Modal */}
      {showMFAModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-white mb-4">Kétlépcsős Azonosítás</h3>
            <p className="text-sm text-zinc-400 mb-6">Olvasd be ezt a QR kódot a Google Authenticator alkalmazással:</p>
            <div className="bg-white p-4 rounded-xl inline-block mb-6">{qrCode && <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48" />}</div>
            <input type="text" maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Írd be a 6-jegyű kódot" className="w-full p-3 bg-black border border-zinc-600 rounded text-center text-white text-xl tracking-widest mb-4 focus:border-blue-500 outline-none" />
            <div className="flex gap-3">
              <button onClick={() => setShowMFAModal(false)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">Mégse</button>
              <button onClick={verifyMfa} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors">Aktiválás</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
