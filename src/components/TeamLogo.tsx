type Props = {
  name: string;
  logo?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "size-5 text-[9px]",
  md: "size-8 text-xs",
  lg: "size-12 text-sm",
};

export function TeamLogo({ name, logo, size = "sm" }: Props) {
  const cls = `${sizes[size]} shrink-0 overflow-hidden rounded-full border border-border bg-white/70 object-cover`;

  if (logo && logo.trim() !== "") {
    return <img src={logo} alt={`Логотип ${name}`} loading="lazy" className={cls} />;
  }

  return (
    <span
      className={`${cls} inline-flex items-center justify-center font-bold uppercase text-muted-foreground`}
      aria-hidden="true"
    >
      {name.slice(0, 2)}
    </span>
  );
}
