import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { upload as blobUpload } from "./upload";
import { authorizeUpload, closePairing, confirmDownloaded, createPairing, getPairing, regenerate, requestDownload, sendText, sendUrl, transfers, uploadHandleUrl } from "./api";
import type { PairingSessionView, PairingStatusView, TransferView } from "@naqlah/shared-types";
import { connectRealtime } from "./realtime";
import { downloadPrivateFile } from "./download";

type IconName = "file" | "link" | "copy" | "refresh";
function Icon({ name }: { name: IconName }) { const path = name === "file" ? "M6 3h8l4 4v14H6zM14 3v5h5" : name === "link" ? "M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10 6" : name === "copy" ? "M9 9h10v10H9zM5 5h10v4" : "M20 11a8 8 0 1 0 1 4"; return <svg aria-hidden="true" viewBox="0 0 24 24" className="icon"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function Senders({ id }: { id: string }) {
  const [text, setText] = useState(""), [url, setUrl] = useState(""), [busy, setBusy] = useState(false);
  const send = (action: () => Promise<unknown>, clear: () => void) => { setBusy(true); action().then(() => { clear(); toast.success("تم الإرسال إلى الهاتف"); }).catch((error) => toast.error(errorMessage(error, "تعذر الإرسال"))).finally(() => setBusy(false)); };
  const upload = async (file: File) => { setBusy(true); try { const auth = await authorizeUpload(id, { filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size }); await blobUpload(auth.blobPath, file, { access: "private", handleUploadUrl: uploadHandleUrl(), clientPayload: JSON.stringify({ transferId: auth.transferId }), headers: { Authorization: `Bearer ${sessionStorage.getItem("naqlah_device_token") || ""}` }, contentType: file.type || "application/octet-stream", onUploadProgress: (event) => { if (event.percentage >= 99) toast.info("جارٍ تأكيد رفع الملف…"); } }); toast.success("اكتمل رفع الملف إلى الهاتف"); } catch (error) { toast.error(errorMessage(error, "فشل رفع الملف")); } finally { setBusy(false); } };
  return <section className="senders"><div className="panel composer-card"><div className="card-title"><span className="card-icon blue"><Icon name="copy" /></span><div><h2>إرسال نص</h2><p>انسخ ملاحظة أو رسالة إلى الهاتف</p></div></div><label htmlFor="web-text">النص</label><textarea id="web-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="اكتب شيئاً لإرساله…" maxLength={100000} /><button type="button" disabled={busy || !text.trim()} onClick={() => send(() => sendText(id, text), () => setText(""))}>إرسال النص</button></div><div className="panel composer-card"><div className="card-title"><span className="card-icon amber"><Icon name="link" /></span><div><h2>إرسال رابط</h2><p>افتح الرابط مباشرة على الهاتف</p></div></div><label htmlFor="web-url">الرابط</label><input id="web-url" type="url" dir="ltr" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" /><button type="button" disabled={busy || !url.trim()} onClick={() => send(() => sendUrl(id, url), () => setUrl(""))}>إرسال الرابط</button></div><div className="panel composer-card"><div className="card-title"><span className="card-icon green"><Icon name="file" /></span><div><h2>إرسال ملف</h2><p>ملفات حتى 100 ميجابايت</p></div></div><label htmlFor="web-file">اختر ملفاً</label><input id="web-file" type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><p className="hint">يتم رفع الملف مباشرة إلى التخزين الخاص.</p></div></section>;
}

function LegacyIncomingItem({ item }: { item: TransferView }) {
  const [busy, setBusy] = useState(false);
  const open = async () => { setBusy(true); try { if (item.contentType === "text" && item.text) await navigator.clipboard.writeText(item.text); else if (item.contentType === "url" && item.url) window.open(item.url, "_blank", "noopener,noreferrer"); else { const result = await requestDownload(item.id); if (!result.downloadUrl) throw new Error("التنزيل غير مهيأ لهذا الملف حالياً"); window.open(result.downloadUrl, "_blank", "noopener,noreferrer"); } await confirmDownloaded(item.id); toast.success(item.contentType === "text" ? "تم نسخ النص" : "تم فتح العنصر"); } catch (error) { toast.error(errorMessage(error, "تعذر فتح العنصر")); } finally { setBusy(false); } };
  const title = item.contentType === "file" ? item.displayFilename || item.filename || "ملف" : item.contentType === "url" ? item.url : "نص من الهاتف";
  return <article className="transfer"><div className="transfer-info"><span className="transfer-type">{item.contentType === "file" ? "ملف" : item.contentType === "url" ? "رابط" : "نص"}</span><strong className="wrap-anywhere">{title}</strong><small>{item.status === "ready" ? "جاهز للاستلام" : "تم الاستلام"}</small></div><button type="button" className="secondary compact" disabled={busy || item.status !== "ready"} onClick={() => void open()}>{item.contentType === "text" ? "نسخ" : "فتح"}</button></article>;
}
function IncomingFileItem({ item }: { item: TransferView }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const result = await requestDownload(item.id);
      if (!result.downloadUrl) throw new Error("download_not_ready");
      await downloadPrivateFile(result.downloadUrl, item.displayFilename || item.filename || "naqlah-file");
      await confirmDownloaded(item.id);
      toast.success("تم تنزيل الملف");
    } catch (error) {
      toast.error(errorMessage(error, "تعذر تنزيل الملف"));
    } finally {
      setBusy(false);
    }
  };
  return <article className="transfer"><div className="transfer-info"><span className="transfer-type">ملف</span><strong className="wrap-anywhere">{item.displayFilename || item.filename || "ملف"}</strong><small>جاهز للتنزيل</small></div><button type="button" className="secondary compact" disabled={busy || !["ready", "downloaded"].includes(item.status)} onClick={() => void download()}>تنزيل</button></article>;
}
function IncomingItem({ item }: { item: TransferView }) {
  return item.contentType === "file" ? <IncomingFileItem item={item} /> : <LegacyIncomingItem item={item} />;
}
function Incoming({ items }: { items: TransferView[] }) { const incoming = items.filter((item) => item.receiver === "web" && ["ready", "downloaded"].includes(item.status)); return <section className="panel incoming"><div className="section-heading"><div><p className="eyebrow">من الهاتف إلى الكمبيوتر</p><h2>العناصر الواردة</h2></div><span className="count-badge">{incoming.length}</span></div>{incoming.length === 0 ? <div className="empty-state"><div className="empty-icon">↓</div><p>لا توجد عناصر واردة بعد</p><small>أي نص أو رابط أو ملف ترسله من الهاتف سيظهر هنا.</small></div> : incoming.map((item) => <IncomingItem key={item.id} item={item} />)}</section>; }

