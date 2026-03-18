"use client";

import { usePWAInstall } from "@/hooks/usePWAInstall";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function PWAInstallBanner() {
    const { canInstall, isIOS, isIOSSafari, promptInstall, dismiss } =
        usePWAInstall();
    const t = useTranslations("pwa");

    return (
        <AnimatePresence>
            {canInstall && (
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="mx-4 sm:mx-0 mb-4 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
                    id="pwa-install-banner"
                >
                    {isIOS ? (
                        <>
                            <Share className="w-5 h-5 text-zinc-400 shrink-0" />
                            <p className="flex-1 text-sm text-zinc-300 leading-snug">
                                {isIOSSafari
                                    ? t("installBanner.iosMessage")
                                    : t("installBanner.iosNonSafariMessage")}
                            </p>
                        </>
                    ) : (
                        <>
                            <Download className="w-5 h-5 text-zinc-400 shrink-0" />
                            <p className="flex-1 text-sm text-zinc-300 leading-snug">
                                {t("installBanner.message")}
                            </p>
                            <button
                                onClick={promptInstall}
                                className="shrink-0 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-white text-black rounded-full hover:bg-zinc-200 transition-colors"
                            >
                                {t("installBanner.install")}
                            </button>
                        </>
                    )}

                    <button
                        onClick={dismiss}
                        className="shrink-0 p-1 text-zinc-500 hover:text-white transition-colors"
                        aria-label={t("installBanner.dismiss")}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
