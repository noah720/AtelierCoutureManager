import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { organizationRouter } from "./routers/organization";
import { storesRouter } from "./routers/stores";
import { customersRouter } from "./routers/customers";
import { productsRouter, variantsRouter, inventoryRouter } from "./routers/catalog";
import { salesRouter, ratesRouter } from "./routers/sales";
import { ordersRouter, supportRouter, dashboardRouter } from "./routers/misc";
import { productionRouter } from "./routers/production";
import { purchasesRouter } from "./routers/purchases";
import { treasuryRouter } from "./routers/treasury";
import { employeesRouter } from "./routers/people";
import { adminRouter } from "./routers/admin";
import { shopRouter, deliveryRouter } from "./routers/shop";
import { systemRouter } from "./_core/systemRouter";

export { assertAllowedRole } from "./guards";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  organization: organizationRouter,
  stores: storesRouter,
  customers: customersRouter,
  products: productsRouter,
  variants: variantsRouter,
  inventory: inventoryRouter,
  sales: salesRouter,
  orders: ordersRouter,
  production: productionRouter,
  purchases: purchasesRouter,
  treasury: treasuryRouter,
  employees: employeesRouter,
  support: supportRouter,
  rates: ratesRouter,
  dashboard: dashboardRouter,
  admin: adminRouter,
  shop: shopRouter,
  delivery: deliveryRouter,
});

export type AppRouter = typeof appRouter;
