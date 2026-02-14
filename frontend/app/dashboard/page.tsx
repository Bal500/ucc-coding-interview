"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import HelpDesk from '@/components/HelpDesk'; 
import { Calendar, dateFnsLocalizer, View, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { hu } from 'date-fns/locale';
import "react-big-calendar/lib/css/react-big-calendar.css"; 
import { useAlert } from '@/components/AlertContext'; 
import ConfirmModal from '@/components/ConfirmModal';

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
  is_meeting?: boolean;
  meeting_link?: string;
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
  const { showAlert } = useAlert();
  const [user, setUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'calendar' | 'helpdesk'>('list');

  // CONFIRM MODAL STATE
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // HELPDESK STATEK
  interface SupportUser { session_id: string; needs_human: boolean; }
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);
  const [selectedSupportUser, setSelectedSupportUser] = useState<string | null>(null);
  const [adminChatMessages, setAdminChatMessages] = useState<any[]>([]);
  const [adminReply, setAdminReply] = useState("");
  const [isChatResolved, setIsChatResolved] = useState(false);

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
  // MODALOK
  const [showMFAModal, setShowMFAModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  // SZERKESZTÉS
  const [editId, setEditId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newParticipants, setNewParticipants] = useState(""); 
  const [isMeeting, setIsMeeting] = useState(false);

  const onNavigate = useCallback((newDate: Date) => setDate(newDate), [setDate]);
  const onView = useCallback((newView: View) => setView(newView), [setView]);

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
      if (storedUser) setUser(storedUser);
      if (storedRole) setUserRole(storedRole);
      fetchEvents();
    }
  }, [router]);

  const fetchEvents = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("http://localhost:8000/events", {
        headers: { "Authorization": `Bearer ${token}` } 
      });
      if(res.ok){
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
      }
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    if (new Date(endDate) < new Date(startDate)) { 
      showAlert("A befejezés nem lehet korábban!", "error"); 
      return; 
    }

    const payload = { 
      title: newTitle, 
      start_date: startDate, 
      end_date: endDate, 
      description: newDesc,
      participants: newParticipants,
      is_meeting: isMeeting
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
        showAlert(`Hiba: ${err.detail}`, 'error');
        return;
    }
    
    showAlert(editId ? "Esemény frissítve!" : "Esemény hozzáadva!", "success");
    resetForm();
    fetchEvents();
  };

  const handleEditClick = (event: EventItem) => {
    if (event.owner && event.owner !== user) {
      showAlert(`Ezt az eseményt ${event.owner} hozta létre, csak ő szerkesztheti.`, "info");
      return;
    }
    setEditId(event.id);
    setNewTitle(event.title);
    setStartDate(event.start_date);
    setEndDate(event.end_date);
    setNewDesc(event.description || "");
    setNewParticipants(event.participants || "");
    setIsMeeting(event.is_meeting || false);
  };

  const handleCalendarEdit = (calEvent: CalendarEvent) => {
    const originalEvent = events.find(e => e.id === calEvent.id);
    if (originalEvent) handleEditClick(originalEvent);
  };

  const resetForm = () => { 
    setEditId(null); setNewTitle(""); setStartDate(""); setEndDate(""); setNewDesc(""); setNewParticipants(""); setIsMeeting(false); 
  };

  const askDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/events/${deleteId}`, { 
      method: "DELETE", 
      headers: { "Authorization": `Bearer ${token}` } 
    });

    if (!res.ok) { 
      const err = await res.json(); 
      showAlert(`Hiba: ${err.detail}`, "error"); 
    } else { 
      showAlert("Esemény törölve!", "success");
      fetchEvents(); 
    }
    setDeleteId(null);
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
      if (res.ok) { 
        showAlert(`Sikeresen létrehozva: ${createUsername}`, "success"); 
        setCreateUsername(""); 
        setCreatePassword(""); 
        setShowUserModal(false); 
      } else { 
        const err = await res.json(); 
        showAlert(err.detail || "Jogosultsági hiba", "error"); 
      }
    } catch (error) { 
      showAlert("Hálózati hiba.", "error"); 
    }
  };

  const fetchSupportRequests = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:8000/admin/support-requests", {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        setSupportUsers(data);
    }
  };

  const fetchUserChatForAdmin = async (targetSessionId: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:8000/admin/chat/${targetSessionId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
        const data = await res.json();
        setAdminChatMessages(data);
        if (data.length > 0) {
          const lastMsg = data[data.length - 1];
          setIsChatResolved(!lastMsg.needs_human);
        } else {
          setIsChatResolved(false);
        }
    }
  };

  const sendAdminReply = async () => {
    if (!selectedSupportUser || !adminReply) return;
    const token = localStorage.getItem("token");
    await fetch("http://localhost:8000/admin/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ target_session_id: selectedSupportUser, message: adminReply })
    });
    setAdminReply("");
    fetchUserChatForAdmin(selectedSupportUser);
  };

  const resolveChat = async () => {
      if (!selectedSupportUser) return;
      const token = localStorage.getItem("token");
      await fetch("http://localhost:8000/admin/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ target_session_id: selectedSupportUser })
      });
      fetchUserChatForAdmin(selectedSupportUser); 
      fetchSupportRequests(); 
  };

  useEffect(() => {
    let interval: any;
    if (activeTab === 'helpdesk' && userRole === 'admin') {
      fetchSupportRequests();
      interval = setInterval(fetchSupportRequests, 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, userRole]);

  useEffect(() => {
    let interval: any;
    if (activeTab === 'helpdesk' && selectedSupportUser) {
      fetchUserChatForAdmin(selectedSupportUser);
      interval = setInterval(() => {
        fetchUserChatForAdmin(selectedSupportUser);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [selectedSupportUser, activeTab]);


  const startMfaSetup = async () => { 
    const token = localStorage.getItem("token"); 
    const res = await fetch("http://localhost:8000/mfa/setup", { 
      method: "POST", 
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, 
      body: JSON.stringify({ username: user }) 
    }); 
    const data = await res.json(); 
    setQrCode(data.qr_code); 
    setShowMFAModal(true); 
  };

  const verifyMfa = async () => { 
    const token = localStorage.getItem("token"); 
    const res = await fetch("http://localhost:8000/mfa/verify", { 
      method: "POST", 
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, 
      body: JSON.stringify({ username: user, code: verifyCode }) 
    }); 
    if (res.ok) { 
      showAlert("Sikeres aktiválás!", "success"); 
      setIsMfaEnabled(true); 
      setShowMFAModal(false); 
    } else { 
      showAlert("Hibás kód!", "error"); 
    } 
  };

  const handleLogout = () => { localStorage.clear(); router.push("/login"); };
  const formatListDate = (d: string) => { try { return format(new Date(d), "yyyy. MM. dd. HH:mm", { locale: hu }); } catch (e) { return d; } };
  const EventWithContextMenu = ({ event }: { event: CalendarEvent }) => { return ( <div onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, event: event }); }} className="h-full w-full"> {event.title} </div> ); };

  return (
    <div className="h-screen overflow-hidden bg-black text-gray-100 font-sans p-8 relative">
      <header className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4 h-[80px]">
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Esemény<span className="text-red-600">Kezelő</span></h1><p className="text-zinc-500 text-sm mt-1">Belépve: <span className="text-white font-medium">{user || "Betöltés..."}</span> ({userRole})</p></div>
        <div className="flex gap-3">
          {userRole === "admin" && (<button onClick={() => setShowUserModal(true)} className="px-4 py-2 bg-zinc-800 border border-zinc-600 text-zinc-300 rounded hover:bg-zinc-700 transition-colors text-sm">👤 Új User</button>)}
          <button onClick={startMfaSetup} className="px-4 py-2 bg-blue-900/30 border border-blue-600 text-blue-400 rounded hover:bg-blue-900/50 transition-colors text-sm flex items-center gap-2">🛡️ 2FA</button>
          <button onClick={handleLogout} className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded hover:border-red-600 text-sm text-white transition-colors">Kilépés</button>
        </div>
      </header>

      {/* FŐ CONTAINER - Módosított magasság és grid struktúra */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-140px)]">
        
        {/* BAL OSZLOP: ŰRLAP (Teljes magasság, görgethető) */}
        {activeTab !== 'helpdesk' && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-fit max-h-full overflow-y-auto shadow-xl transition-all">
          <h2 className="text-xl font-bold mb-4 text-white flex justify-between items-center">{editId ? "Szerkesztés" : "Új Esemény"} {editId && <span className="text-xs bg-yellow-600/20 text-yellow-500 px-2 py-1 rounded border border-yellow-600/40">Szerkesztés</span>}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="text-xs text-zinc-400">Megnevezés</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" required /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-zinc-400">Kezdete</label><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required /></div>
              <div><label className="text-xs text-zinc-400">Vége</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" required /></div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 flex justify-between">Résztvevők <span className="text-zinc-600">(vesszővel elválasztva)</span></label>
              <input value={newParticipants} onChange={e => setNewParticipants(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" placeholder="Pl. Balázs" />
            </div>
            
            <div className="flex items-center gap-2 pt-2">
                <input 
                    type="checkbox" 
                    id="isMeeting" 
                    checked={isMeeting} 
                    onChange={(e) => setIsMeeting(e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="isMeeting" className="text-sm text-zinc-300 cursor-pointer">Meeting</label>
            </div>

            <div><label className="text-xs text-zinc-400">Leírás</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white h-24 mt-1" /></div>
            <div className="flex gap-2 pb-2">
              <button type="submit" className={`flex-1 py-2 font-bold rounded text-white transition-colors ${editId ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-red-700 hover:bg-red-600'}`}>{editId ? "Mentés" : "Hozzáadás"}</button>
              {editId && (<button type="button" onClick={resetForm} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors">Mégse</button>)}
            </div>
          </form>
        </div>
        )}

        {/* JOBB OSZLOP: NAVIGÁCIÓ + TARTALOM (Flex container) */}
        <div className={`${activeTab === 'helpdesk' ? 'col-span-3' : 'lg:col-span-2'} h-full flex flex-col gap-4 overflow-hidden`}>
          
          {/* NAVIGÁCIÓS GOMBOK (Itt vannak most a jobb oldalon fent) */}
          <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex gap-1 w-fit mx-auto lg:mx-0 shrink-0">
            <button onClick={() => setActiveTab('list')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📋 Lista Nézet</button>
            <button onClick={() => setActiveTab('calendar')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>📅 Naptár Nézet</button>
            {userRole === 'admin' && (
              <button onClick={() => setActiveTab('helpdesk')} className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'helpdesk' ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300'}`}>
                🆘 Helpdesk
              </button>
            )}
          </div>

          {/* TARTALOM (Lista / Naptár / Helpdesk) - Kitölti a maradék helyet */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'list' ? (
              <div className="space-y-4 overflow-y-auto h-full pr-2 pb-10">
                {events.length === 0 && <div className="text-center p-10 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">Nincs megjeleníthető esemény.</div>}
                {events.map((event) => (
                  <div key={event.id} className={`bg-zinc-900/50 p-4 rounded-xl border flex justify-between items-start group transition-colors ${editId === event.id ? 'border-yellow-600 bg-yellow-900/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    <div className="min-w-0 flex-1 pr-4">
                      <h3 className="text-lg font-bold text-white flex flex-wrap gap-2 items-center">
                        <span className="truncate">{event.title}</span>
                        {event.owner !== user && <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-900/50 shrink-0" title={`Tulajdonos: ${event.owner}`}>Megosztva veled</span>}
                        {event.is_meeting && <span title="Meeting" className="text-lg shrink-0">📹</span>}
                      </h3> 
                      <div className="flex flex-wrap gap-2 text-sm mt-1">
                        <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30 whitespace-nowrap">{formatListDate(event.start_date)}</span>
                        <span className="text-zinc-500">➝</span>
                        <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30 whitespace-nowrap">{formatListDate(event.end_date)}</span>
                      </div>
                      
                      {event.description && (
                        <p className="text-zinc-400 text-sm mt-2 italic border-l-2 border-zinc-700 pl-2 break-words whitespace-pre-wrap max-w-full">
                            {event.description}
                        </p>
                      )}

                      {event.meeting_link && (
                        <div className="mt-3">
                            <a 
                                href={event.meeting_link.startsWith('http') ? event.meeting_link : `https://${event.meeting_link}`}
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded transition-colors"
                            >
                                🎥 Csatlakozás a Meetinghez
                            </a>
                        </div>
                      )}

                      {event.participants && <p className="text-xs text-zinc-500 mt-2 break-words">Résztvevők: {event.participants}</p>}
                    </div>
                    {event.owner === user && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                        <button onClick={() => handleEditClick(event)} className="p-2 bg-zinc-800 hover:bg-yellow-600 hover:text-white rounded text-zinc-400 transition-colors">✏️</button>
                        <button onClick={() => askDelete(event.id)} className="p-2 bg-zinc-800 hover:bg-red-600 hover:text-white rounded text-zinc-400 transition-colors">🗑️</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : activeTab === 'calendar' ? (
              <div className="bg-white text-black rounded-xl border border-zinc-800 p-4 h-full shadow-inner relative overflow-hidden">
                <Calendar
                  localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end" style={{ height: '100%' }} culture='hu'
                  date={date} view={view} onNavigate={onNavigate} onView={onView}
                  messages={{ next: "Következő", previous: "Előző", today: "Ma", month: "Hónap", week: "Hét", day: "Nap" }}
                  eventPropGetter={(event: any) => ({ 
                    style: { 
                      backgroundColor: event.resource.owner === user ? '#b91c1c' : '#1e40af',
                      color: 'white', borderRadius: '4px', border: '1px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
                    } 
                  })}
                  components={{ event: EventWithContextMenu }}
                />
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-full flex overflow-hidden">
                <div className="w-1/3 border-r border-zinc-800 p-4 overflow-y-auto">
                  <h3 className="text-zinc-400 text-xs uppercase font-bold mb-4">Beszélgetések</h3>
                  {supportUsers.length === 0 && <p className="text-zinc-500 text-sm">Nincs aktív beszélgetés.</p>}
                  {supportUsers.map((u) => (
                    <button 
                      key={u.session_id} 
                      onClick={() => { setSelectedSupportUser(u.session_id); fetchUserChatForAdmin(u.session_id); }}
                      className={`w-full text-left p-3 rounded mb-2 transition-all border flex justify-between items-center group
                        ${selectedSupportUser === u.session_id 
                          ? 'bg-zinc-700 border-white text-white shadow-md'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                  >
                      <span className="truncate text-sm font-medium">👤 {u.session_id}</span>
                      {u.needs_human ? (
                        <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]" title="Segítség kell!" />
                      ) : (
                        <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" title="Megoldva / AI" />
                      )}
                    </button>
                  ))}
                  <button onClick={fetchSupportRequests} className="mt-4 text-xs text-zinc-500 underline w-full text-center hover:text-white">Frissítés</button>
                </div>

                <div className="w-2/3 flex flex-col">
                  {selectedSupportUser ? (
                    <>
                      <div className={`p-4 border-b border-zinc-800 flex justify-between items-center ${isChatResolved ? 'bg-green-900/20' : 'bg-zinc-900/50'}`}>
                        <div>
                          <h3 className="font-bold text-white">Chat: <span className="text-blue-400">{selectedSupportUser}</span></h3>
                          {isChatResolved ? <span className="text-xs text-green-400 font-bold">✅ LEZÁRVA (AI Aktív)</span> : <span className="text-xs text-red-400 font-bold">⚠️ SUPPORT SZÜKSÉGES</span>}
                        </div>
                        {!isChatResolved && (
                          <button onClick={resolveChat} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">✅ Készre jelölés</button>
                        )}
                      </div>
                      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/20">
                        {adminChatMessages.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.sender === 'admin' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}>
                            {msg.sender === 'system' ? (
                              <span className="text-[10px] text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded-full border border-zinc-800">{msg.message}</span>
                            ) : (
                              <div className={`max-w-[80%] p-2 rounded-lg text-sm ${msg.sender === 'admin' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-white'}`}>
                                  <div className="text-[10px] opacity-50 mb-1">{msg.sender.toUpperCase()} - {new Date(msg.timestamp).toLocaleTimeString()}</div>
                                  {msg.message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="p-4 border-t border-zinc-800 flex gap-2 bg-zinc-900">
                        <input 
                          className={`flex-1 bg-black border rounded px-3 py-2 text-white focus:outline-none ${isChatResolved ? 'border-green-900 cursor-not-allowed text-zinc-500' : 'border-zinc-600 focus:border-blue-500'}`}
                          placeholder={isChatResolved ? "Lezárva." : "Válasz..."}
                          value={adminReply}
                          onChange={e => setAdminReply(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !isChatResolved && sendAdminReply()}
                          disabled={isChatResolved}
                        />
                        <button onClick={sendAdminReply} disabled={isChatResolved} className={`px-4 py-2 rounded font-bold ${isChatResolved ? 'bg-zinc-800 text-zinc-500' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>Küldés</button>
                    </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-500">Válassz felhasználót!</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {contextMenu && (
        <div className="fixed bg-zinc-800 border border-zinc-600 shadow-2xl rounded-lg overflow-hidden z-[9999] min-w-[150px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.event.resource.owner === user ? (
            <>
              <button onClick={() => { handleCalendarEdit(contextMenu.event); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-700">✏️ Szerkesztés</button>
              <button onClick={() => { askDelete(contextMenu.event.id); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 border-t border-zinc-700">🗑️ Törlés</button>
            </>
          ) : <div className="px-4 py-2 text-sm text-zinc-400">Tulajdonos: {contextMenu.event.resource.owner}</div>}
        </div>
      )}
      
      {showMFAModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center">
            <h3 className="text-2xl font-bold text-white mb-4">2FA aktiválása</h3>
            <div className="bg-white p-4 rounded-xl inline-block mb-6">{qrCode && <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48" />}</div>
            <input type="text" maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="6 - J E G Y Ű  K Ó D" className="w-full p-3 bg-black border border-zinc-600 rounded text-center text-white text-xl mb-4" />
            <button onClick={verifyMfa} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded">Aktiválás</button>
            <button onClick={() => setShowMFAModal(false)} className="mt-2 text-zinc-500 text-sm hover:text-white">Bezárás</button>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-700 max-w-sm w-full text-center">
            <h3 className="text-2xl font-bold text-white mb-4">Új Felhasználó</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <input type="text" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} className="w-full p-3 bg-black border border-zinc-600 rounded text-white" placeholder="Username" required />
              <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className="w-full p-3 bg-black border border-zinc-600 rounded text-white" placeholder="Password" required />
              <button type="submit" className="w-full py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded">Létrehozás</button>
              <button type="button" onClick={() => setShowUserModal(false)} className="mt-2 text-zinc-500 text-sm hover:text-white">Mégse</button>
            </form>
          </div>
        </div>
      )}

      <HelpDesk />

      <ConfirmModal 
        isOpen={deleteId !== null}
        title="Törlés megerősítése"
        message={`Biztosan törölni szeretnéd ezt az eseményt?\nEz a művelet nem vonható vissza.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
