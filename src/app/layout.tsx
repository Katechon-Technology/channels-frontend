import type { Metadata } from "next";
import "./globals.css";
import { PrivyProviderClient } from "@/components/privy-provider-client";

export const metadata: Metadata = {
  title: "Katechon Channels",
  description: "Config-driven AI-tuned intelligence channels.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PrivyProviderClient>{children}</PrivyProviderClient>
      </body>
    </html>
  );
}
