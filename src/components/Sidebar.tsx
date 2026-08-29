"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ScanLine, Database, ListOrdered, LayoutDashboard } from "lucide-react";

const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/verify", label: "Screen Document", icon: ScanLine },
  { href: "/dashboard", label: "Risk Dashboard", icon: ShieldCheck },
  { href: "/records", label: "Reference Records", icon: Database },
  { href: "/audit", label: "Audit Trail", icon: ListOrdered },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-accent" size={24} />
          <span className="font-semibold text-lg tracking-tight">BorderGuard AI</span>
        </div>
        <p className="text-xs text-muted mt-1">Fake Identity &amp; Document Screening</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active ? "bg-foreground text-background" : "text-muted hover:bg-surface-alt hover:text-foreground"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-border text-xs text-muted">
        SIH Prototype &middot; Not for production use
      </div>
    </aside>
  );
}
