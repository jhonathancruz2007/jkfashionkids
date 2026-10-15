import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Painel Administrativo | JKfashion Kids",
    template: "%s | Admin JKfashion Kids",
  },
  description: "Painel administrativo da JKfashion Kids.",
  icons: {
    icon: [{ url: "/admin-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/admin-icon.svg"],
    apple: [{ url: "/admin-icon.svg", type: "image/svg+xml" }],
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {children}
    </div>
  );
}
