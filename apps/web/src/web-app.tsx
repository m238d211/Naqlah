import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createPairing,
  getPairing,
  regenerate,
  closePairing,
  transfers,
  sendText,
  sendUrl,
  authorizeUpload,
} from "./api";
import type {
  PairingSessionView,
  PairingStatusView,
  TransferView,
} from "@naqlah/shared-types";
const Icon = ({ type }: { type: "file" | "link" | "copy" | "refresh" }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
    <path
      d={
        type === "file"
          ? "M6 3h8l4 4v14H6zM14 3v5h5"
          : type === "link"
            ? "M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10 6"
            : type === "copy"
              ? "M9 9h10v10H9zM5 5h10v4"
              : "M20 11a8 8 0 1 0 1 4"
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
function Senders({ id }: { id: string }) {
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false);
  const send = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success("تم الإرسال إلى الهاتف");
      setText("");
      setUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإرسال");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="senders">
      <div className="panel">
        <h2>إرسال نص</h2>
        <label htmlFor="text">النص</label>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب رسالة قصيرة…"
        />
        <button
          disabled={!text || busy}
          onClick={() => send(() => sendText(id, text))}
        >
          إرسال النص
        </button>
      </div>
      <div className="panel">
        <h2>
          <Icon type="link" /> إرسال رابط
        </h2>
        <label htmlFor="url">الرابط</label>
        <input
          id="url"
          type="url"
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
        <button
          disabled={!url || busy}
          onClick={() => send(() => sendUrl(id, url))}
        >
          إرسال الرابط
        </button>
      </div>
      <div className="panel">
        <h2>
          <Icon type="file" /> إرسال ملف
        </h2>
        <label htmlFor="file">اختر ملفاً (حتى 100 ميجابايت)</label>
        <input
          id="file"
          type="file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const auth = await authorizeUpload(id, {
                filename: file.name,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
              });
              if (!auth.uploadUrl)
                throw new Error("تخزين الملفات غير مهيأ بعد");
              await fetch(auth.uploadUrl, { method: "PUT", body: file });
              toast.success("اكتمل رفع الملف");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "تعذر رفع الملف",
              );
            }
          }}
        />
        <p className="hint">
          يتم رفع الملف مباشرة إلى التخزين الخاص، ولا يمر عبر واجهة API.
        </p>
      </div>
    </section>
  );
}
function Incoming({ items }: { items: TransferView[] }) {
  return (
    <section className="panel incoming">
      <h2>العناصر الواردة</h2>
      {items.filter((x) => x.receiver === "web").length === 0 ? (
        <p className="empty">لا توجد عناصر واردة بعد. ستظهر هنا تلقائياً.</p>
      ) : (
        items
          .filter((x) => x.receiver === "web")
          .map((t) => (
            <article key={t.id} className="transfer">
              <div>
                <strong>
                  {t.displayFilename || t.contentType === "text"
                    ? "نص من الهاتف"
                    : t.url}
                </strong>
                <small>
                  {t.status === "ready" ? "جاهز للتنزيل" : "تمت المعالجة"}
                </small>
              </div>
              <button className="secondary">تنزيل</button>
            </article>
          ))
      )}
    </section>
  );
}
export function WebApp() {
  const [pairing, setPairing] = useState<
    (PairingSessionView & { deviceToken: string }) | null
  >(null);
  const [error, setError] = useState("");
  useEffect(() => {
    createPairing()
      .then(setPairing)
      .catch((e) => setError(e.message));
  }, []);
  const status = useQuery({
    queryKey: ["pairing", pairing?.id],
    queryFn: () => getPairing(pairing!.id),
    enabled: !!pairing,
    refetchInterval: (q) =>
      q.state.data?.status === "active" ||
      q.state.data?.status === "pending" ||
      q.state.data?.status === "claimed"
        ? 2000
        : false,
  });
  const list = useQuery({
    queryKey: ["transfers", pairing?.id],
    queryFn: () => transfers(pairing!.id),
    enabled: status.data?.status === "active",
    refetchInterval: 2000,
  });
  if (error)
    return (
      <main className="center">
        <div className="panel">
          <p className="eyebrow">نقلة / NAQLAH</p>
          <h1>تعذر بدء الجلسة</h1>
          <p>{error}</p>
          <button onClick={() => location.reload()}>إعادة المحاولة</button>
        </div>
      </main>
    );
  if (!pairing)
    return (
      <main className="center">
        <div className="loader" aria-label="جارٍ إنشاء جلسة مؤقتة" />
        <p>جارٍ تجهيز مساحة النقل…</p>
      </main>
    );
  const current = status.data?.status || pairing.status;
  if (current !== "active")
    return (
      <main className="center">
        <div className="panel pair-card">
          <p className="eyebrow">نقلة / NAQLAH</p>
          <h1>انقلها ببساطة</h1>
          <p>افتح تطبيق نقلة داخل Super Badi وامسح الرمز أو أدخل الكود.</p>
          <div className="qr" aria-label="رمز QR لجلسة الاقتران">
            {pairing.qrPayload.slice(0, 12)}
            <br />
            <span>QR</span>
          </div>
          <div className="code-label">رمز الاقتران</div>
          <div className="code">{pairing.manualCode}</div>
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(pairing.manualCode)
                  .then(() => toast.success("تم نسخ الرمز"))
              }
            >
              <Icon type="copy" /> نسخ الرمز
            </button>
            <button
              className="secondary"
              onClick={() =>
                regenerate(pairing.id)
                  .then((x) =>
                    setPairing({ ...pairing, manualCode: x.manualCode }),
                  )
                  .catch((e) => toast.error(e.message))
              }
            >
              <Icon type="refresh" /> رمز جديد
            </button>
          </div>
          <p className="status">
            <span className="dot" />{" "}
            {current === "claimed"
              ? "تم التعرف على الهاتف، بانتظار موافقته…"
              : "بانتظار اتصال الهاتف…"}
          </p>
        </div>
      </main>
    );
  return (
    <main className="workspace">
      <header>
        <div>
          <p className="eyebrow">نقلة / NAQLAH</p>
          <h1>مساحة النقل</h1>
        </div>
        <button
          className="secondary"
          onClick={() =>
            closePairing(pairing.id).then(() => toast.success("أغلقت الجلسة"))
          }
        >
          إنهاء الجلسة
        </button>
      </header>
      <div className="connected">
        <span className="dot" /> متصل مؤقتاً بالهاتف
      </div>
      <Senders id={pairing.id} />
      <Incoming items={list.data || []} />
    </main>
  );
}
