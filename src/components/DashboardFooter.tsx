// This component was extracted from page.tsx to resolve duplication issues.
export function DashboardFooter() {
    return (
        <footer className="border-t-2 border-black mt-24">
            {/* Simple Brutalist Footer */}
            <div className="bg-white text-black py-16">
                <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div>
                        <div className="text-xl font-black uppercase mb-4 tracking-widest">Earnest Page</div>
                        <p className="text-xs mb-4 font-mono">
                            SYSTEM ACTIVE. MONITORING INPUTS.
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
