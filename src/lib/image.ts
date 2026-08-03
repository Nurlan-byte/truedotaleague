/** Reads an image file and returns a small square data URL suitable for localStorage. */
export async function fileToLogoDataUrl(file: File, size = 96): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Файл не является изображением");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Файл слишком большой (макс. 10 МБ)");
  }

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

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  return canvas.toDataURL("image/jpeg", 0.8);
}
