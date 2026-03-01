import React, { useState } from 'react';
import { ArrowRight, Loader2, ImagePlus, X } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { storage, auth } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';

interface InputStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
    onCancel: () => void;
}

export default function InputStep({ state, setState, onNext, onCancel }: InputStepProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Initialize state from local storage securely
    React.useEffect(() => {
        const savedRant = localStorage.getItem('earnest_pending_rant');
        if (savedRant && !state.rant) {
            setState(prev => ({ ...prev, rant: savedRant }));
        }
    }, []);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select a valid image file.');
            return;
        }

        // Limit to 5MB
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be less than 5MB.');
            return;
        }

        setSelectedFile(file);

        // Create an object URL for immediate preview
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setError('');
    };

    const removeImage = () => {
        setSelectedFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        // Also clear any previously uploaded URL if they remove it
        if (state.imageUrl) {
            setState(prev => ({ ...prev, imageUrl: undefined }));
        }
    };

    const handleSubmit = async () => {
        if (!state.rant.trim()) {
            setError('Please describe what is going on before we consult.');
            return;
        }

        setIsGenerating(true);
        setError('');

        try {
            // Upload image if selected
            let uploadedImageUrl = state.imageUrl; // Keep existing if already uploaded and not removed

            if (selectedFile) {
                if (!auth.currentUser) throw new Error("Must be logged in to upload an image.");

                const timestamp = Date.now();
                // Create a unique filename: checkin_images/uid/timestamp_filename
                const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                const storageRef = ref(storage, `checkin_images/${auth.currentUser.uid}/${timestamp}_${safeName}`);

                const snapshot = await uploadBytes(storageRef, selectedFile);
                uploadedImageUrl = await getDownloadURL(snapshot.ref);

                // Update state with the uploaded URL
                setState(prev => ({ ...prev, imageUrl: uploadedImageUrl }));
            }
            // Get the current user token via the backend directly instead of passing it from frontend props to keep it clean.
            // But we actually DO pass uid from context if we need it. For now, since CheckInWizardModal doesn't pass UID, 
            // the CounselStep actually fetches the user profile using the auth context *inside* the API route or passed.
            // Let's look at how BriefingStep used to call Consult. It didn't. BriefingStep just advanced to CounselStep, and CounselStep did the loading.

            // Wait, CounselStep is where the API call happens. We just need to advance the step here.
            onNext();
        } catch (err: any) {
            console.error('Submission failed:', err);
            setError('Failed to advance. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
            <div className="flex-1 overflow-y-auto mb-6">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-tight">What's going on since the last check in?</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Write freely. What are you facing? What is your tension? This is strictly private between you and Character A.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div className="relative">
                            <textarea
                                value={state.rant}
                                onChange={(e) => {
                                    setState(prev => ({ ...prev, rant: e.target.value }));
                                    localStorage.setItem('earnest_pending_rant', e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="I'm feeling..."
                                className="w-full h-64 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 pb-16 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y transition-shadow custom-scrollbar"
                            />

                            {/* Image Upload/Preview Area */}
                            <div className="absolute bottom-3 left-4 flex items-center gap-3">

                                {/* Hidden Input */}
                                <input
                                    type="file"
                                    id="image-upload"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageSelect}
                                />

                                {/* Upload Button - Only show if no image exists */}
                                {!previewUrl && !state.imageUrl && (
                                    <label
                                        htmlFor="image-upload"
                                        className="flex items-center justify-center p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer transition-colors border border-zinc-700/50"
                                        title="Attach an image"
                                    >
                                        <ImagePlus className="w-5 h-5" />
                                    </label>
                                )}

                                {/* Image Preview Thumbnail */}
                                {(previewUrl || state.imageUrl) && (
                                    <div className="relative group rounded-lg overflow-hidden border border-zinc-700/50 w-12 h-12 bg-zinc-950">
                                        <Image
                                            src={previewUrl || state.imageUrl || ""}
                                            alt="Preview"
                                            fill
                                            className="object-cover"
                                        />
                                        <button
                                            onClick={removeImage}
                                            className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remove image"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {error && (
                            <p className="text-sm text-red-500 font-medium animate-in fade-in duration-200">
                                {error}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-3 mt-auto shrink-0 border-t border-zinc-800/50 pt-6">
                <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl font-bold transition-all border border-zinc-800"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!state.rant.trim() || isGenerating}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all font-sans"
                >
                    {isGenerating ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            Consult <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
