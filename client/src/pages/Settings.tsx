import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Copy, Globe, Percent, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const utils = trpc.useUtils();
  const orgQuery = trpc.organization.current.useQuery();
  const organization = orgQuery.data;

  const [values, setValues] = useState({ name: "", country: "", sector: "", referralCustomerRate: "10", referralAffiliateRate: "10", customDomain: "" });

  useEffect(() => {
    if (organization) {
      setValues({
        name: organization.name,
        country: organization.country ?? "",
        sector: organization.sector ?? "",
        referralCustomerRate: String(Number(organization.referralCustomerRate)),
        referralAffiliateRate: String(Number(organization.referralAffiliateRate)),
        customDomain: organization.customDomain ?? "",
      });
    }
  }, [organization]);

  const update = trpc.organization.updateSettings.useMutation({
    onSuccess: () => {
      utils.organization.current.invalidate();
      toast.success("Réglages enregistrés.");
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({
      name: values.name,
      country: values.country || undefined,
      sector: values.sector || undefined,
      referralCustomerRate: Number(values.referralCustomerRate),
      referralAffiliateRate: Number(values.referralAffiliateRate),
      ...(values.customDomain !== (organization?.customDomain ?? "") ? { customDomain: values.customDomain || undefined } : {}),
    });
  };

  const referralsQuery = trpc.customers.referrals.useQuery();
  const customersQuery = trpc.customers.list.useQuery();
  const [referral, setReferral] = useState({ customerId: "", code: "" });
  const createReferral = trpc.customers.createReferral.useMutation({
    onSuccess: () => {
      utils.customers.referrals.invalidate();
      toast.success("Code de parrainage créé.");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell title="Réglages de la marque" subtitle="Informations de la société, parrainage, nom de domaine et boutique en ligne.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Informations de la société</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={submit} className="space-y-3">
              <Input required placeholder="Nom de la marque" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-9 rounded-lg text-xs" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Pays" value={values.country} onChange={(e) => setValues({ ...values, country: e.target.value })} className="h-9 rounded-lg text-xs" />
                <Input placeholder="Secteur d’activité" value={values.sector} onChange={(e) => setValues({ ...values, sector: e.target.value })} className="h-9 rounded-lg text-xs" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-[#858880]"><Percent size={10} /> Réduction client (parrainé, %)</span>
                  <Input inputMode="decimal" value={values.referralCustomerRate} onChange={(e) => setValues({ ...values, referralCustomerRate: e.target.value })} className="h-9 rounded-lg text-xs" />
                </label>
                <label>
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-[#858880]"><Percent size={10} /> Commission affilié (%)</span>
                  <Input inputMode="decimal" value={values.referralAffiliateRate} onChange={(e) => setValues({ ...values, referralAffiliateRate: e.target.value })} className="h-9 rounded-lg text-xs" />
                </label>
              </div>
              <Button disabled={update.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white"><Save size={13} className="mr-1.5" /> {update.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* Liens & domaine */}
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><Globe size={16} className="text-[#2d8a70]" /> Liens & nom de domaine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between rounded-xl border border-[#ececea] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#969991]">Lien fourni par la plateforme</p>
                  <p className="truncate font-mono text-[11px]">{organization?.shopUrl ?? "—"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(organization?.shopUrl ?? ""); toast.success("Lien copié."); }} className="rounded-lg text-[10px]"><Copy size={11} /></Button>
              </div>
              <div className="rounded-xl border border-dashed border-[#d9d7d0] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#969991]">Domaine personnalisé (formule complète)</p>
                <div className="mt-2 flex gap-2">
                  <Input placeholder="distinction.com" value={values.customDomain} onChange={(e) => setValues({ ...values, customDomain: e.target.value })} className="h-9 rounded-lg text-xs" />
                  <Badge className={`shrink-0 border-0 text-[9px] font-bold ${organization?.domainVerified ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0db] text-[#c27b2c]"}`}>{organization?.domainVerified ? "Vérifié" : "En attente"}</Badge>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-[#969991]">Copiez les deux lignes ci-dessous chez votre fournisseur de domaine, puis attendez la vérification automatique (cadenas de sécurité activé).</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-[#f7f7f5] p-2 font-mono text-[10px] text-[#40433d]">{`CNAME www => shops.ateliermanager.africa\nALIAS @  => shops.ateliermanager.africa`}</pre>
              </div>
              <p className="text-[10px] text-[#a6a8a1]">La boutique en ligne publique (vitrine + panier Moneroo) est livrée avec la formule complète — module en cours de construction.</p>
            </CardContent>
          </Card>

          {/* Parrainage */}
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Codes de parrainage</CardTitle>
              <p className="mt-1 text-[11px] text-[#969991]">Le lien sert en ligne, le code en boutique physique. Réduction et commission selon vos taux.</p>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                <select value={referral.customerId} onChange={(e) => setReferral({ ...referral, customerId: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                  <option value="">Client parrain…</option>
                  {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}
                </select>
                <Input placeholder="CODE10" value={referral.code} onChange={(e) => setReferral({ ...referral, code: e.target.value.toUpperCase() })} className="h-9 rounded-lg text-xs" />
                <Button disabled={!referral.customerId || referral.code.length < 3 || createReferral.isPending} onClick={() => createReferral.mutate({ customerId: Number(referral.customerId), code: referral.code })} className="h-9 rounded-xl bg-[#20231f] text-xs text-white">Créer</Button>
              </div>
              <div className="space-y-1.5">
                {(referralsQuery.data ?? []).map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-[#ececea] px-3 py-2 text-xs">
                    <span><span className="font-mono font-bold">{row.code}</span> — {row.ownerName ?? "Client"}</span>
                    <Badge className={`border-0 text-[9px] font-bold ${row.active ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#f2f2ed] text-[#969991]"}`}>{row.active ? "Actif" : "Inactif"}</Badge>
                  </div>
                ))}
                {!(referralsQuery.data ?? []).length && <p className="text-center text-[11px] text-[#969991]">Aucun code pour le moment.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
