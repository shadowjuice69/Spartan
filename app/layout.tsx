import type { Metadata } from "next";
import "./globals.css";
import CommandClockMount from "./components/CommandClockMount";

export const metadata: Metadata = {
  title: "Spartan — Province Command Center",
  description: "Utopia Age 116 strategic command interface",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><CommandClockMount />{children}</body>
    </html>
  );
}
