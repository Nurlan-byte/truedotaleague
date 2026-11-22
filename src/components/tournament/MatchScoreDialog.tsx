import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rpcErrorText, type MatchRow } from "@/lib/league";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function MatchScoreDialog({ match, nameA, nameB, onClose }: { match: MatchRow; nameA: string; nameB: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState(String(match.score_a ?? ""));
  const [b, setB] = useState(String(match.score_b ?? ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const correction = match.score_a !== null || match.score_b !== null;
  async function save() {
    const sa = Number(a), sb = Number(b);
    if (!a.trim() || !b.trim() || !Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0) {
      setError("Введите оба счёта — целые числа ≥ 0"); return;
    }
    if (correction && !reason.trim()) { setError("Укажите причину исправления результата"); return; }
    setBusy(true); setError("");
    try {
      const result = await supabase.rpc("set_match_score", { p_match_id: match.id, p_score_a: sa, p_score_b: sb, ...(reason.trim() ? { p_reason: reason.trim() } : {}) });
      if (result.error) { setError(rpcErrorText(result.error)); return; }
      void qc.invalidateQueries({ queryKey: ["league"] });
      toast.success("Счёт сохранён"); onClose();
    } catch { setError("Не удалось сохранить счёт. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Результат матча</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3">
          <Label htmlFor="match-score-a" className="break-words">{nameA}</Label>
          <Input id="match-score-a" aria-label={`${nameA}: счёт`} inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} disabled={busy} />
          <Label htmlFor="match-score-b" className="break-words">{nameB}</Label>
          <Input id="match-score-b" aria-label={`${nameB}: счёт`} inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} disabled={busy} />
        </div>
        {correction && <div className="space-y-2"><Label htmlFor="match-score-reason">Причина исправления</Label><Textarea id="match-score-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button><Button type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить счёт"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}