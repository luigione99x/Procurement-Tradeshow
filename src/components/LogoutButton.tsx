"use client";

export function LogoutButton() {
  return (
    <button
      className="btn-ghost"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Esci
    </button>
  );
}
