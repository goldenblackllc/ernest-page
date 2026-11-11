"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Check, ImagePlus, X } from "lucide-react";
import type { User } from "firebase/auth";
import type { Timestamp } from "firebase/firestore";
import { authFetch } from "@/lib/auth/authFetch";
import { photoPreview, resizePhoto } from "@/lib/now/resizePhoto";
import { MAX_TEXT_LENGTH, type NowUnderway } from "@functions/lib/now";
import type { NowPost } from "@/types/post";
import { formatMinutes } from "./format";
import { useElapsedMinutes } from "./useElapsedMinutes";

/** What the person has written and chosen so far. NowSheets keeps it, so closing the sheet loses nothing. */
export type FinishDraft = { text: string; photo: { blob: Blob; preview: string } | null };
export const EMPTY_DRAFT: FinishDraft = { text: "", photo: null };

/**
 * Finish: what happened, anything unexpected, an optional photo, and Polish (its
 * spelling, grammar and flow fixed in the background after Done). The checkbox
 * opens the way the person left it last time. Drop it ends the action with no post.
 */
export function FinishSheet({ user, underway, polishDefault, draft, setDraft, onPosted, onDropped, onClose }: {
    user: User;
    underway: NowUnderway<Timestamp>;
    polishDefault: boolean;
    draft: FinishDraft;
    setDraft: Dispatch<SetStateAction<FinishDraft>>;
    onPosted: (post: NowPost, remaining: string[]) => void;
    onDropped: () => void;
    onClose: () => void;
}) {
    const t = useTranslations("now");
    const minutes = useElapsedMinutes(underway.started_at);
    const [polish, setPolish] = useState(polishDefault);
    const [readingPhoto, setReadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmingDrop, setConfirmingDrop] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const choosePhoto = async (file: File | undefined) => {
        if (!file) return;
        setReadingPhoto(true);
        try {
            const blob = await resizePhoto(file);
            const preview = await photoPreview(blob);
            setDraft((d) => ({ ...d, photo: { blob, preview } }));
            setError(null);
        } catch (err) {
            console.error("Failed to read the photo:", err);
            setError(t("photoError"));
        } finally {
            setReadingPhoto(false);
        }
    };

    const done = async () => {
        setSaving(true);
        setError(null);
        const form = new FormData();
        form.set("text", draft.text);
        form.set("polish", String(polish));
        if (draft.photo) form.set("photo", draft.photo.blob, "photo.jpg");
        try {
            const res = await authFetch(user, "/api/now/posts", { method: "POST", body: form });
            if (!res.ok) throw new Error(`Now post returned ${res.status}`);
            const { post, remaining } = (await res.json()) as { post: NowPost; remaining: string[] };
            onPosted(post, remaining);
        } catch (err) {
            console.error("Failed to post the action:", err);
            setError(t("error"));
            setSaving(false);
        }
    };

    const drop = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await authFetch(user, "/api/now", { method: "DELETE" });
            if (!res.ok) throw new Error(`Now drop returned ${res.status}`);
            onDropped();
        } catch (err) {
            console.error("Failed to drop the action:", err);
            setError(t("error"));
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-bold tracking-tight text-white">
                    {underway.action}
                    {minutes !== null && <> <span className="ml-1 text-xs font-medium tracking-normal text-zinc-500">{formatMinutes(minutes, t)}</span></>}
                </h2>
                <button type="button" onClick={onClose} aria-label={t("close")} className="-m-2 shrink-0 p-2 text-zinc-500 transition-colors duration-150 hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <label htmlFor="now-what-happened" className="mt-2 block text-xs text-zinc-400">{t("whatHappened")}</label>
            <textarea
                id="now-what-happened"
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                maxLength={MAX_TEXT_LENGTH}
                rows={4}
                className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none transition-colors duration-150 focus:border-white/30"
            />

            <div className="mt-2 flex items-center gap-2">
                {draft.photo && (
                    <img src={draft.photo.preview} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-white/10 object-cover" />
                )}
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={readingPhoto}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-colors duration-150 hover:bg-white/10 disabled:opacity-60"
                >
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {draft.photo ? t("changePhoto") : t("addPhoto")}
                </button>
                {draft.photo && (
                    <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, photo: null }))}
                        className="text-xs text-zinc-500 transition-colors duration-150 hover:text-white"
                    >
                        {t("removePhoto")}
                    </button>
                )}
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        void choosePhoto(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} className="peer sr-only" />
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-zinc-500 transition-colors duration-150 peer-checked:border-white peer-checked:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-white/40">
                    {polish && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                </span>
                <span className="text-sm font-bold text-white">{t("polish")}</span>
                <span className="text-xs text-zinc-500">{t("polishHint")}</span>
            </label>

            {error && <p className="mt-3 text-xs text-red-400" role="alert">{error}</p>}
            <button
                type="button"
                onClick={done}
                disabled={saving || readingPhoto}
                className="mt-4 h-11 w-full rounded-full bg-white text-sm font-bold text-black transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
            >
                {t("done")}
            </button>

            <div className="mt-3 flex justify-center text-xs">
                {confirmingDrop ? (
                    <span className="flex items-center gap-3 text-zinc-400">
                        {t("dropConfirm")}
                        <button type="button" onClick={drop} disabled={saving} className="font-bold text-white">{t("dropYes")}</button>
                        <button type="button" onClick={() => setConfirmingDrop(false)} className="font-bold text-zinc-400 transition-colors duration-150 hover:text-white">{t("keep")}</button>
                    </span>
                ) : (
                    <button type="button" onClick={() => setConfirmingDrop(true)} className="text-zinc-500 transition-colors duration-150 hover:text-white">
                        {t("drop")}
                    </button>
                )}
            </div>
        </div>
    );
}
