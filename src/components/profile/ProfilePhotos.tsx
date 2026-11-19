import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ImagePlus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { validateLogoFile } from "@/lib/image";

type Photo = { id: string; image_url: string; caption: string; created_at: string };

async function compress(file: File, max = 1080): Promise<string> {
  const err = validateLogoFile(file);
  if (err) throw new Error(err);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image(); el.onload = () => res(el); el.onerror = () => rej(new Error("Не удалось открыть изображение")); el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function ProfilePhotos({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [staff, setStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => supabase.from("profile_photos").select("id,image_url,caption,created_at").eq("profile_id", profileId)
    .order("created_at", { ascending: false }).then(({ data }) => setPhotos((data ?? []) as Photo[]));
  useEffect(() => { void load(); }, [profileId]);
  useEffect(() => {
    if (!user) { setStaff(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "moderator"])
      .then(({ data }) => setStaff(!!data?.length));
  }, [user]);

  const upload = async (file: File) => {
    setErr(null); setBusy(true);
    try {
      const dataUrl = await compress(file);
      const caption = window.prompt("Подпись к фото (необязательно)") ?? "";
      const { error } = await supabase.rpc("add_profile_photo", { p_profile_id: profileId, p_image_url: dataUrl, p_caption: caption });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = async (id: string) => {
    if (!confirm("Удалить фото?")) return;
    const { error } = await supabase.rpc("delete_profile_photo", { p_photo_id: id });
    if (error) setErr(error.message); else { setOpen(null); void load(); }
  };

  if (!photos.length && !staff) return null;
  return (
    <section className="panel mt-6 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          Фотографии
          {photos.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" />Верифицирован</span>}
        </h2>
        {staff && (
          <>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button className="btn btn-primary inline-flex items-center gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />{busy ? "Загрузка…" : "Добавить фото"}
            </button>
          </>
        )}
      </div>
      {err && <p className="mb-3 text-sm text-destructive">{err}</p>}
      {photos.length ? (
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="group relative aspect-square overflow-hidden rounded-md bg-muted">
              <img src={p.image_url} alt={p.caption || "Скриншот аккаунта"} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Фото пока нет. Добавьте скриншоты аккаунта для верификации.</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" onClick={() => setOpen(null)}>
          <div className="panel relative max-h-full w-full max-w-2xl overflow-auto p-2" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 rounded-full bg-background/80 p-1" onClick={() => setOpen(null)} aria-label="Закрыть"><X className="h-5 w-5" /></button>
            <img src={open.image_url} alt={open.caption || "Скриншот"} className="w-full rounded-md" />
            <div className="flex items-start justify-between gap-2 p-2">
              <div>
                {open.caption && <p className="text-sm">{open.caption}</p>}
                <p className="text-xs text-muted-foreground">{new Date(open.created_at).toLocaleDateString("ru-RU")}</p>
              </div>
              {staff && <button className="btn btn-danger inline-flex items-center gap-1" onClick={() => remove(open.id)}><Trash2 className="h-4 w-4" />Удалить</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
