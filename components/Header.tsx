"use client";
export default function Header({ title, showBack = true }: { title: string; showBack?: boolean }) {
  return (
    <div className="header">
      <div className="header-left">
        {showBack && (
          <a href="/" className="header-admin">← Sign in</a>
        )}
        <h1>{title}</h1>
      </div>
      <a href="/admin" className="header-admin">Admin</a>
    </div>
  );
}
