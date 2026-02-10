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
  owner?: string;
  participants?: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource?: any;
}

interface ContextMenuState {
  x: number;
  y: number;
  event: CalendarEvent;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [activeTab, setActiveTab] = useState<'list' | 'calendar'>('list');
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showMFAModal, setShowMFAModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), [setDate]);
  const onView = useCallback((newView: View) => setView(newView), [setView]);

  const [editId, setEditId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newParticipants, setNewParticipants] = useState(""); 

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("username");
    const storedRole = localStorage.getItem("role");

    if (!token) {
      router.push("/login");
    } else {
      setUser(storedUser);
      setUserRole(storedRole);
      fetchEvents();
    }
  }, [router]);

  const fetchEvents = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("http://localhost:8000/events", {
        headers: { "Authorization": `Bearer ${token}` } 
      });
      const data: EventItem[] = await res.json();
      setEvents(data);

      const formattedEvents: CalendarEvent[] = data.map(event => ({
        id: event.id,
        title: event.title,
        start: new Date(event.start_date),
        end: new Date(event.end_date),
        resource: event 
      }));
      setCalendarEvents(formattedEvents);

    } catch (err) { console.error(err); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token"); 
    try {
      const res = await fetch("http://localhost:8000/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ username: createUsername, password: createPassword }),
      });
      if (res.ok) { alert(`Sikeresen létrehozva: ${createUsername}`); setCreateUsername(""); setCreatePassword(""); setShowUserModal(false); } 
      else { const err = await res.json(); alert(`Hiba: ${err.detail || "Jogosultsági hiba"}`); }
    } catch (error) { alert("Hálózati hiba."); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    if (new Date(endDate) < new Date(startDate)) { alert("A befejezés nem lehet korábban!"); return; }

    const payload = { 
      title: newTitle, 
      start_date: startDate, 
      end_date: endDate, 
      description: newDesc,
      participants: newParticipants
    };

    let url = "http://localhost:8000/events";
    let method = "POST";

    if (editId) {
      url = `http://localhost:8000/events/${editId}`;
      method = "PUT";
    }

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.json();
        alert(`Hiba: ${err.detail}`);
        return;
    }
    
    resetForm();
    fetchEvents();
  };

  const handleEditClick = (event: EventItem) => {
    if (event.owner && event.owner !== user) {
      alert(`Ezt az eseményt ${event.owner} hozta létre, csak ő szerkesztheti.`);
      return;
    }

    setEditId(event.id);
    setNewTitle(event.title);
    setStartDate(event.start_date);
    setEndDate(event.end_date);
    setNewDesc(event.description || "");
    setNewParticipants(event.participants || "");
  };

  const handleCalendarEdit = (calEvent: CalendarEvent) => {
    const originalEvent = events.find(e => e.id === calEvent.id);
    if (originalEvent) handleEditClick(originalEvent);
  };

  const resetForm = () => {
    setEditId(null); setNewTitle(""); setStartDate(""); setEndDate(""); setNewDesc(""); setNewParticipants("");
  };

  const handleDelete = async (id: number) => {
    const token = localStorage.getItem("token");
    if(!confirm("Biztosan törölni szeretnéd?")) return;
    
    const res = await fetch(`http://localhost:8000/events/${id}`, { 
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(`Hiba: ${err.detail}`);
    } else {
      fetchEvents();
    }
  };

  const EventWithContextMenu = ({ event }: { event: CalendarEvent }) => {
    return (
      <div 
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, event: event }); }}
        className="h-full w-full"
      >
        {event.title}
      </div>
    );
  };
  const startMfaSetup = async () => { const token = localStorage.getItem("token"); const res = await fetch("http://localhost:8000/mfa/setup", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ username: user }) }); const data = await res.json(); setQrCode(data.qr_code); setShowMFAModal(true); };
  const verifyMfa = async () => { const token = localStorage.getItem("token"); const res = await fetch("http://localhost:8000/mfa/verify", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ username: user, code: verifyCode }) }); if (res.ok) { alert("Sikeres aktiválás!"); setIsMfaEnabled(true); setShowMFAModal(false); } else { alert("Hibás kód!"); } };
  const handleLogout = () => { localStorage.clear(); router.push("/login"); };
  const formatListDate = (d: string) => { try { return format(new Date(d), "yyyy. MM. dd. HH:mm", { locale: hu }); } catch (e) { return d; } };


  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans p-8 relative">
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Esemény<span className="text-red-600">Kezelő</span></h1><p className="text-zinc-500 text-sm mt-1">Belépve: <span className="text-white font-medium">{user}</span> ({userRole})</p></div>
        <div className="flex gap-3">
          {userRole === "admin" && (<button onClick={() => setShowUserModal(true)} className="px-4 py-2 bg-zinc-800 border border-zinc-600 text-zinc-300 rounded hover:bg-zinc-700 transition-colors text-sm">👤 Új User</button>)}
          <button onClick={startMfaSetup} className="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-400 rounded hover:bg-blue-900/50 transition-colors text-sm flex items-center gap-2">🛡️ 2FA</button>
          <button onClick={handleLogout} className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded hover:border-red-600 text-sm text-white transition-colors">Kilépés</button>
        </div>
      </header>

      <div className="flex justify-center mb-8"><div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex gap-1"><button onClick={() => setActiveTab('list')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📋 Lista Nézet</button><button onClick={() => setActiveTab('calendar')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📅 Naptár Nézet</button></div></div>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-250px)]">
        
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-fit shadow-xl transition-all">
          <h2 className="text-xl font-bold mb-4 text-white flex justify-between items-center">{editId ? "Szerkesztés" : "Új Esemény"} {editId && <span className="text-xs bg-yellow-600/20 text-yellow-500 px-2 py-1 rounded border border-yellow-600/40">Szerkesztés</span>}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="text-xs text-zinc-400">Megnevezés</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" required /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-zinc-400">Kezdete</label><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required /></div>
              <div><label className="text-xs text-zinc-400">Vége</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required /></div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 flex justify-between">Résztvevők <span className="text-zinc-600">(vesszővel elválasztva)</span></label>
              <input 
                value={newParticipants} 
                onChange={e => setNewParticipants(e.target.value)} 
                className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" 
                placeholder="Pl. Balázs" 
              />
            </div>
            <div><label className="text-xs text-zinc-400">Leírás</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white h-24 mt-1" /></div>
            <div className="flex gap-2">
              <button type="submit" className={`flex-1 py-2 font-bold rounded text-white transition-colors ${editId ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-red-700 hover:bg-red-600'}`}>{editId ? "Mentés" : "Hozzáadás"}</button>
              {editId && (<button type="button" onClick={resetForm} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">Mégse</button>)}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 h-full overflow-hidden flex flex-col relative">
          {activeTab === 'list' ? (
            <div className="space-y-4 overflow-y-auto pr-2 pb-10">
              {events.length === 0 && <div className="text-center p-10 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">Nincs megjeleníthető esemény.</div>}
              {events.map((event) => (
                <div key={event.id} className={`bg-zinc-900/50 p-4 rounded-xl border flex justify-between items-center group transition-colors ${editId === event.id ? 'border-yellow-600 bg-yellow-900/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                  <div>
                    <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                      {event.title} 
                      {event.owner !== user && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-900/50" title={`Tulajdonos: ${event.owner}`}>Megosztva veled</span>}
                  </h3> 
                    <div className="flex gap-2 text-sm mt-1">
                      <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">{formatListDate(event.start_date)}</span>
                      <span className="text-zinc-500">➝</span>
                      <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">{formatListDate(event.end_date)}</span>
                    </div>
                    {event.participants && <p className="text-xs text-zinc-500 mt-2">Résztvevők: {event.participants}</p>}
                  </div>
                  {event.owner === user && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditClick(event)} className="p-2 bg-zinc-800 hover:bg-yellow-600 hover:text-white rounded text-zinc-400 transition-colors">✏️</button>
                      <button onClick={() => handleDelete(event.id)} className="p-2 bg-zinc-800 hover:bg-red-600 hover:text-white rounded text-zinc-400 transition-colors">🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white text-black rounded-xl border border-zinc-800 p-4 h-full shadow-inner relative">
              <Calendar
                localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" style={{ height: '100%' }} culture='hu'
                date={date} view={view} onNavigate={onNavigate} onView={onView}
                messages={{ next: "Következő", previous: "Előző", today: "Ma", month: "Hónap", week: "Hét", day: "Nap" }}
                eventPropGetter={(event: any) => ({ 
                  style: { 
                    backgroundColor: event.resource.owner === user ? '#b91c1c' : '#1e40af', // Piros (saját) vs Kék (megosztott)
                    color: 'white', borderRadius: '4px', border: '1px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
                  } 
                })}
                components={{ event: EventWithContextMenu }}
              />
            </div>
          )}
        </div>
      </main>
      
      {contextMenu && (
        <div className="fixed bg-zinc-800 border border-zinc-600 shadow-2xl rounded-lg overflow-hidden z-[9999] min-w-[150px] animate-in fade-in zoom-in-95 duration-100" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.event.resource.owner === user ? (
            <>
              <button onClick={() => { handleCalendarEdit(contextMenu.event); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-700 flex items-center gap-2">✏️ Szerkesztés</button>
              <button onClick={() => { handleDelete(contextMenu.event.id); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 flex items-center gap-2 border-t border-zinc-700">🗑️ Törlés</button>
            </>
          ) : (
            <div className="px-4 py-2 text-sm text-zinc-400">Tulajdonos: {contextMenu.event.resource.owner}</div>
          )}
        </div>
      )}
      
      {showMFAModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-white mb-4">Kétlépcsős Azonosítás</h3>
            <p className="text-sm text-zinc-400 mb-6">Olvasd be ezt a QR kódot:</p>
            <div className="bg-white p-4 rounded-xl inline-block mb-6">{qrCode && <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48" />}</div>
            <input type="text" maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="Írd be a 6-jegyű kódot" className="w-full p-3 bg-black border border-zinc-600 rounded text-center text-white text-xl tracking-widest mb-4 focus:border-blue-500 outline-none" />
            <div className="flex gap-3">
              <button onClick={() => setShowMFAModal(false)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">Mégse</button>
              <button onClick={verifyMfa} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors">Aktiválás</button>
            </div>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-white mb-4">Új Felhasználó</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div><label className="block text-sm text-zinc-400 mb-1 text-left">Felhasználónév</label><input type="text" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} className="w-full p-3 bg-black border border-zinc-600 rounded text-white focus:border-blue-500 outline-none" required /></div>
              <div><label className="block text-sm text-zinc-400 mb-1 text-left">Jelszó</label><input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className="w-full p-3 bg-black border border-zinc-600 rounded text-white focus:border-blue-500 outline-none" required /></div>
              <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowUserModal(false)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">Mégse</button><button type="submit" className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded transition-colors">Létrehozás</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
