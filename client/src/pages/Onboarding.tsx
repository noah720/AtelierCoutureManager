import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Store, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const PLANS = [
  { id: "boutique", label: "Boutique", price: "50 000 F CFA / mois", description: "Ventes, clients, stock et trésorerie d'une boutique." },
  { id: "atelier_boutique", label: "Atelier + Boutique", price: "150 000 F CFA / mois", description: "Ajoute la production à la tâche et le personnel." },
  { id: "complet", label: "Formule complète", price: "250 000 F CFA / mois", description: "Tout inclus : boutique en ligne, achats, comptabilité, assistant IA." },
] as const;

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * Parcours d'accueil des nouvelles marques (point 15) : trois étapes —
 * identité de la marque, premier point de vente, récapitulatif — puis
 * essai gratuit de 30 jours sur la formule choisie.
 */
export default function Onboarding() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);

  const [brandName, setBrandName] = useState("");
  const [country, setCountry] = useState("Togo");
  const [sector, setSector] = useState("Couture");
  const [plan, setPlan] = useState<(typeof PLANS)[number]["id"]>("boutique");
  const [storeName, setStoreName] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [currency, setCurrency] = useState<"XOF" | "XAF" | "USD" | "EUR">("XOF");

  const slug = useMemo(
    () => brandName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ma-marque",
    [brandName],
  );

  const createOrganization = trpc.organization.create.useMutation();
  const createStore = trpc.stores.create.useMutation();

  const submitting = createOrganization.isPending || createStore.isPending;

  const finish = async () => {
    try {
      await createOrganization.mutateAsync({ name: brandName, slug, country, sector, plan });
      await utils.organization.current.invalidate();
      if (storeName.trim()) {
        await createStore.mutateAsync({ name: storeName, kind: "boutique", city: storeCity || undefined, currency });
        await utils.stores.list.invalidate();
      }
      toast.success("Votre marque est prête — essai gratuit de 30 jours !");
      navigate("/");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#20231f] font-display text-base font-semibold text-white">A</div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Bienvenue sur AtelierManager</p>
            <p className="text-xs text-[#858880]">Créez votre marque en 3 étapes — 30 jours d'essai gratuit, sans engagement.</p>
          </div>
        </div>

        {/* Progression */}
        <div className="mb-6 flex items-center gap-2">
          {["Votre marque", "Premier point de vente", "C'est parti"].map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step > index ? "bg-[#2d8a70] text-white" : step === index ? "bg-[#20231f] text-white" : "bg-[#e8e8e2] text-[#969991]"}`}>{step > index + 0 ? "✓" : index + 1}</div>
              <span className={`hidden text-xs font-semibold sm:block ${step === index ? "text-[#20231f]" : "text-[#969991]"}`}>{label}</span>
              {index < 2 && <div className={`h-0.5 flex-1 ${step > index ? "bg-[#2d8a70]" : "bg-[#e8e8e2]"}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-[#e8e8e2] bg-white p-6 shadow-[0_8px_30px_rgba(43,45,37,0.04)]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#60635c]">Nom de votre marque *</label>
                <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Ex. Maison Ada Couture" />
                {brandName && <p className="mt-1 text-[11px] text-[#969991]">Votre vitrine en ligne sera : /boutique/{slug}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#60635c]">Pays</label>
                  <Input value={country} onChange={(event) => setCountry(event.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#60635c]">Secteur</label>
                  <Input value={sector} onChange={(event) => setSector(event.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#60635c]">Formule (changeable à tout moment)</label>
                <div className="space-y-2">
                  {PLANS.map((option) => (
                    <button key={option.id} onClick={() => setPlan(option.id)} className={`w-full rounded-xl border p-3 text-left transition ${plan === option.id ? "border-[#20231f] bg-[#f7f7f5] ring-1 ring-[#20231f]" : "border-[#e4e5df] hover:bg-[#fafaf7]"}`}>
                      <div className="flex items-center justify-between text-sm font-semibold">
                        {option.label}
                        <span className="text-xs text-[#60635c]">{option.price}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#969991]">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full rounded-xl bg-[#20231f] text-white hover:bg-[#353832]" disabled={brandName.trim().length < 2} onClick={() => setStep(1)}>
                Continuer
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Store size={16} className="text-[#2d8a70]" /> Votre premier point de vente
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#60635c]">Nom de la boutique *</label>
                <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Ex. Boutique Adjamé" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#60635c]">Ville</label>
                  <Input value={storeCity} onChange={(event) => setStoreCity(event.target.value)} placeholder="Ex. Abidjan" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#60635c]">Devise</label>
                  <select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)} className="w-full rounded-xl border border-[#e4e5df] bg-white px-3 py-2 text-sm">
                    <option value="XOF">XOF — Franc CFA (UEMOA)</option>
                    <option value="XAF">XAF — Franc CFA (CEMAC)</option>
                    <option value="USD">USD — Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
              </div>
              <p className="rounded-xl bg-[#f7f7f5] p-3 text-[11px] text-[#969991]">
                Tout est configurable plus tard : autres boutiques, horaires du personnel avec majoration de 20 % hors créneau, zones de livraison, code de parrainage…
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(0)}>Retour</Button>
                <Button className="flex-1 rounded-xl bg-[#20231f] text-white hover:bg-[#353832]" disabled={storeName.trim().length < 2} onClick={() => setStep(2)}>
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={16} className="text-[#2d8a70]" /> Tout est prêt — récapitulatif
              </div>
              <div className="space-y-2 rounded-2xl bg-[#f7f7f5] p-4 text-sm">
                <p><span className="text-[#969991]">Marque :</span> <span className="font-semibold">{brandName}</span></p>
                <p><span className="text-[#969991]">Formule :</span> <span className="font-semibold">{PLANS.find((option) => option.id === plan)?.label}</span> <span className="text-xs text-[#969991]">({PLANS.find((option) => option.id === plan)?.price}, 30 j d'essai)</span></p>
                <p><span className="text-[#969991]">Point de vente :</span> <span className="font-semibold">{storeName}{storeCity ? ` — ${storeCity}` : ""}</span> <span className="text-xs text-[#969991]">({currency})</span></p>
                {plan === "complet" && <p className="text-xs text-[#2d8a70]">La boutique en ligne publique sera active immédiatement.</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(1)}>Retour</Button>
                <Button className="flex-1 rounded-xl bg-[#20231f] text-white hover:bg-[#353832]" disabled={submitting} onClick={finish}>
                  <UserPlus size={15} className="mr-2" /> {submitting ? "Création…" : "Créer ma marque"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-[#969991]">
          {DAYS.join(" · ")} — vos horaires d'ouverture pourront être définis par employé après la création.
        </p>
      </div>
    </div>
  );
}
