import { clearCart, readCart, updateQuantity, removeFromCart, type CartItem } from "@/lib/shopCart";
import { trpc } from "@/lib/trpc";
import { Loader2, MapPin, ShieldCheck, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";

/**
 * Panier & commande (5.1 : parcours d'achat simple pour éviter l'abandon de
 * panier) + livraison par zone avec frais affichés avant paiement (5.4) +
 * code de parrainage (5.5).
 */
export default function ShopCheckout() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [, navigate] = useLocation();
  const catalogQuery = trpc.shop.catalog.useQuery({ slug }, { retry: false });
  const zonesQuery = trpc.shop.zones.useQuery({ slug }, { retry: false });
  const [cart, setCart] = useState<CartItem[]>(() => readCart(slug));
  const [values, setValues] = useState({ firstName: "", lastName: "", phone: "", email: "", city: "", address: "" });
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [referral, setReferral] = useState("");

  useEffect(() => {
    if (!zoneId && zonesQuery.data?.length) setZoneId(zonesQuery.data[0].id);
  }, [zonesQuery.data, zoneId]);

  const org = catalogQuery.data?.organization;
  const zone = zonesQuery.data?.find((row) => row.id === zoneId);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);
  const referralRate = referral.trim() ? (org?.referralCustomerRate ?? 10) : 0;
  const discount = Math.round(subtotal * referralRate) / 100;
  const deliveryFee = zone ? Number(zone.fee) : 0;
  const total = Math.max(subtotal - (referral ? discount : 0), 0) + deliveryFee;

  const checkout = trpc.shop.checkout.useMutation({
    onSuccess: (result) => {
      clearCart(slug);
      if (result.mode === "live") {
        window.location.href = result.checkoutUrl;
      } else {
        navigate(result.checkoutUrl);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return toast.error("Votre panier est vide.");
    if (!zoneId) return toast.error("Choisissez une zone de livraison.");
    checkout.mutate({
      slug,
      customer: {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        email: values.email,
        city: values.city || undefined,
        address: values.address || undefined,
      },
      deliveryZoneId: zoneId,
      referralCode: referral.trim() || undefined,
      items: cart.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
        customMeasurements: item.customMeasurements,
      })),
    });
  };

  if (catalogQuery.isLoading || zonesQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#faf9f6]"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] pb-16">
      <header className="sticky top-0 z-20 border-b border-[#eceae4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={`/boutique/${slug}`} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#20231f] font-display text-sm font-semibold text-white">{org?.name.slice(0, 1) ?? "B"}</div>
            <span className="font-display text-base font-semibold">{org?.name}</span>
          </Link>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2d8a70]"><ShieldCheck size={14} /> Paiement sécurisé</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-5 px-4 pt-6 md:grid-cols-[1.1fr_1fr]">
        {/* Panier */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-[#eceae4] bg-white p-5">
            <h2 className="font-display text-xl font-semibold">Votre panier</h2>
            {!cart.length ? (
              <div className="py-10 text-center">
                <p className="text-sm text-[#969991]">Votre panier est vide.</p>
                <Link href={`/boutique/${slug}`} className="mt-4 inline-block rounded-full bg-[#20231f] px-5 py-2 text-xs font-semibold text-white">Continuer mes achats</Link>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {cart.map((item) => (
                  <div key={item.variantId} className="flex items-center gap-3 rounded-2xl border border-[#f0eee8] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{item.name}</p>
                      <p className="text-[10px] text-[#969991]">{[item.size, item.color].filter(Boolean).join(" · ")}{item.customMeasurements ? " · sur mesure" : ""}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setCart(updateQuantity(slug, item.variantId, item.quantity - 1))} className="h-6 w-6 rounded-full border border-[#e5e3dd] text-xs">−</button>
                      <span className="w-5 text-center text-xs font-semibold">{item.quantity}</span>
                      <button onClick={() => setCart(updateQuantity(slug, item.variantId, item.quantity + 1))} className="h-6 w-6 rounded-full border border-[#e5e3dd] text-xs">+</button>
                    </div>
                    <p className="w-24 text-right text-xs font-bold">{(item.unitPrice * item.quantity).toLocaleString("fr-FR")} {org?.currency}</p>
                    <button onClick={() => setCart(removeFromCart(slug, item.variantId))} aria-label="Retirer" className="text-[#b4604e]"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coordonnées */}
          <form id="checkout-form" onSubmit={submit} className="rounded-3xl border border-[#eceae4] bg-white p-5">
            <h2 className="font-display text-xl font-semibold">Vos coordonnées</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input required placeholder="Prénom" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
              <input required placeholder="Nom" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
              <input required type="tel" placeholder="Téléphone (+228…)" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
              <input required type="email" placeholder="E-mail (reçu & suivi)" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
              <input placeholder="Ville" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
              <input placeholder="Adresse de livraison" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} className="h-9 rounded-xl border border-[#e5e3dd] px-3 text-xs" />
            </div>

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#858880]"><MapPin size={12} /> Livraison</p>
            <div className="space-y-1.5">
              {(zonesQuery.data ?? []).map((row) => (
                <label key={row.id} className={`flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2.5 text-xs ${zoneId === row.id ? "border-[#20231f] bg-[#faf9f6]" : "border-[#eceae4]"}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="zone" checked={zoneId === row.id} onChange={() => setZoneId(row.id)} />
                    <span>
                      <span className="font-semibold">{row.name}</span>
                      {row.etaDays ? <span className="ml-1 text-[10px] text-[#969991]">· ~{row.etaDays} j</span> : null}
                      {row.kind === "internationale" ? <span className="ml-1 rounded-full bg-[#eee8ff] px-1.5 py-0.5 text-[9px] font-bold text-[#6954c6]">DHL</span> : null}
                    </span>
                  </span>
                  <span className="font-bold">{Number(row.fee).toLocaleString("fr-FR")} {row.currency}</span>
                </label>
              ))}
              {!(zonesQuery.data ?? []).length && <p className="text-xs text-[#969991]">Aucune zone de livraison configurée.</p>}
            </div>

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#858880]"><Tag size={12} /> Code de parrainage</p>
            <input value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} placeholder="Ex. AMINATA10" className="h-9 w-full rounded-xl border border-[#e5e3dd] px-3 text-xs uppercase" />
            {referral.trim() && <p className="mt-1 text-[10px] text-[#2d8a70]">Réduction de {org?.referralCustomerRate ?? 10} % appliquée sur les articles.</p>}
          </form>
        </div>

        {/* Récapitulatif */}
        <div>
          <div className="sticky top-20 rounded-3xl bg-[#20231f] p-5 text-white">
            <h2 className="font-display text-xl font-semibold">Récapitulatif</h2>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-white/70"><span>Sous-total</span><span>{subtotal.toLocaleString("fr-FR")} {org?.currency}</span></div>
              {Boolean(referral.trim()) && discount > 0 && (
                <div className="flex justify-between text-[#8fd8bd]"><span>Parrainage (−{org?.referralCustomerRate ?? 10} %)</span><span>−{Math.round(discount).toLocaleString("fr-FR")} {org?.currency}</span></div>
              )}
              <div className="flex justify-between text-white/70"><span>Livraison — {zone?.name ?? "…"}</span><span>{deliveryFee.toLocaleString("fr-FR")} {org?.currency}</span></div>
              <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2">
                <span className="text-xs font-semibold">Total à payer</span>
                <span className="font-display text-2xl font-semibold">{Math.round(total).toLocaleString("fr-FR")} {org?.currency}</span>
              </div>
            </div>
            <button
              disabled={checkout.isPending || !cart.length || !zoneId}
              form="checkout-form"
              type="submit"
              className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-bold text-[#20231f] transition hover:bg-white/90 disabled:opacity-50"
            >
              {checkout.isPending ? <Loader2 size={15} className="animate-spin" /> : "Commander et payer"}
            </button>
            <p className="mt-3 text-center text-[10px] leading-relaxed text-white/50">
              Paiement sécurisé via Moneroo : mobile money (MTN, Moov, Orange, Wave), carte bancaire ou PayPal selon votre pays. La marque reçoit la commande immédiatement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
