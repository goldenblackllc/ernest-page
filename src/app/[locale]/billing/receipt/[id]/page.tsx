"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import type { BillingItem } from "@/lib/payments/billing";
import type { SELLER } from "@/lib/payments/catalog";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

interface Receipt extends BillingItem {
    receiptNumber: string;
    billingEmail: string | null;
    refunds: { createdAt: number; amountCents: number }[];
    seller: typeof SELLER;
}

/** A printable receipt for one payment (Billing → History). Print or save as PDF from the browser. */
export default function ReceiptPage() {
    return (
        <ProtectedRoute>
            <ReceiptView />
        </ProtectedRoute>
    );
}

function ReceiptView() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const t = useTranslations("payments");
    const format = useFormatter();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!user || !id) return;
        authFetch(user, `/api/payments/receipt?id=${encodeURIComponent(id)}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(setReceipt)
            .catch(() => setFailed(true));
    }, [user, id]);

    const price = (cents: number) => format.number(cents / 100, { style: "currency", currency: receipt?.currency.toUpperCase() || "USD" });
    const date = (ms: number) => format.dateTime(new Date(ms), { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    const itemLabel = (item: BillingItem["item"]) => (item === "membership" ? t("membershipMonth") : item === "pack3" ? t("pack3") : t("single"));

    return (
        <main className="min-h-screen bg-black text-zinc-300 print:bg-white print:text-black">
            <div className="max-w-xl mx-auto px-6 pt-[calc(32px+env(safe-area-inset-top))] pb-16">
                <div className="flex items-center justify-between mb-10 print:hidden">
                    <Link href="/billing" className="text-sm text-zinc-500 hover:text-white transition-colors">← {t("billingTitle")}</Link>
                    {receipt && (
                        <button onClick={() => window.print()} className="border border-white/10 text-zinc-200 text-xs font-semibold px-4 py-2 rounded-full hover:border-white/30 transition-colors duration-150">
                            {t("printReceipt")}
                        </button>
                    )}
                </div>

                {failed && <p className="text-sm text-zinc-500">{t("receiptNotFound")}</p>}
                {!receipt && !failed && <div className="h-64 rounded-xl bg-zinc-900/50 animate-pulse" />}

                {receipt && (
                    <article className="space-y-8">
                        <header>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 print:text-zinc-600">{t("receipt")}</p>
                            <h1 className="text-2xl font-bold text-white print:text-black mt-1">{receipt.seller.name}</h1>
                            {receipt.seller.legalName && <p className="text-sm">{receipt.seller.legalName}</p>}
                            {receipt.seller.address && <p className="text-sm whitespace-pre-line">{receipt.seller.address}</p>}
                            {receipt.seller.taxId && <p className="text-sm">{t("taxId", { id: receipt.seller.taxId })}</p>}
                        </header>

                        <dl className="grid grid-cols-2 gap-y-2 text-sm">
                            <dt className="text-zinc-500">{t("receiptNumber")}</dt><dd className="text-right break-all">{receipt.receiptNumber}</dd>
                            <dt className="text-zinc-500">{t("datePaid")}</dt><dd className="text-right">{date(receipt.createdAt)}</dd>
                            {receipt.card && (<><dt className="text-zinc-500">{t("paidWith")}</dt><dd className="text-right capitalize">{t("cardOnFile", { brand: receipt.card.brand, last4: receipt.card.last4 })}</dd></>)}
                            {receipt.billingEmail && (<><dt className="text-zinc-500">{t("billedTo")}</dt><dd className="text-right break-all">{receipt.billingEmail}</dd></>)}
                        </dl>

                        <div className="border-t border-white/10 print:border-zinc-300 pt-4 space-y-2 text-sm">
                            <div className="flex justify-between"><span>{itemLabel(receipt.item)}</span><span>{price(receipt.amountCents)}</span></div>
                            {receipt.refunds.map((r, i) => (
                                <div key={i} className="flex justify-between text-zinc-500">
                                    <span>{t("refundOn", { date: date(r.createdAt) })}</span><span>−{price(r.amountCents)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between font-bold text-white print:text-black border-t border-white/10 print:border-zinc-300 pt-2">
                                <span>{t("totalPaid")}</span><span>{price(receipt.amountCents - receipt.refundedCents)}</span>
                            </div>
                        </div>
                    </article>
                )}
            </div>
        </main>
    );
}
