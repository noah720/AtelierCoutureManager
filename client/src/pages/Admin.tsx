import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatXof } from "@/const";
import { trpc } from "@/lib/trpc";
import { Building2, CheckCircle2, LifeBuoy, MessageSquare, Pause, Play, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const planLabels: Record<string, string> = {
  boutique: "Boutique",
  atelier_boutique: "Atelier + Boutique",
  complet: "Complet (+ en ligne)",
};

const statusTones: Record<string, string> = {
  trial: "bg-[#eee8ff] text-[#6954c6]",
  active: "bg-[#e2f4ee] text-[#2d8a70]",
  grace: "bg-[#fff0db] text-[#c27b2c]",
  blocked: "bg-[#fff0ed] text-[#b4604e]",
  suspended: "bg-[#f2f2ed] text-[#60635c]",
};

const statusLabels: Record<string, string> = {
  trial: "Essai",
  active: "Actif",
  grace: "Tolérance",
  blocked: "Bloqué",
  suspended: "Suspendu",
};

export default function Admin() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery();
  const statsQuery = trpc.admin.stats.useQuery(undefined, { enabled: meQuery.data?.role === "admin" });
  const orgsQuery = trpc.admin.organizations.useQuery(undefined, { enabled: meQuery.data?.role === "admin" });
  const pendingQuery = trpc.admin.subscriptions.pendingPayments.useQuery(undefined, { enabled: meQuery.data?.role === "admin" });

  const validate = trpc.admin.subscriptions.validatePayment.useMutation({
    onSuccess: () => {
      utils.admin.subscriptions.pendingPayments.invalidate();
      utils.admin.organizations.invalidate();
      toast.success("Paiement validé — abonnement activé.");
    },
    onError: (error) => toast.error(error.message),
  });
  const refuse = trpc.admin.subscriptions.refusePayment.useMutation({
    onSuccess: () => {
      utils.admin.subscriptions.pendingPayments.invalidate();
      toast.success("Paiement refusé.");
    },
  });
  const setStatus = trpc.admin.setOrganizationStatus.useMutation({
    onSuccess: () => {
      utils.admin.organizations.invalidate();
      toast.success("Statut de la marque mis à jour.");
    },
    onError: (error) => toast.error(error.message),
  });

  if (meQuery.data && meQuery.data.role !== "admin") {
    return (
      <AppShell title="Administration ENVOL" subtitle="Espace réservé à l’équipe opératrice.">
        <Card className="border-[#fff0ed] bg-[#fff8f6]">
          <CardContent className="px-5 py-14 text-center">
            <ShieldCheck size={22} className="mx-auto mb-3 text-[#b4604e]" />
            <p className="text-sm font-semibold">Accès réservé à l’équipe ENVOL AFRICA GROUPE</p>
            <p className="mt-1 text-xs text-[#92958d]">Connectez-vous avec le compte administration (admin@envol.africa).</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const stats = statsQuery.data;

  return (
    <AppShell title="Administration ENVOL" subtitle="Pilotage global de la plateforme : marques, abonnements, paiements et assistance.">
      {/* Statistiques */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Marques inscrites", value: stats ? String(stats.organizations) : "…" },
          { label: "Marques actives", value: stats ? String(stats.activeOrganizations) : "…" },
          { label: "Comptes utilisateurs", value: stats ? String(stats.users) : "…" },
          { label: "Paiements en attente", value: stats ? String(stats.pendingPayments) : "…" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-[#e8e8e2]">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold text-[#858880]">{kpi.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paiements d'abonnement en attente */}
      <Card className="mb-5 border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
          <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Paiements d’abonnement à valider</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!(pendingQuery.data ?? []).length ? (
            <p className="px-5 py-10 text-center text-xs text-[#969991]">Aucun paiement en attente.</p>
          ) : (
            <div className="divide-y divide-[#f0f0eb]">
              {pendingQuery.data!.map((row) => (
                <div key={row.payment.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{row.organization.name} — {planLabels[row.payment.plan]} ({row.payment.months} mois)</p>
                    <p className="text-[10px] text-[#969991]">Méthode : {row.payment.method} · {new Date(row.payment.createdAt).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatXof(row.payment.amount, row.payment.currency)}</p>
                  <Button size="sm" disabled={validate.isPending} onClick={() => validate.mutate({ id: row.payment.id })} className="rounded-lg bg-[#20231f] text-[11px] text-white"><CheckCircle2 size={12} className="mr-1" /> Valider</Button>
                  <Button size="sm" variant="outline" disabled={refuse.isPending} onClick={() => refuse.mutate({ id: row.payment.id })} className="rounded-lg text-[11px] text-[#b4604e]"><XCircle size={12} className="mr-1" /> Refuser</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Marques */}
      <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><Building2 size={17} className="text-[#6954c6]" /> Marques inscrites</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!(orgsQuery.data ?? []).length ? (
            <p className="px-5 py-10 text-center text-xs text-[#969991]">Aucune marque inscrite.</p>
          ) : (
            <div className="divide-y divide-[#f0f0eb]">
              {orgsQuery.data!.map((row) => (
                <div key={row.organization.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee8ff] text-[10px] font-bold text-[#6954c6]">{row.organization.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{row.organization.name} <span className="ml-1 text-[10px] font-normal text-[#969991]">· {planLabels[row.organization.plan]}</span></p>
                    <p className="text-[11px] text-[#969991]">
                      Propriétaire : {row.ownerName} · {Number(row.members)} membre(s)
                      {row.organization.subscriptionEndsAt ? ` · abonnement jusqu’au ${new Date(row.organization.subscriptionEndsAt).toLocaleDateString("fr-FR")}` : ` · essai jusqu’au ${new Date(row.organization.trialEndsAt).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                  <Badge className={`border-0 text-[9px] font-bold ${statusTones[row.effectiveStatus]}`}>{statusLabels[row.effectiveStatus] ?? row.effectiveStatus}</Badge>
                  {row.effectiveStatus === "suspended" ? (
                    <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: row.organization.id, status: "trial" })} className="rounded-lg text-[11px]"><Play size={11} className="mr-1" /> Réactiver</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: row.organization.id, status: "suspended" })} className="rounded-lg text-[11px] text-[#b4604e]"><Pause size={11} className="mr-1" /> Suspendre</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SupportSection />
    </AppShell>
  );
}

const TICKET_STATUS: Record<string, { label: string; tone: string }> = {
  ouvert: { label: "Ouvert", tone: "bg-[#fff0db] text-[#c27b2c]" },
  en_cours: { label: "En cours", tone: "bg-[#eee8ff] text-[#6954c6]" },
  resolu: { label: "Résolu", tone: "bg-[#e2f4ee] text-[#2d8a70]" },
  ferme: { label: "Fermé", tone: "bg-[#f2f2ed] text-[#60635c]" },
};

/** Assistance côté ENVOL : répondre aux demandes et les clôturer (point 12). */
function SupportSection() {
  const utils = trpc.useUtils();
  const ticketsQuery = trpc.support.listAll.useQuery();
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const respond = trpc.support.respond.useMutation({
    onSuccess: () => {
      toast.success("Réponse envoyée — le ticket passe en cours.");
      setReplyFor(null);
      setDraft("");
      utils.support.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const close = trpc.support.close.useMutation({
    onSuccess: () => {
      toast.success("Demande clôturée.");
      utils.support.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const tickets = ticketsQuery.data ?? [];

  return (
    <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
      <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]">
          <LifeBuoy size={16} className="text-[#2d8a70]" /> Demandes d'assistance ({tickets.filter((ticket) => ticket.status !== "ferme").length} en cours)
        </CardTitle>
        <p className="mt-1 text-[11px] text-[#969991]">Répondez aux marques depuis cette page — elles voient vos réponses dans leur assistance.</p>
      </CardHeader>
      <CardContent className="p-0">
        {tickets.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-[#969991]">Aucune demande d'assistance pour le moment.</p>
        ) : (
          <div className="divide-y divide-[#f0f0eb]">
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? TICKET_STATUS.ouvert;
              return (
                <div key={ticket.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{ticket.subject}</span>
                    <Badge className={`border-0 text-[9px] font-bold ${status.tone}`}>{status.label}</Badge>
                    <span className="text-[11px] text-[#969991]">
                      {ticket.reporterName} · {new Date(ticket.createdAt).toLocaleString("fr-FR")}
                    </span>
                    {ticket.pageUrl && <span className="text-[10px] text-[#a6a8a1]">({ticket.pageUrl})</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl bg-[#f7f7f5] px-3 py-2 text-xs text-[#3a3d37]">{ticket.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {replyFor === ticket.id ? (
                      <>
                        <input
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="Votre réponse…"
                          className="min-w-0 flex-1 rounded-lg border border-[#e4e5df] px-3 py-1.5 text-xs outline-none focus:border-[#20231f]"
                        />
                        <Button size="sm" className="rounded-lg bg-[#20231f] text-[10px] font-semibold text-white" disabled={respond.isPending || draft.trim().length === 0} onClick={() => respond.mutate({ ticketId: ticket.id, message: draft })}>
                          Envoyer
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-lg text-[10px]" onClick={() => { setReplyFor(null); setDraft(""); }}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="rounded-lg text-[10px]" onClick={() => setReplyFor(ticket.id)}>
                          <MessageSquare size={11} className="mr-1" /> Répondre
                        </Button>
                        {ticket.status !== "ferme" && (
                          <Button size="sm" variant="ghost" className="rounded-lg text-[10px] text-[#2d8a70]" disabled={close.isPending} onClick={() => close.mutate({ ticketId: ticket.id })}>
                            <CheckCircle2 size={11} className="mr-1" /> Clôturer
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
