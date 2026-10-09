"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { User } from "firebase/auth";
import { cn } from "@/lib/utils/cn";
import { authFetch } from "@/lib/auth/authFetch";
import { CREDIT_PRODUCTS, MEMBERSHIP, unitPriceCents } from "@/lib/payments/catalog";
import type { SavedCard } from "@/lib/payments/billing";
import type { AccessSummary } from "@functions/lib/access/sessionAccess";
import { PaymentForm, getStripePromise } from "./PaymentForm";
import { EmailForm } from "./EmailForm";

export type Choice = "single" | "pack3" | "membership";
const NEW_CARD = "new";

/** Polls until the webhook has applied a payment (credits or membership show up). */
export async function waitForAccess(user: User, done: (s: AccessSummary) => boolean, timeoutMs = 30_000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try {
            const res = await authFetch(user, "/api/check-session-access", { method: "POST" });
            if (res.ok && done(await res.json())) return true;
        } catch {
            // keep polling
        }
        await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
}

interface PurchasePanelProps {
    user: User;
    summary: AccessSummary | null;
    initialChoice?: Choice;
    onClose: () => void;
    /** Called once the purchase has been applied. */
    onPurchased: () => void;
}

/**
 * Shown when a session can't start because the free sessions are used up, and
 * from Billing. Leads with the person's own record, then the offer. Asks for a
 * receipt email before the first purchase; offers saved cards for one-tap payment.
 */
