import { redirect } from "@/i18n/navigation";

// Liked posts now live as a tab on the profile page
export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: { pathname: "/profile", query: { tab: "liked" } }, locale });
}
