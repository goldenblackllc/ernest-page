"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import { MEMBERSHIP } from "@/lib/payments/catalog";
import type { BillingItem, SavedCard } from "@/lib/payments/billing";
import { SESSION_LIMITS, type AccessSummary } from "@functions/lib/access/sessionAccess";
import { PaymentForm } from "./PaymentForm";
import { PurchasePanel, type Choice } from "./PurchasePanel";
import { EmailForm } from "./EmailForm";

interface Status {
    summary: AccessSummary;
    purchases: { id: string; product: string; creditsTotal: number; creditsRemaining: number; amountCents: number; refundableCents: number; purchasedAt: number }[];
    sessions: { id: string; startedAt: number; amountCents: number; refunded: boolean; refundable: boolean; reason?: string }[];
    sessionRefundsLeft: number;
    membershipRefundable: boolean;
    billingEmail: string | null;
    cards: SavedCard[];
}

type Refund = { kind: "credits"; lotId: string; amountCents: number } | { kind: "session"; sessionId: string; amountCents: number } | { kind: "membership"; amountCents: number };

/**
 * Billing (hamburger menu → Billing): balance, membership, payment methods,
 * receipt email, billing history with receipts, and self-serve refunds.
 * All in-app; no Stripe-hosted pages.
 */
export function BillingView() {
    const { user } = useAuth();
    const t = useTranslations("payments");
    const format = useFormatter();
    const [status, setStatus] = useState<Status | null>(null);
    const [history, setHistory] = useState<BillingItem[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [purchase, setPurchase] = useState<Choice | null>(null);
    const [cardSecret, setCardSecret] = useState<string | null>(null);
    const [editingEmail, setEditingEmail] = useState(false);
    const [pendingRefund, setPendingRefund] = useState<Refund | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const price = (cents: number) => format.number(cents / 100, { style: "currency", currency: "USD" });
    const date = (ms: number) => format.dateTime(new Date(ms), { month: "long", day: "numeric", year: "numeric" });

    const load = useCallback(() => {
        if (!user) return Promise.resolve();
        const getJson = (url: string) => authFetch(user, url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))));
        return Promise.all([
            getJson("/api/payments/status").then((data: Status) => { setStatus(data); setLoadFailed(false); }),
            getJson("/api/payments/history").then((data: { items: BillingItem[] }) => setHistory(data.items)).catch(() => setHistory([])),
        ]).catch(() => setLoadFailed(true));
    }, [user]);

    useEffect(() => { load(); }, [load]);

    const post = async (url: string, body?: unknown) => {
        if (!user) throw new Error("signed out");
        const res = await authFetch(user, url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw Object.assign(new Error(data.error), { reason: data.reason });
        return data;
    };

    const run = async (action: () => Promise<unknown>, done?: string) => {
        setBusy(true);
        setNotice(null);
        try {
            await action();
            if (done) setNotice(done);
            await load();
        } catch (error) {
            setNotice((error as { reason?: string }).reason === "membership_default" ? t("removeDefaultBlocked") : t("actionFailed"));
        } finally {
            setBusy(false);
        }
    };

    const startAddCard = () => run(async () => {
        const data = await post("/api/payments/methods", { action: "add", makeDefault: (status?.cards.length ?? 0) === 0 });
        setCardSecret(data.clientSecret);
    });

    const confirmRefund = async () => {
        if (!pendingRefund) return;
        const refund = pendingRefund;
        setPendingRefund(null);
        setBusy(true);
        setNotice(null);
        try {
            const body = refund.kind === "credits" ? { kind: refund.kind, lotId: refund.lotId }
                : refund.kind === "session" ? { kind: refund.kind, sessionId: refund.sessionId }
                : { kind: refund.kind };
            const data = await post("/api/payments/refund", body);
            setNotice(t("refundDone", { amount: price(data.amountCents) }));
            await load();
        } catch {
            setNotice(t("refundFailed"));
        } finally {
            setBusy(false);
        }
    };

    if (!user) return null;
    if (loadFailed) return <p className="px-4 py-8 text-sm text-zinc-500 text-center">{t("loadFailed")}</p>;
    if (!status) return <div className="mx-4 mt-6 h-40 rounded-xl bg-zinc-900/50 animate-pulse" />;

    const { summary } = status;
    const unused = status.purchases.filter((p) => p.creditsRemaining > 0);
    const itemLabel = (item: BillingItem["item"]) => (item === "membership" ? t("membership") : item === "pack3" ? t("pack3") : t("single"));

    return (
        <div className="px-4 py-6 space-y-10">
            <h1 className="text-2xl font-bold text-white tracking-tight">{t("billingTitle")}</h1>

            {/* ── Balance ── */}
            <section className="space-y-3">
                <Heading>{t("balance")}</Heading>
                {summary.membership && (
                    <Row label={t("memberActive")} value={summary.membership.comp ? t("memberComp") : summary.membership.cancelAtPeriodEnd
                        ? t("memberEnds", { date: date(summary.membership.renewsAt) })
                        : t("memberRenews", { date: date(summary.membership.renewsAt) })} />
                )}
                <Row
                    label={t("freeRemaining", { count: summary.freeRemaining })}
                    value={summary.freeRenewsAt ? t("renews", { date: date(summary.freeRenewsAt) }) : ""}
                />
                <Row label={t("credits", { count: summary.credits })} value={t("neverExpire")} />
                <Row label={t("today", { count: summary.sessionsToday, limit: summary.sessionsPerDay })} value="" />
                <p className="text-xs text-zinc-500 leading-relaxed">
                    {t("limits", { turns: SESSION_LIMITS.turnsPerSession, hours: SESSION_LIMITS.sessionHours, perDay: SESSION_LIMITS.sessionsPerDay })}
                </p>
                <PrimaryButton onClick={() => setPurchase("single")}>{t("addSessions")}</PrimaryButton>
            </section>

            {/* ── Membership ── */}
            <section className="space-y-3">
                <Heading>{t("membership")}</Heading>
                {summary.membership?.comp ? (
                    <p className="text-sm text-zinc-400">{t("memberCompNote")}</p>
                ) : summary.membership ? (
                    <div className="flex flex-wrap gap-2">
                        {summary.membership.cancelAtPeriodEnd
                            ? <PillButton onClick={() => run(() => post("/api/payments/membership/cancel", { resume: true }))} disabled={busy}>{t("resumeMembership")}</PillButton>
                            : <PillButton onClick={() => run(() => post("/api/payments/membership/cancel", { resume: false }))} disabled={busy}>{t("cancelMembership")}</PillButton>}
                        {status.membershipRefundable && (
                            <PillButton onClick={() => setPendingRefund({ kind: "membership", amountCents: MEMBERSHIP.amountCents })} disabled={busy}>
                                {t("refundMembership")}
                            </PillButton>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-zinc-400">{t("membershipPitch", { price: price(MEMBERSHIP.amountCents) })}</p>
                        <PillButton onClick={() => setPurchase("membership")} disabled={busy}>{t("becomeMember")}</PillButton>
                    </div>
                )}
            </section>

            {/* ── Payment methods ── */}
            <section className="space-y-3">
                <Heading>{t("paymentMethods")}</Heading>
                {status.cards.length === 0 && !cardSecret && <p className="text-sm text-zinc-500">{t("noCards")}</p>}
                {status.cards.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-4 border-b border-white/5 pb-3">
                        <div className="min-w-0">
                            <p className="text-sm text-zinc-200 capitalize">{c.last4 ? t("cardOnFile", { brand: c.brand, last4: c.last4 }) : c.brand}</p>
                            <p className="text-xs text-zinc-500">
                                {c.expMonth > 0 && t("cardExpires", { month: String(c.expMonth).padStart(2, "0"), year: String(c.expYear) })}
                                {c.isDefault && <span className="ml-2 text-emerald-400">{t("defaultCard")}</span>}
                            </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {!c.isDefault && (
                                <PillButton onClick={() => run(() => post("/api/payments/methods", { action: "default", paymentMethodId: c.id }))} disabled={busy}>
                                    {t("makeDefault")}
                                </PillButton>
                            )}
                            <PillButton onClick={() => run(() => post("/api/payments/methods", { action: "remove", paymentMethodId: c.id }))} disabled={busy}>
                                {t("removeCard")}
                            </PillButton>
                        </div>
                    </div>
                ))}
                {cardSecret ? (
                    <PaymentForm
                        clientSecret={cardSecret}
                        mode="setup"
                        submitLabel={t("saveCard")}
                        onSuccess={() => { setCardSecret(null); setNotice(t("cardSaved")); setTimeout(load, 3000); }}
                    />
                ) : (
                    <PillButton onClick={startAddCard} disabled={busy}>{t("addCard")}</PillButton>
                )}
            </section>

            {/* ── Receipt email ── */}
            <section className="space-y-3">
                <Heading>{t("receiptEmail")}</Heading>
                {editingEmail || !status.billingEmail ? (
                    <EmailForm
                        user={user}
                        initial={status.billingEmail || ""}
                        onSaved={() => { setEditingEmail(false); load(); }}
                    />
                ) : (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-zinc-200 break-all">{status.billingEmail}</p>
                        <PillButton onClick={() => setEditingEmail(true)} disabled={busy}>{t("changeEmail")}</PillButton>
                    </div>
                )}
                <p className="text-xs text-zinc-500">{t("emailUse")}</p>
            </section>

            {/* ── History ── */}
            <section className="space-y-3">
                <Heading>{t("history")}</Heading>
                {history === null && <div className="h-16 rounded-xl bg-zinc-900/50 animate-pulse" />}
                {history?.length === 0 && <p className="text-sm text-zinc-500">{t("noHistory")}</p>}
                {history?.map((h) => (
                    <Link key={h.id} href={`/billing/receipt/${h.id}`} className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 hover:opacity-80 transition-opacity">
                        <div className="min-w-0">
                            <p className="text-sm text-zinc-200">{itemLabel(h.item)}</p>
                            <p className="text-xs text-zinc-500">
                                {date(h.createdAt)}
                                {h.refundedCents > 0 && <span className="ml-2">{t("refundedAmount", { amount: price(h.refundedCents) })}</span>}
                            </p>
                        </div>
                        <span className="text-sm font-semibold text-zinc-200 shrink-0">{price(h.amountCents)}</span>
                    </Link>
                ))}
            </section>

            {/* ── Refunds ── */}
            {(unused.length > 0 || status.sessions.length > 0) && (
                <section className="space-y-3">
                    <Heading>{t("refunds")}</Heading>
                    {unused.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm text-zinc-200">{t("unused", { remaining: p.creditsRemaining, total: p.creditsTotal })}</p>
                                <p className="text-xs text-zinc-500">{date(p.purchasedAt)}</p>
                            </div>
                            <PillButton onClick={() => setPendingRefund({ kind: "credits", lotId: p.id, amountCents: p.refundableCents })} disabled={busy}>
                                {t("refundAmount", { amount: price(p.refundableCents) })}
                            </PillButton>
                        </div>
                    ))}
                    {status.sessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-4">
                            <p className="text-sm text-zinc-200">{t("sessionOn", { date: date(s.startedAt) })}</p>
                            {s.refunded ? (
                                <span className="text-xs text-zinc-500">{t("refunded")}</span>
                            ) : s.refundable ? (
                                <PillButton onClick={() => setPendingRefund({ kind: "session", sessionId: s.id, amountCents: s.amountCents })} disabled={busy}>
                                    {t("refundAmount", { amount: price(s.amountCents) })}
                                </PillButton>
                            ) : (
                                <span className="text-xs text-zinc-500">{t("refundLimit")}</span>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* ── Confirm a refund ── */}
            {pendingRefund && (
                <div className="border border-white/10 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-white">{t("confirmRefund", { amount: price(pendingRefund.amountCents) })}</p>
                    <div className="flex gap-2">
                        <PillButton onClick={confirmRefund} disabled={busy} primary>{t("confirm")}</PillButton>
                        <PillButton onClick={() => setPendingRefund(null)} disabled={busy}>{t("keep")}</PillButton>
                    </div>
                </div>
            )}

            {notice && <p className="text-sm text-emerald-400" role="status">{notice}</p>}

            {purchase && (
                <PurchasePanel
                    user={user}
                    summary={summary}
                    initialChoice={purchase}
                    onClose={() => setPurchase(null)}
                    onPurchased={() => { setPurchase(null); load(); }}
                />
            )}
        </div>
    );
}

function Heading({ children }: { children: React.ReactNode }) {
    return <h2 className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{children}</h2>;
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-3">
            <span className="text-sm font-semibold text-white">{label}</span>
            {value && <span className="text-xs text-zinc-500 text-right">{value}</span>}
        </div>
    );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full bg-white text-black text-sm font-bold py-3 rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
        >
            {children}
        </button>
    );
}

function PillButton({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={
                primary
                    ? "bg-white text-black text-xs font-bold px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
                    : "border border-white/10 text-zinc-200 text-xs font-semibold px-4 py-2 rounded-full hover:border-white/30 transition-colors duration-150 disabled:opacity-50"
            }
        >
            {children}
        </button>
    );
}
