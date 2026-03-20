'use client';

import { useState, useRef, useEffect } from 'react';
import { COUNTRY_CODES, type CountryCode } from '@/lib/constants/countryCodes';

interface CountryCodeSelectProps {
    value: string;  // ISO country code e.g. 'US'
    onChange: (countryCode: string) => void;
    className?: string;
}

export function CountryCodeSelect({ value, onChange, className = '' }: CountryCodeSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

    const filtered = search
        ? COUNTRY_CODES.filter(c =>
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.dial.includes(search) ||
            c.code.toLowerCase().includes(search.toLowerCase())
        )
        : COUNTRY_CODES;

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Focus search when opened
    useEffect(() => {
        if (isOpen && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isOpen]);

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Selected button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-zinc-950 text-white text-sm hover:border-white/20 transition-colors duration-150 min-w-[90px]"
                aria-label="Select country code"
            >
                <span className="text-base leading-none">{selected.flag}</span>
                <span className="text-zinc-300 font-medium">{selected.dial}</span>
                <svg className={`w-3 h-3 text-zinc-600 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 max-h-72 bg-zinc-950 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
                    {/* Search field */}
                    <div className="p-2 border-b border-white/[0.06]">
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search country..."
                            className="w-full px-3 py-2 bg-zinc-900 border border-white/[0.08] rounded-lg text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/20 transition-colors"
                        />
                    </div>

                    {/* Country list */}
                    <div className="overflow-y-auto max-h-56 overscroll-contain">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-zinc-600">No results</div>
                        ) : (
                            filtered.map((country) => (
                                <button
                                    key={country.code}
                                    type="button"
                                    onClick={() => {
                                        onChange(country.code);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/[0.04] transition-colors ${
                                        country.code === value ? 'bg-white/[0.06] text-white' : 'text-zinc-400'
                                    }`}
                                >
                                    <span className="text-base leading-none">{country.flag}</span>
                                    <span className="flex-1 truncate">{country.name}</span>
                                    <span className="text-zinc-600 text-xs font-mono">{country.dial}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
