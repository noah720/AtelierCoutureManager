import { addToCart, cartCount, readCart, type CartItem } from "@/lib/shopCart";
import { GAMME_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { Factory, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

const MEASUREMENT_FIELDS = [
  { key: "poitrine", label: "Poitrine (cm)" },
  { key: "taille", label: "Taille (cm)" },
  { key: "hanches", label: "Hanches (cm)" },
  { key: "longueur", label: "Longueur souhaitée (cm)" },
];

/**
 * Fiche produit publique (5.2) : taille S→3XL ou « Sur mesure » (le client
 * saisit lui-même ses mensurations), genre, gamme, couleur personnalisée.
 */
export default function ShopProduct() {
  const params = useParams<{ slug: string; id: string }>();
  const slug = params.slug ?? "";
  const productId = Number(params.id);
  const catalogQuery = trpc.shop.catalog.useQuery({ slug }, { retry: false });
  const [size, setSize] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [cart, setCart] = useState(() => readCart(slug));

  const product = useMemo(() => catalogQuery.data?.products.find((row) => row.id === productId), [catalogQuery.data, productId]);

  if (catalogQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#faf9f6]"><Loader2 className="animate-spin" /></div>;
  }
  if (!product) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f6] px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Article introuvable</h1>
        <Link href={`/boutique/${slug}`} className="mt-4 rounded-full bg-[#20231f] px-5 py-2 text-xs font-semibold text-white">Retour à la boutique</Link>
      </div>
    );
  }

  const org = catalogQuery.data!.organization;
  const isSurMesure = size === "Sur mesure";
  const selectedVariant = useMemo(() => {
    if (!product) return undefined;
    if (size && size !== "Sur mesure") {
      return product.variants.find((variant) => variant.size === size && variant.available > 0) ?? product.variants.find((variant) => variant.size === size);
    }
    return product.variants.find((variant) => variant.available > 0) ?? product.variants[0];
  }, [product, size]);
  if (!product) return null;
  const unitPrice = selectedVariant ? Number(selectedVariant.price) : Number(product.basePrice);
  const stockForSize = selectedVariant?.available ?? 0;

  const addItem = () => {
    if (!size) return toast.error("Choisissez une taille.");
    if (isSurMesure && !measurements.poitrine && !measurements.taille) {
      return toast.error("Renseignez au moins le tour de poitrine ou de taille.");
    }
    if (!selectedVariant) return toast.error("Article momentanément indisponible.");
    const customMeasurements = isSurMesure
      ? MEASUREMENT_FIELDS.filter((field) => measurements[field.key]).map((field) => `${field.label.replace(" (cm)", "")} ${measurements[field.key]}`).join(", ") + (measurements.notes ? ` — ${measurements.notes}` : "")
      : undefined;
    const item: CartItem = {
      variantId: selectedVariant.id,
      productId: product.id,
      name: product.name,
      size: isSurMeasureLabel(size) ? "Sur mesure" : size,
      color: color || selectedVariant.color || undefined,
      unitPrice,
      quantity,
      customMeasurements,
    };
    setCart(addToCart(slug, item));
    toast.success("Article ajouté au panier.");
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] pb-24">
      <header className="sticky top-0 z-20 border-b border-[#eceae4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={`/boutique/${slug}`} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#20231f] font-display text-sm font-semibold text-white">{org.name.slice(0, 1)}</div>
            <span className="font-display text-base font-semibold">{org.name}</span>
          </Link>
          <Link href={`/boutique/${slug}/panier`}>
            <button className="relative flex h-9 items-center gap-2 rounded-full bg-[#20231f] px-4 text-xs font-semibold text-white">
              <ShoppingBag size={14} /> Panier
              {cartCount(cart) > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c27b2c] px-1 text-[10px] font-bold text-white">{cartCount(cart)}</span>}
            </button>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 pt-6 md:grid-cols-2">
        {/* Visuel */}
        <div className="flex aspect-square items-center justify-center rounded-3xl bg-gradient-to-br from-[#efe9dc] via-[#e7ddc8] to-[#d9cba8] text-8xl">
          {product.family === "accessoire" ? "👜" : product.genre === "femme" ? "👗" : product.genre === "enfant" ? "🧒" : "👕"}
        </div>

        {/* Détails */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1a39d]">
            {product.category} · {product.genre} · Gamme {GAMME_LABELS[product.gamme]}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-2 font-display text-2xl font-semibold text-[#20231f]">{unitPrice.toLocaleString("fr-FR")} {org.currency}</p>
          {product.description && <p className="mt-3 text-xs leading-relaxed text-[#60635c]">{product.description}</p>}

          {/* Tailles (5.2) */}
          <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#858880]">Taille</p>
          <div className="flex flex-wrap gap-1.5">
            {product.sizes.map((option) => (
              <button
                key={option}
                onClick={() => setSize(option)}
                className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition ${size === option ? "border-[#20231f] bg-[#20231f] text-white" : "border-[#e5e3dd] bg-white text-[#40433d]"}`}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Mensurations sur mesure */}
          {isSurMesure && (
            <div className="mt-3 rounded-2xl border border-dashed border-[#d9d7d0] bg-white p-3">
              <p className="mb-2 text-[11px] font-semibold text-[#40433d]">Vos mensurations (sur mesure)</p>
              <div className="grid grid-cols-2 gap-2">
                {MEASUREMENT_FIELDS.map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-0.5 block text-[10px] text-[#858880]">{field.label}</span>
                    <input inputMode="decimal" value={measurements[field.key] ?? ""} onChange={(e) => setMeasurements({ ...measurements, [field.key]: e.target.value })} className="h-8 w-full rounded-lg border border-[#e5e3dd] px-2 text-xs" />
                  </label>
                ))}
              </div>
              <input placeholder="Précisions (col, poignets, tissu…)" value={measurements.notes ?? ""} onChange={(e) => setMeasurements({ ...measurements, notes: e.target.value })} className="mt-2 h-8 w-full rounded-lg border border-[#e5e3dd] px-2 text-xs" />
            </div>
          )}

          {/* Couleur */}
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#858880]">Couleur</p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(product.variants.map((variant) => variant.color).filter(Boolean))].map((option) => (
              <button key={option} onClick={() => setColor(option === color ? "" : (option as string))} className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold ${color === option ? "border-[#20231f] bg-[#20231f] text-white" : "border-[#e5e3dd] bg-white text-[#40433d]"}`}>
                {option}
              </button>
            ))}
            <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Personnalisée…" className="h-8 w-32 rounded-full border border-dashed border-[#d9d7d0] px-3 text-[11px]" />
          </div>

          {/* Quantité + stock */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[#e5e3dd] bg-white px-2 py-1">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="rounded-full p-1 hover:bg-[#f1f1ed]" aria-label="Diminuer"><Minus size={13} /></button>
              <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="rounded-full p-1 hover:bg-[#f1f1ed]" aria-label="Augmenter"><Plus size={13} /></button>
            </div>
            {!isSurMesure && size && (
              <p className="text-[11px] text-[#969991]">
                {stockForSize > 0 ? `${stockForSize} en stock (toutes boutiques)` : "Stock épuisé — fabrication possible"}
              </p>
            )}
          </div>
          {product.onlineAvailable === 0 && (
            <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#eee8ff] px-3 py-2 text-[11px] font-semibold text-[#6954c6]">
              <Factory size={12} /> Cet article sera fabriqué à la commande par notre atelier — délai communiqué après validation.
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button onClick={addItem} className="flex h-11 flex-1 items-center justify-center rounded-full bg-[#20231f] text-sm font-semibold text-white transition hover:bg-[#353832]">
              <ShoppingBag size={15} className="mr-2" /> Ajouter au panier
            </button>
            <Link href={`/boutique/${slug}/panier`}>
              <button className="h-11 rounded-full border border-[#20231f] px-5 text-sm font-semibold text-[#20231f]">Panier ({cartCount(cart)})</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function isSurMeasureLabel(size: string) {
  return size === "Sur mesure";
}
