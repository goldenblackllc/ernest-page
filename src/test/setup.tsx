// Global test setup: every render gets the next-intl provider with the real
// English messages, matching how components run inside the [locale] layout.
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

function IntlWrapper({ children }: { children: ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
            {children}
        </NextIntlClientProvider>
    );
}

vi.mock("@testing-library/react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@testing-library/react")>();
    return {
        ...actual,
        render: ((ui: Parameters<typeof actual.render>[0], options?: Parameters<typeof actual.render>[1]) =>
            actual.render(ui, { wrapper: IntlWrapper, ...options })) as typeof actual.render,
    };
});
