import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const THINKING_STEPS = [
    "Analyzing the tension...",
    "Checking against your Core Beliefs...",
    "Identifying the hidden rule...",
    "Drafting your new protocol...",
    "Finalizing the Recast..."
];

export const RecastThinkingState = () => {
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setStepIndex((prev) => (prev + 1) % THINKING_STEPS.length);
        }, 2500); // 2.5 seconds loop
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-8 animate-in fade-in duration-500">
            {/* Pulsing Orb */}
            <div className="relative">
                <motion.div
                    className="w-24 h-24 bg-blue-500/20 rounded-full blur-xl absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
                <motion.div
                    className="w-16 h-16 bg-blue-400/10 rounded-full relative z-10 border border-blue-500/30"
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.5
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center z-20">
                    <motion.div
                        className="w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)]"
                        animate={{
                            opacity: [0.5, 1, 0.5],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            duration: 1.5,
                            repeat: Infinity
                        }}
                    />
                </div>
            </div>

            {/* Cycling Text */}
            <div className="h-8 flex items-center justify-center overflow-hidden relative w-full">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={stepIndex}
                        initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                        transition={{ duration: 0.5 }}
                        className="text-center font-medium text-zinc-400 text-sm tracking-wide"
                    >
                        {THINKING_STEPS[stepIndex]}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};
