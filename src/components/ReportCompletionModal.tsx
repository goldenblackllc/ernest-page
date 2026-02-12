"use client";

import { useState, useRef } from "react";
import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";

interface ReportCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    action: any; // The active mission object
}

export function ReportCompletionModal({ isOpen, onClose, action }: ReportCompletionModalProps) {
    const { user } = useAuth();
    const [notes, setNotes] = useState("");
    const [unexpectedYield, setUnexpectedYield] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen || !action) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleConfirm = async () => {
        if (!user) return;
        if (!notes.trim()) {
            alert("Field notes are required.");
            return;
        }

        setIsSubmitting(true);
        try {
            let imageUrl = "";

            // 1. Upload Evidence (if any)
            if (file) {
                const storageRef = ref(storage, `reports/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            // 2. Update Master Action Status
            const actionRef = doc(db, "master_actions", action.id);
            await updateDoc(actionRef, {
                status: "completed",
                completedAt: serverTimestamp()
            });

            // 3. Add to Ledger (Entries)
            await addDoc(collection(db, "entries"), {
                type: "action_report",
                uid: user.uid,
                actionTitle: action.title || "Unknown Action",
                text: notes, // Main body for ledger
                unexpectedYield: unexpectedYield.trim() || null, // Only save if exists
                image: imageUrl || null,
                createdAt: serverTimestamp(),
                status: "completed"
            });

            onClose();
        } catch (error) {
            console.error("Error reporting completion:", error);
            alert("Failed to transmit report.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-white border-4 border-black p-8 max-w-lg w-full relative rounded-none shadow-2xl">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-xl font-black cursor-pointer hover:text-gray-500"
                >
                    ✕
                </button>

                {/* Header */}
                <h2 className="text-2xl font-black tracking-tighter uppercase mb-2">
                    FIELD REPORT
                </h2>
                <div className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">
                    {action.title || "UNTITLED ACTION"}
                </div>

                {/* Form Elements */}

                {/* Evidence Upload */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-black border-dashed p-4 text-center cursor-pointer hover:bg-gray-50 mb-6 text-xs font-bold uppercase tracking-widest text-gray-500 flex flex-col items-center justify-center gap-2"
                >
                    <span>{file ? `FILE SELECTED: ${file.name}` : "+ ATTACH EVIDENCE (OPTIONAL)"}</span>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*"
                    />
                </div>

                {/* Field Notes (Required) */}
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter field notes or physical results..."
                    className="w-full border-2 border-black p-4 text-sm focus:outline-none focus:ring-0 mb-4 rounded-none resize-none min-h-[120px] placeholder:text-gray-400"
                />

                {/* Unexpected Yield (Optional - CRITICAL) */}
                <textarea
                    value={unexpectedYield}
                    onChange={(e) => setUnexpectedYield(e.target.value)}
                    placeholder="Log an anomaly or unexpected yield (optional)..."
                    className="w-full border-2 border-black bg-gray-50 p-4 text-sm focus:outline-none focus:ring-0 mb-8 rounded-none resize-none min-h-[80px] placeholder:text-gray-400"
                />

                {/* Action Button */}
                <button
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                    className="bg-black text-white px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-gray-800 transition-colors w-full cursor-pointer disabled:opacity-50"
                >
                    {isSubmitting ? "TRANSMITTING..." : "CONFIRM KINETIC ACTION"}
                </button>
            </div>
        </div>
    );
}
