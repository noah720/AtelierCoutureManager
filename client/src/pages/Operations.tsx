import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatXof, GAMME_LABELS, GENRE_LABELS, ORDER_STATUS_LABELS, SIZES_ADULT } from "@/const";
import { trpc } from "@/lib/trpc";
import { downloadBase64Pdf } from "@/lib/download";
import { toast } from "sonner";
import { Boxes, MapPin, Package, Pencil, Plus, Search, Store, Trash2, Users, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const sections = [
  { key: "stores", label: "Boutiques & agences", icon: Store },
  { key: "customers", label: "Clients", icon: Users },
  { key: "products", label: "Produits & stock", icon: Boxes },
  { key: "orders", label: "Commandes clients", icon: Package },
] as const;

type SectionKey = (typeof sections)[number]["key"];

export default function Operations({ section = "stores" }: { section?: string }) {
  const [active, setActive] = useState<SectionKey>(sections.some((item) => item.key === section) ? (section as SectionKey) : "stores");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [variantProduct, setVariantProduct] = useState<any>(null);
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [orderForm, setOrderForm] = useState(false);
  const [search, setSearch] = useState("");
  const current = sections.find((item) => item.key === active)!;

  const utils = trpc.useUtils();
  const storeQuery = trpc.stores.list.useQuery(undefined, { enabled: active === "stores" });
  const customerQuery = trpc.customers.list.useQuery(undefined, { enabled: active === "customers" });
  const productQuery = trpc.products.list.useQuery(undefined, { enabled: active === "products" });
  const variantsQuery = trpc.variants.list.useQuery(undefined, { enabled: active === "products" });
  const inventoryQuery = trpc.inventory.list.useQuery(undefined, { enabled: active === "products" });
  const storesForOrder = trpc.stores.list.useQuery();
  const customersForOrder = trpc.customers.list.useQuery();
  const variantsForOrder = trpc.variants.list.useQuery(undefined, { enabled: orderForm });

  const data = active === "stores" ? storeQuery.data : active === "customers" ? customerQuery.data : productQuery.data;
  const query = active === "stores" ? storeQuery : active === "customers" ? customerQuery : productQuery;
  const filtered = useMemo(() => (data ?? []).filter((item: any) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [data, search]);

  const inventoryByVariant = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of inventoryQuery.data ?? []) map.set(row.variantId, (map.get(row.variantId) ?? 0) + row.quantity);
    return map;
  }, [inventoryQuery.data]);
  const storesById = useMemo(() => new Map((storesForOrder.data ?? []).map((s) => [s.id, s])), [storesForOrder.data]);

  return (
    <AppShell
      title="Gestion opérationnelle"
      subtitle="Gérez les ressources de votre marque depuis un espace unique."
      actions={
        active === "orders" ? (
          <Button onClick={() => setOrderForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white hover:bg-[#353832]">
            <Plus size={15} className="mr-2" /> Nouvelle commande
          </Button>
        ) : (
          <Button onClick={() => setShowForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white hover:bg-[#353832]">
            <Plus size={15} className="mr-2" /> Ajouter
          </Button>
        )
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#e8e8e2] bg-white p-2 sm:grid-cols-4">
        {sections.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setActive(item.key);
              setSearch("");
            }}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold transition ${active === item.key ? "bg-[#20231f] text-white" : "text-[#81847c] hover:bg-[#f1f1ed] hover:text-[#20231f]"}`}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {active === "orders" ? (
        <OrdersList onOpenCreate={() => setOrderForm(true)} storesById={storesById} />
      ) : (
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.025)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[#f0f0eb] px-5 py-5 sm:px-6">
            <div>
              <CardTitle className="font-display text-xl tracking-[-0.03em]">{current.label}</CardTitle>
              <p className="mt-1 text-xs text-[#969991]">
                {filtered.length} élément{filtered.length > 1 ? "s" : ""}
                {active === "products" && !variantsQuery.isLoading ? ` · ${variantsQuery.data?.length ?? 0} variante(s)` : ""}
              </p>
            </div>
            <div className="relative w-48">
              <Search className="absolute left-3 top-2.5 text-[#a6a8a1]" size={14} />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" className="h-9 rounded-lg border-[#e6e6e0] pl-9 text-xs" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="px-6 py-16 text-center text-sm text-[#9a9c95]">Chargement des données…</div>
            ) : query.isError ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold">Votre espace de marque n’est pas encore configuré.</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#92958d]">Créez une organisation pour commencer à enregistrer vos {current.label.toLowerCase()}.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f2ed] text-[#9a9c95]">
                  <current.icon size={18} />
                </div>
                <p className="text-sm font-semibold">Aucun élément pour le moment</p>
                <p className="mt-1 text-xs text-[#9a9c95]">Ajoutez votre premier élément pour commencer.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0eb]">
                {filtered.map((item: any) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                    {active === "stores" && (
                      <>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]">{item.kind === "atelier" ? <Boxes size={15} /> : <Store size={15} />}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{item.name} {item.kind === "atelier" && <Badge className="ml-1 border-0 bg-[#fff0db] text-[9px] font-bold text-[#c27b2c]">Atelier</Badge>}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-[#979a92]"><MapPin size={11} /> {[item.city, item.address].filter(Boolean).join(" — ") || "Localisation non renseignée"} · {item.currency}</p>
                        </div>
                        <Badge className={`border-0 text-[10px] ${item.isActive ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0ed] text-[#b4604e]"}`}>{item.isActive ? "Active" : "Désactivée"}</Badge>
                        <Button variant="outline" size="sm" onClick={() => { setEditing(item); setShowForm(true); }} className="rounded-lg text-[11px]"><Pencil size={12} className="mr-1" /> Modifier</Button>
                        {item.isActive && <DeactivateStoreButton id={item.id} onDone={() => utils.stores.list.invalidate()} />}
                      </>
                    )}
                    {active === "customers" && (
                      <>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff0db] text-[10px] font-bold text-[#c27b2c]">{item.firstName[0]}{item.lastName[0]}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{item.firstName} {item.lastName}</p>
                          <p className="mt-0.5 text-xs text-[#979a92]">{[item.phone, item.city].filter(Boolean).join(" · ") || "Coordonnées non renseignées"}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setCustomerDetail(item)} className="rounded-lg text-[11px]">Fiche & mensurations</Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditing(item); setShowForm(true); }} className="rounded-lg text-[11px]"><Pencil size={12} /></Button>
                      </>
                    )}
                    {active === "products" && (
                      <>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e2f4ee] text-[#2d8a70]"><Boxes size={15} /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="mt-0.5 text-xs text-[#979a92]">
                            {item.category} · {GENRE_LABELS[item.genre]} · Gamme {GAMME_LABELS[item.gamme]}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">{formatXof(item.basePrice)}</p>
                        <Button variant="outline" size="sm" onClick={() => setVariantProduct(item)} className="rounded-lg text-[11px]"><Plus size={12} className="mr-1" /> Variante</Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {active === "products" && !query.isError && (variantsQuery.data?.length ?? 0) > 0 && (
              <div className="border-t border-[#f0f0eb] px-5 py-5 sm:px-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#a1a39d]">Variantes par produit (SKU · taille · couleur · prix · stock total)</p>
                <div className="space-y-3">
                  {Object.entries(
                    (variantsQuery.data ?? []).reduce<Record<string, any[]>>((groups, row) => {
                      (groups[row.product.name] ??= []).push(row);
                      return groups;
                    }, {}),
                  ).map(([productName, rows]) => (
                    <div key={productName} className="rounded-2xl border border-[#ececea] p-3">
                      <p className="mb-2 text-xs font-semibold">{productName}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {rows.map((row) => (
                          <span key={row.variant.id} className="rounded-lg border border-[#ececea] bg-white px-2 py-1 text-[10px]">
                            <span className="font-mono">{row.variant.sku}</span> · {row.variant.size ?? "—"} · {row.variant.color ?? "—"} · {formatXof(row.variant.price)} · stock {inventoryByVariant.get(row.variant.id) ?? 0}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulaire création / édition */}
      <CreateForm
        type={active}
        initial={editing}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
      />

      {/* Variante produit */}
      <VariantForm product={variantProduct} onClose={() => setVariantProduct(null)} />

      {/* Fiche client détaillée */}
      <CustomerDetail customer={customerDetail} onClose={() => setCustomerDetail(null)} />

      {/* Nouvelle commande */}
      <OrderForm
        open={orderForm}
        onClose={() => setOrderForm(false)}
        stores={(storesForOrder.data ?? []).filter((s) => s.isActive && s.kind === "boutique")}
        customers={customersForOrder.data ?? []}
        variants={(variantsForOrder.data ?? []).slice(0, 100)}
      />
    </AppShell>
  );
}

function DeactivateStoreButton({ id, onDone }: { id: number; onDone: () => void }) {
  const deactivate = trpc.stores.deactivate.useMutation({ onSuccess: onDone });
  return (
    <Button variant="outline" size="sm" disabled={deactivate.isPending} onClick={() => deactivate.mutate({ id })} className="rounded-lg text-[11px] text-[#b4604e]">
      <Trash2 size={12} />
    </Button>
  );
}

function CreateForm({ type, initial, onClose }: { type: SectionKey; initial?: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "boutique",
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    currency: initial?.currency ?? "XOF",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    measurements: initial?.measurements ?? "",
    notes: initial?.notes ?? "",
    category: initial?.category ?? "Vêtement",
    family: initial?.family ?? "vetement",
    genre: initial?.genre ?? "homme",
    gamme: initial?.gamme ?? "leader",
    sizes: initial?.sizes ?? SIZES_ADULT.join(","),
    basePrice: initial?.basePrice ? String(Number(initial.basePrice)) : "",
  });

  const storeMutation = trpc.stores.create.useMutation({ onSuccess: () => { utils.stores.list.invalidate(); onClose(); } });
  const storeUpdateMutation = trpc.stores.update.useMutation({ onSuccess: () => { utils.stores.list.invalidate(); onClose(); } });
  const customerMutation = trpc.customers.create.useMutation({ onSuccess: () => { utils.customers.list.invalidate(); onClose(); } });
  const customerUpdateMutation = trpc.customers.update.useMutation({ onSuccess: () => { utils.customers.list.invalidate(); onClose(); } });
  const productMutation = trpc.products.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); onClose(); } });

  const pending = storeMutation.isPending || customerMutation.isPending || productMutation.isPending || storeUpdateMutation.isPending || customerUpdateMutation.isPending;
  const error = storeMutation.error || customerMutation.error || productMutation.error || storeUpdateMutation.error || customerUpdateMutation.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (type === "stores") {
      if (initial) storeUpdateMutation.mutate({ id: initial.id, name: values.name, city: values.city || undefined, address: values.address || undefined });
      else storeMutation.mutate({ name: values.name, kind: values.kind as "boutique" | "atelier", city: values.city || undefined, address: values.address || undefined, currency: values.currency as any });
    } else if (type === "customers") {
      const payload = { firstName: values.firstName, lastName: values.lastName, email: values.email || undefined, phone: values.phone || undefined, city: values.city || undefined, measurements: values.measurements || undefined, notes: values.notes || undefined };
      if (initial) customerUpdateMutation.mutate({ id: initial.id, ...payload });
      else customerMutation.mutate(payload);
    } else {
      productMutation.mutate({
        name: values.name,
        family: values.family as "vetement" | "accessoire",
        category: values.category,
        genre: values.genre as "femme" | "homme" | "enfant",
        gamme: values.gamme as "leader" | "vip" | "royale" | "presidentiel",
        sizes: values.sizes || undefined,
        basePrice: values.basePrice,
      });
    }
  };

  const open = Boolean(initial) || type === "stores" || type === "customers" || type === "products";
  if (!open) return null;

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">{initial ? "Modifier" : "Nouveau"} — {type === "stores" ? "établissement" : type === "customers" ? "client" : "produit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {type === "customers" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input required placeholder="Prénom" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Input required placeholder="Nom" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} className="h-9 rounded-lg text-xs" />
            </div>
          ) : (
            <Input required placeholder={type === "stores" ? "Nom de la boutique / de l’atelier" : "Nom du produit"} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-9 rounded-lg text-xs" />
          )}

          {type === "stores" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={values.kind} onChange={(e) => setValues({ ...values, kind: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                  <option value="boutique">Boutique / agence</option>
                  <option value="atelier">Atelier</option>
                </select>
                <select value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                  {["XOF", "XAF", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Input placeholder="Ville" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Input placeholder="Adresse" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} className="h-9 rounded-lg text-xs" />
            </>
          )}

          {type === "customers" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Téléphone" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} className="h-9 rounded-lg text-xs" />
                <Input type="email" placeholder="E-mail" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="h-9 rounded-lg text-xs" />
              </div>
              <Input placeholder="Ville" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Textarea placeholder="Mensurations (ex. poitrine 92, taille 74, hanches 98)" value={values.measurements} onChange={(e) => setValues({ ...values, measurements: e.target.value })} rows={2} className="rounded-xl text-xs" />
              <Textarea placeholder="Notes privées (préférences, anniversaire…)" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} rows={2} className="rounded-xl text-xs" />
            </>
          )}

          {type === "products" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[10px] font-semibold text-[#858880]">Famille</span>
                  <select value={values.family} onChange={(e) => setValues({ ...values, family: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                    <option value="vetement">Vêtement</option>
                    <option value="accessoire">Accessoire</option>
                  </select>
                </label>
                <Input required placeholder="Catégorie (ex. Agbada, Sac…)" value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })} className="h-9 rounded-lg text-xs" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[10px] font-semibold text-[#858880]">Genre</span>
                  <select value={values.genre} onChange={(e) => setValues({ ...values, genre: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                    <option value="homme">Homme</option>
                    <option value="femme">Femme</option>
                    <option value="enfant">Enfant</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-semibold text-[#858880]">Gamme</span>
                  <select value={values.gamme} onChange={(e) => setValues({ ...values, gamme: e.target.value })} className="h-9 w-full rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                    <option value="leader">Leader</option>
                    <option value="vip">VIP</option>
                    <option value="royale">Royale</option>
                    <option value="presidentiel">Présidentiel</option>
                  </select>
                </label>
              </div>
              <Input required inputMode="decimal" placeholder="Prix de base en FCFA" value={values.basePrice} onChange={(e) => setValues({ ...values, basePrice: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Input placeholder="Tailles proposées (séparées par des virgules)" value={values.sizes} onChange={(e) => setValues({ ...values, sizes: e.target.value })} className="h-9 rounded-lg text-xs" />
            </>
          )}

          {error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{error.message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={pending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{pending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VariantForm({ product, onClose }: { product: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ sku: "", size: "", color: "", price: "" });

  const mutation = trpc.variants.create.useMutation({
    onSuccess: () => {
      utils.variants.list.invalidate();
      utils.inventory.list.invalidate();
      onClose();
    },
  });

  if (!product) return null;

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouvelle variante — {product.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ productId: product.id, sku: values.sku, size: values.size || undefined, color: values.color || undefined, price: values.price });
          }}
          className="space-y-3"
        >
          <Input required placeholder="SKU (ex. AGBA-ROY-M)" value={values.sku} onChange={(e) => setValues({ ...values, sku: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Taille" value={values.size} onChange={(e) => setValues({ ...values, size: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input placeholder="Couleur" value={values.color} onChange={(e) => setValues({ ...values, color: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <Input required inputMode="decimal" placeholder="Prix en FCFA" value={values.price} onChange={(e) => setValues({ ...values, price: e.target.value })} className="h-9 rounded-lg text-xs" />
          {mutation.error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Enregistrement…" : "Créer la variante"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetail({ customer, onClose }: { customer: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    city: customer?.city ?? "",
    measurements: customer?.measurements ?? "",
    notes: customer?.notes ?? "",
  });
  const mutation = trpc.customers.update.useMutation({ onSuccess: () => { utils.customers.list.invalidate(); onClose(); } });

  if (!customer) return null;

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">{customer.firstName} {customer.lastName}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              id: customer.id,
              firstName: values.firstName,
              lastName: values.lastName,
              phone: values.phone || undefined,
              email: values.email || undefined,
              city: values.city || undefined,
              measurements: values.measurements || undefined,
              notes: values.notes || undefined,
            });
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input required placeholder="Prénom" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input required placeholder="Nom" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Téléphone" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input type="email" placeholder="E-mail" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <Input placeholder="Ville" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} className="h-9 rounded-lg text-xs" />
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[#858880]">Mensurations (consultables et modifiables)</p>
            <Textarea value={values.measurements} onChange={(e) => setValues({ ...values, measurements: e.target.value })} rows={2} className="rounded-xl text-xs" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[#858880]">Notes privées</p>
            <Textarea value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} rows={2} className="rounded-xl text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Fermer</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Enregistrement…" : "Enregistrer la fiche"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrdersList({ onOpenCreate, storesById }: { onOpenCreate: () => void; storesById: Map<number, any> }) {
  const utils = trpc.useUtils();
  const query = trpc.orders.list.useQuery();
  const statusMutation = trpc.orders.updateStatus.useMutation({ onSuccess: () => utils.orders.list.invalidate() });
  const statuses = ["pending", "confirmed", "in_production", "ready", "delivered", "cancelled"] as const;
  const [receiptOrderId, setReceiptOrderId] = useState<number | null>(null);
  const orderPdf = trpc.receipts.orderPdf.useQuery({ orderId: receiptOrderId ?? 0 }, { enabled: receiptOrderId !== null });
  useState;
  const emailOrder = trpc.receipts.emailOrder.useMutation({
    onSuccess: (result) => {
      if (result.status === "envoye") toast.success(`Reçu envoyé à ${result.recipient}.`);
      else if (result.status === "simulation") toast.info(`E-mail simulé (aucun fournisseur configuré) — ${result.recipient}.`);
      else toast.error(`Échec de l'envoi : ${result.detail ?? "erreur inconnue"}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const downloadOrderReceipt = async (orderId: number) => {
    try {
      setReceiptOrderId(orderId);
      const result = await orderPdf.refetch();
      if (result.data) downloadBase64Pdf(result.data.filename, result.data.base64);
    } catch {
      toast.error("Impossible de générer le reçu PDF.");
    }
  };

  return (
    <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.025)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[#f0f0eb] px-5 py-5 sm:px-6">
        <div>
          <CardTitle className="font-display text-xl tracking-[-0.03em]">Commandes clients</CardTitle>
          <p className="mt-1 text-xs text-[#969991]">Chaque commande transmet automatiquement sa fiche de fabrication à l’atelier.</p>
        </div>
        <Button onClick={onOpenCreate} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white"><Plus size={14} className="mr-1" /> Nouvelle commande</Button>
      </CardHeader>
      <CardContent className="p-0">
        {query.isLoading ? (
          <div className="px-6 py-16 text-center text-sm text-[#9a9c95]">Chargement des commandes…</div>
        ) : query.isError ? (
          <div className="px-6 py-16 text-center text-sm text-[#92958d]">Connectez votre espace de marque pour consulter les commandes.</div>
        ) : query.data?.length ? (
          <div className="divide-y divide-[#f0f0eb]">
            {query.data.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]"><Package size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {order.reference}
                    {order.channel === "en_ligne" && <Badge className="ml-2 border-0 bg-[#eee8ff] text-[9px] font-bold text-[#6954c6]">En ligne</Badge>}
                    {order.channel === "en_ligne" && (
                      <Badge className={`ml-1 border-0 text-[9px] font-bold ${order.paymentStatus === "paye" ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0ed] text-[#b4604e]"}`}>
                        {order.paymentStatus === "paye" ? "Payé" : "Impayé"}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[#979a92]">
                    Client #{order.customerId} · {storesById.get(order.storeId)?.name ?? `Boutique #${order.storeId}`} · {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                    {order.channel === "en_ligne" && order.deliveryPhone ? ` · Livraison : ${order.deliveryName ?? ""} (${order.deliveryPhone})` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatXof(order.totalAmount)}</p>
                {order.channel === "en_ligne" && order.paymentStatus === "paye" && (
                  <div className="flex gap-1">
                    <button
                      className="rounded-lg border border-[#e4e5df] bg-white px-2 py-1 text-[10px] font-semibold text-[#60635c] hover:bg-[#f1f1ed]"
                      onClick={() => downloadOrderReceipt(order.id)}
                      title="Télécharger le reçu PDF"
                    >
                      Reçu
                    </button>
                    <button
                      className="rounded-lg border border-[#e4e5df] bg-white px-2 py-1 text-[10px] font-semibold text-[#60635c] hover:bg-[#f1f1ed]"
                      onClick={() => {
                        const to = window.prompt("Adresse e-mail du client :", "");
                        if (to) emailOrder.mutate({ orderId: order.id, to });
                      }}
                      title="Envoyer le reçu par e-mail"
                    >
                      E-mail
                    </button>
                  </div>
                )}
                <select
                  aria-label={`Statut de ${order.reference}`}
                  value={order.status}
                  disabled={statusMutation.isPending}
                  onChange={(event) => statusMutation.mutate({ id: order.id, status: event.target.value as (typeof statuses)[number] })}
                  className="rounded-lg border border-[#e4e5df] bg-white px-2 py-1 text-[10px] font-semibold text-[#60635c]"
                >
                  {statuses.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold">Aucune commande enregistrée</p>
            <p className="mt-1 text-xs text-[#9a9c95]">Créez une commande quand un article, une taille ou une couleur manque en boutique.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrderForm({ open, onClose, stores, customers, variants }: { open: boolean; onClose: () => void; stores: any[]; customers: any[]; variants: any[] }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ storeId: "", customerId: "", reference: "", totalAmount: "", notes: "", dueDate: "", variantId: "", quantity: "1", unitPrice: "" });
  const [items, setItems] = useState<Array<{ variantId: number; label: string; quantity: number; unitPrice: string }>>([]);

  const mutation = trpc.orders.create.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      onClose();
      setItems([]);
    },
  });

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      storeId: Number(values.storeId),
      customerId: Number(values.customerId),
      reference: values.reference,
      totalAmount: values.totalAmount,
      notes: values.notes || undefined,
      dueDate: values.dueDate || undefined,
      items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice })),
    });
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">Nouvelle commande client</DialogTitle>
          <p className="mt-1 text-xs text-[#858880]">Article, taille ou couleur indisponible en boutique ? Le client commande ; l’atelier reçoit la fiche avec mensurations et exigences.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <select required value={values.storeId} onChange={(e) => setValues({ ...values, storeId: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="">Boutique…</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select required value={values.customerId} onChange={(e) => setValues({ ...values, customerId: e.target.value })} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
              <option value="">Client…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input required placeholder="Référence (ex. CMD-0002)" value={values.reference} onChange={(e) => setValues({ ...values, reference: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input required inputMode="decimal" placeholder="Montant total en FCFA" value={values.totalAmount} onChange={(e) => setValues({ ...values, totalAmount: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="rounded-2xl border border-dashed border-[#d9d7d0] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#a1a39d]">Articles commandés (optionnel)</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_70px_90px_auto]">
              <select value={values.variantId} onChange={(e) => { const v = variants.find((row) => row.variant.id === Number(e.target.value)); setValues({ ...values, variantId: e.target.value, unitPrice: v ? String(Number(v.variant.price)) : values.unitPrice }); }} className="h-9 rounded-lg border border-[#e6e6e0] bg-white px-2 text-xs">
                <option value="">Article / variante…</option>
                {variants.map((row) => <option key={row.variant.id} value={row.variant.id}>{row.product.name} · {row.variant.size ?? "—"} ({row.variant.sku})</option>)}
              </select>
              <Input inputMode="numeric" placeholder="Qté" value={values.quantity} onChange={(e) => setValues({ ...values, quantity: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Input inputMode="decimal" placeholder="Prix unit." value={values.unitPrice} onChange={(e) => setValues({ ...values, unitPrice: e.target.value })} className="h-9 rounded-lg text-xs" />
              <Button
                type="button"
                variant="outline"
                disabled={!values.variantId}
                onClick={() => {
                  const variant = variants.find((row) => row.variant.id === Number(values.variantId));
                  if (!variant) return;
                  setItems((current) => [...current, { variantId: variant.variant.id, label: `${variant.product.name} · ${variant.variant.size ?? "—"}`, quantity: Number(values.quantity) || 1, unitPrice: values.unitPrice }]);
                  setValues({ ...values, variantId: "", quantity: "1", unitPrice: "" });
                }}
                className="h-9 rounded-lg text-xs"
              >
                <Plus size={13} />
              </Button>
            </div>
            {items.length > 0 && (
              <div className="mt-2 space-y-1">
                {items.map((item, index) => (
                  <div key={`${item.variantId}-${index}`} className="flex items-center justify-between rounded-lg bg-[#f7f7f5] px-2 py-1 text-[11px]">
                    <span>{item.label} × {item.quantity} — {formatXof(Number(item.unitPrice) * item.quantity)}</span>
                    <button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} aria-label="Retirer"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} className="h-9 rounded-lg text-xs" />
            <Input placeholder="Exigences particulières, photo des tissus…" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} className="h-9 rounded-lg text-xs" />
          </div>
          {mutation.error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{mutation.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button>
            <Button disabled={mutation.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{mutation.isPending ? "Enregistrement…" : "Créer la commande"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
