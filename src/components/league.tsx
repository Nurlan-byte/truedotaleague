import type { ReactNode } from "react";
import { STATUS_LABEL, type TournamentStatus } from "@/lib/league";

const STATUS_STYLE: Record<TournamentStatus, string> = {
  draft: "border-dashed border-muted-foreground/50 bg-white/60 text-muted-foreground",
  announced: "border-primary/30 bg-primary/10 text-primary",
  registration_open: "border-win/40 bg-win/15 text-win",
  registration_closed: "border-border bg-secondary text-secondary-foreground",
  live: "border-destructive/40 bg-destructive/10 text-destructive",
  finished: "border-accent/40 bg-accent/15 text-foreground",
  cancelled: "border-destructive/40 bg-white/70 text-destructive line-through decoration-1",
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLE[status]}`}
    >
      {status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-destructive" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Картинка турнира или фирменная заглушка TDL. */
export function TournamentImage({
  src,
  title,
  className = "",
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  if (src) {
    return <img src={src} alt={title} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div
      aria-label={title}
      className={`flex items-center justify-center bg-gradient-to-br from-primary to-primary/60 font-display tracking-widest text-primary-foreground ${className}`}
    >
      TDL
    </div>
  );
}

/** Безопасный рендер markdown: только текст через React, без сырого HTML. */
export function SafeMarkdown({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const inline = (text: string): ReactNode[] =>
    text
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      );
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) {
          const cls = h[1].length === 1 ? "text-2xl" : h[1].length === 2 ? "text-xl" : "text-lg";
          return (
            <p key={i} className={`font-display ${cls} text-foreground`}>
              {inline(h[2])}
            </p>
          );
        }
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>
          ));
          return ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

export function LoadingPanel({ text = "Загружаем…" }: { text?: string }) {
  return <div className="panel p-5 text-sm text-muted-foreground">{text}</div>;
}
