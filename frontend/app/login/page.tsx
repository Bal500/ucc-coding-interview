"use client";

import { SyntheticEvent, useState } from 'react'; 
import HelpDesk from '@/components/HelpDesk'; 

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const username = formData.get('username');
    const password = formData.get('password');

    console.log("Küldendő adatok:", { username, password });

    // itt majd fetch
    // await loginUser(username, password);

    setIsLoading(false);
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center font-sans">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800">
        
        <h2 className="text-3xl font-bold text-center mb-8 text-white tracking-tight">
          Eseménykezelő <span className="text-red-600">Login</span>
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-400">Felhasználónév</label>
            {/*name attributum*/}
            <input 
              name="username"
              type="text" 
              className="w-full p-3 bg-black border border-zinc-700 rounded-lg focus:outline-none focus:border-red-600 transition-all text-white" 
              placeholder="admin"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-zinc-400">Jelszó</label>
            <input 
              name="password"
              type="password" 
              className="w-full p-3 bg-black border border-zinc-700 rounded-lg focus:outline-none focus:border-red-600 transition-all text-white" 
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg shadow-lg shadow-red-900/20 transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Betöltés..." : "Belépés"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button className="text-sm text-zinc-500 hover:text-red-400 transition-colors underline decoration-dotted">
            Elfelejtettem a jelszavam
          </button>
        </div>
      </div>
      
      {/* HelpDesk komponens beillesztése */}
      <HelpDesk />
    </div>
  );
}