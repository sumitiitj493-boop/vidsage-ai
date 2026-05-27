import "./globals.css";
import { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
};

export const metadata = {
  title: "VidSage",
  description: "AI-powered video learning assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js"
          async
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
