import "./globals.css";
import OfflineProvider from "@/components/OfflineProvider";

export const metadata = {
  title: "R2G Site Register",
  description: "R2G Projects — Digital Site Attendance Register",
  appleWebApp: {
    capable: true,
    title: "Site Register",
    statusBarStyle: "black",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OfflineProvider>{children}</OfflineProvider>
      </body>
    </html>
  );
}