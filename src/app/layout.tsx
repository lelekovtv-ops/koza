import type { Metadata } from "next";
import { StorageCleanup } from "@/components/app/StorageCleanup";
import { DevInspector } from "@/components/app/DevInspector";
import { DevButton } from "@/components/ui/DevButton";
import { GlobalNav } from "@/components/app/GlobalNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOZA — Unasked. Built",
  description: "Unasked. Built",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased flex flex-col h-screen overflow-hidden bg-[#0B0C10]">
        <StorageCleanup />
        <GlobalNav />
        <main className="flex-1 overflow-auto pt-[56px]">
          {children}
        </main>
        <DevButton />
        <DevInspector />
      </body>
    </html>
  );
}
