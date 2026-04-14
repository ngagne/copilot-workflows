import type { Metadata } from "next";
import { ThemeProvider } from "@/src/contexts/ThemeContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "AI Workflows",
  description: "Powered by GitHub Copilot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
