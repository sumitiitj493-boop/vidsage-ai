import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
