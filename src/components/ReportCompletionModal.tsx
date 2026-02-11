import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { X } from "lucide-react";
import { FocusReportForm } from "./FocusReportForm";

interface ReportCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNext?: () => void;
    action: any;
}

export function ReportCompletionModal({ isOpen, onClose, onNext, action }: ReportCompletionModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md p-0 border border-gray-300 bg-white shadow-sm max-h-[90vh] overflow-y-auto rounded-none">
                <div className="absolute right-4 top-4 z-10">
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-black transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-8">
                    <FocusReportForm action={action} onSuccess={(next) => {
                        onClose();
                        if (next && onNext) {
                            onNext();
                        } else {
                            window.location.reload();
                        }
                    }} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
