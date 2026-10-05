import { redirect } from "@/i18n/navigation";

// My Posts now lives as a tab on the profile page
export default async function MyPostsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect({ href: { pathname: "/profile", query: { tab: "posts" } }, locale });
}
