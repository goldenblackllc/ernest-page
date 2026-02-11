"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { MasterAction } from "@/lib/firebase/schema";


interface LockedContextType {
    isLocked: boolean;
    activeAction: MasterAction | null;
    lockApp: (action: MasterAction) => void;
    unlockApp: () => void;
}

const LockedContext = createContext<LockedContextType | undefined>(undefined);

export function LockedProvider({ children }: { children: ReactNode }) {
    const [isLocked, setIsLocked] = useState(false);
    const [activeAction, setActiveAction] = useState<MasterAction | null>(null);

    // Persist locked state to local storage to survive refreshes
    useEffect(() => {
        const storedLocked = localStorage.getItem("isLocked");
        const storedAction = localStorage.getItem("activeAction");
        if (storedLocked === "true" && storedAction) {
            setIsLocked(true);
            setActiveAction(JSON.parse(storedAction));
        }
    }, []);

    const lockApp = (action: MasterAction) => {
        setIsLocked(true);
        setActiveAction(action);
        localStorage.setItem("isLocked", "true");
        localStorage.setItem("activeAction", JSON.stringify(action));
    };

    const unlockApp = () => {
        setIsLocked(false);
        setActiveAction(null);
        localStorage.removeItem("isLocked");
        localStorage.removeItem("activeAction");
    };

    return (
        <LockedContext.Provider value={{ isLocked, activeAction, lockApp, unlockApp }}>
            {children}
        </LockedContext.Provider>
    );
}

export function useLocked() {
    const context = useContext(LockedContext);
    if (context === undefined) {
        throw new Error("useLocked must be used within a LockedProvider");
    }
    return context;
}
