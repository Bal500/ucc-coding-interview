"use client";
import { useState, useRef, useEffect } from "react";

interface SearchableSelectProps {
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  label?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Válassz...",
  label
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setSearch(value);
    } else {
      setSearch("");
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        if (!options.includes(search) && value) {
          setSearch(value);
        } else if (!options.includes(search) && !value) {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef, search, value, options]);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(option);
    setSearch(option);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <h2 className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">{label}</h2>}
      
      {/* input mező */}
      <div className="relative">
        <input
          type="text"
          className="w-full p-2.5 bg-black border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (e.target.value === "") onChange(null);
          }}
          onClick={() => setIsOpen(true)}
        />
        
        {/* nyíl ikon / törlés gomb */}
        <div className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
          {value ? (
            <button onClick={() => { onChange(null); setSearch(""); }} className="hover:text-white">✕</button>
          ) : (
            <span className="pointer-events-none">▼</span>
          )}
        </div>
      </div>

      {/* Legördülő lista */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option}
                onClick={() => handleSelect(option)}
                className={`px-4 py-2 cursor-pointer text-sm transition-colors ${
                  option === value
                    ? "bg-blue-900/40 text-blue-200"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {option}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-zinc-500 text-sm italic">
              Nincs találat.
            </div>
          )}
        </div>
      )}
    </div>
  );
}