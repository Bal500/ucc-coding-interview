"use client";

import { SyntheticEvent, useState } from 'react'; 
import { useRouter } from 'next/navigation';
import HelpDesk from '@/components/HelpDesk';
import Alert from '@/components/Alert';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showMFA, setShowMFA] = useState(false);
  const [notification, setNotification] = useState<{ msg: string, type: 'error' | 'success' | 'info' } | null>(null);
  
  const router = useRouter();

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null);

    const formData = new FormData(event.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const mfaCode = formData.get('mfa_code') as string; 

    if (!username || !password) {
      setNotification({ msg: "Minden mező kitöltése kötelező!", type: 'error' });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("https://localhost:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username, 
          password,
          mfa_code: mfaCode || null
        }),
      });

      if (response.status === 403) {
        setShowMFA(true);
        setNotification({ msg: "Kérjük, adja meg a hitelesítő kódot!", type: 'info' });
        setIsLoading(false);
        return;
      }

      if (!response.ok) throw new Error("Hibás adatok");

      const data = await response.json();
      
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", username);
      localStorage.setItem("role", data.role);
      
      setNotification({ msg: "Sikeres bejelentkezés!", type: 'success' });
      
      setTimeout(() => {
        router.push("/dashboard");
      }, 500);

    } catch (error) {
      setNotification({ msg: "Hiba: Rossz felhasználónév, jelszó vagy kód!", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center font-sans relative">
      <Alert 
        message={notification?.msg || null} 
        type={notification?.type} 
        onClose={() => setNotification(null)} 
      />

      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800">
        <h2 className="text-3xl font-bold text-center mb-8 text-white tracking-tight">
          Eseménykezelő <span className="text-red-600">Login</span>
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {!showMFA && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-400">Felhasználónév</label>
                <input 
                    name="username" 
                    type="text" 
                    className="w-full p-3 bg-black border border-zinc-700 rounded text-white focus:border-red-600 focus:outline-none transition-colors" 
                    placeholder="admin" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-400">Jelszó</label>
                <input 
                    name="password" 
                    type="password" 
                    className="w-full p-3 bg-black border border-zinc-700 rounded text-white focus:border-red-600 focus:outline-none transition-colors" 
                    placeholder="••••••••" 
                />
              </div>
            </>
          )}

          {showMFA && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <label className="block text-sm font-medium mb-2 text-red-500 font-bold">Kétlépcsős Kód (MFA)</label>
              <input 
                name="mfa_code" 
                type="text" 
                maxLength={6}
                className="w-full p-3 bg-black border border-red-600 rounded text-white text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-1 focus:ring-red-500" 
                placeholder="123456" 
                autoFocus
              />
              <input type="hidden" name="username" value={(document.querySelector('input[name="username"]') as HTMLInputElement)?.value || ''} />
              <input type="hidden" name="password" value={(document.querySelector('input[name="password"]') as HTMLInputElement)?.value || ''} />
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Betöltés..." : (showMFA ? "Kód Ellenőrzése" : "Belépés")}
          </button>
        </form>

        {!showMFA && (
          <div className="mt-6 text-center">
            <button type="button" onClick={() => router.push("/login/reset")} className="text-sm text-zinc-500 hover:text-red-400 underline decoration-dotted transition-colors">
              Elfelejtettem a jelszavam
            </button>
          </div>
        )}
      </div>

      <HelpDesk />
    </div>
  );
}
