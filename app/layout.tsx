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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function getTheme() {
                  var match = document.cookie.match(/(?:^| )theme=([^;]+)/);
                  return match ? match[1] : null;
                }
                var saved = getTheme();
                if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
