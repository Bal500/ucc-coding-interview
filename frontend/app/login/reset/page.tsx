"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@/components/Alert';

export default function ResetPage() {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [alertData, setAlertData] = useState<{ msg: string | null; type: 'error' | 'success' | 'info' }>({
    msg: null,
    type: 'info'
  });

  const router = useRouter();

  const showAlert = (msg: string, type: 'error' | 'success' | 'info' = 'info') => {
    setAlertData({ msg, type });
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("http://localhost:8000/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    showAlert("Kód generálva! Nézd meg a Backend terminált.");
    setStep(2);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("http://localhost:8000/confirm-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (res.ok) {
      showAlert("Sikeres csere! Most jelentkezz be.");
      router.push("/login");
    } else {
      showAlert("Hiba: Rossz kód!");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center font-sans">
      <Alert 
        message={alertData.msg} 
        type={alertData.type} 
        onClose={() => setAlertData({ ...alertData, msg: null })} 
      />

      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-2xl border border-zinc-800">
        <h2 className="text-2xl font-bold mb-6 text-red-600">Jelszó Visszaállítás</h2>

        {step === 1 ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <p className="text-sm text-zinc-400">Add meg a felhasználóneved, és generálunk egy kódot.</p>
            <input 
              className="w-full p-3 bg-black border border-zinc-700 rounded text-white"
              placeholder="Felhasználónév (pl. admin)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button type="submit" className="w-full py-3 bg-red-700 hover:bg-red-600 rounded font-bold">
              Kód Kérése
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-sm text-zinc-400">Írd be a kapott kódot és az új jelszót.</p>
            <input 
              className="w-full p-3 bg-black border border-zinc-700 rounded text-white"
              placeholder="Visszaállító Kód"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <input 
              type="password"
              className="w-full p-3 bg-black border border-zinc-700 rounded text-white"
              placeholder="Új jelszó"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button type="submit" className="w-full py-3 bg-green-700 hover:bg-green-600 rounded font-bold">
              Jelszó Mentése
            </button>
          </form>
        )}
        
        <button onClick={() => router.push("/login")} className="mt-4 text-xs text-zinc-500 hover:underline">
          Vissza a belépéshez
        </button>
      </div>
    </div>
  );
}
