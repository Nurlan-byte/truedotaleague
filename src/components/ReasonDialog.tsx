import { useCallback, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Ask = { title: string; description?: ReactNode; required?: boolean; confirmLabel?: string; withReason?: boolean };

/** Диалог подтверждения с полем причины. ask() → строка (может быть пустой) или null при отмене. */
export function useReasonDialog() {
  const [state, setState] = useState<Ask | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((a: Ask) => {
    setText("");
    setState({ withReason: true, ...a });
    return new Promise<string | null>((res) => {
      resolver.current = res;
    });
  }, []);

  const close = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && close(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.description && <DialogDescription asChild><div>{state.description}</div></DialogDescription>}
        </DialogHeader>
        {state?.withReason && (
          <textarea
            autoFocus
            className="min-h-24 w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder={state.required ? "Причина (обязательно)" : "Причина (необязательно)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <button className="rounded-lg border border-border bg-white/70 px-4 py-2 text-sm font-semibold" onClick={() => close(null)}>
            Отмена
          </button>
          <button
            disabled={!!state?.required && !text.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            onClick={() => close(text.trim())}
          >
            {state?.confirmLabel ?? "Подтвердить"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
