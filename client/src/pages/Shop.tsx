import { cartCount, readCart } from "@/lib/shopCart";
import { GAMME_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { Factory, Loader2, Search, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";

/**
 * Vitrine publique de la boutique en ligne (5.1) : moderne, élégante,
 * pensée d'abord pour le téléphone, sans compte requis pour acheter.
 */
export default function Shop() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [, navigate] = useLocation();
  const catalogQuery = trpc.shop.catalog.useQuery({ slug }, { retry: false });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("tout");
  const [cart, setCart] = useState<CartItemFlag>(() => readCart(slug));

  type CartItemFlag = ReturnType<typeof readCart>;

  const products = catalogQuery.data?.products ?? [];
  const categories = useMemo(() => ["tout", ...new Set(products.map((product) => product.category))], [products]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter(
      (product) =>
        (category === "tout" || product.category === category) &&
        (!needle || `${product.name} ${product.description ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [products, search, category]);

  if (catalogQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f6]">
        <Loader2 className="animate-spin text-[#20231f]" />
      </div>
    );
  }

  if (catalogQuery.isError || !catalogQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 text-center">
        <ShoppingBag size={28} className="mb-4 text-[#b4604e]" />
        <h1 className="font-display text-2xl font-semibold">Boutique indisponible</h1>
        <p className="mt-2 max-w-sm text-sm text-[#858880]">Cette marque n’existe pas ou n’a pas activé sa boutique en ligne.</p>
      </div>
    );
  }

  const org = catalogQuery.data.organization;

  return (
    <div className="min-h-screen bg-[#faf9f6] pb-16">
      {/* En-tête vitrine */}
      <header className="sticky top-0 z-20 border-b border-[#eceae4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={org.name} className="h-8 w-8 rounded-xl object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#20231f] font-display text-sm font-semibold text-white">{org.name.slice(0, 1)}</div>
            )}
            <span className="font-display text-lg font-semibold tracking-tight">{org.name}</span>
          </div>
          <Link href={`/boutique/${slug}/panier`}>
            <button className="relative flex h-9 items-center gap-2 rounded-full bg-[#20231f] px-4 text-xs font-semibold text-white" onClick={() => setCart(readCart(slug))}>
              <ShoppingBag size={14} />
              Panier
              {cartCount(cart) > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c27b2c] px-1 text-[10px] font-bold text-white">{cartCount(cart)}</span>
              )}
            </button>
          </Link>
        </div>
      </header>

      {/* Bannière */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="overflow-hidden rounded-3xl bg-[#20231f] px-6 py-10 text-center text-white sm:py-14">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">Couture & mode africaine</p>
          <h1 className="mx-auto mt-2 max-w-xl font-display text-3xl font-semibold leading-tight sm:text-4xl">
            L’élégance africaine, taillée pour vous.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-white/60">
            Vêtements et accessoires {org.name} — livraison depuis nos boutiques, fabrication sur mesure possible. Livraison locale et internationale.
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-2.5 text-[#a6a8a1]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article…" className="h-9 w-full rounded-full border border-[#e5e3dd] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#20231f]" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition ${category === item ? "bg-[#20231f] text-white" : "border border-[#e5e3dd] bg-white text-[#60635c]"}`}>
                {item === "tout" ? "Tout" : item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grille produits */}
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 px-4 pt-5 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((product) => (
          <Link key={product.id} href={`/boutique/${slug}/produit/${product.id}`}>
            <div className="group overflow-hidden rounded-2xl border border-[#eceae4] bg-white transition hover:border-[#20231f]">
              <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-[#efe9dc] via-[#e7ddc8] to-[#d9cba8] text-3xl">
                {product.family === "accessoire" ? "👜" : product.genre === "femme" ? "👗" : product.genre === "enfant" ? "🧒" : "👕"}
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-semibold">{product.name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs font-bold text-[#20231f]">{Number(product.basePrice).toLocaleString("fr-FR")} {org.currency}</p>
                  {product.onlineAvailable > 0 ? (
                    <span className="rounded-full bg-[#e2f4ee] px-1.5 py-0.5 text-[9px] font-bold text-[#2d8a70]">Dispo</span>
                  ) : (
                    <span className="flex items-center gap-0.5 rounded-full bg-[#eee8ff] px-1.5 py-0.5 text-[9px] font-bold text-[#6954c6]"><Factory size={9} /> À fabriquer</span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-[#969991]">Gamme {GAMME_LABELS[product.gamme]}</p>
              </div>
            </div>
          </Link>
        ))}
        {!filtered.length && <p className="col-span-full py-14 text-center text-xs text-[#969991]">Aucun article ne correspond à votre recherche.</p>}
      </div>

      {/* Pied de page vitrine */}
      <footer className="mx-auto mt-12 max-w-5xl px-4">
        <div className="rounded-2xl border border-[#eceae4] bg-white px-5 py-4 text-center text-[11px] text-[#969991]">
          <p>
            {org.name} — boutique en ligne propulsée par <span className="font-semibold text-[#60635c]">AtelierManager</span>. Paiement sécurisé Moneroo (mobile money, carte, PayPal).
          </p>
          <p className="mt-1">
            Une question ? Écrivez-nous ou passez en boutique — livraison suivie locale et internationale <span className="font-semibold text-[#60635c]">DHL</span>.
          </p>
        </div>
      </footer>
      {/* Lien discret espace personnel */}
      <button onClick={() => navigate("/login")} className="fixed bottom-3 right-3 z-20 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-[#969991] shadow ring-1 ring-[#eceae4]">
        Espace marque
      </button>
    </div>
  );
}
