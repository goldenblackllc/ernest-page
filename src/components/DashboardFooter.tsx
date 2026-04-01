// This component was extracted from page.tsx to resolve duplication issues.
export function DashboardFooter() {
    return (
        <footer className="w-full border-t border-white/5 mt-auto bg-black z-10 relative">
            <div className="container mx-auto px-4 py-8 pb-32 flex flex-col md:flex-row justify-between items-start md:items-center text-zinc-500 gap-4">
                <div>
                    <div className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">Earnest Page</div>
                    <p className="text-xs">Character Editor for Reality.</p>
                </div>
                <div className="text-[10px] uppercase tracking-widest font-bold">
                    &copy; 2026 Earnest Page.
                </div>
            </div>
        </footer>
    );
}
