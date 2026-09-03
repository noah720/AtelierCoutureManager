import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Boxes,
  ChevronDown,
  CircleHelp,
  Command,
  Factory,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const navItems = [
  { label: "Vue d'ensemble", icon: LayoutDashboard, active: true, href: "/" },
  { label: "Ventes", icon: ShoppingBag, href: "/operations/orders" },
  { label: "Commandes", icon: Package, count: "12", href: "/operations/orders" },
  { label: "Produits & stock", icon: Boxes, href: "/operations/products" },
  { label: "Clients", icon: Users, href: "/operations/customers" },
  { label: "Boutiques", icon: Store, href: "/operations/stores" },
  { label: "Production", icon: Factory, href: "/operations/orders" },
];

const orders = [
  { id: "CMD-1048", client: "Aminata Diop", store: "Dakar Plateau", amount: "385 000 FCFA", status: "En production", tone: "amber", initials: "AD" },
  { id: "CMD-1047", client: "Moussa Koné", store: "Abidjan Cocody", amount: "210 000 FCFA", status: "À préparer", tone: "violet", initials: "MK" },
  { id: "CMD-1046", client: "Fatou Ndiaye", store: "Dakar Plateau", amount: "125 000 FCFA", status: "Livrée", tone: "green", initials: "FN" },
  { id: "CMD-1045", client: "Yannick Bamba", store: "Lagos Island", amount: "490 000 FCFA", status: "En attente", tone: "slate", initials: "YB" },
];

const activity = [
  { title: "Nouvelle commande enregistrée", detail: "CMD-1048 · il y a 8 min", icon: ShoppingBag, color: "bg-[#eee8ff] text-[#6954c6]" },
  { title: "Stock réapprovisionné", detail: "Wax Indigo · +24 pièces", icon: Boxes, color: "bg-[#e2f4ee] text-[#2d8a70]" },
  { title: "Nouveau client ajouté", detail: "Aminata Diop · il y a 42 min", icon: Users, color: "bg-[#fff0db] text-[#c27b2c]" },
];

