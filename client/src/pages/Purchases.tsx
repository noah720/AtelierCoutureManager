import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatXof, PURCHASE_STATUS_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Plus, ShoppingCart, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Purchases() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const listQuery = trpc.purchases.list.useQuery();
  const accountsQuery = trpc.treasury.accounts.useQuery();
  const meQuery = trpc.auth.me.useQuery();

  const validate = trpc.purchases.validate.useMutation({
    onSuccess: (result) => {
      utils.purchases.list.invalidate();
      toast.success(`Étape validée — statut : ${PURCHASE_STATUS_LABELS[result.status]}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const refuse = trpc.purchases.refuse.useMutation({ onSuccess: () => utils.purchases.list.invalidate() });
  const pay = trpc.purchases.pay.useMutation({
    onSuccess: () => {
      utils.purchases.list.invalidate();
      utils.treasury.accounts.invalidate();
      utils.treasury.movements.invalidate();
      toast.success("Achat payé — sortie de trésorerie enregistrée.");
    },
    onError: (error) => toast.error(error.message),
  });

  const myJob = (trpc.employees.list.useQuery().data ?? []).find((row) => row.employee.userId === meQuery.data?.id)?.employee.jobTitle ?? "";
  const payables = accountsQuery.data ?? [];

  return (
    <AppShell
      title="Approvisionnement"
      subtitle="Demandes d'achat avec circuit de validation : acheteur → comptable → direction (sauf < 50 000 F CFA)."
      actions={
        <Button onClick={() => setShowForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white"><Plus size={15} className="mr-2" /> Nouvelle demande d’achat</Button>
      }
    >
      <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
          <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Demandes d’achat</CardTitle>
          {myJob && <p className="mt-1 text-[11px] text-[#969991]">Votre poste enregistré : <span className="font-semibold">{myJob}</span></p>}
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <p className="px-5 py-12 text-center text-xs text-[#969991]">Chargement…</p>
          ) : !(listQuery.data ?? []).length ? (
            <div className="px-5 py-14 text-center">
              <ShoppingCart size={20} className="mx-auto mb-3 text-[#9a9c95]" />
              <p className="text-sm font-semibold">Aucune demande d’achat</p>
              <p className="mt-1 text-xs text-[#9a9c95]">Quand un stock manque, la demande d’achat part de ici vers le circuit de validation.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0eb]">
              {listQuery.data!.map((request) => (
                <div key={request.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold">
                      {request.supplier ?? "Fournisseur non précisé"} — {formatXof(request.totalAmount, request.currency)}
                    </p>
                    <Badge className={`border-0 text-[9px] font-bold ${request.status === "recue" ? "bg-[#e2f4ee] text-[#2d8a70]" : request.status === "refusee" ? "bg-[#fff0ed] text-[#b4604e]" : "bg-[#fff0db] text-[#c27b2c]"}`}>
                      {PURCHASE_STATUS_LABELS[request.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-[#969991]">Demandée par {request.requesterName} · {new Date(request.createdAt).toLocaleDateString("fr-FR")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {request.status === "proposee" && (
                      <Button variant="outline" size="sm" disabled={validate.isPending} onClick={() => validate.mutate({ id: request.id, step: "acheteur" })} className="rounded-lg text-[11px]">
                        <CheckCircle2 size={12} className="mr-1 text-[#2d8a70]" /> Avis acheteur
                      </Button>
                    )}
                    {request.status === "valide_acheteur" && (
                      <Button variant="outline" size="sm" disabled={validate.isPending} onClick={() => validate.mutate({ id: request.id, step: "comptable" })} className="rounded-lg text-[11px]">
                        <CheckCircle2 size={12} className="mr-1 text-[#2d8a70]" /> Visa comptable
                      </Button>
                    )}
                    {request.status === "valide_comptable" && (
                      <Button variant="outline" size="sm" disabled={validate.isPending} onClick={() => validate.mutate({ id: request.id, step: "direction" })} className="rounded-lg text-[11px]">
                        <CheckCircle2 size={12} className="mr-1 text-[#2d8a70]" /> Accord direction
                      </Button>
                    )}
                    {(request.status === "approubee") && payables.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          const accountId = Number(event.target.value);
                          if (accountId) pay.mutate({ id: request.id, accountId });
                          event.target.value = "";
                        }}
                        className="rounded-lg border border-[#e4e5df] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#40433d]"
                      >
                        <option value="">Payer depuis…</option>
                        {payables.map((row) => (
                          <option key={row.account.id} value={row.account.id}>{row.account.label} ({row.account.currency})</option>
                        ))}
                      </select>
                    )}
                    {["proposee", "valide_acheteur", "valide_comptable"].includes(request.status) && (
                      <Button variant="outline" size="sm" disabled={refuse.isPending} onClick={() => refuse.mutate({ id: request.id })} className="rounded-lg text-[11px] text-[#b4604e]">
                        <XCircle size={12} className="mr-1" /> Refuser
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePurchaseForm open={showForm} onClose={() => setShowForm(false)} />
    </AppShell>
  );
}

function CreatePurchaseForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState<Array<{ label: string; quantity: string; unitPrice: string }>>([{ label: "", quantity: "1", unitPrice: "" }]);

  const mutation = trpc.purchases.create.useMutation({
    onSuccess: () => {
      utils.purchases.list.invalidate();
      onClose();
      setItems([{ label: "", quantity: "1", unitPrice: "" }]);
      setSupplier("");
    },
  });

  const total = items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      supplier: supplier || undefined,
      items: items.filter((item) => item.label && Number(item.unitPrice) > 0).map((item) => ({ label: item.label, quantity: Number(item.quantity) || 1, unitPrice: item.unitPrice })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouvelle demande d’achat</DialogTitle>
          <p className="mt-1 text-xs text-[#92958d]">Moins de 50 000 F CFA : le visa du comptable suffit. Moins de 2 000 F CFA : payable depuis la petite caisse.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input placeholder="Fournisseur (optionnel)" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-9 rounded-lg text-xs" />
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_70px_100px_auto] gap-2">
              <Input placeholder="Article (tissu, fil…)" value={item.label} onChange={(e) => setItems((current) => current.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)))} className="h-9 rounded-lg text-xs" />
              <Input inputMode="numeric" placeholder="Qté" value={item.quantity} onChange={(e) => setItems((current) => current.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)))} className="h-9 rounded-lg text-xs" />
              <Input inputMode="decimal" placeholder="Prix unit." value={item.unitPrice} onChange={(e) => setItems((current) => current.map((row, i) => (i === index ? { ...row, unitPrice: e.target.value } : row)))} className="h-9 rounded-lg text-xs" />
              <Button type="button" variant="outline" onClick={() => setItems((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))} className="h-9 rounded-lg text-[11px]">—</Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, { label: "", quantity: "1", unitPrice: "" }])} className="rounded-lg text-[11px]">+ Ajouter une ligne</Button>
            <p className="text-xs font-semibold">Total : {formatXof(total)}</p>
          </div>
          {mutation.error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending || total <= 0} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Envoi…" : "Envoyer la demande"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
