import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, MapPin, Package, Plus, Search, Store, Users, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

const sections = [
  { key: "stores", label: "Boutiques", icon: Store },
  { key: "customers", label: "Clients", icon: Users },
  { key: "products", label: "Produits & stock", icon: Boxes },
  { key: "orders", label: "Commandes", icon: Package },
] as const;

type SectionKey = (typeof sections)[number]["key"];

export default function Operations({ section = "stores" }: { section?: string }) {
  const [active, setActive] = useState<SectionKey>(sections.some((item) => item.key === section) ? section as SectionKey : "stores");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const current = sections.find((item) => item.key === active)!;

  const storeQuery = trpc.stores.list.useQuery(undefined, { enabled: active === "stores" });
  const customerQuery = trpc.customers.list.useQuery(undefined, { enabled: active === "customers" });
  const productQuery = trpc.products.list.useQuery(undefined, { enabled: active === "products" });

  const data = active === "stores" ? storeQuery.data : active === "customers" ? customerQuery.data : productQuery.data;
  const query = active === "stores" ? storeQuery : active === "customers" ? customerQuery : productQuery;
  const filtered = useMemo(() => (data ?? []).filter((item: any) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [data, search]);

  return <div className="min-h-screen bg-[#f7f7f5] px-5 py-6 text-[#20231f] sm:px-8 lg:px-12 lg:py-10">
    <div className="mx-auto max-w-[1220px]">
      <div className="mb-8 flex items-center justify-between"><div><Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#888b83] hover:text-[#20231f]"><ArrowLeft size={14} /> Retour au tableau de bord</Link><h1 className="font-display text-3xl font-semibold tracking-[-0.05em]">Gestion opérationnelle</h1><p className="mt-2 text-sm text-[#858880]">Gérez les ressources de votre marque depuis un espace unique.</p></div><Button onClick={() => setShowForm(true)} className="rounded-xl bg-[#20231f] text-xs font-semibold text-white hover:bg-[#353832]"><Plus size={15} className="mr-2" /> Ajouter</Button></div>
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#e8e8e2] bg-white p-2 sm:grid-cols-4">{sections.map((item) => <button key={item.key} onClick={() => { setActive(item.key); setSearch(""); }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold transition ${active === item.key ? "bg-[#20231f] text-white" : "text-[#81847c] hover:bg-[#f1f1ed] hover:text-[#20231f]"}`}><item.icon size={15} />{item.label}</button>)}</div>
      {active === "orders" ? <OrdersList /> : <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.025)]"><CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[#f0f0eb] px-5 py-5 sm:px-6"><div><CardTitle className="font-display text-xl tracking-[-0.03em]">{current.label}</CardTitle><p className="mt-1 text-xs text-[#969991]">{filtered.length} élément{filtered.length > 1 ? "s" : ""} dans votre marque</p></div><div className="relative w-48"><Search className="absolute left-3 top-2.5 text-[#a6a8a1]" size={14} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher" className="h-9 rounded-lg border-[#e6e6e0] pl-9 text-xs" /></div></CardHeader><CardContent className="p-0">{query.isLoading ? <div className="px-6 py-16 text-center text-sm text-[#9a9c95]">Chargement des données…</div> : query.isError ? <div className="px-6 py-16 text-center"><p className="text-sm font-semibold">Votre espace de marque n’est pas encore configuré.</p><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#92958d]">Créez une organisation et invitez votre équipe pour commencer à enregistrer vos {current.label.toLowerCase()}.</p><Button onClick={() => setShowForm(true)} variant="outline" className="mt-5 rounded-xl text-xs">Créer le premier élément</Button></div> : filtered.length === 0 ? <div className="px-6 py-16 text-center"><div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f2ed] text-[#9a9c95]"><current.icon size={18} /></div><p className="text-sm font-semibold">Aucun élément pour le moment</p><p className="mt-1 text-xs text-[#9a9c95]">Ajoutez votre premier élément pour commencer.</p></div> : <div className="divide-y divide-[#f0f0eb]">{filtered.map((item: any) => <ResourceRow key={item.id} item={item} type={active} />)}</div>}</CardContent></Card>}
      {showForm && <CreateForm type={active} onClose={() => setShowForm(false)} />}
    </div>
  </div>;
}

function ResourceRow({ item, type }: { item: any; type: SectionKey }) {
  const title = type === "stores" ? item.name : type === "customers" ? `${item.firstName} ${item.lastName}` : item.name;
  const subtitle = type === "stores" ? item.city || "Adresse à compléter" : type === "customers" ? item.phone || item.email || "Coordonnées à compléter" : `${item.category} · ${Number(item.basePrice).toLocaleString("fr-FR")} FCFA`;
  return <div className="flex items-center gap-3 px-5 py-4 sm:px-6"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f2efe6] text-[#8e7958]">{type === "stores" ? <MapPin size={16} /> : type === "customers" ? <Users size={16} /> : <Boxes size={16} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{title}</p><p className="mt-1 truncate text-xs text-[#979a92]">{subtitle}</p></div><Badge variant="outline" className="border-[#e4e5df] text-[10px] font-medium text-[#777a73]">Actif</Badge></div>;
}

function CreateForm({ type, onClose }: { type: SectionKey; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ name: "", city: "", address: "", firstName: "", lastName: "", email: "", phone: "", measurements: "", category: "Vêtement", basePrice: "" });
  const storeMutation = trpc.stores.create.useMutation({ onSuccess: () => { utils.stores.list.invalidate(); onClose(); } });
  const customerMutation = trpc.customers.create.useMutation({ onSuccess: () => { utils.customers.list.invalidate(); onClose(); } });
  const productMutation = trpc.products.create.useMutation({ onSuccess: () => { utils.products.list.invalidate(); onClose(); } });
  const pending = storeMutation.isPending || customerMutation.isPending || productMutation.isPending;
  const error = storeMutation.error || customerMutation.error || productMutation.error;
  const submit = (event: FormEvent) => { event.preventDefault(); if (type === "stores") storeMutation.mutate({ name: values.name, city: values.city, address: values.address }); else if (type === "customers") customerMutation.mutate({ firstName: values.firstName, lastName: values.lastName, email: values.email || undefined, phone: values.phone || undefined, city: values.city || undefined, measurements: values.measurements || undefined }); else productMutation.mutate({ name: values.name, category: values.category, basePrice: values.basePrice }); };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#20231f]/25 p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a1a39d]">Nouveau</p><h2 className="mt-1 font-display text-2xl font-semibold">{type === "stores" ? "Établissement" : type === "customers" ? "Client" : "Produit"}</h2></div><button onClick={onClose} aria-label="Fermer"><X size={18} className="text-[#92958d]" /></button></div><form onSubmit={submit} className="space-y-4">{type === "customers" ? <div className="grid gap-3 sm:grid-cols-2"><Input required placeholder="Prénom" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} /><Input required placeholder="Nom" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} /></div> : <Input required placeholder={type === "stores" ? "Nom de la boutique" : "Nom du produit"} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />}{type === "stores" && <><Input placeholder="Ville" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} /><Input placeholder="Adresse" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} /></>}{type === "customers" && <><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Téléphone" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} /><Input type="email" placeholder="E-mail" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} /></div><Input placeholder="Mensurations (ex. poitrine 92, taille 74, hanches 98)" value={values.measurements} onChange={(e) => setValues({ ...values, measurements: e.target.value })} /></>}{type === "products" && <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Catégorie" value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })} /><Input required type="number" min="0" step="0.01" placeholder="Prix en FCFA" value={values.basePrice} onChange={(e) => setValues({ ...values, basePrice: e.target.value })} /></div>}{error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{error.message}</p>}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">Annuler</Button><Button disabled={pending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white">{pending ? "Enregistrement…" : "Enregistrer"}</Button></div></form></div></div>;
}

