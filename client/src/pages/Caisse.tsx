import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CURRENCY_LABELS, formatXof, PAYMENT_METHOD_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { downloadBase64Pdf } from "@/lib/download";
import { Banknote, CreditCard, FileDown, Mail, Minus, Plus, Printer, Search, Smartphone, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { computeSettlement, convert, DEFAULT_RATES, type CurrencyCode, type PaymentInput, type PaymentMethod, type RateMap } from "@shared/money";

type CartLine = { variantId: number; name: string; size: string | null; color: string | null; unitPrice: number; quantity: number };
type DraftPayment = { method: PaymentMethod; currency: CurrencyCode; amount: string; reference?: string; mobileNumber?: string };

const CASH_CURRENCIES: CurrencyCode[] = ["XOF", "USD", "EUR"];

export default function Caisse() {
  const utils = trpc.useUtils();
  const storesQuery = trpc.stores.list.useQuery();
  const customersQuery = trpc.customers.list.useQuery();
  const variantsQuery = trpc.variants.list.useQuery();
  const ratesQuery = trpc.rates.get.useQuery();
  const orgQuery = trpc.organization.current.useQuery();

  const [storeId, setStoreId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [cashInputs, setCashInputs] = useState<Record<string, string>>({ XOF: "", USD: "", EUR: "" });
  const [mobileDialog, setMobileDialog] = useState<{ open: boolean; amount: string; currency: CurrencyCode; number: string }>({ open: false, amount: "", currency: "XOF", number: "" });
  const [tpeDialog, setTpeDialog] = useState<{ open: boolean; amount: string; currency: CurrencyCode; reference: string }>({ open: false, amount: "", currency: "XOF", reference: "" });
  const [receipt, setReceipt] = useState<{ saleId: number; reference: string; total: number; currency: string; three: { XOF: number; USD: number; EUR: number }; change: number } | null>(null);

  const store = (storesQuery.data ?? []).find((s) => s.id === (storeId ?? storesQuery.data?.[0]?.id));
  const activeStoreId = store?.id ?? null;

  const rates: RateMap = useMemo(() => {
    const map: RateMap = { ...DEFAULT_RATES };
    for (const row of ratesQuery.data ?? []) map[row.code] = Number(row.rateToXof);
    return map;
  }, [ratesQuery.data]);

  const storeCurrency = (store?.currency ?? "XOF") as CurrencyCode;

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const referralRate = Number(orgQuery.data?.referralCustomerRate ?? 10);
  const discount = referralCode.trim() ? (subtotal * referralRate) / 100 : 0;
  const total = Math.max(subtotal - discount, 0);

  const paymentInputs: PaymentInput[] = payments.map((p) => ({ method: p.method, currency: p.currency, amount: Number(p.amount) || 0 }));
  const settlement = computeSettlement(total, paymentInputs, storeCurrency, rates);

  const filteredVariants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = variantsQuery.data ?? [];
    if (!needle) return all.slice(0, 12);
    return all.filter((row) => `${row.product.name} ${row.variant.sku} ${row.variant.size ?? ""} ${row.variant.color ?? ""}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [variantsQuery.data, search]);

  const addToCart = (row: { variant: { id: number; size: string | null; color: string | null; price: string }; product: { name: string } }) => {
    setCart((current) => {
      const existing = current.find((line) => line.variantId === row.variant.id);
      if (existing) return current.map((line) => (line.variantId === row.variant.id ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { variantId: row.variant.id, name: row.product.name, size: row.variant.size, color: row.variant.color, unitPrice: Number(row.variant.price), quantity: 1 }];
    });
  };

  const setCash = (currency: CurrencyCode, value: string) => {
    setCashInputs((current) => ({ ...current, [currency]: value }));
    setPayments((current) => {
      const others = current.filter((p) => !(p.method === "cash" && p.currency === currency));
      const amount = Number(value) || 0;
      return amount > 0 ? [...others, { method: "cash", currency, amount: String(amount) }] : others;
    });
  };

  const resetSale = () => {
    setCart([]);
    setPayments([]);
    setCashInputs({ XOF: "", USD: "", EUR: "" });
    setReferralCode("");
    setCustomerId(null);
  };

  const createSale = trpc.sales.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Vente ${result.sale.reference} enregistrée.`);
      setReceipt({ saleId: result.sale.id, reference: result.sale.reference, total: Number(result.sale.totalAmount), currency: result.storeCurrency, three: result.threeCurrencies, change: result.settlement.change });
      resetSale();
      utils.dashboard.summary.invalidate();
      utils.sales.list.invalidate();
      utils.inventory.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Reçu PDF + envoi e-mail (point 13) — actifs dès qu'une vente est réglée.
  const receiptPdf = trpc.receipts.salePdf.useQuery({ saleId: receipt?.saleId ?? 0 }, { enabled: Boolean(receipt?.saleId) });
  const downloadReceipt = async () => {
    try {
      const result = await receiptPdf.refetch();
      if (result.data) downloadBase64Pdf(result.data.filename, result.data.base64);
    } catch (error) {
      toast.error("Impossible de générer le reçu PDF.");
    }
  };
  const emailSale = trpc.receipts.emailSale.useMutation({
    onSuccess: (result) => {
      if (result.status === "envoye") toast.success(`Reçu envoyé à ${result.recipient}.`);
      else if (result.status === "simulation") toast.info(`E-mail simulé (aucun fournisseur configuré) — ${result.recipient}. Le PDF reste téléchargeable.`);
      else toast.error(`Échec de l'envoi : ${result.detail ?? "erreur inconnue"}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const validate = () => {
    if (!activeStoreId) return toast.error("Choisissez d’abord une boutique.");
    if (!cart.length) return toast.error("Ajoutez au moins un article.");
    if (settlement.remain > 0) return toast.error(`Reste à payer : ${formatXof(settlement.remain, storeCurrency)}`);
    createSale.mutate({
      storeId: activeStoreId,
      customerId: customerId ?? undefined,
      items: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity, unitPrice: String(line.unitPrice) })),
      payments: payments.map((p) => ({ ...p, amount: String(Number(p.amount)) })),
      referralCode: referralCode.trim().toUpperCase() || undefined,
    });
  };

  const displayRates = CASH_CURRENCIES.map((currency) => ({ currency, value: convert(total, storeCurrency, currency, rates) }));
  const remainByCurrency = CASH_CURRENCIES.map((currency) => ({ currency, value: convert(settlement.remain, storeCurrency, currency, rates) }));

  return (
    <AppShell title="Caisse & ventes" subtitle="Encaissement multi-articles et multi-paiements — espèces en trois devises, mobile money, TPE…">
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Colonne articles */}
        <div className="space-y-4">
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">1 · Boutique, client et articles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Boutique</span>
                  <select value={activeStoreId ?? ""} onChange={(e) => setStoreId(Number(e.target.value))} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                    {(storesQuery.data ?? []).filter((s) => s.isActive && s.kind === "boutique").map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.currency})</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Client (optionnel)</span>
                  <select value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                    <option value="">Client de passage</option>
                    {(customersQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-[#a6a8a1]" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article (nom, SKU, taille…)" className="h-9 rounded-lg pl-9 text-xs" />
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredVariants.map((row) => (
                  <button key={row.variant.id} onClick={() => addToCart(row)} className="rounded-xl border border-[#ececea] bg-white px-3 py-2 text-left transition hover:border-[#20231f]">
                    <p className="truncate text-[11px] font-semibold">{row.product.name}</p>
                    <p className="mt-0.5 text-[10px] text-[#969991]">{[row.variant.size, row.variant.color].filter(Boolean).join(" · ") || row.variant.sku}</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#2d8a70]">{formatXof(row.variant.price)}</p>
                  </button>
                ))}
                {!filteredVariants.length && <p className="col-span-2 py-6 text-center text-xs text-[#969991]">Aucun article trouvé.</p>}
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Code de parrainage (réduction client {referralRate} %)</span>
                <Input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Ex. AMINATA10" className="h-9 rounded-lg text-xs uppercase" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Colonne ticket + paiements */}
        <div className="space-y-4">
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">2 · Ticket en cours</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {!cart.length ? (
                <p className="py-6 text-center text-xs text-[#969991]">Le panier est vide — touchez un article pour l’ajouter.</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div key={line.variantId} className="flex items-center gap-2 rounded-xl border border-[#ececea] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold">{line.name}</p>
                        <p className="text-[10px] text-[#969991]">{[line.size, line.color].filter(Boolean).join(" · ")} — {formatXof(line.unitPrice)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCart((c) => c.map((l) => (l.variantId === line.variantId ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)))} className="rounded-lg border border-[#ececea] p-1" aria-label="Diminuer"><Minus size={11} /></button>
                        <span className="w-6 text-center text-xs font-semibold">{line.quantity}</span>
                        <button onClick={() => setCart((c) => c.map((l) => (l.variantId === line.variantId ? { ...l, quantity: l.quantity + 1 } : l)))} className="rounded-lg border border-[#ececea] p-1" aria-label="Augmenter"><Plus size={11} /></button>
                        <button onClick={() => setCart((c) => c.filter((l) => l.variantId !== line.variantId))} className="rounded-lg p-1 text-[#b4604e] hover:bg-[#fff0ed]" aria-label="Retirer"><Trash2 size={12} /></button>
                      </div>
                      <p className="w-24 text-right text-[11px] font-semibold">{formatXof(line.unitPrice * line.quantity, storeCurrency)}</p>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-[#f0f0eb] pt-2 text-xs">
                    <span className="text-[#858880]">Sous-total{discount > 0 ? ` − parrainage ${referralRate} %` : ""}</span>
                    <span className="font-display text-lg font-semibold">{formatXof(total, storeCurrency)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">3 · Paiement</CardTitle>
              <p className="mt-1 text-[10px] text-[#969991]">Total en trois devises : {displayRates.map((r) => `${r.value.toLocaleString("fr-FR")} ${r.currency}`).join(" · ")}</p>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {/* Espèces en trois devises (7.1) */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#a1a39d]"><Banknote size={13} /> Espèces (devise locale, dollars, euros)</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CASH_CURRENCIES.map((currency) => (
                    <label key={currency} className="block">
                      <span className="mb-1 block text-[10px] font-semibold text-[#858880]">{CURRENCY_LABELS[currency]}</span>
                      <Input inputMode="decimal" value={cashInputs[currency]} onChange={(e) => setCash(currency, e.target.value)} placeholder="0" className="h-9 rounded-lg text-xs" />
                      <span className="mt-0.5 block text-[9px] text-[#a6a8a1]">Reste : {remainByCurrency.find((r) => r.currency === currency)?.value.toLocaleString("fr-FR")} {currency}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Autres moyens : mobile money d'abord (7.1) */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button type="button" variant="outline" onClick={() => setMobileDialog({ ...mobileDialog, open: true })} className="h-9 rounded-xl text-[11px] font-semibold">
                  <Smartphone size={13} className="mr-1.5 text-[#2d8a70]" /> Mobile Money
                </Button>
                <Button type="button" variant="outline" onClick={() => setTpeDialog({ ...tpeDialog, open: true })} className="h-9 rounded-xl text-[11px] font-semibold">
                  <CreditCard size={13} className="mr-1.5 text-[#6954c6]" /> TPE
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayments((p) => [...p, { method: "transfer", currency: storeCurrency, amount: String(Math.round(settlement.remain)) }])}
                  className="h-9 rounded-xl text-[11px] font-semibold"
                >
                  <Wallet size={13} className="mr-1.5" /> Virement (solde)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayments((p) => [...p, { method: "card", currency: storeCurrency, amount: String(Math.round(settlement.remain)) }])}
                  className="h-9 rounded-xl text-[11px] font-semibold"
                >
                  <CreditCard size={13} className="mr-1.5" /> Carte (solde)
                </Button>
              </div>

              {payments.filter((p) => p.method !== "cash").length > 0 && (
                <div className="space-y-1.5">
                  {payments.filter((p) => p.method !== "cash").map((payment, index) => (
                    <div key={`${payment.method}-${index}`} className="flex items-center justify-between rounded-xl bg-[#f7f7f5] px-3 py-2">
                      <span className="text-[11px] font-semibold">{PAYMENT_METHOD_LABELS[payment.method]} · {payment.currency}</span>
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="font-semibold">{formatXof(Number(payment.amount), payment.currency)}</span>
                        {payment.mobileNumber && <span className="font-mono text-[10px] text-[#969991]">{payment.mobileNumber}</span>}
                        {payment.reference && <span className="font-mono text-[10px] text-[#969991]">{payment.reference}</span>}
                        <button onClick={() => setPayments((current) => current.filter((_, i) => i !== index))} aria-label="Retirer ce paiement"><Trash2 size={12} className="text-[#b4604e]" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#20231f] px-4 py-3 text-white">
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-white/50">Réglé</p>
                  <p className="text-xs font-bold">{formatXof(settlement.paid, storeCurrency)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-white/50">Reste à payer</p>
                  <p className="text-xs font-bold">{formatXof(settlement.remain, storeCurrency)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-white/50">Monnaie à rendre</p>
                  <p className="text-xs font-bold">{formatXof(settlement.change, storeCurrency)}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetSale} className="rounded-xl text-xs">Tout effacer</Button>
                <Button disabled={createSale.isPending || settlement.remain > 0 || !cart.length} onClick={validate} className="flex-1 rounded-xl bg-[#20231f] text-xs font-semibold text-white hover:bg-[#353832]">
                  {createSale.isPending ? "Enregistrement…" : settlement.remain > 0 ? `Reste ${formatXof(settlement.remain, storeCurrency)}` : "Encaisser et clôturer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fenêtre demande Mobile Money : le paiement part sur le numéro saisi (7.1) */}
      <Dialog open={mobileDialog.open} onOpenChange={(open) => setMobileDialog({ ...mobileDialog, open })}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-semibold">Demande de paiement Mobile Money</DialogTitle>
            <p className="mt-1 text-xs text-[#858880]">À la validation, la demande de paiement partira sur le numéro indiqué ; le client la validera sur son téléphone.</p>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Montant</span>
              <Input inputMode="decimal" value={mobileDialog.amount} onChange={(e) => setMobileDialog({ ...mobileDialog, amount: e.target.value })} placeholder="0" className="h-9 rounded-lg text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Devise</span>
              <select value={mobileDialog.currency} onChange={(e) => setMobileDialog({ ...mobileDialog, currency: e.target.value as CurrencyCode })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                {(["XOF", "XAF", "USD", "EUR"] as CurrencyCode[]).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Numéro mobile du client</span>
              <Input value={mobileDialog.number} onChange={(e) => setMobileDialog({ ...mobileDialog, number: e.target.value })} placeholder="+228 90 00 00 00" className="h-9 rounded-lg text-xs" />
            </label>
            <Button
              disabled={!Number(mobileDialog.amount) || !mobileDialog.number}
              onClick={() => {
                setPayments((p) => [...p, { method: "mobile_money", currency: mobileDialog.currency, amount: mobileDialog.amount, mobileNumber: mobileDialog.number }]);
                setMobileDialog({ open: false, amount: "", currency: "XOF", number: "" });
                toast.info("Demande de paiement mobile enregistrée sur le ticket.");
              }}
              className="w-full rounded-xl bg-[#20231f] text-xs font-semibold text-white"
            >
              Envoyer la demande
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fenêtre références TPE (7.1) */}
      <Dialog open={tpeDialog.open} onOpenChange={(open) => setTpeDialog({ ...tpeDialog, open })}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-semibold">Paiement par terminal TPE</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Montant</span>
              <Input inputMode="decimal" value={tpeDialog.amount} onChange={(e) => setTpeDialog({ ...tpeDialog, amount: e.target.value })} placeholder="0" className="h-9 rounded-lg text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Référence du paiement TPE</span>
              <Input value={tpeDialog.reference} onChange={(e) => setTpeDialog({ ...tpeDialog, reference: e.target.value })} placeholder="Ex. TPE-88123" className="h-9 rounded-lg text-xs" />
            </label>
            <Button
              disabled={!Number(tpeDialog.amount)}
              onClick={() => {
                setPayments((p) => [...p, { method: "tpe", currency: tpeDialog.currency, amount: tpeDialog.amount, reference: tpeDialog.reference || undefined }]);
                setTpeDialog({ open: false, amount: "", currency: "XOF", reference: "" });
              }}
              className="w-full rounded-xl bg-[#20231f] text-xs font-semibold text-white"
            >
              Ajouter au ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reçu */}
      <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold">Vente {receipt?.reference} réglée</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#f7f7f5] p-4">
                <p className="text-[10px] uppercase tracking-wide text-[#969991]">Total facturé</p>
                <p className="font-display text-2xl font-semibold">{formatXof(receipt.total, receipt.currency)}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#60635c]">
                  <p>USD : {receipt.three.USD.toLocaleString("fr-FR")} $</p>
                  <p>EUR : {receipt.three.EUR.toLocaleString("fr-FR")} €</p>
                </div>
                {receipt.change > 0 && (
                  <p className="mt-2 rounded-xl bg-[#e2f4ee] px-3 py-2 text-xs font-semibold text-[#2d8a70]">Monnaie à rendre : {formatXof(receipt.change, receipt.currency)}</p>
                )}
              </div>
              <p className="text-[11px] text-[#969991]">Le stock de la boutique a été mis à jour et la trésorerie alimentée automatiquement.</p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" className="w-full rounded-xl text-xs font-semibold" onClick={() => downloadReceipt()} disabled={receiptPdf.isFetching}>
                  <FileDown size={14} className="mr-2" /> Reçu PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl text-xs font-semibold"
                  onClick={() => {
                    if (!receipt) return;
                    const to = window.prompt("Adresse e-mail du client :", "");
                    if (!to) return;
                    emailSale.mutate({ saleId: receipt.saleId, to });
                  }}
                  disabled={emailSale.isPending}
                >
                  <Mail size={14} className="mr-2" /> Envoyer par e-mail
                </Button>
                <Button variant="outline" onClick={() => window.print()} className="w-full rounded-xl text-xs font-semibold">
                  <Printer size={14} className="mr-2" /> Imprimer le reçu
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
