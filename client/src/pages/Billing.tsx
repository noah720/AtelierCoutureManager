import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatXof } from "@/const";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, CalendarClock, CreditCard, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const planLabels: Record<string, string> = {
  boutique: "Boutique",
  atelier_boutique: "Atelier + Boutique",
  complet: "Atelier + Boutique + Boutique en ligne",
};

export default function Billing() {
  const utils = trpc.useUtils();
  const orgQuery = trpc.organization.current.useQuery();
  const plansQuery = trpc.organization.plans.useQuery();
  const paymentsQuery = trpc.organization.subscriptionPayments.useQuery();
  const [months, setMonths] = useState<1 | 12>(1);
  const [requested, setRequested] = useState<string | null>(null);

  const request = trpc.organization.requestSubscription.useMutation({
    onSuccess: (result) => {
      utils.organization.subscriptionPayments.invalidate();
      setRequested(String(result.amount));
      toast.success(`Demande d’abonnement envoyée (${formatXof(result.amount)}). L’équipe ENVOL validera le paiement mobile money.`);
    },
    onError: (error) => toast.error(error.message),
  });

  const organization = orgQuery.data;
  const plans = plansQuery.data ?? [];
  const trialDaysLeft = organization?.trialEndsAt ? Math.max(0, Math.ceil((new Date(organization.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <AppShell title="Facturation & abonnement" subtitle="30 jours d’essai gratuit, puis une formule par mois ou par an (réduction). Paiement par mobile money ou carte bancaire.">
      {/* État actuel */}
      <Card className="mb-5 border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]"><Sparkles size={17} /></div>
            <div>
              <p className="text-sm font-semibold">{organization ? planLabels[organization.plan] : "—"}</p>
              <p className="text-[11px] text-[#969991]">
                {organization?.effectiveStatus === "active"
                  ? `Abonnement actif jusqu’au ${organization.subscriptionEndsAt ? new Date(organization.subscriptionEndsAt).toLocaleDateString("fr-FR") : "—"}`
                  : organization?.effectiveStatus === "trial"
                    ? `Essai gratuit — ${trialDaysLeft} jour(s) restant(s)`
                    : organization?.effectiveStatus === "grace"
                      ? "Semaine de tolérance : choisissez une formule pour continuer"
                      : "Accès bloqué — choisissez une formule"}
              </p>
            </div>
          </div>
          <Badge className={`border-0 text-[10px] font-bold ${organization?.effectiveStatus === "active" ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0db] text-[#c27b2c]"}`}>
            {organization?.effectiveStatus === "active" ? "Actif" : organization?.effectiveStatus === "trial" ? "Essai" : organization?.effectiveStatus === "grace" ? "Tolérance" : organization?.effectiveStatus}
          </Badge>
        </CardContent>
      </Card>

      {/* Formules */}
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const current = organization?.plan === plan.key;
          return (
            <Card key={plan.key} className={`flex flex-col border shadow-[0_8px_30px_rgba(43,45,37,0.03)] ${current ? "border-[#20231f]" : "border-[#e8e8e2]"}`}>
              <CardHeader className="px-5 py-4">
                <CardTitle className="font-display text-lg font-semibold leading-snug tracking-[-0.03em]">{plan.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col px-5 pb-5">
                <p className="font-display text-3xl font-semibold">{formatXof(plan.monthly)}<span className="text-xs font-normal text-[#969991]"> / mois</span></p>
                <p className="mt-1 text-[11px] text-[#969991]">ou {formatXof(plan.annual)} / an <span className="font-semibold text-[#2d8a70]">(−{plan.annualDiscountPercent} %)</span></p>
                <div className="mt-3 flex-1">
                  <p className="text-[11px] leading-relaxed text-[#60635c]">
                    {plan.key === "boutique" && "Vente en boutique, clients, stocks, statistiques, caisse, présence du personnel, jusqu’à la comptabilité. Pour les boutiques de revente sans production."}
                    {plan.key === "atelier_boutique" && "Tout ce qui précède + fabrication en atelier et achats de fournitures."}
                    {plan.key === "complet" && "Tout ce qui précède + boutique en ligne, parrainage, paiement direct sur votre compte et nom de domaine personnalisé."}
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex gap-1.5">
                    {([1, 12] as const).map((value) => (
                      <button key={value} onClick={() => setMonths(value)} className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${months === value ? "border-[#20231f] bg-[#20231f] text-white" : "border-[#e4e5df] text-[#60635c]"}`}>
                        {value === 1 ? "Mensuel" : "Annuel"}
                      </button>
                    ))}
                  </div>
                  <Button
                    disabled={request.isPending}
                    onClick={() => organization && request.mutate({ plan: plan.key as any, months, method: "mobile_money" })}
                    className="w-full rounded-xl bg-[#20231f] text-xs font-semibold text-white"
                  >
                    <CreditCard size={13} className="mr-1.5" />
                    {current && months === 1 ? "Renouveler" : "Choisir cette formule"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {requested && (
        <div className="mb-5 rounded-2xl border border-[#cfe8dd] bg-[#e2f4ee] px-5 py-4 text-xs text-[#2d8a70]">
          Demande enregistrée : {formatXof(Number(requested))}. Un agent ENVOL confirmera la réception du paiement mobile money et votre formule s’activera automatiquement.
        </div>
      )}

      {/* Option IA */}
      <Card className="mb-5 border-[#eee8ff] bg-[#faf8ff] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]"><BadgeCheck size={17} /></div>
            <div>
              <p className="text-sm font-semibold">Assistant Commercial & Marketing IA — option</p>
              <p className="text-[11px] text-[#969991]">100 000 F CFA / mois, activable à tout moment. Réponses WhatsApp & réseaux sociaux, création de contenu. (Module en préparation.)</p>
            </div>
          </div>
          <Badge className="border-0 bg-[#eee8ff] text-[10px] font-bold text-[#6954c6]">Bientôt disponible</Badge>
        </CardContent>
      </Card>

      {/* Historique des demandes */}
      <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><CalendarClock size={16} className="text-[#6954c6]" /> Demandes d’abonnement</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!(paymentsQuery.data ?? []).length ? (
            <p className="px-5 py-10 text-center text-xs text-[#969991]">Aucune demande pour le moment.</p>
          ) : (
            <div className="divide-y divide-[#f0f0eb]">
              {paymentsQuery.data!.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between px-5 py-3 text-xs">
                  <div>
                    <p className="font-semibold">{planLabels[payment.plan]} — {payment.months} mois</p>
                    <p className="text-[10px] text-[#969991]">{new Date(payment.createdAt).toLocaleDateString("fr-FR")} · {payment.method}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatXof(payment.amount, payment.currency)}</span>
                    <Badge className={`border-0 text-[9px] font-bold ${payment.status === "valide" ? "bg-[#e2f4ee] text-[#2d8a70]" : payment.status === "refuse" ? "bg-[#fff0ed] text-[#b4604e]" : "bg-[#fff0db] text-[#c27b2c]"}`}>
                      {payment.status === "valide" ? "Validé" : payment.status === "refuse" ? "Refusé" : "En attente ENVOL"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
