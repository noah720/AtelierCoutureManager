import SupportButton from "@/components/SupportButton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Boxes,
  Factory,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  Sparkles,
  Receipt,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

const navSections = [
  { label: "Tableau de bord", href: "/", icon: LayoutDashboard },
  { label: "Caisse & ventes", href: "/caisse", icon: ShoppingBag },
  { label: "Commandes clients", href: "/operations/orders", icon: Package },
  { label: "Production atelier", href: "/production", icon: Factory },
  { label: "Approvisionnement", href: "/approvisionnement", icon: Boxes },
  { label: "Trésorerie", href: "/tresorerie", icon: Wallet },
  { label: "Personnel", href: "/personnel", icon: Users },
  { label: "Assistant IA", href: "/assistant", icon: Sparkles },
  { label: "Boutiques & agences", href: "/operations/stores", icon: Store },
  { label: "Clients", href: "/operations/customers", icon: Users },
  { label: "Produits & stock", href: "/operations/products", icon: Boxes },
  { label: "Facturation", href: "/facturation", icon: Receipt },
  { label: "Réglages", href: "/reglages", icon: Settings2 },
  { label: "Assistance", href: "/assistance", icon: LifeBuoy },
];

export default function AppShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const orgQuery = trpc.organization.current.useQuery();
  const organization = orgQuery.data;

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const mobileSections = navSections.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#20231f]">
      {/* Barre supérieure (point 6) */}
      <header className="sticky top-0 z-30 border-b border-[#e8e8e2] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-[#f1f1ed] lg:hidden" onClick={() => setMobileNav((v) => !v)} aria-label="Menu">
              <Boxes size={18} />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#20231f] font-display text-sm font-semibold text-white">A</div>
              <div className="leading-tight">
                <p className="font-display text-sm font-semibold tracking-tight">AtelierManager</p>
                <p className="max-w-[180px] truncate text-[10px] text-[#858880]">{organization?.name ?? "Votre marque"}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {user?.role === "admin" && (
              <Link href="/admin">
                <Button variant="outline" size="sm" className="hidden h-8 rounded-lg border-[#e4e2dc] text-[11px] font-semibold sm:inline-flex">
                  <ShieldCheck size={14} className="mr-1.5 text-[#2d8a70]" />
                  Administration ENVOL
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-2 rounded-full border border-[#e8e8e2] bg-white px-2 py-1">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-[#eee8ff] text-[10px] font-semibold text-[#6954c6]">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate text-[11px] font-semibold sm:block">{user?.name ?? user?.email}</span>
              <button onClick={logout} className="rounded-full p-1 text-[#858880] hover:bg-[#f1f1ed] hover:text-[#20231f]" aria-label="Se déconnecter" title="Se déconnecter">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px]">
        {/* Menu latéral */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[#e8e8e2] bg-white p-4 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#a1a39d]">Menu</span>
            <button onClick={() => setMobileNav(false)} aria-label="Fermer le menu" className="p-1"><LogOut size={16} className="rotate-180" /></button>
          </div>
          <nav className="space-y-1 overflow-y-auto lg:max-h-[calc(100vh-7rem)]">
            {navSections.map((item) => {
              const active = location === item.href;
              return (
                <Link key={item.href + item.label} href={item.href} onClick={() => setMobileNav(false)}>
                  <span className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? "bg-[#20231f] text-white" : "text-[#60635c] hover:bg-[#f1f1ed] hover:text-[#20231f]"}`}>
                    <item.icon size={15} />
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>
        {mobileNav && <div className="fixed inset-0 z-30 bg-[#20231f]/25 lg:hidden" onClick={() => setMobileNav(false)} />}

        {/* Contenu */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 text-xs text-[#858880] sm:text-sm">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>

      {/* Barre mobile en bas (point 6) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#e8e8e2] bg-white sm:hidden">
        {mobileSections.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span className={`flex flex-col items-center gap-1 py-2 text-[9px] font-semibold ${active ? "text-[#20231f]" : "text-[#969991]"}`}>
                <item.icon size={17} />
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="h-14 sm:hidden" />

      <SupportButton />
    </div>
  );
}
