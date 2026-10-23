import type { Metadata } from "next";
import "./globals.css";
import UpdatesNotice from "./components/UpdatesNotice";
import Jeeves from "./components/Jeeves";
import JeevesHourly from "./components/JeevesHourly";
import DiagnosticsMonitor from "./components/DiagnosticsMonitor";

export const metadata: Metadata = {
  title: "Spartan — Province Command Center",
  description: "Utopia Age 116 strategic command interface",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <UpdatesNotice />
        <Jeeves />
        <JeevesHourly />
        <DiagnosticsMonitor />
        {children}
      </body>
    </html>
  );
}
