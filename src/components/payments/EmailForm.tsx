"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";

/** Sets the receipt email (POST /api/payments/email). */
export function EmailForm({ user, initial = "", onSaved }: { user: User; initial?: string; onSaved: (email: string) => void }) {
    const t = useTranslations("payments");
    const [value, setValue] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await authFetch(user, "/api/payments/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: value }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSaved(data.email);
        } catch {
            setError(t("emailInvalid"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={save} className="space-y-3">
            <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("emailPlaceholder")}
                aria-label={t("receiptEmail")}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-xl px-4 py-3 text-base text-white placeholder:text-zinc-600 outline-none transition-colors"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
                type="submit"
                disabled={busy}
                className="w-full bg-white text-black text-sm font-bold py-3 rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
                {busy ? t("processing") : t("saveEmail")}
            </button>
        </form>
    );
}
