import type { Metadata } from "next";
import { StorageCleanup } from "@/components/app/StorageCleanup";
import { DevInspector } from "@/components/app/DevInspector";
import { GlobalNav } from "@/components/app/GlobalNav";
import { ThemeProvider } from "@/components/app/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PIECE — Creative Production Platform",
  description: "Creative Production Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased flex flex-col h-screen overflow-hidden bg-[#0B0C10]">
        <ThemeProvider />
        <StorageCleanup />
        <GlobalNav />
        <main className="flex-1 overflow-auto pt-[56px]">
          {children}
        </main>
        <DevInspector />
      </body>
    </html>
  );
}
