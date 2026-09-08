import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CircleHelp, Send, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

/**
 * Bouton d'assistance permanent (point 12 de la présentation) : visible sur
 * toutes les pages, le contexte de la page courante est pré-rempli.
 */
export default function SupportButton({ floating = true }: { floating?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();

  const createTicket = trpc.support.create.useMutation({
    onSuccess: () => {
      utils.support.listMine.invalidate();
      setOpen(false);
      setSubject("");
      setMessage("");
      toast.success("Demande envoyée à l’équipe support.");
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    createTicket.mutate({ subject: subject || "Demande d’aide", message, pageUrl: location });
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className={
          floating
            ? "fixed bottom-5 right-5 z-40 h-11 rounded-full border-[#e4e2dc] bg-white px-4 text-xs font-semibold text-[#20231f] shadow-[0_8px_24px_rgba(43,45,37,0.14)] hover:bg-[#faf9f6]"
            : "h-9 rounded-xl border-[#e4e2dc] text-xs font-semibold"
        }
      >
        <CircleHelp size={16} className={floating ? "mr-2 text-[#6954c6]" : "mr-2"} />
        Assistance
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl border-[#e8e8e2] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold">Demander de l’aide</DialogTitle>
            <p className="mt-1 text-xs text-[#858880]">Contexte de la page : <span className="font-mono text-[11px]">{location || "/"}</span></p>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Input placeholder="Sujet (ex. Je n’arrive pas à encaisser)" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea required placeholder="Décrivez votre problème…" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
            {createTicket.error && <p className="rounded-xl bg-[#fff0ed] px-3 py-2 text-xs text-[#b4604e]">{createTicket.error.message}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl text-xs">
                Annuler
              </Button>
              <Button disabled={createTicket.isPending} type="submit" className="rounded-xl bg-[#20231f] text-xs text-white hover:bg-[#353832]">
                <Send size={14} className="mr-2" />
                {createTicket.isPending ? "Envoi…" : "Envoyer la demande"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
