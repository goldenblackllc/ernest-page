"use client";

import { RefreshCw, Fingerprint, Zap, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ControlButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
}

function ControlButton({ icon, label, onClick }: ControlButtonProps) {
    return (
        <button
            onClick={onClick}
            className="group flex flex-col items-center justify-center gap-1 md:gap-2 p-2 md:p-4 border-2 border-black bg-white hover:bg-black hover:text-white transition-colors duration-200 uppercase font-bold tracking-widest text-[10px] md:text-xs w-full h-20 md:h-24"
        >
            <div className="group-hover:text-white text-black transition-colors duration-200">
                {icon}
            </div>
            <span className="leading-none text-center">{label}</span>
        </button>
    );
}

interface ControlDeckProps {
    onIdentityClick?: () => void;
    onTakeActionClick?: () => void;
}

export function ControlDeck({ onIdentityClick, onTakeActionClick }: ControlDeckProps) {
    return (
        <div className="grid grid-cols-4 gap-2 md:gap-4 mt-6">
            <ControlButton
                icon={<RefreshCw className="w-4 h-4 md:w-6 md:h-6" />}
                label="Recast"
            />
            <ControlButton
                icon={<Fingerprint className="w-4 h-4 md:w-6 md:h-6" />}
                label="Identity"
                onClick={onIdentityClick}
            />
            <ControlButton
                icon={<Zap className="w-4 h-4 md:w-6 md:h-6" />}
                label="Take Action"
                onClick={onTakeActionClick}
            />
            <ControlButton
                icon={<Star className="w-4 h-4 md:w-6 md:h-6" />}
                label="I Want"
            />
        </div>
    );
}
