/** Reads an image file and returns a small square data URL suitable for localStorage. */

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const ALLOWED_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 МБ

export function validateLogoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const extOk = ALLOWED_EXTS.some((ext) => name.endsWith(ext));
  const typeOk = ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number]);

  if (!typeOk && !extOk) {
    return "Поддерживаются только форматы PNG, JPG и WebP.";
  }

  if (file.size === 0) {
    return "Файл пустой — выберите другое изображение.";
  }

  if (file.size > MAX_SIZE) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `Файл слишком большой (${mb} МБ). Максимум — 10 МБ.`;
  }

  return null;
}

export async function fileToLogoDataUrl(file: File, size = 128): Promise<string> {
  const err = validateLogoFile(file);
  if (err) throw new Error(err);

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Не удалось открыть изображение"));
    el.src = dataUrl;
  });

  // Рисуем ровно size×size: масштаб по меньшей стороне (cover), центрируем.
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Белый фон — чтобы прозрачные PNG не становились чёрными при JPEG-экспорте.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  return canvas.toDataURL("image/jpeg", 0.85);
}
