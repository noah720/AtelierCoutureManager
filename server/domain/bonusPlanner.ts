/**
 * Primes automatiques planifiées (point 14.3 de la présentation).
 *
 * Quatre règles, paramétrables par marque :
 *  - hebdomadaire : meilleur vendeur de la semaine écoulée → montant fixe ;
 *  - mensuelle    : meilleur vendeur du mois écoulé → montant fixe ;
 *  - fidélité trimestrielle : 2 % du chiffre d'affaires individuel du
 *    trimestre écoulé (dès 50 000 F de CA, plancher de prime à 1 000 F) ;
 *  - annuelle     : 25 % d'un mois de salaire de base pour chaque employé
 *    actif — la « prime voiture/moto » de fin d'année (à valider par le
 *    propriétaire avant versement).
 *
 * Chaque prime porte une clé de période (2026-W37, 2026-09, 2026-T3, 2026) :
 * l'index unique de la table garantit qu'un plan exécuté deux fois ne crée
 * jamais de doublon.
 */

import { monthKey, quarterKey, weekKey } from "./attendance";

export type PlannedBonusRule = {
  type: "meilleur_semaine" | "meilleur_mois" | "fidelite" | "autre";
  period: "semaine" | "mois" | "trimestre" | "annee";
  label: string;
  description: string;
};

export const PLANNED_RULES: PlannedBonusRule[] = [
  { type: "meilleur_semaine", period: "semaine", label: "Meilleur vendeur de la semaine", description: "Montant fixe au vendeur ayant réalisé le plus de ventes la semaine écoulée." },
  { type: "meilleur_mois", period: "mois", label: "Meilleur vendeur du mois", description: "Montant fixe au vendeur le plus performant du mois écoulé." },
  { type: "fidelite", period: "trimestre", label: "Fidélité trimestrielle (2 %)", description: "2 % du chiffre d'affaires individuel du trimestre écoulé (dès 50 000 F de ventes)." },
  { type: "autre", period: "annee", label: "Prime annuelle (voiture/moto)", description: "25 % d'un mois de salaire de base à chaque employé actif — à convertir en voiture ou moto pour le lauréat." },
];

/** Paramètres par défaut (modifiables côté marque à terme). */
export const PLAN_DEFAULTS = {
  weeklyFixed: 5000,
  monthlyFixed: 10000,
  fidelityRate: 0.02,
  fidelityMinSales: 50000,
  fidelityMinBonus: 1000,
  annualRateOfSalary: 0.25,
};

export type SellerTotal = { sellerUserId: number | null; totalXof: number };
export type EmployeeRow = { id: number; userId: number | null; baseSalaryMonthly: string; active: boolean };

export type PlannedBonus = { employeeId: number; type: PlannedBonusRule["type"]; periodKey: string; amount: number; note: string };

/**
 * Calcule les primes dues pour les périodes écoulées. `sellersByWeek`,
 * `sellersByMonth`, `sellersByQuarter` donnent le CA XOF par utilisateur pour
 * chaque période ; `userToEmployee` relie un utilisateur vendeur à l'employé.
 */
export function computePlannedBonuses(input: {
  now: Date;
  sellersByWeek: SellerTotal[];
  sellersByMonth: SellerTotal[];
  sellersByQuarter: SellerTotal[];
  userToEmployee: Map<number, EmployeeRow>;
  employees: EmployeeRow[];
  plan?: typeof PLAN_DEFAULTS;
}): PlannedBonus[] {
  const plan = input.plan ?? PLAN_DEFAULTS;
  const bonuses: PlannedBonus[] = [];

  // 1. Meilleur vendeur de la semaine écoulée.
  const previousWeek = new Date(input.now.getTime() - 7 * 86400000);
  const topWeek = topSeller(input.sellersByWeek);
  if (topWeek && topWeek.totalXof > 0) {
    const employee = topWeek.sellerUserId !== null ? input.userToEmployee.get(topWeek.sellerUserId) : undefined;
    if (employee) {
      bonuses.push({ employeeId: employee.id, type: "meilleur_semaine", periodKey: weekKey(previousWeek), amount: plan.weeklyFixed, note: `Prime hebdomadaire — meilleur vendeur (${Math.round(topWeek.totalXof).toLocaleString("fr-FR")} F de ventes)` });
    }
  }

  // 2. Meilleur vendeur du mois écoulé.
  const previousMonth = new Date(input.now.getFullYear(), input.now.getMonth() - 1, 15);
  const topMonth = topSeller(input.sellersByMonth);
  if (topMonth && topMonth.totalXof > 0) {
    const employee = topMonth.sellerUserId !== null ? input.userToEmployee.get(topMonth.sellerUserId) : undefined;
    if (employee) {
      bonuses.push({ employeeId: employee.id, type: "meilleur_mois", periodKey: monthKey(previousMonth), amount: plan.monthlyFixed, note: `Prime mensuelle — meilleur vendeur (${Math.round(topMonth.totalXof).toLocaleString("fr-FR")} F de ventes)` });
    }
  }

  // 3. Fidélité trimestrielle : 2 % du CA individuel (seuils de déclenchement).
  const previousQuarter = new Date(input.now.getFullYear(), input.now.getMonth() - 3, 15);
  for (const seller of input.sellersByQuarter) {
    if (seller.sellerUserId === null || seller.totalXof < plan.fidelityMinSales) continue;
    const employee = input.userToEmployee.get(seller.sellerUserId);
    if (!employee) continue;
    const amount = Math.max(plan.fidelityMinBonus, Math.round((seller.totalXof * plan.fidelityRate) / 100) * 100);
    bonuses.push({ employeeId: employee.id, type: "fidelite", periodKey: quarterKey(previousQuarter), amount, note: `Fidélité trimestrielle — 2 % de ${Math.round(seller.totalXof).toLocaleString("fr-FR")} F de ventes` });
  }

  // 4. Prime annuelle : 25 % d'un mois de salaire de base, employés actifs.
  const previousYear = new Date(input.now.getFullYear() - 1, 6, 1);
  for (const employee of input.employees) {
    if (!employee.active) continue;
    const amount = Math.round((Number(employee.baseSalaryMonthly) * plan.annualRateOfSalary) / 100) * 100;
    if (amount <= 0) continue;
    bonuses.push({ employeeId: employee.id, type: "autre", periodKey: String(previousYear.getFullYear()), amount, note: "Prime annuelle (voiture/moto) — à valider avant versement" });
  }

  return bonuses;
}

function topSeller(sellers: SellerTotal[]): SellerTotal | null {
  const ranked = [...sellers].filter((seller) => seller.sellerUserId !== null).sort((a, b) => b.totalXof - a.totalXof);
  return ranked[0] ?? null;
}