function formatDate() {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

export default function Home() {
  const { user, loading: authLoading, error: authError, isAuthenticated } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const firstName = user?.name?.split(" ")[0] || "Mariam";
  const summaryQuery = trpc.dashboard.summary.useQuery(undefined, { enabled: Boolean(user) });
  const ordersQuery = trpc.orders.list.useQuery(undefined, { enabled: Boolean(user) });
  const summary = summaryQuery.data;
  const dashboardLoading = authLoading || (Boolean(user) && (summaryQuery.isLoading || ordersQuery.isLoading));
  const noOrganization = summaryQuery.error?.data?.code === "PRECONDITION_FAILED";
  const dashboardError = !authLoading && Boolean(isAuthenticated) && (summaryQuery.isError || ordersQuery.isError) && !noOrganization;
  const previewMode = !authLoading && !isAuthenticated && !authError;
  const recentOrders = previewMode ? orders : dashboardError || noOrganization ? [] : (ordersQuery.data ?? []).slice(0, 4).map((order: any) => ({
    id: order.reference || `CMD-${order.id}`,
    client: order.customerName || "Client non renseigné",
    store: order.storeName || "Boutique non renseignée",
    amount: `${Number(order.totalAmount || 0).toLocaleString("fr-FR")} FCFA`,
    status: order.status || "En attente",
    tone: order.status === "delivered" ? "green" : order.status === "in_production" ? "amber" : "violet",
    initials: (order.customerName || "CL").slice(0, 2).toUpperCase(),
  }));

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#20231f]">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-[#e9e9e4] bg-[#fbfbf9] px-5 py-6 transition-transform duration-200 lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-10 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#20231f] text-sm font-bold text-white">A</div>
            <div>
              <p className="font-display text-[17px] font-semibold tracking-[-0.03em]">AtelierManager</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9b9e98]">Espace marque</p>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setMobileNav(false)} aria-label="Fermer le menu"><X size={18} /></button>
        </div>

        <div className="mb-5 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1a39d]">Pilotage</div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setMobileNav(false)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${item.active ? "bg-[#20231f] font-semibold text-white shadow-[0_6px_18px_rgba(32,35,31,0.14)]" : "text-[#71756d] hover:bg-[#f0f0ec] hover:text-[#20231f]"}`}>
              <item.icon size={16} strokeWidth={item.active ? 2.2 : 1.8} />
              <span className="flex-1">{item.label}</span>
              {item.count && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.active ? "bg-white/15 text-white" : "bg-[#ecece7] text-[#878a83]"}`}>{item.count}</span>}
            </Link>
          ))}
        </nav>

        <div className="mb-5 mt-9 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1a39d]">Organisation</div>
        <nav className="space-y-1">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#71756d] transition hover:bg-[#f0f0ec] hover:text-[#20231f]"><Wallet size={16} strokeWidth={1.8} /> Trésorerie</button>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#71756d] transition hover:bg-[#f0f0ec] hover:text-[#20231f]"><Settings2 size={16} strokeWidth={1.8} /> Réglages</button>
        </nav>

        <div className="mt-auto rounded-2xl bg-[#f0eee8] p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#ded9c8] text-xs font-bold text-[#756e58]">✦</div>
          <p className="font-display text-sm font-semibold">Besoin d'aide ?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#85867f]">Notre équipe est disponible pour vous accompagner.</p>
          <button className="mt-3 text-[11px] font-bold text-[#756e58]">Contacter l'assistance →</button>
        </div>
      </aside>

      {mobileNav && <button className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Fermer le menu" />}

      <main className="lg:pl-[252px]">
        <header className="flex h-[76px] items-center justify-between border-b border-[#e9e9e4] bg-[#fbfbf9]/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-4">
            <button className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Ouvrir le menu"><Menu size={21} /></button>
            <div className="hidden items-center gap-2 rounded-lg border border-[#e6e6e0] bg-white px-3 py-2 text-xs text-[#9a9c95] sm:flex"><Search size={14} /><span>Rechercher...</span><span className="ml-10 rounded border border-[#e5e5df] px-1.5 py-0.5 text-[10px]">⌘ K</span></div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button className="relative text-[#7d8078] hover:text-[#20231f]" aria-label="Notifications"><Bell size={18} strokeWidth={1.8} /><span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#d47752]" /></button>
            <div className="h-6 w-px bg-[#e5e5df]" />
            <button className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d9e4d3] text-[11px] font-bold text-[#587052]">{user?.name?.slice(0, 2).toUpperCase() || "MA"}</div><span className="hidden text-xs font-semibold sm:inline">{firstName} Ndiaye</span><ChevronDown size={14} className="text-[#9b9d96]" /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-2 text-xs font-semibold capitalize text-[#9b9d96]">{formatDate()} <span className="mx-2">·</span> Dakar, Sénégal</p><h1 className="font-display text-[32px] font-semibold tracking-[-0.05em] sm:text-[38px]">Bonjour, {firstName} <span className="text-[#bc8a57]">.</span></h1><p className="mt-2 text-sm text-[#83867e]">Voici ce qui se passe dans votre activité aujourd'hui.</p></div>
            <div className="flex items-center gap-2"><Button variant="outline" className="h-10 rounded-xl border-[#e2e2dc] bg-white px-3 text-xs font-semibold text-[#6d7169]"><span className="mr-2 h-2 w-2 rounded-full bg-[#6bae86]" /> Distinction <ChevronDown size={14} className="ml-2" /></Button><Button onClick={() => startLogin()} className="h-10 rounded-xl bg-[#20231f] px-4 text-xs font-semibold text-white hover:bg-[#383b35]"><Plus size={15} className="mr-1.5" /> Nouvelle vente</Button></div>
          </div>

          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Chiffre d'affaires" value={dashboardLoading || dashboardError || noOrganization ? "—" : previewMode ? "4 285 000" : summary ? Number(summary.sales).toLocaleString("fr-FR") : "—"} suffix="FCFA" change={dashboardLoading ? "Chargement" : dashboardError || noOrganization ? "Indisponible" : "+12,8%"} trend="up" accent="dark" />
            <StatCard label="Commandes" value={dashboardLoading || dashboardError || noOrganization ? "—" : previewMode ? "128" : summary ? String(summary.orders) : "—"} change={dashboardLoading ? "Chargement" : dashboardError || noOrganization ? "Indisponible" : "+8,2%"} trend="up" />
            <StatCard label="Produits en stock" value={dashboardLoading || dashboardError || noOrganization ? "—" : previewMode ? "1 249" : summary ? summary.stock.toLocaleString("fr-FR") : "—"} change={dashboardLoading ? "Chargement" : dashboardError || noOrganization ? "Indisponible" : "-2,4%"} trend="down" />
            <StatCard label="Nouveaux clients" value={dashboardLoading || dashboardError || noOrganization ? "—" : previewMode ? "36" : summary ? String(summary.customers) : "—"} change={dashboardLoading ? "Chargement" : dashboardError || noOrganization ? "Indisponible" : "+18,6%"} trend="up" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
            <section className="rounded-2xl border border-[#e8e8e2] bg-white p-5 shadow-[0_8px_30px_rgba(43,45,37,0.025)] sm:p-6">
              <div className="mb-7 flex items-start justify-between"><div><h2 className="font-display text-[18px] font-semibold tracking-[-0.03em]">Performance des ventes</h2><p className="mt-1 text-xs text-[#969991]">Évolution du chiffre d'affaires</p></div><button className="flex items-center gap-2 rounded-lg border border-[#e7e7e1] px-3 py-2 text-[11px] font-semibold text-[#73776f]">Ce mois <ChevronDown size={13} /></button></div>
              <div className="flex h-[210px] items-end gap-2 border-b border-[#efefe9] px-1 pb-0 sm:gap-4">
                {[38, 55, 46, 68, 58, 82, 73, 92, 66, 76, 88, 100].map((height, i) => <div key={i} className="group flex h-full flex-1 flex-col justify-end"><div className={`relative rounded-t-md transition-all ${i === 11 ? "bg-[#20231f]" : "bg-[#e7e7e1] group-hover:bg-[#c9c9c0]"}`} style={{ height: `${height}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#20231f] px-2 py-1 text-[9px] text-white group-hover:block">{Math.round(height * 39)}k</span></div></div>)}
              </div>
              <div className="mt-3 flex justify-between px-1 text-[10px] font-medium text-[#a4a69f]"><span>01 Mai</span><span>08 Mai</span><span>15 Mai</span><span>22 Mai</span><span>31 Mai</span></div>
            </section>

            <section className="rounded-2xl border border-[#e8e8e2] bg-white p-5 shadow-[0_8px_30px_rgba(43,45,37,0.025)] sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-[18px] font-semibold tracking-[-0.03em]">Activité récente</h2><p className="mt-1 text-xs text-[#969991]">Les dernières actions de votre équipe</p></div><button className="text-[#a0a29b]"><MoreHorizontal size={18} /></button></div><div className="space-y-5">{activity.map((item) => <div key={item.title} className="flex items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.color}`}><item.icon size={16} /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#42453f]">{item.title}</p><p className="mt-1 truncate text-[11px] text-[#a0a29b]">{item.detail}</p></div><div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5d7d0]" /></div>)}</div><button className="mt-6 text-[11px] font-bold text-[#8b6d47]">Voir toute l'activité →</button></section>
          </div>

          <section className="mt-5 rounded-2xl border border-[#e8e8e2] bg-white p-5 shadow-[0_8px_30px_rgba(43,45,37,0.025)] sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-[18px] font-semibold tracking-[-0.03em]">Commandes récentes</h2><p className="mt-1 text-xs text-[#969991]">Suivez les dernières commandes de vos boutiques</p></div><button className="rounded-lg border border-[#e6e6e0] px-3 py-2 text-[11px] font-bold text-[#777a73]">Voir toutes les commandes</button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-[#eeeeea] text-[10px] font-bold uppercase tracking-[0.12em] text-[#a3a59e]"><th className="pb-3 pl-1">Commande</th><th className="pb-3">Client</th><th className="pb-3">Boutique</th><th className="pb-3">Montant</th><th className="pb-3">Statut</th><th className="pb-3"></th></tr></thead><tbody>{dashboardLoading ? <tr><td colSpan={6} className="py-12 text-center text-xs text-[#969991]">Chargement des commandes…</td></tr> : !previewMode && recentOrders.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-xs text-[#969991]">Aucune commande récente pour le moment.</td></tr> : recentOrders.map((order) => <tr key={order.id} className="border-b border-[#f1f1ed] last:border-0"><td className="py-4 pl-1 text-xs font-semibold">{order.id}</td><td className="py-4"><div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0e7da] text-[9px] font-bold text-[#9e754c]">{order.initials}</div><span className="text-xs font-medium">{order.client}</span></div></td><td className="py-4 text-xs text-[#82857d]">{order.store}</td><td className="py-4 text-xs font-semibold">{order.amount}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.tone === "amber" ? "bg-[#fff0dc] text-[#b77b38]" : order.tone === "violet" ? "bg-[#eee9ff] text-[#6954c6]" : order.tone === "green" ? "bg-[#e3f4eb] text-[#428565]" : "bg-[#eff0ed] text-[#747870]"}`}>{order.status}</span></td><td className="py-4 text-right"><button className="text-[#aaaca5] hover:text-[#20231f]"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#e6eee4] px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-[#65845d]"><CircleHelp size={17} /></div><p className="text-xs text-[#61705d]">{authLoading ? "Vérification de votre session…" : !isAuthenticated ? "Vous consultez un aperçu de l’espace marque." : noOrganization ? "Aucune marque n’est encore associée à ce compte." : dashboardError ? "Les données de votre marque sont temporairement indisponibles." : "Vous êtes en mode connecté."}</p></div><button onClick={() => startLogin()} className="hidden text-xs font-bold text-[#54704e] sm:block">Se connecter →</button></div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, suffix, change, trend, accent = "light" }: { label: string; value: string; suffix?: string; change: string; trend: "up" | "down"; accent?: "dark" | "light" }) {
  const dark = accent === "dark";
  return <div className={`rounded-2xl border p-5 ${dark ? "border-[#20231f] bg-[#20231f] text-white" : "border-[#e8e8e2] bg-white"}`}><div className="mb-5 flex items-center justify-between"><span className={`text-xs ${dark ? "text-white/55" : "text-[#92958d]"}`}>{label}</span><div className={`rounded-lg p-2 ${dark ? "bg-white/10 text-[#d9c39e]" : "bg-[#f5f4ef] text-[#989a91]"}`}>{label === "Chiffre d'affaires" ? <Wallet size={15} /> : label === "Commandes" ? <ShoppingBag size={15} /> : label === "Produits en stock" ? <Boxes size={15} /> : <Users size={15} />}</div></div><div className="flex items-baseline gap-1"><span className="font-display text-[26px] font-semibold tracking-[-0.05em]">{value}</span>{suffix && <span className={`text-[11px] ${dark ? "text-white/55" : "text-[#969991]"}`}>{suffix}</span>}</div><div className={`mt-3 flex items-center gap-1 text-[10px] font-semibold ${trend === "up" ? "text-[#5a9b76]" : "text-[#c77b61]"}`}>{trend === "up" ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {change}<span className={`ml-1 font-normal ${dark ? "text-white/40" : "text-[#a5a79f]"}`}>vs mois dernier</span></div></div>;
}
