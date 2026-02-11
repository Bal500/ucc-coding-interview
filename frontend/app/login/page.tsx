"use client";

import { SyntheticEvent, useState } from 'react'; 
import { useRouter } from 'next/navigation';
import HelpDesk from '@/components/HelpDesk';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showMFA, setShowMFA] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const mfaCode = formData.get('mfa_code') as string; 

    try {
      const response = await fetch("http://localhost:8000/login", {
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
        alert("Kérjük, adja meg a hitelesítő kódot!");
        setIsLoading(false);
        return;
      }

      if (!response.ok) throw new Error("Hibás adatok");

      const data = await response.json();
      
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", username);
      localStorage.setItem("role", data.role);
      
      router.push("/dashboard");

    } catch (error) {
      alert("Hiba: Rossz felhasználónév, jelszó vagy kód!");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center font-sans">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800">
        <h2 className="text-3xl font-bold text-center mb-8 text-white tracking-tight">
          Eseménykezelő <span className="text-red-600">Login</span>
        </h2>
        
        {/* MFA vizsgálat, vagy betöltés */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {!showMFA && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-400">Felhasználónév</label>
                <input name="username" type="text" className="w-full p-3 bg-black border border-zinc-700 rounded text-white" placeholder="admin" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-400">Jelszó</label>
                <input name="password" type="password" className="w-full p-3 bg-black border border-zinc-700 rounded text-white" placeholder="••••••••" required />
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
                className="w-full p-3 bg-black border border-red-600 rounded text-white text-center text-2xl tracking-[0.5em]" 
                placeholder="123456" 
                autoFocus
              />
              <input type="hidden" name="username" value={(document.querySelector('[name=username]') as HTMLInputElement)?.value} />
              <input type="hidden" name="password" value={(document.querySelector('[name=password]') as HTMLInputElement)?.value} />
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded"
          >
            {isLoading ? "Betöltés..." : (showMFA ? "Kód Ellenőrzése" : "Belépés")}
          </button>
        </form>

        {!showMFA && (
          <div className="mt-6 text-center">
            <button type="button" onClick={() => router.push("/login/reset")} className="text-sm text-zinc-500 hover:text-red-400 underline decoration-dotted">
              Elfelejtettem a jelszavam
            </button>
          </div>
        )}
      </div>

      {/* CHAT GOMB */}
      <HelpDesk />
    </div>
  );
}
