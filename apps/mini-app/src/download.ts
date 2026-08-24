export async function downloadPrivateFile(url: string, filename: string, onProgress?: (percentage: number) => void): Promise<void> {
  window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "active", percentage: 0, filename } }));
  const response = await fetch(url);
  if (!response.ok) throw new Error("تعذر تنزيل الملف من التخزين الخاص");
  const total = Number(response.headers.get("content-length") || 0);
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(100);
    await saveBlob(blob, filename);
    window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "complete", percentage: 100, filename } }));
    return;
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(new Uint8Array(chunk.value).slice().buffer as ArrayBuffer);
    loaded += chunk.value.byteLength;
    const percentage = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
    onProgress?.(percentage);
    window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "active", percentage, filename } }));
  }
  onProgress?.(100);
  await saveBlob(new Blob(chunks, { type: response.headers.get("content-type") || undefined }), filename);
  window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "complete", percentage: 100, filename } }));
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "naqlah-file";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = safeName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
