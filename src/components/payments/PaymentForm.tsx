"use client";

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";

let stripePromise: Promise<Stripe | null> | null = null;
export function getStripePromise() {
    if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
    return stripePromise;
}

// Matches the app: black surfaces, zinc borders, white text, pill-free inputs.
const APPEARANCE = {
    theme: "night" as const,
    variables: {
        colorPrimary: "#ffffff",
        colorBackground: "#18181b",
        colorText: "#f4f4f5",
        colorTextSecondary: "#a1a1aa",
        colorDanger: "#f87171",
        borderRadius: "12px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSizeBase: "16px",
    },
    rules: {
        ".Input": { border: "1px solid #27272a", boxShadow: "none" },
        ".Input:focus": { border: "1px solid #52525b", boxShadow: "none" },
        ".Tab": { border: "1px solid #27272a", boxShadow: "none" },
    },
};

interface PaymentFormProps {
    clientSecret: string;
    /** 'payment' for purchases and membership, 'setup' to save a new card */
    mode: "payment" | "setup";
    submitLabel: string;
    onSuccess: () => void;
}

/**
 * Stripe Payment Element inside our own page: cards and wallets, no redirects.
 */
export function PaymentForm(props: PaymentFormProps) {
    return (
        <Elements stripe={getStripePromise()} options={{ clientSecret: props.clientSecret, appearance: APPEARANCE }}>
            <PaymentFormInner {...props} />
        </Elements>
    );
}

function PaymentFormInner({ mode, submitLabel, onSuccess }: PaymentFormProps) {
    const t = useTranslations("payments");
    const stripe = useStripe();
    const elements = useElements();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);

        const returnUrl = window.location.href; // only used by methods that redirect, which are disabled
        const result = mode === "payment"
            ? await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: returnUrl } })
            : await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: returnUrl } });

        if (result.error) {
            setError(result.error.message || t("paymentFailed"));
            setIsSubmitting(false);
            return;
        }
        onSuccess();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Link is Stripe's own wallet with its own sign-in; cards, Apple Pay and Google Pay only. */}
            <PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
                type="submit"
                disabled={!stripe || isSubmitting}
                className="w-full bg-white text-black text-sm font-bold py-3.5 rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
                {isSubmitting ? t("processing") : submitLabel}
            </button>
        </form>
    );
}
