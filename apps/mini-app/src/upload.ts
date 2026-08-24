import { upload as uploadBlob } from "@vercel/blob/client";

type UploadOptions = Parameters<typeof uploadBlob>[2];
type ProgressCallback = Exclude<UploadOptions["onUploadProgress"], undefined>;

export async function upload(
  pathname: Parameters<typeof uploadBlob>[0],
  file: Parameters<typeof uploadBlob>[1],
  options: UploadOptions,
) {
  const originalProgress = options?.onUploadProgress;
  const filename = typeof file === "object" && file && "name" in file ? String(file.name) : "file";
  const nextOptions = {
    ...options,
    onUploadProgress: (event: Parameters<ProgressCallback>[0]) => {
      window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "upload", status: "active", percentage: Math.round(event.percentage), filename } }));
      originalProgress?.(event);
    },
  } as UploadOptions;
  try {
    const result = await uploadBlob(pathname, file, nextOptions);
    window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "upload", status: "complete", percentage: 100, filename } }));
    return result;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("naqlah:transfer", { detail: { direction: "upload", status: "failed", percentage: 0, filename } }));
    throw error;
  }
}
