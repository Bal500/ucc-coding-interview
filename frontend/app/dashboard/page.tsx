"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import hu from 'date-fns/locale/hu'; 
import "react-big-calendar/lib/css/react-big-calendar.css"; 

const locales = { 'hu': hu };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface EventItem {
  id: number;
  title: string;
  date: string;
  description?: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [activeTab, setActiveTab] = useState<'list' | 'calendar'>('list');
  
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
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

      const formattedEvents: CalendarEvent[] = data.map(event => {
        const startDate = new Date(event.date);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 

        return {
          id: event.id,
          title: event.title,
          start: startDate,
          end: endDate,
          allDay: false,
          resource: event.description
        };
      });
      setCalendarEvents(formattedEvents);

    } catch (err) { console.error(err); }
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
    if(!confirm("Biztosan törölni szeretnéd?")) return;
    await fetch(`http://localhost:8000/events/${id}`, { method: "DELETE" });
    fetchEvents();
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  const formatListDate = (dateString: string) => {
    try {
        return format(new Date(dateString), "yyyy. MM. dd. HH:mm", { locale: hu });
    } catch (e) {
        return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans p-8 relative">
      
      {/* fejlec */}
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Esemény<span className="text-red-600">Kezelő</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Belépve: <span className="text-white font-medium">{user}</span></p>
        </div>
        <button onClick={handleLogout} className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded hover:border-red-600 text-sm text-white transition-colors">
          Kilépés
        </button>
      </header>

      {/* nezet */}
      <div className="flex justify-center mb-8">
        <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex gap-1">
            <button 
              onClick={() => setActiveTab('list')}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${
                activeTab === 'list' 
                ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              📋 Kompakt Nézet
            </button>
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${
                activeTab === 'calendar' 
                ? 'bg-zinc-800 text-white shadow-lg border border-zinc-700' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              📅 Naptár Nézet
            </button>
        </div>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-250px)]">
        
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-fit shadow-xl">
          <h2 className="text-xl font-bold mb-4 text-white">Új Esemény</h2>
          <form onSubmit={handleAddEvent} className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400">Megnevezés</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1" placeholder="Pl. Meeting" required />
            </div>
            
            <div>
                <label className="text-xs text-zinc-400">Időpont</label>
                <input 
                  type="datetime-local" 
                  value={newDate} 
                  onChange={e => setNewDate(e.target.value)} 
                  className="w-full p-2 bg-black border border-zinc-700 rounded text-white mt-1 [color-scheme:dark]" 
                  required 
                />
            </div>

            <div>
                <label className="text-xs text-zinc-400">Leírás</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full p-2 bg-black border border-zinc-700 rounded text-white h-24 mt-1" placeholder="Opcionális..." />
            </div>

            <button type="submit" className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded">Hozzáadás</button>
          </form>
        </div>

        <div className="lg:col-span-2 h-full overflow-hidden flex flex-col">
          
          {activeTab === 'list' ? (
            <div className="space-y-4 overflow-y-auto pr-2 pb-10">
              {events.length === 0 && <div className="text-center p-10 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">Nincs esemény rögzítve.</div>}

              {events.map((event) => (
                <div key={event.id} className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex justify-between items-center group hover:border-zinc-600 transition-colors">
                  <div>
                    <h3 className="text-lg font-bold text-white">{event.title}</h3> 
                    <span className="text-sm text-red-400 bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30">
                      {formatListDate(event.date)}
                    </span>
                    {event.description && <p className="text-zinc-400 text-sm mt-1">{event.description}</p>}
                  </div>
                  <button onClick={() => handleDelete(event.id)} className="text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2">🗑️</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white text-black rounded-xl border border-zinc-800 p-4 h-full shadow-inner">
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                culture='hu'
                messages={{ next: "Következő", previous: "Előző", today: "Ma", month: "Hónap", week: "Hét", day: "Nap" }}
                eventPropGetter={() => ({
                  style: { backgroundColor: '#b91c1c', color: 'white', borderRadius: '4px', border: 'none' }
                })}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
