import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ACCOUNT_TYPE_LABELS, formatXof } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowDownLeft, ArrowUpRight, Plus, RefreshCcw, Wallet } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Treasury() {
  const utils = trpc.useUtils();
  const [showMovement, setShowMovement] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const accountsQuery = trpc.treasury.accounts.useQuery();
  const movementsQuery = trpc.treasury.movements.useQuery();
  const refill = trpc.treasury.refillPettyCash.useMutation({
    onSuccess: () => {
      utils.treasury.accounts.invalidate();
      utils.treasury.movements.invalidate();
      toast.success("Petite caisse renflouée.");
    },
    onError: (error) => toast.error(error.message),
  });

  const accounts = accountsQuery.data ?? [];
  const totalByCurrency = accounts.reduce<Record<string, number>>((sums, row) => {
    sums[row.account.currency] = (sums[row.account.currency] ?? 0) + Number(row.balance);
    return sums;
  }, {});
  const pettyCash = accounts.find((row) => row.account.type === "petite_caisse");
  const sourceAccounts = accounts.filter((row) => row.account.type !== "petite_caisse");

  return (
    <AppShell
      title="Trésorerie"
      subtitle="Chaque caisse suivie séparément : boutiques, caisse centrale, banque, mobile money, TPE, boutique en ligne, petite caisse."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAccount(true)} className="rounded-xl text-xs font-semibold"><Plus size={14} className="mr-1" /> Compte</Button>
          <Button onClick={() => setShowMovement(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white"><Plus size={15} className="mr-2" /> Mouvement</Button>
        </div>
      }
    >
      {/* Soldes consolidés */}
      <div className="mb-5 flex flex-wrap gap-3">
        {Object.entries(totalByCurrency).map(([currency, total]) => (
          <div key={currency} className="flex-1 rounded-2xl bg-[#20231f] px-5 py-4 text-white">
            <p className="text-[10px] uppercase tracking-wide text-white/50">Ensemble des comptes ({currency})</p>
            <p className="font-display text-2xl font-semibold">{formatXof(total, currency)}</p>
          </div>
        ))}
        {!accounts.length && <p className="py-4 text-xs text-[#969991]">Aucun compte de trésorerie pour le moment.</p>}
      </div>

      {/* Renflouement petite caisse (20 000 XOF) */}
      {pettyCash && sourceAccounts.length > 0 && (
        <Card className="mb-5 border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><RefreshCcw size={15} className="text-[#c27b2c]" /> Petite caisse — fond de 20 000 XOF</CardTitle>
            <p className="mt-1 text-[11px] text-[#969991]">Solde actuel : {formatXof(pettyCash.balance, pettyCash.account.currency)}. Les achats de moins de 2 000 XOF passent par ce fond, avec visa du comptable.</p>
          </CardHeader>
          <CardContent className="px-5 py-4">
            <PettyCashForm pettyId={pettyCash.account.id} sources={sourceAccounts.map((row) => row.account)} onSubmit={(sourceId, amount) => refill.mutate({ pettyAccountId: pettyCash.account.id, sourceAccountId: sourceId, amount })} pending={refill.isPending} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        {/* Comptes */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Comptes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {accounts.length === 0 ? (
              <p className="px-5 py-12 text-center text-xs text-[#969991]">Aucun compte pour le moment.</p>
            ) : (
              <div className="divide-y divide-[#f0f0eb]">
                {accounts.map((row) => (
                  <div key={row.account.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${Number(row.balance) >= 0 ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0ed] text-[#b4604e]"}`}><Wallet size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{row.account.label}</p>
                      <p className="text-[10px] text-[#969991]">{ACCOUNT_TYPE_LABELS[row.account.type]}</p>
                    </div>
                    <p className="text-xs font-semibold">{formatXof(row.balance, row.account.currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mouvements */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Derniers mouvements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!(movementsQuery.data ?? []).length ? (
              <p className="px-5 py-12 text-center text-xs text-[#969991]">Aucun mouvement pour le moment.</p>
            ) : (
              <div className="max-h-[520px] divide-y divide-[#f0f0eb] overflow-y-auto">
                {movementsQuery.data!.map((movement) => (
                  <div key={movement.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${movement.direction === "entree" ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0ed] text-[#b4604e]"}`}>
                      {movement.direction === "entree" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{movement.label}</p>
                      <p className="text-[10px] text-[#969991]">{new Date(movement.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {ACCOUNT_TYPE_LABELS[accounts.find((a) => a.account.id === movement.accountId)?.account.type ?? ""] ?? movement.category}</p>
                    </div>
                    <p className={`text-xs font-semibold ${movement.direction === "entree" ? "text-[#2d8a70]" : "text-[#b4604e]"}`}>
                      {movement.direction === "entree" ? "+" : "−"}{formatXof(movement.amount, movement.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MovementForm open={showMovement} accounts={accounts.map((row) => row.account)} onClose={() => setShowMovement(false)} />
      <AccountForm open={showAccount} onClose={() => setShowAccount(false)} />
    </AppShell>
  );
}

function PettyCashForm({ pettyId, sources, onSubmit, pending }: { pettyId: number; sources: any[]; onSubmit: (sourceId: number, amount: string) => void; pending: boolean }) {
  const [sourceId, setSourceId] = useState<string>("");
  const [amount, setAmount] = useState("20000");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-40 flex-1">
        <span className="mb-1 block text-[10px] font-semibold text-[#858880]">Renflouer depuis</span>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
          <option value="">Compte source…</option>
          {sources.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
      </label>
      <label className="w-32">
        <span className="mb-1 block text-[10px] font-semibold text-[#858880]">Montant (XOF)</span>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 rounded-lg text-xs" />
      </label>
      <Button disabled={pending || !sourceId} onClick={() => onSubmit(Number(sourceId), amount)} className="h-9 rounded-xl bg-[#20231f] text-xs text-white">Renflouer</Button>
    </div>
  );
}

function MovementForm({ open, accounts, onClose }: { open: boolean; accounts: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ accountId: "", direction: "entree", amount: "", category: "autre", label: "" });
  const mutation = trpc.treasury.recordMovement.useMutation({
    onSuccess: () => {
      utils.treasury.accounts.invalidate();
      utils.treasury.movements.invalidate();
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      accountId: Number(values.accountId),
      direction: values.direction as "entree" | "sortie",
      amount: values.amount,
      category: values.category as any,
      label: values.label,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouveau mouvement</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <select required value={values.accountId} onChange={(e) => setValues({ ...values, accountId: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
            <option value="">Compte…</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} ({account.currency})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={values.direction} onChange={(e) => setValues({ ...values, direction: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="entree">Entrée d’argent</option>
              <option value="sortie">Sortie d’argent</option>
            </select>
            <select value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              {["vente", "achat", "paie", "petite_caisse", "abonnement", "ajustement", "autre"].map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <Input required inputMode="decimal" placeholder="Montant" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} className="h-9 rounded-lg text-xs" />
          <Input required placeholder="Libellé (ex. Paie semaine 36 atelier)" value={values.label} onChange={(e) => setValues({ ...values, label: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ type: "caisse_centrale", label: "", currency: "XOF", openingBalance: "0" });
  const mutation = trpc.treasury.createAccount.useMutation({
    onSuccess: () => {
      utils.treasury.accounts.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouveau compte de trésorerie</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ type: values.type as any, label: values.label, currency: values.currency as any, openingBalance: values.openingBalance });
          }}
          className="space-y-3"
        >
          <select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Input required placeholder="Nom du compte (ex. Ecobank — Douala)" value={values.label} onChange={(e) => setValues({ ...values, label: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div className="grid grid-cols-2 gap-3">
            <select value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              {["XOF", "XAF", "USD", "EUR"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
            <Input inputMode="decimal" placeholder="Solde d’ouverture" value={values.openingBalance} onChange={(e) => setValues({ ...values, openingBalance: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Création…" : "Créer le compte"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