function OrdersList() {
  const query = trpc.orders.list.useQuery();
  return <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.025)]"><CardHeader className="border-b border-[#f0f0eb] px-5 py-5 sm:px-6"><CardTitle className="font-display text-xl tracking-[-0.03em]">Commandes</CardTitle><p className="mt-1 text-xs text-[#969991]">Suivi des commandes de votre marque</p></CardHeader><CardContent className="p-0">{query.isLoading ? <div className="px-6 py-16 text-center text-sm text-[#9a9c95]">Chargement des commandes…</div> : query.isError ? <div className="px-6 py-16 text-center text-sm text-[#92958d]">Connectez votre espace de marque pour consulter les commandes.</div> : query.data?.length ? <div className="divide-y divide-[#f0f0eb]">{query.data.map((order) => <div key={order.id} className="flex items-center gap-4 px-5 py-4 sm:px-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee8ff] text-[#6954c6]"><Package size={16} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{order.reference}</p><p className="mt-1 text-xs text-[#979a92]">Client #{order.customerId} · Boutique #{order.storeId}</p></div><div className="text-right"><p className="text-sm font-semibold">{Number(order.totalAmount).toLocaleString("fr-FR")} FCFA</p><Badge variant="outline" className="mt-1 border-[#e4e5df] text-[10px]">{order.status}</Badge></div></div>)}</div> : <div className="px-6 py-16 text-center text-sm text-[#92958d]">Aucune commande enregistrée pour le moment.</div>}</CardContent></Card>;
}
