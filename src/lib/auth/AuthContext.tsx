'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

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

            // Persist auth hint for instant skeleton on next cold-open
            try {
                if (user) {
                    localStorage.setItem(AUTH_HINT_KEY, '1');
                } else {
                    localStorage.removeItem(AUTH_HINT_KEY);
                }
            } catch { /* localStorage unavailable — non-critical */ }

            // Sync region on every login — fire-and-forget
            if (user) {
                user.getIdToken().then(token => {
                    fetch('/api/user/region', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({}),
                    }).catch(() => { }); // Silent fail — non-critical
                }).catch(() => { });
            }
        });

        return () => unsubscribe();
    }, []);

    const signOut = async () => {
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

