"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/onsite", label: "On-Site" },
  { href: "/admin/emergency", label: "Emergency" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/sites", label: "Sites" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/visitors", label: "Visitors" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
      if (pathname === "/admin/login") {
        setAuthed(false);
        return;
      }
      fetch("/api/admin/dashboard")
        .then(r => {
          if (!r.ok) throw new Error("no");
          setAuthed(true);
        })
        .catch(() => { setAuthed(false); router.push("/admin/login"); });
    }, [pathname, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (authed === null) {
    return (
      <div>
        <div className="header">
          <div className="header-left">
            <a href="/" className="header-admin">← Sign in</a>
            <h1>R2G Admin</h1>
          </div>
        </div>
        <div className="accent-bar" />
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (!authed) return null;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          <a href="/" className="header-admin">← Sign in</a>
          <h1>R2G Admin</h1>
        </div>
        <button
          className="btn"
          style={{ background: "transparent", color: "#fff", minHeight: 36, padding: "6px 12px", fontSize: "0.875rem" }}
          onClick={() => router.push("/admin/login")}
        >
          Logout
        </button>
      </div>
      <div className="accent-bar" />
      <nav className="admin-nav">
        {ADMIN_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="container-wide">{children}</div>
    </div>
  );
}