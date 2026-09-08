import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bot, Check, CheckCheck, Copy, Facebook, Instagram, MessageCircle, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const CHANNEL_BADGES: Record<string, { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-green-100 text-green-800" },
  facebook: { label: "Facebook", className: "bg-blue-100 text-blue-800" },
  instagram: { label: "Instagram", className: "bg-pink-100 text-pink-800" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  brouillon: { label: "Brouillon", className: "bg-amber-100 text-amber-800" },
  approuve: { label: "Approuvé", className: "bg-blue-100 text-blue-800" },
  publie: { label: "Publié", className: "bg-green-100 text-green-800" },
  rejete: { label: "Rejeté", className: "bg-gray-100 text-gray-600" },
};

type Tab = "publications" | "messages" | "journal";

export default function Assistant() {
  const utils = trpc.useUtils();
  const settings = trpc.assistant.settings.useQuery();
  const posts = trpc.assistant.listPosts.useQuery();
  const inbox = trpc.assistant.inbox.useQuery();
  const products = trpc.assistant.products.useQuery();

  const [tab, setTab] = useState<Tab>("publications");
  const [channel, setChannel] = useState<"whatsapp" | "facebook" | "instagram">("whatsapp");
  const [kind, setKind] = useState<"produit" | "promo" | "nouvelle_collection" | "reactivation">("produit");
  const [productId, setProductId] = useState<string>("");
  const [autoResult, setAutoResult] = useState<{ message: string; actions: Array<{ type: string; detail: string }> } | null>(null);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const invalidateAll = () => {
    utils.assistant.listPosts.invalidate();
    utils.assistant.inbox.invalidate();
    utils.assistant.settings.invalidate();
  };

  const setMode = trpc.assistant.setMode.useMutation({
    onSuccess: () => {
      toast.success("Mode de l'assistant mis à jour.");
      utils.assistant.settings.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const autoRun = trpc.assistant.autoRun.useMutation({
    onSuccess: (data) => {
      setAutoResult({ message: data.message, actions: data.actions });
      invalidateAll();
    },
    onError: (error) => toast.error(error.message),
  });

  const generate = trpc.assistant.generatePost.useMutation({
    onSuccess: () => {
      toast.success("Publication générée — elle attend votre validation.");
      utils.assistant.listPosts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const approve = trpc.assistant.approvePost.useMutation({ onSuccess: () => utils.assistant.listPosts.invalidate(), onError: (e) => toast.error(e.message) });
  const reject = trpc.assistant.rejectPost.useMutation({ onSuccess: () => utils.assistant.listPosts.invalidate(), onError: (e) => toast.error(e.message) });
  const publish = trpc.assistant.publishNow.useMutation({ onSuccess: () => utils.assistant.listPosts.invalidate(), onError: (e) => toast.error(e.message) });
  const demoIncoming = trpc.assistant.demoIncoming.useMutation({
    onSuccess: () => {
      toast.success("Nouveau message client reçu.");
      utils.assistant.inbox.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const suggest = trpc.assistant.suggestReply.useQuery(
    { messageId: replyFor ?? 0 },
    { enabled: replyFor !== null },
  );
  const sendReply = trpc.assistant.sendReply.useMutation({
    onSuccess: () => {
      toast.success("Réponse envoyée.");
      setReplyFor(null);
      setReplyDraft("");
      utils.assistant.inbox.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Fils de discussion groupés par client (le plus récent d'abord).
  const threads = useMemo(() => {
    const messages = inbox.data ?? [];
    const map = new Map<string, typeof messages>();
    for (const message of messages) {
      const list = map.get(message.customerName) ?? [];
      list.push(message);
      map.set(message.customerName, list);
    }
    return [...map.entries()];
  }, [inbox.data]);

  const mode = settings.data?.mode ?? "brouillon";
  const modeInfo = settings.data?.modes.find((m) => m.value === mode);
  const unanswered = (inbox.data ?? []).filter((m) => m.direction === "entrant" && !((inbox.data ?? []).some((r) => r.direction === "sortant" && r.customerName === m.customerName)));

  return (
    <AppShell
      title="Assistant Commercial & Marketing IA"
      subtitle="Publications WhatsApp / Facebook / Instagram et réponses aux clients — générées à partir de vos vraies données."
      actions={
        <Button onClick={() => autoRun.mutate({})} disabled={autoRun.isPending} className="bg-violet-600 hover:bg-violet-700 text-white">
          <Bot className="mr-2 h-4 w-4" /> Lancer l'assistant maintenant
        </Button>
      }
    >
      <div className="space-y-6">

        {autoResult && (
          <Card className="border-violet-200 bg-violet-50">
            <CardContent className="pt-4">
              <p className="font-medium text-violet-900">{autoResult.message}</p>
              {autoResult.actions.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-violet-800">
                  {autoResult.actions.map((action, index) => (
                    <li key={index}>• {action.detail}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Modes de fonctionnement */}
        <div className="grid gap-3 md:grid-cols-3">
          {(settings.data?.modes ?? []).map((option) => (
            <button
              key={option.value}
              onClick={() => setMode.mutate({ mode: option.value })}
              disabled={setMode.isPending}
              className={`rounded-xl border p-4 text-left transition ${mode === option.value ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : "border-[#e4e4de] bg-white hover:border-violet-300"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{option.label}</span>
                {mode === option.value && <Check className="h-4 w-4 text-violet-600" />}
              </div>
              <p className="mt-1 text-xs text-[#858880]">{option.description}</p>
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-[#858880]">
          Mode actif : <span className="font-semibold text-[#20231f]">{modeInfo?.label ?? mode}</span>. Le journal de toutes les actions automatiques se trouve dans l'onglet « Journal ».
        </p>

        {/* Onglets */}
        <div className="flex gap-2">
          {(["publications", "messages", "journal"] as Tab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${tab === value ? "bg-[#20231f] text-white" : "bg-[#f1f1ed] text-[#20231f] hover:bg-[#e4e4de]"}`}
            >
              {value}
              {value === "messages" && unanswered.length > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white">{unanswered.length}</span>}
            </button>
          ))}
        </div>

        {tab === "publications" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1 h-fit">
              <CardHeader>
                <CardTitle className="text-base">Générer une publication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#858880]">Canal</label>
                  <div className="flex gap-2">
                    {(["whatsapp", "facebook", "instagram"] as const).map((value) => (
                      <button
                        key={value}
                        onClick={() => setChannel(value)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${channel === value ? "border-violet-500 bg-violet-50 text-violet-800" : "border-[#e4e4de] hover:bg-[#f1f1ed]"}`}
                      >
                        {value === "whatsapp" ? <MessageCircle className="h-3.5 w-3.5" /> : value === "facebook" ? <Facebook className="h-3.5 w-3.5" /> : <Instagram className="h-3.5 w-3.5" />}
                        {CHANNEL_BADGES[value].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#858880]">Type de publication</label>
                  <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="produit">Mise en avant produit</SelectItem>
                      <SelectItem value="promo">Promotion / parrainage</SelectItem>
                      <SelectItem value="nouvelle_collection">Nouvelle collection</SelectItem>
                      <SelectItem value="reactivation">Relance des clients</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {kind === "produit" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#858880]">Produit</label>
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger><SelectValue placeholder="Choix automatique" /></SelectTrigger>
                      <SelectContent>
                        {(products.data ?? []).map((product) => (
                          <SelectItem key={product.id} value={String(product.id)}>
                            {product.name} {product.onlineAvailable > 0 ? "" : "(à fabriquer)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => generate.mutate({ channel, kind, productId: productId ? Number(productId) : undefined })}
                  disabled={generate.isPending}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Générer
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3 lg:col-span-2">
              {(posts.data ?? []).length === 0 && <Card><CardContent className="py-10 text-center text-sm text-[#858880]">Aucune publication pour le moment — générez la première !</CardContent></Card>}
              {(posts.data ?? []).map((post) => {
                const statusBadge = STATUS_BADGES[post.status] ?? STATUS_BADGES.brouillon;
                const channelBadge = CHANNEL_BADGES[post.channel] ?? CHANNEL_BADGES.whatsapp;
                return (
                  <Card key={post.id}>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={channelBadge.className}>{channelBadge.label}</Badge>
                        <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                        {post.publishedAt && <span className="text-xs text-[#858880]">Publié le {new Date(post.publishedAt).toLocaleString("fr-FR")}</span>}
                      </div>
                      <h3 className="mt-2 font-semibold">{post.title}</h3>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-[#fafaf7] p-3 font-sans text-sm text-[#3a3d37]">{post.content}</pre>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(post.content); toast.success("Texte copié."); }}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copier
                        </Button>
                        {post.status === "brouillon" && (
                          <>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approve.mutate({ id: post.id })}>
                              <Check className="mr-1 h-3.5 w-3.5" /> Approuver
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => publish.mutate({ id: post.id })}>
                              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Publier maintenant
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => reject.mutate({ id: post.id })}>
                              <X className="mr-1 h-3.5 w-3.5" /> Rejeter
                            </Button>
                          </>
                        )}
                        {post.status === "approuve" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => publish.mutate({ id: post.id })}>
                            <CheckCheck className="mr-1 h-3.5 w-3.5" /> Publier maintenant
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {tab === "messages" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => demoIncoming.mutate({})} disabled={demoIncoming.isPending}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Simuler un message client
              </Button>
            </div>
            {threads.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-[#858880]"> — cliquez sur « Simuler un message client » pour tester.</CardContent></Card>}
            {threads.map(([customerName, messages]) => (
              <Card key={customerName}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{customerName}</h3>
                    <Badge className={CHANNEL_BADGES[messages[0]?.channel ?? "whatsapp"].className}>{CHANNEL_BADGES[messages[0]?.channel ?? "whatsapp"].label}</Badge>
                  </div>
                  {[...messages].reverse().map((message) => (
                    <div key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.direction === "entrant" ? "bg-[#f1f1ed]" : "ml-auto bg-green-100"}`}>
                      {message.direction === "sortant" && (
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">{message.origin === "auto" ? "🤖 Réponse automatique" : "Vous"}</div>
                      )}
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </div>
                  ))}
                  {replyFor && messages.some((m) => m.id === replyFor) && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-800">
                        <Sparkles className="h-3.5 w-3.5" /> Suggestion de l'assistant
                      </div>
                      {suggest.isFetching ? (
                        <p className="text-sm text-[#858880]">Génération…</p>
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">{suggest.data?.suggestion}</pre>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setReplyFor(replyFor === messages.find((m) => m.direction === "entrant")?.id ? null : messages.find((m) => m.direction === "entrant")?.id ?? null); setReplyDraft(""); }}
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" /> Suggérer une réponse
                    </Button>
                    {replyFor && messages.some((m) => m.id === replyFor) && (
                      <>
                        <Textarea
                          value={replyDraft || suggest.data?.suggestion || ""}
                          onChange={(event) => setReplyDraft(event.target.value)}
                          rows={3}
                          className="w-full"
                          placeholder="Réponse à envoyer…"
                        />
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { const target = messages.find((m) => m.id === replyFor); if (target) sendReply.mutate({ messageId: target.id, body: replyDraft || suggest.data?.suggestion || "" }); }}
                          disabled={sendReply.isPending}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Envoyer
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === "journal" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Journal de l'assistant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#858880]">Actions automatiques (dernière exécution)</h4>
                {!autoResult && <p className="text-sm text-[#858880]">Lancez l'assistant pour voir ses actions ici.</p>}
                {autoResult && autoResult.actions.length === 0 && <p className="text-sm text-[#858880]">{autoResult.message}</p>}
                <ul className="space-y-1 text-sm">
                  {autoResult?.actions.map((action, index) => (
                    <li key={index} className="flex items-center gap-2">
                      {action.type === "publication" ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Bot className="h-3.5 w-3.5 text-violet-600" />} {action.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#858880]">Publications envoyées</h4>
                {(posts.data ?? []).filter((post) => post.status === "publie").length === 0 && <p className="text-sm text-[#858880]">Aucune publication encore publiée.</p>}
                <ul className="space-y-1 text-sm">
                  {(posts.data ?? []).filter((post) => post.status === "publie").map((post) => (
                    <li key={post.id}>
                      <span className="font-medium">{CHANNEL_BADGES[post.channel]?.label ?? post.channel}</span> — « {post.title} », {post.publishedAt ? new Date(post.publishedAt).toLocaleString("fr-FR") : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#858880]">Réponses automatiques envoyées</h4>
                {(inbox.data ?? []).filter((message) => message.origin === "auto").length === 0 && <p className="text-sm text-[#858880]">Aucune réponse automatique pour le moment.</p>}
                <ul className="space-y-1 text-sm">
                  {(inbox.data ?? []).filter((message) => message.origin === "auto").map((message) => (
                    <li key={message.id}>
                      <span className="font-medium">{message.customerName}</span> — réponse automatique ({message.channel}), {new Date(message.createdAt).toLocaleString("fr-FR")}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