function PairingCard({ pairing, current, setPairing }: { pairing: PairingSessionView & { deviceToken: string }; current: PairingStatusView["status"]; setPairing: (pairing: PairingSessionView & { deviceToken: string }) => void }) {
  const [regenerating, setRegenerating] = useState(false);
  const regenerateCode = () => { setRegenerating(true); regenerate(pairing.id).then((value) => setPairing({ ...pairing, manualCode: value.manualCode, expiresAt: value.expiresAt })).catch((error) => toast.error(errorMessage(error, "تعذر إنشاء رمز جديد"))).finally(() => setRegenerating(false)); };
  return <main className="center"><section className="pair-card panel"><div className="brand-mark">نَ</div><p className="eyebrow">NAQLAH / نَقلة</p><h1>انقلها ببساطة</h1><p className="lead">افتح تطبيق نقلة داخل Super Badi وامسح الرمز أو أدخل الكود يدوياً.</p><div className="qr-shell"><QRCodeSVG value={pairing.qrPayload} size={220} level="M" includeMargin fgColor="#0f172a" bgColor="#ffffff" title="امسح هذا الرمز للاقتران" /></div><p className="code-label">رمز الاقتران</p><div className="code">{pairing.manualCode}</div><div className="pair-actions"><button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(pairing.manualCode).then(() => toast.success("تم نسخ الكود"))}><Icon name="copy" />نسخ الكود</button><button type="button" className="secondary" disabled={regenerating || current !== "pending"} onClick={regenerateCode}><Icon name="refresh" />{regenerating ? "جارٍ الإنشاء…" : "كود جديد"}</button></div><p className="status"><span className={current === "claimed" ? "dot claimed" : "dot"} />{current === "claimed" ? "تم التعرف على الهاتف، بانتظار موافقته…" : "بانتظار اتصال الهاتف…"}</p></section></main>;
}

export function WebApp() {
  const [pairing, setPairing] = useState<(PairingSessionView & { deviceToken: string }) | null>(null), [error, setError] = useState(""), [closed, setClosed] = useState(false);
  useEffect(() => { createPairing().then(setPairing).catch((cause) => setError(errorMessage(cause, "تعذر بدء الجلسة"))); }, []);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["pairing", pairing?.id], queryFn: () => getPairing(pairing!.id), enabled: !!pairing, refetchInterval: false });
  const list = useQuery({ queryKey: ["transfers", pairing?.id], queryFn: () => transfers(pairing!.id), enabled: status.data?.status === "active", refetchInterval: false, refetchOnWindowFocus: false });
  useEffect(() => {
    if (!pairing) return;
    return connectRealtime(pairing.id, () => {
      void queryClient.invalidateQueries({ queryKey: ["pairing", pairing.id] });
      void queryClient.invalidateQueries({ queryKey: ["transfers", pairing.id] });
    }, () => undefined);
  }, [pairing, queryClient]);
  if (error) return <main className="center"><section className="panel error-card"><p className="eyebrow">نَقلة / NAQLAH</p><h1>تعذر بدء الجلسة</h1><p>{error}</p><button type="button" onClick={() => location.reload()}>إعادة المحاولة</button></section></main>;
  if (!pairing) return <main className="center" aria-live="polite"><div className="loader" /><p>جارٍ تجهيز مساحة النقل…</p></main>;
  if (closed) return <main className="center"><section className="panel error-card"><p className="eyebrow">نَقلة / NAQLAH</p><h1>انتهت الجلسة</h1><p>تم فصل الجهازين بنجاح. يمكنك إنشاء جلسة جديدة متى احتجت.</p><button type="button" onClick={() => location.reload()}>بدء جلسة جديدة</button></section></main>;
  const current = pairing.status === "active" || pairing.status === "rejected" ? pairing.status : status.data?.status || pairing.status;
  if (current !== "active") return <PairingCard pairing={pairing} current={current} setPairing={setPairing} />;
  return <main className="workspace"><header className="workspace-header"><div><p className="eyebrow">نَقلة / NAQLAH</p><h1>مساحة النقل</h1><p className="subtitle">انقل النصوص والروابط والملفات بين أجهزتك بسهولة.</p></div><button type="button" className="secondary end-button" onClick={() => closePairing(pairing.id).then(() => { setClosed(true); toast.success("تم إنهاء الجلسة"); }).catch((cause) => toast.error(errorMessage(cause, "تعذر إنهاء الجلسة")))}>إنهاء الجلسة</button></header><div className="connection-banner"><span className="dot" /><div><strong>متصل بالهاتف</strong><small>جلسة مؤقتة ومشفرة بين الجهازين</small></div></div><Senders id={pairing.id} /><Incoming items={list.data || []} /></main>;
}
