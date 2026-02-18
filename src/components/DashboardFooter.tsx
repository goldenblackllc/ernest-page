// This component was extracted from page.tsx to resolve duplication issues.
export function DashboardFooter() {
    return (
        <footer className="border-t border-white/5 mt-24 pb-24">
            {/* Simple Minimalist Footer */}
            <div className="bg-black text-zinc-500 py-16">
                <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div>
                        <div className="text-sm font-bold uppercase mb-4 tracking-widest text-zinc-400">Earnest Page</div>
                        <p className="text-xs mb-4">
                            Character Editor for Reality.
                        </p>
                    </div>

                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest font-bold">
                            &copy; 2026 Earnest Page.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
