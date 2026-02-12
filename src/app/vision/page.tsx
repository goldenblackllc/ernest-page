'use client';

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { VisionForm } from "@/components/VisionForm";

export default function VisionPage() {
    return (
        <ProtectedRoute>
            <main className="min-h-screen bg-white text-black p-6 md:p-8 lg:p-12">
                <VisionForm />
            </main>
        </ProtectedRoute>
    );
}
