import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, LockKeyhole, Mail, User } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const demoAccounts = [
  { label: "Propriétaire DISTINCTION", email: "proprietaire@distinction.tg" },
  { label: "Chef d’atelier", email: "chef.atelier@distinction.tg" },
  { label: "Comptable", email: "comptable@distinction.tg" },
  { label: "Vendeuse", email: "vendeuse@distinction.tg" },
  { label: "Administration ENVOL", email: "admin@envol.africa" },
];

export default function Login() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [pending, setPending] = useState(false);

  const saveToken = (data?: { token?: string }) => {
    if (!data?.token) return;
    try {
      localStorage.setItem("app_session_token", data.token);
    } catch {
      /* stockage indisponible : le cookie reste utilisé */
    }
  };

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      saveToken(data);
      await utils.auth.me.invalidate();
      toast.success("Connexion réussie. Bienvenue !");
      navigate("/", { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  const register = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      saveToken(data);
      await utils.auth.me.invalidate();
      toast.success("Compte créé. Bienvenue sur AtelierManager !");
      navigate("/", { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    if (mode === "login") {
      login.mutate({ email: values.email, password: values.password }, { onSettled: () => setPending(false) });
    } else {
      register.mutate({ name: values.name, email: values.email, password: values.password }, { onSettled: () => setPending(false) });
    }
  };

  const fillDemo = (email: string) => {
    setMode("login");
    setValues({ name: "", email, password: email === "admin@envol.africa" ? "envol2026" : "demo2026" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5] lg:flex-row">
      {/* Colonne présentation */}
      <div className="relative hidden flex-1 overflow-hidden bg-[#20231f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white font-display text-lg font-semibold text-[#20231f]">A</div>
          <div>
            <p className="font-display text-lg font-semibold">AtelierManager</p>
            <p className="text-xs text-white/60">ENVOL AFRICA GROUPE</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-md font-display text-4xl font-semibold leading-tight tracking-tight">
            Toute votre marque de couture, réunie dans un seul outil.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            Ventes en boutique, caisse multidevises, atelier et production, achats de fournitures, trésorerie, personnel, parrainage et boutique en ligne — sans multiplier les cahiers ni les applications.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center">
            {["Caisse multidevises", "Paye à la tâche", "Circuit d’achats"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-[11px] font-semibold text-white/80">
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-white/40">Plateforme SaaS de gestion pour les marques de mode africaines.</p>
      </div>

      {/* Colonne formulaire */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#20231f] font-display text-lg font-semibold text-white">A</div>
            <div>
              <p className="font-display text-lg font-semibold">AtelierManager</p>
              <p className="text-[11px] text-[#858880]">ENVOL AFRICA GROUPE</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#e8e8e2] bg-white p-1.5">
            {(["login", "register"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${mode === key ? "bg-[#20231f] text-white" : "text-[#81847c] hover:bg-[#f1f1ed]"}`}
              >
                {key === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3 rounded-3xl border border-[#e8e8e2] bg-white p-6 shadow-[0_8px_30px_rgba(43,45,37,0.04)]">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.03em]">{mode === "login" ? "Content de vous revoir" : "Nouvelle marque ?"}</h2>
            <p className="mb-2 text-xs text-[#858880]">
              {mode === "login" ? "Connectez-vous pour accéder à votre espace de gestion." : "Créez votre compte, puis enregistrez votre marque (essai gratuit 30 jours)."}
            </p>
            {mode === "register" && (
              <div className="relative">
                <User size={15} className="absolute left-3 top-3 text-[#a6a8a1]" />
                <Input required placeholder="Votre nom complet" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            )}
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-3 text-[#a6a8a1]" />
              <Input required type="email" placeholder="Adresse e-mail" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="h-10 rounded-xl pl-9 text-sm" />
            </div>
            <div className="relative">
              <LockKeyhole size={15} className="absolute left-3 top-3 text-[#a6a8a1]" />
              <Input required type="password" minLength={8} placeholder="Mot de passe (8 caractères min.)" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} className="h-10 rounded-xl pl-9 text-sm" />
            </div>
            <Button disabled={pending} type="submit" className="h-10 w-full rounded-xl bg-[#20231f] text-sm font-semibold text-white hover:bg-[#353832]">
              {pending ? <Loader2 size={16} className="mx-auto animate-spin" /> : (
                <>
                  {mode === "login" ? "Se connecter" : "Créer mon compte"}
                  <ArrowRight size={15} className="ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 rounded-3xl border border-dashed border-[#d9d7d0] bg-white/60 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a1a39d]">Comptes de démonstration</p>
            <p className="mt-1 text-[11px] text-[#858880]">Cliquez pour remplir le formulaire (mot de passe inclus).</p>
            <div className="mt-3 space-y-1.5">
              {demoAccounts.map((account) => (
                <button key={account.email} onClick={() => fillDemo(account.email)} className="flex w-full items-center justify-between rounded-xl border border-[#ececea] bg-white px-3 py-2 text-left text-[11px] font-semibold text-[#40433d] transition hover:border-[#20231f]">
                  <span>{account.label}</span>
                  <span className="font-mono text-[10px] font-normal text-[#969991]">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
