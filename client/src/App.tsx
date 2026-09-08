import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import Operations from "@/pages/Operations";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import Caisse from "./pages/Caisse";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Production from "./pages/Production";
import Purchases from "./pages/Purchases";
import Settings from "./pages/Settings";
import Staff from "./pages/Staff";
import Support from "./pages/Support";
import Billing from "./pages/Billing";
import Treasury from "./pages/Treasury";
import Shop from "./pages/Shop";
import ShopProduct from "./pages/ShopProduct";
import ShopCheckout from "./pages/ShopCheckout";
import ShopPayment from "./pages/ShopPayment";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/caisse" component={Caisse} />
      <Route path="/operations/:section">{(params) => <Operations section={params.section} />}</Route>
      <Route path="/operations">{() => <Operations />}</Route>
      <Route path="/production" component={Production} />
      <Route path="/approvisionnement" component={Purchases} />
      <Route path="/tresorerie" component={Treasury} />
      <Route path="/personnel" component={Staff} />
      <Route path="/facturation" component={Billing} />
      <Route path="/reglages" component={Settings} />
      <Route path="/assistance" component={Support} />
      <Route path="/admin" component={Admin} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

/** Vitrine publique : visible par tout le monde, sans connexion (5.1). */
function ShopRouter() {
  return (
    <Switch>
      <Route path="/boutique/:slug" component={Shop} />
      <Route path="/boutique/:slug/produit/:id" component={ShopProduct} />
      <Route path="/boutique/:slug/panier" component={ShopCheckout} />
      <Route path="/boutique/:slug/paiement/:paymentId" component={ShopPayment} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const { loading, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const isLoginPage = location === "/login";
  const isPublicShop = location.startsWith("/boutique");

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {isPublicShop ? (
            <ShopRouter />
          ) : loading && !isLoginPage ? (
            <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#20231f] border-t-transparent" />
                <p className="text-sm text-[#858880]">Chargement d’AtelierManager…</p>
              </div>
            </div>
          ) : !isAuthenticated && !isLoginPage ? (
            <Login />
          ) : (
            <Router />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
