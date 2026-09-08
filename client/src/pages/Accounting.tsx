import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatXof } from "@/const";
import { ArrowRightLeft, BookOpen, Calculator, CheckCheck, Landmark, RefreshCw, Scale, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const JOURNAL_LABELS: Record<string, string> = {
  VT: "Ventes",
  AC: "Achats",
  BQ: "Banque",
  CA: "Caisses",
  OD: "Opérations diverses",
};

const JOURNAL_COLORS: Record<string, string> = {
  VT: "bg-green-100 text-green-800",
  AC: "bg-orange-100 text-orange-800",
  BQ: "bg-blue-100 text-blue-800",
  CA: "bg-amber-100 text-amber-800",
  OD: "bg-gray-100 text-gray-700",
};

export default function Accounting() {
  const utils = trpc.useUtils();
  const entries = trpc.accounting.entries.useQuery();
  const trialBalance = trpc.accounting.trialBalance.useQuery();
  const income = trpc.accounting.incomeStatement.useQuery();
  const balanceSheet = trpc.accounting.balanceSheet.useQuery();
  const chart = trpc.accounting.chart.useQuery();
  const bankAccount = trpc.accounting.bankAccount.useQuery();
  const statementLines = trpc.accounting.statementLines.useQuery();
  const reconciliation = trpc.accounting.reconciliationSummary.useQuery();

  const [statementLabel, setStatementLabel] = useState("");
  const [statementAmount, setStatementAmount] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));

  const sync = trpc.accounting.sync.useMutation({
    onSuccess: (data) => {
      toast.success(data.created ? `${data.created} écriture(s) générée(s).` : "Comptabilité déjà à jour.");
      utils.accounting.entries.invalidate();
      utils.accounting.trialBalance.invalidate();
      utils.accounting.incomeStatement.invalidate();
      utils.accounting.balanceSheet.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const addLine = trpc.accounting.addStatementLine.useMutation({
    onSuccess: () => {
      toast.success("Ligne de relevé ajoutée.");
      setStatementLabel("");
      setStatementAmount("");
      utils.accounting.statementLines.invalidate();
      utils.accounting.reconciliationSummary.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const removeLine = trpc.accounting.removeStatementLine.useMutation({
    onSuccess: () => {
      utils.accounting.statementLines.invalidate();
      utils.accounting.reconciliationSummary.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const matchLine = trpc.accounting.matchStatementLine.useMutation({
    onSuccess: () => {
      toast.success("Rapprochement enregistré.");
      utils.accounting.statementLines.invalidate();
      utils.accounting.reconciliationSummary.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const autoMatch = trpc.accounting.autoMatch.useMutation({
    onSuccess: (data) => {
      toast.success(data.matched ? `${data.matched} ligne(s) rapprochée(s) automatiquement.` : "Aucune correspondance automatique trouvée.");
      utils.accounting.statementLines.invalidate();
      utils.accounting.reconciliationSummary.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const unmatchedCount = (reconciliation.data?.unmatchedMovements.length ?? 0) + (reconciliation.data?.unmatchedLines.length ?? 0);

  return (
    <AppShell
      title="Comptabilité"
      subtitle="Écritures automatiques aux normes SYSCOHADA révisé (plan simplifié) et rapprochement bancaire."
      actions={
        <Button onClick={() => sync.mutate({})} disabled={sync.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
          <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /> Générer les écritures
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Indicateurs */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Produits (classe 7)</p>
              <p className="text-xl font-bold text-green-700">{income.data ? formatXof(income.data.produits) : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Charges (classe 6)</p>
              <p className="text-xl font-bold text-red-700">{income.data ? formatXof(income.data.charges) : "—"}</p>
            </CardContent>
          </Card>
          <Card className={income.data && income.data.resultat >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CardContent className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Résultat de la période</p>
              <p className={`text-xl font-bold ${income.data && income.data.resultat >= 0 ? "text-green-700" : "text-red-700"}`}>{income.data ? formatXof(income.data.resultat) : "—"}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="journal">
          <TabsList>
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="balance">Balance & états</TabsTrigger>
            <TabsTrigger value="rapprochement">
              Rapprochement bancaire
              {unmatchedCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white">{unmatchedCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="plan">Plan comptable</TabsTrigger>
          </TabsList>

          {/* Journal */}
          <TabsContent value="journal" className="space-y-3">
            {(entries.data ?? []).length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-[#858880]">
                  Aucune écriture — cliquez sur « Générer les écritures » pour comptabiliser vos ventes, achats et mouvements.
                </CardContent>
              </Card>
            )}
            {(entries.data ?? []).map((entry) => {
              const totalDebit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
              return (
                <Card key={entry.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={JOURNAL_COLORS[entry.journalCode] ?? JOURNAL_COLORS.OD}>{JOURNAL_LABELS[entry.journalCode] ?? entry.journalCode}</Badge>
                      <span className="font-semibold">{entry.label}</span>
                      <span className="text-xs text-[#858880]">
                        {new Date(entry.entryDate).toLocaleDateString("fr-FR")} · {entry.reference} · {totalDebit > 0 ? formatXof(totalDebit) : ""}
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Compte</TableHead>
                          <TableHead>Libellé</TableHead>
                          <TableHead className="text-right">Débit</TableHead>
                          <TableHead className="text-right">Crédit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entry.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-mono text-xs">{line.accountNumber}</TableCell>
                            <TableCell>{line.accountLabel}</TableCell>
                            <TableCell className="text-right">{Number(line.debit) ? formatXof(Number(line.debit)) : ""}</TableCell>
                            <TableCell className="text-right">{Number(line.credit) ? formatXof(Number(line.credit)) : ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Balance + états financiers */}
          <TabsContent value="balance" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Balance générale</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                        <TableHead className="text-right">Solde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(trialBalance.data?.accounts ?? []).map((account) => (
                        <TableRow key={account.accountNumber}>
                          <TableCell>
                            <span className="font-mono text-xs">{account.accountNumber}</span> <span className="text-xs text-[#858880]">{account.accountLabel}</span>
                          </TableCell>
                          <TableCell className="text-right">{formatXof(account.debit)}</TableCell>
                          <TableCell className="text-right">{formatXof(account.credit)}</TableCell>
                          <TableCell className="text-right font-medium">{formatXof(account.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-[#f1f1ed] font-bold">
                        <TableCell>Totaux</TableCell>
                        <TableCell className="text-right">{formatXof(trialBalance.data?.totalDebit ?? 0)}</TableCell>
                        <TableCell className="text-right">{formatXof(trialBalance.data?.totalCredit ?? 0)}</TableCell>
                        <TableCell className="text-right">{trialBalance.data && Math.abs(trialBalance.data.totalDebit - trialBalance.data.totalCredit) < 0.01 ? "✓ équilibrée" : "—"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" /> Compte de résultat</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        {(income.data?.detail ?? []).map((row) => (
                          <TableRow key={row.accountNumber}>
                            <TableCell><span className="font-mono text-xs">{row.accountNumber}</span> {row.label}</TableCell>
                            <TableCell className={`text-right font-medium ${row.accountNumber.startsWith("7") ? "text-green-700" : "text-red-700"}`}>{formatXof(row.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-[#f1f1ed] font-bold">
                          <TableCell>{(income.data?.resultat ?? 0) >= 0 ? "Bénéfice" : "Perte"}</TableCell>
                          <TableCell className={`text-right ${(income.data?.resultat ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>{formatXof(income.data?.resultat ?? 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" /> Bilan simplifié</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="mb-1 font-semibold">Actif</p>
                    <div className="flex justify-between"><span>Trésorerie (caisses, banque, mobile money…)</span><span className="font-medium">{formatXof(balanceSheet.data?.totalTresorerie ?? 0)}</span></div>
                    <div className="flex justify-between"><span>Créances clients (411)</span><span className="font-medium">{formatXof(balanceSheet.data?.creancesClients ?? 0)}</span></div>
                    <div className="flex justify-between border-t pt-1 font-bold"><span>Total actif</span><span>{formatXof(balanceSheet.data?.actif ?? 0)}</span></div>
                    <p className="mt-3 mb-1 font-semibold">Passif</p>
                    <div className="flex justify-between"><span>Dettes fournisseurs (401)</span><span className="font-medium">{formatXof(balanceSheet.data?.dettesFournisseurs ?? 0)}</span></div>
                    <div className="flex justify-between"><span>Résultat de la période</span><span className="font-medium">{formatXof(balanceSheet.data?.resultat ?? 0)}</span></div>
                    <div className="flex justify-between"><span>Réserves (capital + reports)</span><span className="font-medium">{formatXof(balanceSheet.data?.reserves ?? 0)}</span></div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Rapprochement bancaire */}
          <TabsContent value="rapprochement" className="space-y-4">
            {!bankAccount.data && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-[#858880]">Aucun compte « banque » dans la trésorerie — créez-le dans Trésorerie pour activer le rapprochement.</CardContent>
              </Card>
            )}
            {bankAccount.data && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Solde en livres (trésorerie saisie)</p>
                      <p className="text-xl font-bold">{formatXof(reconciliation.data?.soldeLivres ?? 0)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Mouvements saisis dans la banque</p>
                      <p className="text-xl font-bold">{reconciliation.data ? formatXof(reconciliation.data.soldeLivres - Number(bankAccount.data.openingBalance)) : "—"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#858880]">Lignes de relevé enregistrées</p>
                      <p className="text-xl font-bold">{formatXof(reconciliation.data?.soldeReleve ?? 0)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Importer une ligne de relevé bancaire</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 sm:grid-cols-4">
                    <Input placeholder="Libellé (ex. Virement client)" value={statementLabel} onChange={(event) => setStatementLabel(event.target.value)} />
                    <Input placeholder="Montant (− pour une sortie)" type="number" step="0.01" value={statementAmount} onChange={(event) => setStatementAmount(event.target.value)} />
                    <Input type="date" value={statementDate} onChange={(event) => setStatementDate(event.target.value)} />
                    <Button
                      onClick={() => {
                        const amount = Number(statementAmount);
                        if (!statementLabel.trim() || !Number.isFinite(amount) || amount === 0) {
                          toast.error("Renseignez un libellé et un montant non nul.");
                          return;
                        }
                        addLine.mutate({ accountId: bankAccount.data.id, statementDate, label: statementLabel.trim(), amount, currency: bankAccount.data.currency });
                      }}
                      disabled={addLine.isPending}
                    >
                      Ajouter
                    </Button>
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ArrowRightLeft className="h-4 w-4" /> Lignes de relevé
                        <Button size="sm" variant="outline" className="ml-auto" onClick={() => autoMatch.mutate({})} disabled={autoMatch.isPending}>
                          <CheckCheck className="mr-1 h-3.5 w-3.5" /> Rapprocher automatiquement
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Libellé</TableHead>
                            <TableHead className="text-right">Montant</TableHead>
                            <TableHead>Rapprochement</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(statementLines.data ?? []).length === 0 && (
                            <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-[#858880]">Aucune ligne de relevé.</TableCell></TableRow>
                          )}
                          {(statementLines.data ?? []).map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-xs">{new Date(line.statementDate).toLocaleDateString("fr-FR")}</TableCell>
                              <TableCell>{line.label}</TableCell>
                              <TableCell className={`text-right font-medium ${Number(line.amount) >= 0 ? "text-green-700" : "text-red-700"}`}>{formatXof(Number(line.amount))}</TableCell>
                              <TableCell>
                                {line.matchedMovementId ? (
                                  <Badge className="bg-green-100 text-green-800">Rapproché (mvt n°{line.matchedMovementId})</Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-800">À rapprocher</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <button className="text-[#858880] hover:text-red-600" onClick={() => removeLine.mutate({ id: line.id })} aria-label="Supprimer">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Mouvements bancaires non rapprochés</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableBody>
                          {(reconciliation.data?.unmatchedMovements ?? []).length === 0 && (
                            <TableRow><TableCell className="py-6 text-center text-sm text-[#858880]">Tous les mouvements sont rapprochés ✓</TableCell></TableRow>
                          )}
                          {(reconciliation.data?.unmatchedMovements ?? []).map((movement) => (
                            <TableRow key={movement.id}>
                              <TableCell className="text-xs">{new Date(movement.date).toLocaleDateString("fr-FR")}</TableCell>
                              <TableCell>{movement.label}</TableCell>
                              <TableCell className={`text-right font-medium ${movement.amount >= 0 ? "text-green-700" : "text-red-700"}`}>{formatXof(movement.amount)}</TableCell>
                              <TableCell className="text-right">
                                <select
                                  className="rounded-md border border-[#e4e4de] bg-white px-1 py-1 text-xs"
                                  value=""
                                  onChange={(event) => {
                                    const line = reconciliation.data?.unmatchedLines.find((entry) => String(entry.id) === event.target.value);
                                    if (line) matchLine.mutate({ id: line.id, movementId: movement.id });
                                  }}
                                >
                                  <option value="">Rapprocher avec…</option>
                                  {(reconciliation.data?.unmatchedLines ?? []).map((line) => (
                                    <option key={line.id} value={line.id}>{line.label} ({formatXof(line.amount)})</option>
                                  ))}
                                </select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Plan comptable */}
          <TabsContent value="plan">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Plan comptable simplifié (SYSCOHADA révisé)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(chart.data ?? []).map((account) => (
                    <div key={account.number} className="flex items-center gap-2 rounded-lg border border-[#e4e4de] px-3 py-2 text-sm">
                      <span className="font-mono text-xs font-bold text-[#858880]">{account.number}</span> {account.label}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