export function PurchasePanel({ user, summary, initialChoice = "single", onClose, onPurchased }: PurchasePanelProps) {
    const t = useTranslations("payments");
    const format = useFormatter();
    const [titles, setTitles] = useState<string[]>([]);
    const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined while loading
    const [cards, setCards] = useState<SavedCard[]>([]);
    const [choice, setChoice] = useState<Choice>(summary?.membership ? (initialChoice === "membership" ? "single" : initialChoice) : initialChoice);
    const [card, setCard] = useState<string>(NEW_CARD);
    const [saveCard, setSaveCard] = useState(true);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [stage, setStage] = useState<"choose" | "pay" | "confirming">("choose");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Out of sessions (opened by the chat button) vs. buying ahead from Billing.
    // Only the out-of-sessions screen reminds the person of their own record.
    const isPaywall = summary?.canStart === false && summary.reason === "payment_required";

    const price = (cents: number) => format.number(cents / 100, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const amountFor = (c: Choice) => (c === "membership" ? MEMBERSHIP.amountCents : CREDIT_PRODUCTS[c].amountCents);

    useEffect(() => {
        if (isPaywall) {
            authFetch(user, "/api/posts/mine?limit=3")
                .then((res) => (res.ok ? res.json() : { posts: [] }))
                .then((data) => setTitles((data.posts || []).map((p: { title?: string }) => p.title).filter(Boolean).slice(0, 3)))
                .catch(() => {});
        }
        authFetch(user, "/api/payments/status")
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: { billingEmail: string | null; cards: SavedCard[] }) => {
                setEmail(data.billingEmail);
                setCards(data.cards || []);
                const preferred = (data.cards || []).find((c) => c.isDefault) || data.cards?.[0];
                if (preferred) setCard(preferred.id);
            })
            .catch(() => setEmail(null));
    }, [user, isPaywall]);

    const handlePaid = async () => {
        setStage("confirming");
        const creditsBefore = summary?.credits ?? 0;
        const applied = await waitForAccess(user, (s) => (choice === "membership" ? !!s.membership : s.credits > creditsBefore));
        if (applied) onPurchased();
        else setError(t("confirmDelayed"));
    };

    const startPayment = async () => {
        setError(null);
        setBusy(true);
        const savedCard = card !== NEW_CARD ? card : undefined;
        try {
            const res = choice === "membership"
                ? await authFetch(user, "/api/payments/membership", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentMethodId: savedCard }),
                })
                : await authFetch(user, "/api/payments/purchase", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ product: choice, saveCard, paymentMethodId: savedCard }),
                });
            const data = await res.json();
            if (data.reason === "email_required") { setEmail(null); return; }
            if (!res.ok) throw new Error(data.error);

            if (!savedCard) {
                if (!data.clientSecret) throw new Error("missing client secret");
                setClientSecret(data.clientSecret);
                setStage("pay");
                return;
            }

            // Saved card: charged already, unless the bank wants a check.
            if (data.status !== "succeeded" && data.status !== "active") {
                const stripe = await getStripePromise();
                const result = stripe && data.clientSecret ? await stripe.handleNextAction({ clientSecret: data.clientSecret }) : null;
                if (!result || result.error) {
                    setError(result?.error?.message || t("paymentFailed"));
                    return;
                }
            }
            await handlePaid();
        } catch {
            setError(t("startFailed"));
        } finally {
            setBusy(false);
        }
    };

    const options: { id: Choice; label: string; note: string; amount: string }[] = [
        { id: "single", label: t("single"), note: t("singleNote"), amount: price(CREDIT_PRODUCTS.single.amountCents) },
        { id: "pack3", label: t("pack3"), note: t("pack3Note", { price: price(unitPriceCents(CREDIT_PRODUCTS.pack3)) }), amount: price(CREDIT_PRODUCTS.pack3.amountCents) },
        ...(summary?.membership ? [] : [{ id: "membership" as const, label: t("membership"), note: t("membershipNote"), amount: `${price(MEMBERSHIP.amountCents)} ${t("perMonth")}` }]),
    ];

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-t-2xl sm:rounded-2xl px-6 pt-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
                <div className="flex items-start justify-between mb-5">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {isPaywall ? t("title") : choice === "membership" ? t("membership") : t("addSessions")}
                    </h2>
                    <button onClick={onClose} aria-label={t("close")} className="p-1 -mr-1 text-zinc-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {isPaywall && summary && (
                    <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                        {summary.freeRenewsAt
                            ? t("freeUsed", { date: format.dateTime(new Date(summary.freeRenewsAt), { month: "long", day: "numeric", year: "numeric" }) })
                            : t("freeUsedNoDate")}
                    </p>
                )}

                {titles.length > 0 && (
                    <div className="mb-6 border-l border-white/10 pl-4">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">{t("yourRecord")}</p>
                        <ul className="space-y-1.5">
                            {titles.map((title, i) => (
                                <li key={i} className="text-sm text-zinc-200 leading-snug">{title}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {email === undefined && <div className="h-32 rounded-xl bg-zinc-900/50 animate-pulse" />}

                {email === null && (
                    <div className="space-y-3">
                        <p className="text-sm text-zinc-400 leading-relaxed">{t("emailWhy")}</p>
                        <EmailForm user={user} onSaved={(saved) => setEmail(saved)} />
                    </div>
                )}

                {email && stage === "choose" && (
                    <>
                        <div role="radiogroup" aria-label={t("title")} className="space-y-2 mb-5">
                            {options.map((o) => (
                                <button
                                    key={o.id}
                                    role="radio"
                                    aria-checked={choice === o.id}
                                    onClick={() => setChoice(o.id)}
                                    className={cn(
                                        "w-full flex items-center justify-between text-left px-4 py-3.5 rounded-xl border transition-colors duration-150",
                                        choice === o.id ? "border-white bg-zinc-900" : "border-zinc-800 hover:border-zinc-700"
                                    )}
                                >
                                    <span>
                                        <span className="block text-sm font-bold text-white">{o.label}</span>
                                        <span className="block text-xs text-zinc-500 mt-0.5">{o.note}</span>
                                    </span>
                                    <span className="text-sm font-semibold text-zinc-200 shrink-0 ml-4">{o.amount}</span>
                                </button>
                            ))}
                        </div>

                        {cards.length > 0 && (
                            <div role="radiogroup" aria-label={t("paymentMethods")} className="space-y-1 mb-4">
                                {[...cards.map((c) => ({ id: c.id, label: c.last4 ? t("cardOnFile", { brand: c.brand, last4: c.last4 }) : c.brand })), { id: NEW_CARD, label: t("newCard") }].map((o) => (
                                    <label key={o.id} className="flex items-center gap-3 py-1.5 text-sm text-zinc-200 cursor-pointer">
                                        <input type="radio" name="card" checked={card === o.id} onChange={() => setCard(o.id)} className="accent-white" />
                                        <span className="capitalize">{o.label}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {card === NEW_CARD && choice !== "membership" && (
                            <label className="flex items-center gap-3 mb-4 text-sm text-zinc-300 cursor-pointer">
                                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="accent-white" />
                                {t("saveThisCard")}
                            </label>
                        )}

                        <p className="text-xs text-zinc-500 leading-relaxed mb-5">
                            {choice === "membership" ? t("membershipTerms") : t("creditTerms")}
                        </p>
                        <button
                            onClick={startPayment}
                            disabled={busy}
                            className="w-full bg-white text-black text-sm font-bold py-3.5 rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
                        >
                            {busy ? t("processing") : card === NEW_CARD ? t("continue") : t("pay", { amount: price(amountFor(choice)) })}
                        </button>
                    </>
                )}

                {stage === "pay" && clientSecret && (
                    <PaymentForm
                        clientSecret={clientSecret}
                        mode="payment"
                        submitLabel={t("pay", { amount: price(amountFor(choice)) })}
                        onSuccess={handlePaid}
                    />
                )}

                {stage === "confirming" && !error && (
                    <p className="text-sm text-zinc-400 text-center py-6">{t("confirming")}</p>
                )}

                {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
            </div>
        </div>
    );
}
