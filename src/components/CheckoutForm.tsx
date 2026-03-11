'use client';

import { useState } from 'react';
import {
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { Shield } from 'lucide-react';

interface CheckoutFormProps {
    plan: 'proving_ground' | 'long_game';
    uid: string;
    onSuccess: () => void;
    onError: (message: string) => void;
}

export function CheckoutForm({ plan, uid, onSuccess, onError }: CheckoutFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [ready, setReady] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setProcessing(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin,
            },
            redirect: 'if_required',
        });

        if (error) {
            onError(error.message || 'Payment failed. Please try again.');
            setProcessing(false);
            return;
        }

        if (paymentIntent?.status === 'succeeded') {
            // Payment succeeded — write subscription to Firestore
            try {
                const res = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid,
                        plan,
                        paymentIntentId: paymentIntent.id,
                    }),
                });

                if (!res.ok) throw new Error('Failed to activate subscription.');

                onSuccess();
            } catch (err: any) {
                onError(err.message || 'Payment processed but activation failed. Contact support.');
                setProcessing(false);
            }
        } else {
            onError('Payment was not completed. Please try again.');
            setProcessing(false);
        }
    };

    const buttonLabel = plan === 'proving_ground' ? 'Enter the Proving Ground' : 'Lock In the Long Game';

    return (
        <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 mb-6">
                <Shield className="w-4 h-4 text-zinc-600" />
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 font-semibold">
                    Payment Details
                </span>
            </div>

            <div className="mb-6">
                <PaymentElement
                    onReady={() => setReady(true)}
                    options={{
                        layout: 'tabs',
                    }}
                />
            </div>

            <button
                type="submit"
                disabled={!stripe || !elements || processing || !ready}
                className="w-full rounded-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {processing ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Processing...
                    </span>
                ) : (
                    buttonLabel
                )}
            </button>

            <p className="text-[10px] text-zinc-600 text-center tracking-wide mt-4">
                Encrypted & Private. Accountability is not optional.
            </p>
        </form>
    );
}
