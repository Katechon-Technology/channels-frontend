"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function PrivyProviderClient({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const devBypass = process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "1";

  if (devBypass) return <>{children}</>;

  if (!appId) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-0 p-6 text-foreground">
        <section className="w-full max-w-lg rounded-lg border border-surface-3 bg-surface-1 p-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-accent-amber">
            configuration required
          </div>
          <h1 className="font-heading text-3xl font-semibold">Privy app ID missing</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Set NEXT_PUBLIC_PRIVY_APP_ID in this frontend environment before using
            the channel console.
          </p>
        </section>
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#00E87B",
          logo: undefined,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
