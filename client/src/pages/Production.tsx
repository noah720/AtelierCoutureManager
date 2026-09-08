import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatXof, PRODUCTION_TYPE_LABELS, STAGE_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Factory, Plus, Scissors, Users2 } from "lucide-react";
import { FormEvent, useState } from "react";

export default function Production() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [showRates, setShowRates] = useState(false);

  const ordersQuery = trpc.production.list.useQuery();
  const tasksQuery = trpc.production.tasks.useQuery();
  const payrollQuery = trpc.production.weeklyPayroll.useQuery();
  const ratesQuery = trpc.production.taskRates.useQuery();
  const employeesQuery = trpc.employees.list.useQuery(undefined, { enabled: Boolean(assignFor) });

  const advance = trpc.production.advance.useMutation({
    onSuccess: () => {
      utils.production.list.invalidate();
      utils.production.tasks.invalidate();
    },
  });
  const cancel = trpc.production.cancel.useMutation({ onSuccess: () => utils.production.list.invalidate() });
  const completeTask = trpc.production.completeTask.useMutation({
    onSuccess: () => {
      utils.production.tasks.invalidate();
      utils.production.weeklyPayroll.invalidate();
    },
  });

  const workers = (employeesQuery.data ?? []).filter((row) => ["coupeur", "couturier", "brodeur", "chef_atelier"].includes(row.employee.jobTitle));

  return (
    <AppShell
      title="Production atelier"
      subtitle="Circuit : Coupe → Couture → Broderie → Finition → Contrôle qualité → Emballage → Livraison."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRates(true)} className="rounded-xl text-xs font-semibold">Barème à la tâche</Button>
          <Button onClick={() => setShowForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white"><Plus size={15} className="mr-2" /> Nouvelle fiche</Button>
        </div>
      }
    >
      {/* Paie de la semaine */}
      <Card className="mb-5 border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
        <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><Users2 size={16} className="text-[#c27b2c]" /> Paie à la tâche — semaine en cours</CardTitle>
          <p className="mt-1 text-xs text-[#969991]">Somme des tâches terminées depuis le lundi, au tarif du barème de la marque.</p>
        </CardHeader>
        <CardContent className="p-0">
          {!(payrollQuery.data ?? []).length ? (
            <p className="px-5 py-8 text-center text-xs text-[#969991]">Aucune tâche terminée cette semaine pour le moment.</p>
          ) : (
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
              {payrollQuery.data!.map((row) => (
                <div key={row.employeeId ?? row.employeeName} className="flex items-center justify-between border-b border-[#f0f0eb] px-5 py-3 last:border-0">
                  <div>
                    <p className="text-xs font-semibold">{row.employeeName}</p>
                    <p className="text-[10px] text-[#969991]">{Number(row.tasksDone)} tâche(s) terminée(s)</p>
                  </div>
                  <p className="text-sm font-semibold text-[#2d8a70]">{formatXof(row.totalPay)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Fiches de fabrication */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Fiches de fabrication</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {ordersQuery.isLoading ? (
              <p className="px-5 py-12 text-center text-xs text-[#969991]">Chargement…</p>
            ) : !(ordersQuery.data ?? []).length ? (
              <div className="px-5 py-14 text-center">
                <Factory size={20} className="mx-auto mb-3 text-[#9a9c95]" />
                <p className="text-sm font-semibold">Aucune fiche pour le moment</p>
                <p className="mt-1 text-xs text-[#9a9c95]">Les commandes clients, confections et retouches arrivent ici automatiquement.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0eb]">
                {ordersQuery.data!.map((row) => (
                  <div key={row.order.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold">{row.order.label}</p>
                      <Badge className="border-0 bg-[#eee8ff] text-[9px] font-bold text-[#6954c6]">{PRODUCTION_TYPE_LABELS[row.order.type]}</Badge>
                      <Badge className={`border-0 text-[9px] font-bold ${row.order.status === "terminee" ? "bg-[#e2f4ee] text-[#2d8a70]" : row.order.status === "annulee" ? "bg-[#fff0ed] text-[#b4604e]" : "bg-[#fff0db] text-[#c27b2c]"}`}>
                        {row.order.status === "en_cours" ? "En cours" : row.order.status === "terminee" ? "Terminée" : row.order.status === "annulee" ? "Annulée" : "Ouverte"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {["coupe", "couture", "broderie", "finition", "controle_qualite", "emballage", "livraison"].map((stage, index) => {
                        const stageIndex = ["coupe", "couture", "broderie", "finition", "controle_qualite", "emballage", "livraison"].indexOf(row.order.stage);
                        const done = index < stageIndex;
                        const activeStage = index === stageIndex;
                        return (
                          <span key={stage} className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[9px] font-semibold ${activeStage ? "bg-[#20231f] text-white" : done ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#f2f2ed] text-[#969991]"}`}>
                            {STAGE_LABELS[stage]}
                            {index < 6 && <ArrowRight size={8} className="opacity-50" />}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#969991]">
                      <span>{Number(row.tasksDone)}/{Number(row.tasksCount)} tâche(s) faite(s)</span>
                      {row.order.dueDate && <span>· Livraison souhaitée : {new Date(row.order.dueDate).toLocaleDateString("fr-FR")}</span>}
                      {row.order.measurements && <span>· Mensurations : {row.order.measurements}</span>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAssignFor(row.order)} className="rounded-lg text-[11px]"><Scissors size={12} className="mr-1" /> Assigner un travail</Button>
                      {row.order.status !== "terminee" && row.order.status !== "annulee" && (
                        <Button variant="outline" size="sm" disabled={advance.isPending} onClick={() => advance.mutate({ id: row.order.id })} className="rounded-lg text-[11px]">
                          Étape suivante →
                        </Button>
                      )}
                      {row.order.status === "ouverte" && (
                        <Button variant="outline" size="sm" onClick={() => cancel.mutate({ id: row.order.id })} className="rounded-lg text-[11px] text-[#b4604e]">Annuler</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tâches */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Tâches des ouvriers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!(tasksQuery.data ?? []).length ? (
              <p className="px-5 py-12 text-center text-xs text-[#969991]">Aucune tâche assignée pour le moment.</p>
            ) : (
              <div className="max-h-[540px] divide-y divide-[#f0f0eb] overflow-y-auto">
                {tasksQuery.data!.map((row) => (
                  <div key={row.task.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{row.task.task}{row.task.withEmbroidery ? " (avec broderie)" : ""}</p>
                      <p className="mt-0.5 truncate text-[10px] text-[#969991]">{row.orderLabel} · {row.employeeName}</p>
                    </div>
                    <p className="text-xs font-semibold text-[#2d8a70]">{formatXof(row.task.rate)}</p>
                    {row.task.status === "assignee" ? (
                      <Button variant="outline" size="sm" disabled={completeTask.isPending} onClick={() => completeTask.mutate({ id: row.task.id })} className="rounded-lg text-[10px]">Terminer</Button>
                    ) : (
                      <Badge className="border-0 bg-[#e2f4ee] text-[9px] font-bold text-[#2d8a70]">Terminée</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateFicheForm open={showForm} onClose={() => setShowForm(false)} />
      <AssignTaskForm fiche={assignFor} workers={workers} onClose={() => setAssignFor(null)} />
      <RatesDialog open={showRates} rates={ratesQuery.data ?? []} onClose={() => { setShowRates(false); utils.production.taskRates.invalidate(); }} />
    </AppShell>
  );
}

function CreateFicheForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const customersQuery = trpc.customers.list.useQuery(undefined, { enabled: open });
  const [values, setValues] = useState({ type: "commande", label: "", customerId: "", measurements: "", notes: "", dueDate: "" });
  const mutation = trpc.production.create.useMutation({
    onSuccess: () => {
      utils.production.list.invalidate();
      onClose();
      setValues({ type: "commande", label: "", customerId: "", measurements: "", notes: "", dueDate: "" });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      type: values.type as "commande" | "confection" | "retouche",
      label: values.label,
      customerId: values.customerId ? Number(values.customerId) : undefined,
      measurements: values.measurements || undefined,
      notes: values.notes || undefined,
      dueDate: values.dueDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouvelle fiche de fabrication</DialogTitle>
          <p className="mt-1 text-xs text-[#92958d]">Commande atelier, confection (le client apporte son tissu, ne paie que les frais de couture) ou retouche.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="commande">Commande client</option>
              <option value="confection">Confection (tissu du client)</option>
              <option value="retouche">Retouche</option>
            </select>
            <select value={values.customerId} onChange={(e) => setValues({ ...values, customerId: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="">Client (optionnel)</option>
              {(customersQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <Input required placeholder="Intitulé (ex. Agbada Royale — Moussa Koné)" value={values.label} onChange={(e) => setValues({ ...values, label: e.target.value })} className="h-9 rounded-lg text-xs" />
          <Input placeholder="Mensurations (ex. cou 40, poitrine 100)" value={values.measurements} onChange={(e) => setValues({ ...values, measurements: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input placeholder="Exigences (broderie main…)" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          {mutation.error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Création…" : "Créer la fiche"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignTaskForm({ fiche, workers, onClose }: { fiche: any; workers: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ employeeId: "", task: "", withEmbroidery: false });
  const ratesQuery = trpc.production.taskRates.useQuery(undefined, { enabled: Boolean(fiche) });
  const mutation = trpc.production.assignTask.useMutation({
    onSuccess: () => {
      utils.production.tasks.invalidate();
      utils.production.list.invalidate();
      utils.production.weeklyPayroll.invalidate();
      onClose();
    },
  });

  if (!fiche) return null;
  const selectedRate = (ratesQuery.data ?? []).find((r) => r.task === values.task && r.withEmbroidery === values.withEmbroidery);

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold">Assigner un travail</DialogTitle>
          <p className="mt-1 truncate text-xs text-[#92958d]">{fiche.label}</p>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ productionOrderId: fiche.id, employeeId: Number(values.employeeId), task: values.task, withEmbroidery: values.withEmbroidery });
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Ouvrier</span>
            <select required value={values.employeeId} onChange={(e) => setValues({ ...values, employeeId: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="">Choisir…</option>
              {workers.map((w) => <option key={w.employee.id} value={w.employee.id}>{w.employee.firstName} {w.employee.lastName} ({w.employee.jobTitle})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-[#858880]">Tâche (barème)</span>
            <select required value={values.task} onChange={(e) => setValues({ ...values, task: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="">Choisir…</option>
              {[...new Set((ratesQuery.data ?? []).map((r) => r.task))].map((task) => <option key={task} value={task}>{task}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={values.withEmbroidery} onChange={(e) => setValues({ ...values, withEmbroidery: e.target.checked })} />
            Avec broderie à la main
          </label>
          <p className="rounded-xl bg-[#f7f7f5] px-3 py-2 text-xs">
            Tarif appliqué : <span className="font-semibold text-[#2d8a70]">{selectedRate ? formatXof(selectedRate.rate) : "non défini dans le barème"}</span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending || !selectedRate} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Assignation…" : "Assigner"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RatesDialog({ open, rates, onClose }: { open: boolean; rates: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ task: "", withEmbroidery: false, rate: "" });
  const mutation = trpc.production.upsertTaskRate.useMutation({
    onSuccess: () => {
      utils.production.taskRates.invalidate();
      setValues({ task: "", withEmbroidery: false, rate: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Barème de paye à la tâche</DialogTitle>
          <p className="mt-1 text-xs text-[#92958d]">Chaque marque définit ses propres tarifs ; les prix sont calculés automatiquement en fin de journée.</p>
        </DialogHeader>
        <div className="space-y-1.5">
          {rates.map((rate) => (
            <div key={`${rate.task}-${rate.withEmbroidery}`} className="flex items-center justify-between rounded-xl border border-[#ececea] px-3 py-2 text-xs">
              <span className="font-semibold">{rate.task}{rate.withEmbroidery ? " · avec broderie main" : ""}</span>
              <span className="font-semibold text-[#2d8a70]">{formatXof(rate.rate)}</span>
            </div>
          ))}
          {!rates.length && <p className="py-6 text-center text-xs text-[#969991]">Aucun tarif défini.</p>}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ task: values.task, withEmbroidery: values.withEmbroidery, rate: values.rate });
          }}
          className="space-y-3 rounded-2xl border border-dashed border-[#d9d7d0] p-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a1a39d]">Ajouter / mettre à jour un tarif</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_90px]">
            <Input required placeholder="Tâche (ex. Haut Danshiki)" value={values.task} onChange={(e) => setValues({ ...values, task: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input required inputMode="decimal" placeholder="Tarif FCFA" value={values.rate} onChange={(e) => setValues({ ...values, rate: e.target.value })} className="h-9 rounded-lg text-xs" />
            <label className="flex items-center gap-1.5 text-[10px] font-semibold">
              <input type="checkbox" checked={values.withEmbroidery} onChange={(e) => setValues({ ...values, withEmbroidery: e.target.checked })} /> Broderie
            </label>
          </div>
          <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Enregistrement…" : "Enregistrer le tarif"}</Button>
        </form>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">Fermer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
