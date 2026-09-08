import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_LABELS } from "@/const";
import { trpc } from "@/lib/trpc";
import { LifeBuoy, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Support() {
  const utils = trpc.useUtils();
  const ticketsQuery = trpc.support.listMine.useQuery();
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const respond = trpc.support.respond.useMutation({
    onSuccess: () => {
      utils.support.listMine.invalidate();
      setReply("");
      setReplyFor(null);
      toast.success("Réponse envoyée.");
    },
  });
  const close = trpc.support.close.useMutation({ onSuccess: () => utils.support.listMine.invalidate() });

  const tickets = ticketsQuery.data ?? [];

  return (
    <AppShell title="Assistance" subtitle="Historique de vos demandes d’aide — le bouton Assistance en bas à droite permet d’en ouvrir une nouvelle avec le contexte de la page.">
      {tickets.length === 0 ? (
        <Card className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
          <CardContent className="px-5 py-16 text-center">
            <LifeBuoy size={22} className="mx-auto mb-3 text-[#9a9c95]" />
            <p className="text-sm font-semibold">Aucune demande d’aide</p>
            <p className="mt-1 text-xs text-[#9a9c95]">Le bouton « Assistance » est visible en permanence en bas à droite de chaque page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="border-[#e8e8e2] shadow-[0_8px_30px_rgba(43,45,37,0.03)]">
              <CardHeader className="border-b border-[#f0f0eb] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-display text-base font-semibold tracking-[-0.02em]">{ticket.subject}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={`border-0 text-[9px] font-bold ${ticket.status === "ferme" || ticket.status === "resolu" ? "bg-[#e2f4ee] text-[#2d8a70]" : "bg-[#fff0db] text-[#c27b2c]"}`}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
                    {ticket.status !== "ferme" && ticket.status !== "resolu" && (
                      <Button variant="outline" size="sm" onClick={() => close.mutate({ ticketId: ticket.id })} className="rounded-lg text-[10px]">Marquer résolue</Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-[#969991]">{new Date(ticket.createdAt).toLocaleString("fr-FR")} · page : <span className="font-mono">{ticket.pageUrl ?? "/"}</span></p>
              </CardHeader>
              <CardContent className="space-y-2 px-5 py-4">
                <p className="rounded-2xl bg-[#f7f7f5] px-4 py-3 text-xs leading-relaxed">{ticket.message}</p>
                {(replyFor === ticket.id ? (
                  <div className="space-y-2">
                    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Préciser votre demande…" className="rounded-xl text-xs" />
                    <div className="flex gap-2">
                      <Button disabled={!reply.trim() || respond.isPending} onClick={() => respond.mutate({ ticketId: ticket.id, message: reply })} className="rounded-xl bg-[#20231f] text-[11px] text-white"><Send size={12} className="mr-1" /> Envoyer</Button>
                      <Button variant="outline" onClick={() => { setReplyFor(null); setReply(""); }} className="rounded-xl text-[11px]">Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setReplyFor(ticket.id)} className="rounded-lg text-[11px]"><MessageSquare size={12} className="mr-1" /> Répondre / ajouter un détail</Button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
