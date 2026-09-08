import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EMPLOYEE_TYPE_LABELS, formatXof } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Award, Clock, LogIn, LogOut, Plus, Trophy, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Staff() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [bonusFor, setBonusFor] = useState<any>(null);

  const employeesQuery = trpc.employees.list.useQuery();
  const attendanceQuery = trpc.employees.attendance.useQuery();
  const leaderboardQuery = trpc.employees.leaderboard.useQuery();
  const bonusesQuery = trpc.employees.bonuses.useQuery();
  const payrollQuery = trpc.production.weeklyPayroll.useQuery();
  const monthlyQuery = trpc.employees.monthlyPayroll.useQuery();
  const storesQuery = trpc.stores.list.useQuery(undefined, { enabled: showForm });

  const checkIn = trpc.employees.checkIn.useMutation({
    onSuccess: () => {
      utils.employees.attendance.invalidate();
      toast.success("Pointage enregistré — présence confirmée sur le lieu de travail.");
    },
    onError: (error) => toast.error(error.message),
  });
  const checkOut = trpc.employees.checkOut.useMutation({
    onSuccess: () => {
      utils.employees.attendance.invalidate();
      toast.success("Fin de service enregistrée.");
    },
    onError: (error) => toast.error(error.message),
  });

  const employees = employeesQuery.data ?? [];
  const openSessions = new Set((attendanceQuery?.data ?? []).filter((row) => !row.session.checkOutAt).map((row) => row.session.employeeId));

  return (
    <AppShell
      title="Personnel"
      subtitle="Effectifs, présence au poste, paie (hebdomadaire à la tâche, mensuelle) et primes commerciales."
      actions={
        <Button onClick={() => setShowForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white"><UserPlus size={15} className="mr-2" /> Ajouter un employé</Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Effectifs */}
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
            <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Effectifs ({employees.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {employees.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <UserPlus size={20} className="mx-auto mb-3 text-[#9a9c95]" />
                <p className="text-sm font-semibold">Aucun employé enregistré</p>
                <p className="mt-1 text-xs text-[#9a9c95]">Ajoutez vos vendeuses, ouvriers, comptable, chefs d’agence…</p>
              </div>
            ) : (
              <div className="max-h-[420px] divide-y divide-[#f0f0eb] overflow-y-auto">
                {employees.map((row) => (
                  <div key={row.employee.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eee8ff] text-[10px] font-bold text-[#6954c6]">{row.employee.firstName[0]}{row.employee.lastName[0]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{row.employee.firstName} {row.employee.lastName}</p>
                      <p className="text-[10px] text-[#969991]">{row.employee.jobTitle} · {EMPLOYEE_TYPE_LABELS[row.employee.type]}{row.storeName ? ` · ${row.storeName}` : ""}</p>
                    </div>
                    {row.employee.type !== "atelier" && Number(row.employee.baseSalaryMonthly) > 0 && (
                      <p className="hidden text-[11px] font-semibold text-[#969991] sm:block">{formatXof(row.employee.baseSalaryMonthly)}/mois</p>
                    )}
                    {row.employee.type === "boutique" && (
                      openSessions.has(row.employee.id) ? (
                        <Button variant="outline" size="sm" disabled={checkOut.isPending} onClick={() => {
                          const session = (attendanceQuery?.data ?? []).find((a) => a.session.employeeId === row.employee.id && !a.session.checkOutAt);
                          if (session) checkOut.mutate({ sessionId: session.session.id });
                        }} className="rounded-lg text-[10px]"><LogOut size={11} className="mr-1" /> Sortie</Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={checkIn.isPending} onClick={() => checkIn.mutate({ employeeId: row.employee.id })} className="rounded-lg text-[10px]"><LogIn size={11} className="mr-1" /> Arrivée</Button>
                      )
                    )}
                    <Button variant="outline" size="sm" onClick={() => setBonusFor(row)} className="rounded-lg text-[10px]"><Award size={11} className="mr-1" /> Prime</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* Classement vendeurs (14.4) */}
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><Trophy size={16} className="text-[#c27b2c]" /> Classement des vendeurs</CardTitle>
              <p className="mt-1 text-[11px] text-[#969991]">1 point par tranche de 50 000 F CFA vendus · vente &gt; 1 000 000 F CFA = prime automatique de 2 %.</p>
            </CardHeader>
            <CardContent className="p-0">
              {!(leaderboardQuery.data ?? []).length ? (
                <p className="px-5 py-10 text-center text-xs text-[#969991]">Aucune vente enregistrée pour le classement.</p>
              ) : (
                <div className="divide-y divide-[#f0f0eb]">
                  {leaderboardQuery.data!.map((row, index) => (
                    <div key={`${row.sellerUserId}-${index}`} className="flex items-center gap-3 px-5 py-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${index === 0 ? "bg-[#fff0db] text-[#c27b2c]" : "bg-[#f2f2ed] text-[#969991]"}`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{row.sellerName}</p>
                        <p className="text-[10px] text-[#969991]">{row.salesCount} vente(s) — {formatXof(row.totalXof)}</p>
                      </div>
                      <Badge className="border-0 bg-[#eee8ff] text-[10px] font-bold text-[#6954c6]">{row.points} pts</Badge>
                      {row.motivationAlert && <Badge className="border-0 bg-[#fff0ed] text-[9px] font-bold text-[#b4604e]"><AlertTriangle size={10} className="mr-1" /> &lt; 60 pts/mois</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Paie */}
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.03em]"><Clock size={16} className="text-[#2d8a70]" /> Paie</CardTitle>
              <p className="mt-1 text-[11px] text-[#969991]">Ouvriers atelier : payés chaque semaine à la tâche. Boutique & administration : chaque mois.</p>
            </CardHeader>
            <CardContent className="space-y-2 px-5 py-4">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a1a39d]">Semaine en cours (à la tâche)</p>
                {(payrollQuery.data ?? []).length === 0 ? (
                  <p className="text-xs text-[#969991]">Aucune tâche terminée cette semaine.</p>
                ) : (
                  payrollQuery.data!.map((row) => (
                    <div key={row.employeeId ?? row.employeeName} className="flex justify-between py-1 text-xs">
                      <span>{row.employeeName}</span>
                      <span className="font-semibold">{formatXof(row.totalPay)}</span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a1a39d]">Salaires mensuels</p>
                {(monthlyQuery.data ?? []).length === 0 ? (
                  <p className="text-xs text-[#969991]">Aucun salarié mensuel.</p>
                ) : (
                  monthlyQuery.data!.map((row) => (
                    <div key={row.employee.id} className="flex justify-between py-1 text-xs">
                      <span>{row.employee.firstName} {row.employee.lastName} <span className="text-[#969991]">({row.employee.jobTitle})</span></span>
                      <span className="font-semibold">{formatXof(row.employee.baseSalaryMonthly)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Primes */}
          <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
            <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
              <CardTitle className="font-display text-lg font-semibold tracking-[-0.03em]">Primes récentes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!(bonusesQuery.data ?? []).length ? (
                <p className="px-5 py-8 text-center text-xs text-[#969991]">Aucune prime enregistrée.</p>
              ) : (
                <div className="max-h-48 divide-y divide-[#f0f0eb] overflow-y-auto">
                  {bonusesQuery.data!.map((row) => (
                    <div key={row.bonus.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <span><span className="font-semibold">{row.employeeName}</span> · {row.bonus.type}{row.bonus.note ? ` — ${row.bonus.note}` : ""}</span>
                      <span className="font-semibold text-[#2d8a70]">{formatXof(row.bonus.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EmployeeForm open={showForm} stores={storesQuery.data ?? []} onClose={() => setShowForm(false)} />
      <BonusForm target={bonusFor} onClose={() => setBonusFor(null)} />
    </AppShell>
  );
}

function EmployeeForm({ open, stores, onClose }: { open: boolean; stores: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ firstName: "", lastName: "", type: "boutique", jobTitle: "vendeuse", storeId: "", baseSalaryMonthly: "0", linkedEmail: "" });
  const mutation = trpc.employees.create.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      firstName: values.firstName,
      lastName: values.lastName,
      type: values.type as "boutique" | "administration" | "atelier",
      jobTitle: values.jobTitle,
      storeId: values.storeId ? Number(values.storeId) : undefined,
      baseSalaryMonthly: values.baseSalaryMonthly || "0",
      linkedEmail: values.linkedEmail || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouvel employé</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input required placeholder="Prénom" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input required placeholder="Nom" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="boutique">Boutique</option>
              <option value="administration">Administration</option>
              <option value="atelier">Atelier</option>
            </select>
            <Input required placeholder="Poste (vendeuse, coupeur, comptable…)" value={values.jobTitle} onChange={(e) => setValues({ ...values, jobTitle: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <select value={values.storeId} onChange={(e) => setValues({ ...values, storeId: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
            <option value="">Lieu de travail (optionnel)</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input inputMode="decimal" placeholder="Salaire mensuel (0 si à la tâche)" value={values.baseSalaryMonthly} onChange={(e) => setValues({ ...values, baseSalaryMonthly: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input type="email" placeholder="E-mail du compte lié (optionnel)" value={values.linkedEmail} onChange={(e) => setValues({ ...values, linkedEmail: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Ajout…" : "Ajouter l’employé"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BonusForm({ target, onClose }: { target: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ type: "meilleur_semaine", amount: "10000", note: "" });
  const mutation = trpc.employees.awardBonus.useMutation({
    onSuccess: () => {
      utils.employees.bonuses.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!target) return null;

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold">Prime — {target.employee.firstName} {target.employee.lastName}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ employeeId: target.employee.id, type: values.type as any, amount: values.amount, note: values.note || undefined });
          }}
          className="space-y-3"
        >
          <select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
            <option value="meilleur_semaine">Meilleur vendeur de la semaine (10 000)</option>
            <option value="meilleur_mois">Meilleur vendeur du mois (30 000)</option>
            <option value="fidelite">Fidélité client (2 % trimestriel)</option>
            <option value="gros_achat">Gros achat (2 %)</option>
            <option value="autre">Autre prime</option>
          </select>
          <Input required inputMode="decimal" placeholder="Montant" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} className="h-9 rounded-lg text-xs" />
          <Input placeholder="Note (optionnel)" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Attribution…" : "Attribuer la prime"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
