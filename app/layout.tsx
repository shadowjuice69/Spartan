import type { Metadata } from "next";
import "./globals.css";
import CommandClockMount from "./components/CommandClockMount";
import UpdatesNotice from "./components/UpdatesNotice";
import WelcomeBriefing from "./components/WelcomeBriefing";
import WelcomeIdentityPrompt from "./components/WelcomeIdentityPrompt";

export const metadata: Metadata = {
  title: "Spartan — Province Command Center",
  description: "Utopia Age 116 strategic command interface",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CommandClockMount />
        <UpdatesNotice />
        <WelcomeBriefing />
        <WelcomeIdentityPrompt />
        {children}
      </body>
    </html>
  );
}
