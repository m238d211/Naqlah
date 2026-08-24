export async function downloadPrivateFile(url: string, filename: string, onProgress?: (percentage: number) => void): Promise<void> {
  window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "active", percentage: 0, filename } }));
  const downloadUrl = new URL(url);
  downloadUrl.searchParams.set("download", "1");
  const anchor = document.createElement("a");
  anchor.href = downloadUrl.toString();
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  onProgress?.(100);
  window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "download", status: "complete", percentage: 100, filename } }));
}
