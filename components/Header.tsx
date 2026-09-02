"use client";
import { useEffect, useState } from "react";
import { kioskSiteCodeFromCookie } from "@/lib/kiosk";

export default function Header({
  title,
  showBack = true,
  hideAdmin = false,
}: {
  title: string;
  showBack?: boolean;
  hideAdmin?: boolean;
}) {
  const [kiosk, setKiosk] = useState(hideAdmin);

  useEffect(() => {
    if (hideAdmin) {
      setKiosk(true);
      return;
    }
    const fromPath = window.location.pathname.startsWith("/kiosk");
    setKiosk(fromPath || Boolean(kioskSiteCodeFromCookie(document.cookie)));
  }, [hideAdmin]);

  return (
    <div className="header">
      <div className="header-left">
        {showBack && !kiosk && (
          <a href="/" className="header-admin">← Sign in</a>
        )}
        <h1>{title}</h1>
      </div>
      {!kiosk && <a href="/admin" className="header-admin">Admin</a>}
    </div>
  );
}
