import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatXof, ORDER_STATUS_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Boxes, Factory, Package, Plus, ShoppingBag, Sparkles, TrendingUp, Users } from "lucide-react";
import { Link } from "wouter";

function statusTone(status: string) {
  switch (status) {
    case "delivered":
    case "payee":
      return "bg-[#e2f4ee] text-[#2d8a70]";
    case "in_production":
    case "pending":
      return "bg-[#fff0db] text-[#c27b2c]";
    case "cancelled":
      return "bg-[#fff0ed] text-[#b4604e]";
    default:
      return "bg-[#eee8ff] text-[#6954c6]";
  }
}

export default function Home() {
  const { user } = useAuth();
  const orgQuery = trpc.organization.current.useQuery();
  const summaryQuery = trpc.dashboard.summary.useQuery();
  const summary = summaryQuery.data;
  const organization = orgQuery.data;

  const firstName = user?.name?.split(" ")[0] ?? "Vendeur";
  const isTrial = organization?.effectiveStatus === "trial";
  const trialDaysLeft = organization?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(organization.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <AppShell
      title={`Bonjour ${firstName}`}
      subtitle={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
      actions={
        <Link href="/caisse">
          <Button className="rounded-xl bg-[#20231f] text-xs font-semibold text-white hover:bg-[#353832]">
            <Plus size={15} className="mr-2" /> Nouvelle vente en caisse
          </Button>
        </Link>
      }
    >
      {/* Bandeau abonnement */}
      {organization && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8e8e2] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold">
                Formule {organization.plan === "complet" ? "Atelier + Boutique + Boutique en ligne" : organization.plan === "atelier_boutique" ? "Atelier + Boutique" : "Boutique"}
                {isTrial && trialDaysLeft !== null && <span className="ml-2 rounded-full bg-[#fff0db] px-2 py-0.5 text-[10px] font-bold text-[#c27b2c]">Essai — {trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""} restant{trialDaysLeft > 1 ? "s" : ""}</span>}
                {organization.effectiveStatus === "grace" && <span className="ml-2 rounded-full bg-[#fff0ed] px-2 py-0.5 text-[10px] font-bold text-[#b4604e]">Semaine de tolérance</span>}
              </p>
              <p className="text-[11px] text-[#969991]">
                Statut : {organization.effectiveStatus === "active" ? "Abonnement actif" : isTrial ? "Période d’essai gratuite 30 jours" : organization.effectiveStatus}
                {" · "}Boutique en ligne : <span className="font-mono text-[10px]">{organization.shopUrl}</span>
              </p>
            </div>
          </div>
          <Link href="/facturation">
            <Button variant="outline" className="rounded-xl text-xs font-semibold">
              Gérer l’abonnement <ArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Ventes du jour", value: summary ? formatXof(summary.salesToday) : "…", icon: ShoppingBag, tone: "bg-[#eee8ff] text-[#6954c6]" },
          { label: "Ventes du mois", value: summary ? formatXof(summary.salesMonth) : "…", icon: TrendingUp, tone: "bg-[#e2f4ee] text-[#2d8a70]" },
          { label: "Commandes en cours", value: summary ? String(summary.orders) : "…", icon: Package, tone: "bg-[#fff0db] text-[#c27b2c]" },
          { label: "Clients enregistrés", value: summary ? String(summary.customers) : "…", icon: Users, tone: "bg-[#fff0ed] text-[#b4604e]" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[#858880]">{kpi.label}</p>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${kpi.tone}`}>
                  <kpi.icon size={13} />
                </div>
              </div>
              <p className="font-display text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summaryQuery.isError && (
        <div className="mb-6 rounded-2xl border border-[#f3d3cc] bg-[#fff0ed] px-5 py-4 text-xs text-[#b4604e]">
          Impossible de charger les indicateurs. Vérifiez votre connexion puis réessayez.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Ventes récentes */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Dernières ventes</CardTitle>
            <Link href="/caisse" className="text-[11px] font-semibold text-[#6954c6] hover:underline">Ouvrir la caisse</Link>
          </CardHeader>
          <CardContent className="p-0">
            {!summary?.recentSales.length ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f2ed] text-[#9a9c95]"><ShoppingBag size={18} /></div>
                <p className="text-sm font-semibold">Aucune vente pour le moment</p>
                <p className="mt-1 text-xs text-[#9a9c95]">Ouvrez la caisse pour enregistrer votre première vente.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0eb]">
                {summary.recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]"><ShoppingBag size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{sale.reference}</p>
                      <p className="text-[10px] text-[#969991]">{new Date(sale.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <p className="text-xs font-semibold">{formatXof(sale.totalAmount, sale.currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commandes récentes */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Commandes récentes</CardTitle>
            <Link href="/operations/orders" className="text-[11px] font-semibold text-[#6954c6] hover:underline">Tout voir</Link>
          </CardHeader>
          <CardContent className="p-0">
            {!summary?.recentOrders.length ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f2ed] text-[#9a9c95]"><Package size={18} /></div>
                <p className="text-sm font-semibold">Aucune commande pour le moment</p>
                <p className="mt-1 text-xs text-[#9a9c95]">Les commandes passées en boutique arrivent ici et partent à l’atelier.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0eb]">
                {summary.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff0db] text-[#c27b2c]"><Package size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{order.reference}</p>
                      <p className="text-[10px] text-[#969991]">Client #{order.customerId}</p>
                    </div>
                    <Badge className={`border-0 text-[10px] font-semibold ${statusTone(order.status)}`}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                    <p className="text-xs font-semibold">{formatXof(order.totalAmount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Accès rapides */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Production atelier", href: "/production", icon: Factory },
          { label: "Approvisionnement", href: "/approvisionnement", icon: Boxes },
          { label: "Trésorerie", href: "/tresorerie", icon: TrendingUp },
          { label: "Personnel", href: "/personnel", icon: Users },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <div className="flex flex-col gap-2 rounded-2xl border border-[#e8e8e2] bg-white px-4 py-4 transition hover:border-[#20231f]">
              <item.icon size={16} className="text-[#6954c6]" />
              <span className="text-xs font-semibold">{item.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
