import { describe, expect, it } from "vitest";
import { applyReferralDiscount, computeSettlement, convert, DEFAULT_RATES, formatMoney, toXof } from "./domain/money";
import { nextPurchaseStatusOnAccountantApproval, nextPurchaseStatusOnBuyerApproval, nextPurchaseStatusOnDirectorApproval, PURCHASE_DIRECTION_THRESHOLD_XOF, PETTY_CASH_LIMIT_PER_INVOICE } from "./domain/purchases";
import { effectiveOrgStatus, planPrice, PLANS, trialEndsFrom, TRIAL_DAYS } from "./domain/subscription";
import { bigSaleBonus, salesPoints, needsMotivationAlert } from "./domain/commissions";
import { nextStage, STAGES } from "./routers/production";

describe("règlement multidevises de la caisse (7.1)", () => {
  it("accepte une facture payée en trois devises sur le même ticket", () => {
    // Facture de 1 000 000 XOF : 200 000 TPE + 300 000 mobile money
    // + 100 000 XOF + ~200 000 XOF en USD + ~200 000 XOF en EUR.
    const settlement = computeSettlement(
      1_000_000,
      [
        { method: "tpe", currency: "XOF", amount: 200_000 },
        { method: "mobile_money", currency: "XOF", amount: 300_000 },
        { method: "cash", currency: "XOF", amount: 100_000 },
        { method: "cash", currency: "USD", amount: 333.33 },
        { method: "cash", currency: "EUR", amount: 304.9 },
      ],
      "XOF",
      DEFAULT_RATES,
    );
    // Les arrondis de conversion font varier le reste de quelques francs.
    expect(settlement.remain).toBeLessThanOrEqual(10);
    expect(settlement.change).toBe(0);
    expect(settlement.paidByCurrency.USD).toBe(333.33);
  });

  it("calcule le reste à payer puis la monnaie à rendre", () => {
    const partial = computeSettlement(100_000, [{ method: "cash", currency: "XOF", amount: 40_000 }], "XOF");
    expect(partial.remain).toBe(60_000);
    expect(partial.settled).toBe(false);

    const overpaid = computeSettlement(100_000, [{ method: "cash", currency: "XOF", amount: 110_000 }], "XOF");
    expect(overpaid.remain).toBe(0);
    expect(overpaid.change).toBe(10_000);
    expect(overpaid.settled).toBe(true);
  });

  it("convertit une facture XAF vers USD/EUR pour l'affichage 3 devises", () => {
    const usd = convert(100_000, "XOF", "USD", DEFAULT_RATES);
    const eur = convert(100_000, "XOF", "EUR", DEFAULT_RATES);
    expect(usd).toBeCloseTo(166.67, 1);
    expect(eur).toBeCloseTo(152.44, 1);
    expect(toXof(50, "USD", DEFAULT_RATES)).toBe(30_000);
  });

  it("applique la réduction de parrainage (5.5)", () => {
    const result = applyReferralDiscount(100_000, 10);
    expect(result.discount).toBe(10_000);
    expect(result.total).toBe(90_000);
  });

  it("formate les montants à la française", () => {
    // fr-FR utilise l'espace fine insécable comme séparateur de milliers.
    expect(formatMoney(1_000_000, "XOF")).toMatch(/^1[\s\u202f]000[\s\u202f]000 XOF$/);
    expect(formatMoney(99.5, "USD")).toMatch(/99,50 USD$/);
  });
});

describe("circuit de validation des achats (9)", () => {
  it("exige la direction au-delà de 50 000 F CFA", () => {
    expect(nextPurchaseStatusOnBuyerApproval()).toBe("valide_acheteur");
    expect(nextPurchaseStatusOnAccountantApproval(50_000)).toBe("valide_comptable");
    expect(nextPurchaseStatusOnDirectorApproval()).toBe("approubee");
    expect(nextPurchaseStatusOnAccountantApproval(49_999)).toBe("approubee");
    expect(PURCHASE_DIRECTION_THRESHOLD_XOF).toBe(50_000);
  });

  it("réserve la petite caisse aux très petites dépenses", () => {
    expect(PETTY_CASH_LIMIT_PER_INVOICE).toBe(2_000);
  });
});

describe("cycle d'abonnement (3)", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("accorde 30 jours d'essai", () => {
    const ends = trialEndsFrom(new Date("2026-09-08T12:00:00Z"));
    expect(ends.toISOString()).toBe(new Date("2026-10-08T12:00:00Z").toISOString());
    expect(TRIAL_DAYS).toBe(30);
  });

  it("passe en tolérance puis bloque après l'essai", () => {
    const trialEndsAt = new Date("2026-08-01T00:00:00Z");
    const inGrace = new Date("2026-08-05T00:00:00Z");
    const afterGrace = new Date("2026-08-15T00:00:00Z");
    expect(effectiveOrgStatus({ status: "trial", trialEndsAt, subscriptionEndsAt: null, now })).toBe("blocked");
    expect(effectiveOrgStatus({ status: "trial", trialEndsAt, subscriptionEndsAt: null, now: inGrace })).toBe("grace");
    expect(effectiveOrgStatus({ status: "trial", trialEndsAt, subscriptionEndsAt: null, now: afterGrace })).toBe("blocked");
  });

  it("restera actif tant que l'abonnement payé court", () => {
    const status = effectiveOrgStatus({
      status: "active",
      trialEndsAt: new Date("2026-01-01T00:00:00Z"),
      subscriptionEndsAt: new Date("2027-01-01T00:00:00Z"),
      now,
    });
    expect(status).toBe("active");
  });

  it("tarifie les trois formules avec réduction annuelle", () => {
    expect(PLANS.boutique.monthly).toBe(50_000);
    expect(PLANS.atelier_boutique.monthly).toBe(150_000);
    expect(PLANS.complet.monthly).toBe(250_000);
    expect(planPrice("boutique", 12)).toBe(480_000); // -20 %
    expect(planPrice("atelier_boutique", 12)).toBe(1_350_000); // -25 %
    expect(planPrice("complet", 12)).toBe(2_100_000); // -30 %
  });
});

describe("primes commerciales (14.4)", () => {
  it("compte un point par tranche de 50 000 F CFA", () => {
    expect(salesPoints(0)).toBe(0);
    expect(salesPoints(49_999)).toBe(0);
    expect(salesPoints(50_000)).toBe(1);
    expect(salesPoints(1_600_000)).toBe(32);
  });

  it("prime automatiquement les grosses ventes à 2 %", () => {
    expect(bigSaleBonus(1_000_000)).toBe(0);
    expect(bigSaleBonus(1_500_000)).toBe(30_000);
  });

  it("alerte la motivation sous 60 points mensuels", () => {
    expect(needsMotivationAlert(59)).toBe(true);
    expect(needsMotivationAlert(60)).toBe(false);
  });
});

describe("circuit de fabrication (8)", () => {
  it("suit les sept étapes dans l'ordre", () => {
    expect(STAGES).toEqual(["coupe", "couture", "broderie", "finition", "controle_qualite", "emballage", "livraison"]);
    expect(nextStage("coupe")).toBe("couture");
    expect(nextStage("livraison")).toBeNull();
  });
});

describe("isolation multi-tenant (schéma)", () => {
  it("requiert une organisation sur chaque ressource métier", async () => {
    const schema = await import("../drizzle/schema");
    for (const table of [schema.customers, schema.inventory, schema.orders, schema.products, schema.sales, schema.stores, schema.productionOrders, schema.purchaseRequests, schema.employees]) {
      expect(table.organizationId).toBeDefined();
    }
  });
});
