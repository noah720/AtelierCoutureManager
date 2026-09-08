import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

const PROVIDERS = [
  { key: "mtn", label: "MTN MoMo" },
  { key: "moov", label: "Moov Flooz" },
  { key: "orange", label: "Orange Money" },
  { key: "wave", label: "Wave" },
  { key: "card", label: "Carte bancaire" },
];

/**
 * Caisse de paiement en ligne.
 *
 * En mode **simulation** (démonstration sans clé Moneroo), cette page joue le
 * rôle de la caisse sécurisée : le client choisit son moyen de paiement et
 * valide. En production (`MONEROO_API_KEY` configurée), le client est redirigé
 * vers la caisse officielle Moneroo et cette page ne sert que de retour
 * (`return_url`) avec confirmation du statut.
 */
export default function ShopPayment() {
  const params = useParams<{ slug: string; paymentId: string }>();
  const slug = params.slug ?? "";
  const paymentId = Number(params.paymentId);
  const paymentQuery = trpc.shop.payment.useQuery({ paymentId }, { retry: false });
  const [provider, setProvider] = useState("mtn");
  const [phone, setPhone] = useState("");

  const confirm = trpc.shop.confirmPayment.useMutation({
    onSuccess: () => paymentQuery.refetch(),
    onError: (error) => toast.error(error.message),
  });

  if (paymentQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#faf9f6]"><Loader2 className="animate-spin" /></div>;
  }

  if (paymentQuery.isError || !paymentQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Paiement introuvable</h1>
        <Link href={`/boutique/${slug}`} className="mt-4 rounded-full bg-[#20231f] px-5 py-2 text-xs font-semibold text-white">Retour à la boutique</Link>
      </div>
    );
  }

  const { payment, order, organization } = paymentQuery.data;
  const amount = Number(payment.amount);

  if (payment.status === "succes") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e2f4ee]">
          <CheckCircle2 size={30} className="text-[#2d8a70]" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold">Merci pour votre commande !</h1>
        <p className="mt-2 max-w-md text-sm text-[#60635c]">
          Votre paiement de <span className="font-bold">{amount.toLocaleString("fr-FR")} {payment.currency}</span> est confirmé.
          Votre commande <span className="font-mono font-semibold">{order.reference}</span> chez {organization.name} est en préparation — vous recevrez son suivi par e-mail.
        </p>
        <Link href={`/boutique/${slug}`} className="mt-6 rounded-full bg-[#20231f] px-6 py-2.5 text-xs font-semibold text-white">Continuer mes achats</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-[#eceae4] bg-white p-6 shadow-[0_12px_40px_rgba(43,45,37,0.06)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#20231f] font-display text-sm font-semibold text-white">{organization.name.slice(0, 1)}</div>
              <div>
                <p className="text-xs font-semibold">{organization.name}</p>
                <p className="text-[10px] text-[#969991]">Commande {order.reference}</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#2d8a70]"><Lock size={11} /> Sécurisé</span>
          </div>

          <div className="mt-5 rounded-2xl bg-[#faf9f6] px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[#969991]">Montant à payer</p>
            <p className="font-display text-3xl font-semibold">{amount.toLocaleString("fr-FR")} {payment.currency}</p>
          </div>

          <p className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#858880]"><Smartphone size={12} /> Moyen de paiement</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PROVIDERS.map((row) => (
              <button key={row.key} onClick={() => setProvider(row.key)} className={`rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${provider === row.key ? "border-[#20231f] bg-[#20231f] text-white" : "border-[#e5e3dd] bg-white text-[#40433d]"}`}>
                {row.label}
              </button>
            ))}
          </div>

          {provider !== "card" && (
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro mobile à débiter (+228…)" className="mt-3 h-10 w-full rounded-xl border border-[#e5e3dd] px-3 text-sm" />
          )}
          {provider === "card" && (
            <div className="mt-3 space-y-2">
              <input placeholder="Numéro de carte" className="h-10 w-full rounded-xl border border-[#e5e3dd] px-3 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="MM/AA" className="h-10 rounded-xl border border-[#e5e3dd] px-3 text-sm" />
                <input placeholder="CVC" className="h-10 rounded-xl border border-[#e5e3dd] px-3 text-sm" />
              </div>
            </div>
          )}

          <button
            disabled={confirm.isPending || (provider !== "card" && phone.replace(/\D/g, "").length < 8)}
            onClick={() => confirm.mutate({ paymentId, method: provider, mobileNumber: phone || undefined })}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-[#20231f] text-sm font-bold text-white transition hover:bg-[#353832] disabled:opacity-50"
          >
            {confirm.isPending ? <Loader2 size={15} className="animate-spin" /> : `Payer ${amount.toLocaleString("fr-FR")} ${payment.currency}`}
          </button>

          <p className="mt-4 rounded-xl bg-[#eee8ff] px-3 py-2 text-center text-[10px] leading-relaxed text-[#6954c6]">
            <ShieldCheck size={11} className="mr-1 inline" />
            Environnement de démonstration — en production, cette caisse est celle de <span className="font-bold">Moneroo</span> (mobile money, carte, PayPal selon le pays), sans qu’aucune donnée bancaire ne transite par la marque.
          </p>
        </div>
        <p className="mt-4 text-center text-[10px] text-[#a6a8a1]">En payant, vous acceptez les conditions de vente de {organization.name}.</p>
      </div>
    </div>
  );
}
