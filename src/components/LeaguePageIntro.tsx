import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function LeaguePageIntro({ eyebrow, title, description, actions, children }: Props) {
  return (
    <header className="panel overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-4xl leading-none text-foreground sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function QueryFeedback({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div className="panel p-6 text-sm text-muted-foreground" role={retry ? "alert" : "status"}>
      <p>{text}</p>
      {retry && (
        <button type="button" onClick={retry} className="mt-3 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          Повторить
        </button>
      )}
    </div>
  );
}
