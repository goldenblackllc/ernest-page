'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
import { clearFeedCache } from '@/lib/feedCache';

const AUTH_HINT_KEY = 'ep-auth-hint';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

/**
 * Returns true if a user was previously logged in.
 * Synchronous read from localStorage — no async wait.
 */
export function getAuthHint(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(AUTH_HINT_KEY) === '1';
    } catch {
        return false;
    }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);

            try {
                if (user) {
                    localStorage.setItem(AUTH_HINT_KEY, '1');

                    // Track last_active_date once per day (fire-and-forget)
                    const today = new Date().toISOString().split('T')[0];
                    const activeKey = `ep-active-${user.uid}`;
                    if (localStorage.getItem(activeKey) !== today) {
                        localStorage.setItem(activeKey, today);
                        updateDoc(doc(db, 'users', user.uid), { last_active_date: today }).catch(() => {});
                    }
                } else {
                    localStorage.removeItem(AUTH_HINT_KEY);
                }
            } catch { /* localStorage unavailable — non-critical */ }
        });

        return () => unsubscribe();
    }, []);

    const signOut = async () => {
        clearFeedCache();
        try {
            localStorage.removeItem(AUTH_HINT_KEY);
        } catch { /* non-critical */ }
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

