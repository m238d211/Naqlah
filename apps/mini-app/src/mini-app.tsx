import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import jsQR from "jsqr";
import { upload as blobUpload } from "./upload";
import {
  authorizeUpload,
  claimManual,
  claimQr,
  close,
  confirm,
  confirmDownloaded,
  exchange,
  listTransfers,
  pairing,
  readStoredSession,
  reject,
  requestDownload,
  sendText,
  sendUrl,
  uploadHandleUrl,
} from "./api";
import type {
  AppSession,
  PairingStatusView,
  TransferView,
} from "@naqlah/shared-types";
import { connectRealtime } from "./realtime";
import { downloadPrivateFile } from "./download";

const codePattern = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function Scanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState("");
  useEffect(() => {
    let active = true,
      stream: MediaStream | undefined,
      frame = 0;
    const scan = () => {
      if (!active) return;
      const video = videoRef.current,
        canvas = canvasRef.current;
      if (
        video &&
        canvas &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context?.getImageData(0, 0, canvas.width, canvas.height);
        const result =
          image &&
          jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
        if (result?.data) {
          onDetected(result.data);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "هذا المتصفح لا يدعم الكاميرا. استخدم رمز الاقتران اليدوي.",
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((next) => {
        if (!active) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) {
          videoRef.current.srcObject = next;
          void videoRef.current.play();
        }
        frame = requestAnimationFrame(scan);
      })
      .catch(() =>
        setCameraError(
          "لم نتمكن من فتح الكاميرا. اسمح بالكاميرا من إعدادات Super Badi أو استخدم الرمز اليدوي.",
        ),
      );
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);
  return (
    <div className="scanner-backdrop" role="presentation" onClick={onClose}>
      <section
        className="scanner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">اقتران آمن</p>
            <h2 id="scanner-title">امسح رمز الكمبيوتر</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="إغلاق الكاميرا"
          >
            ×
          </button>
        </div>
        <div className="camera-frame">
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="معاينة الكاميرا لمسح رمز QR"
          />
          <div className="scan-guide" aria-hidden="true" />
        </div>
        <canvas ref={canvasRef} className="visually-hidden" />
        {cameraError ? (
          <p className="inline-error" role="alert">
            {cameraError}
          </p>
        ) : (
          <p className="hint">وجّه الكاميرا إلى رمز QR الظاهر على الكمبيوتر.</p>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          استخدام الرمز اليدوي
        </button>
      </section>
    </div>
  );
}

function PairingClaim({
  onClaim,
}: {
  onClaim: (pair: PairingStatusView) => void;
}) {
  const [code, setCode] = useState(""),
    [scannerOpen, setScannerOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const submit = (action: () => Promise<PairingStatusView>) => {
    setBusy(true);
    action()
      .then(onClaim)
      .catch((error) => toast.error(messageOf(error, "تعذر الاقتران")))
      .finally(() => setBusy(false));
  };
  const detect = (value: string) => {
    setScannerOpen(false);
    submit(() => claimQr(value));
  };
  return (
    <main className="center">
      {scannerOpen && (
        <Scanner onDetected={detect} onClose={() => setScannerOpen(false)} />
      )}
      <section className="panel claim">
        <p className="eyebrow">نَقلة داخل Super Badi</p>
        <h1>اربط جهازاً جديداً</h1>
        <p>امسح رمز QR من شاشة الكمبيوتر أو أدخل رمز الاقتران يدوياً.</p>
        <button
          className="scan"
          type="button"
          disabled={busy}
          onClick={() => setScannerOpen(true)}
        >
          مسح رمز QR بالكاميرا
        </button>
        <div className="divider">
          <span>أو</span>
        </div>
        <label htmlFor="pairing-code">رمز الاقتران</label>
        <input
          id="pairing-code"
          inputMode="text"
          autoComplete="one-time-code"
          dir="ltr"
          value={code}
          onChange={(event) =>
            setCode(
              event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9-]/g, ""),
            )
          }
          placeholder="K7M4-P9Q2"
          maxLength={9}
        />
        <button
          type="button"
          disabled={busy || !codePattern.test(code)}
          onClick={() => submit(() => claimManual(code))}
        >
          متابعة
        </button>
        <p className="hint">
          سيظهر لك اسم الجهاز ومعلوماته قبل الموافقة النهائية.
        </p>
      </section>
    </main>
  );
}

function Confirmation({
  pair,
  onUpdate,
}: {
  pair: PairingStatusView;
  onUpdate: (pair: PairingStatusView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const act = (
    action: () => Promise<unknown>,
    status: PairingStatusView["status"],
    success: string,
  ) => {
    setBusy(true);
    action()
      .then(() => {
        onUpdate({ ...pair, status });
        toast.success(success);
      })
      .catch((error) => toast.error(messageOf(error, "تعذر تنفيذ الطلب")))
      .finally(() => setBusy(false));
  };
  return (
    <main className="center">
      <section className="panel claim">
        <p className="eyebrow">طلب اقتران جديد</p>
        <h1>هل توافق على الاتصال؟</h1>
        <div className="device">
          <div className="device-mark" aria-hidden="true">
            ⌘
          </div>
          <div>
            <strong>{pair.device.browser || "متصفح الكمبيوتر"}</strong>
            <small>
              {pair.device.operatingSystem || "جهاز كمبيوتر"} · جلسة مؤقتة
            </small>
          </div>
        </div>
        <p>
          بالموافقة، سيتمكن الجهازان من نقل الملفات والنصوص والروابط مؤقتاً.
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(() => confirm(pair.id), "active", "تم ربط الجهاز")
            }
          >
            موافقة
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              act(() => reject(pair.id), "rejected", "تم رفض الطلب")
            }
          >
            رفض
          </button>
        </div>
      </section>
    </main>
  );
}

function Composer({ id }: { id: string }) {
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false);
  const send = (action: () => Promise<unknown>, clear: () => void) => {
    setBusy(true);
    action()
      .then(() => {
        clear();
        toast.success("تم الإرسال إلى الكمبيوتر");
      })
      .catch((error) => toast.error(messageOf(error, "تعذر الإرسال")))
      .finally(() => setBusy(false));
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const auth = await authorizeUpload(id, {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
      await blobUpload(auth.blobPath, file, { access: "private", handleUploadUrl: uploadHandleUrl(), clientPayload: JSON.stringify({ transferId: auth.transferId }), headers: { Authorization: `Bearer ${sessionStorage.getItem("naqlah_app_token") || ""}` }, contentType: file.type || "application/octet-stream" });
      toast.success("اكتمل رفع الملف");
    } catch (error) {
      toast.error(messageOf(error, "تعذر رفع الملف"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="senders">
      <div className="panel">
        <h2>إرسال نص</h2>
        <label htmlFor="transfer-text">النص</label>
        <textarea
          id="transfer-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="اكتب رسالة قصيرة…"
          maxLength={100000}
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() =>
            send(
              () => sendText(id, text),
              () => setText(""),
            )
          }
        >
          إرسال النص
        </button>
      </div>
      <div className="panel">
        <h2>إرسال رابط</h2>
        <label htmlFor="transfer-url">الرابط</label>
        <input
          id="transfer-url"
          type="url"
          dir="ltr"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() =>
            send(
              () => sendUrl(id, url),
              () => setUrl(""),
            )
          }
        >
          إرسال الرابط
        </button>
      </div>
      <div className="panel">
        <h2>إرسال ملف</h2>
        <label htmlFor="transfer-file">اختر ملفاً، بحد أقصى 100 ميجابايت</label>
        <input
          id="transfer-file"
          type="file"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <p className="hint">
          يُرفع الملف مباشرة إلى التخزين الخاص ولا يمر عبر API.
        </p>
      </div>
    </section>
  );
}

function LegacyIncomingItem({ item }: { item: TransferView }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      if (item.contentType === "text" && item.text)
        await navigator.clipboard.writeText(item.text);
      else if (item.contentType === "url" && item.url)
        window.open(item.url, "_blank", "noopener,noreferrer");
      else {
        const result = await requestDownload(item.id);
        if (!result.downloadUrl)
          throw new Error("التنزيل غير مهيأ لهذا الملف حالياً");
        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      }
      await confirmDownloaded(item.id);
      toast.success(
        item.contentType === "text" ? "تم نسخ النص" : "تم فتح العنصر",
      );
    } catch (error) {
      toast.error(messageOf(error, "تعذر فتح العنصر"));
    } finally {
      setBusy(false);
    }
  };
  const title =
    item.contentType === "file"
      ? item.displayFilename || item.filename || "ملف"
      : item.contentType === "url"
        ? item.url
        : "نص من الكمبيوتر";
  return (
    <article className="transfer">
      <div>
        <strong className="wrap-anywhere">{title}</strong>
        <small>{item.status === "ready" ? "جاهز" : "تمت المعالجة"}</small>
      </div>
      <button
        type="button"
        className="secondary compact"
        disabled={busy || item.status !== "ready"}
        onClick={() => void open()}
      >
        {item.contentType === "text" ? "نسخ" : "فتح"}
      </button>
    </article>
  );
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
      toast.error(messageOf(error, "تعذر تنزيل الملف"));
    } finally {
      setBusy(false);
    }
  };
  return <article className="transfer"><div><strong className="wrap-anywhere">{item.displayFilename || item.filename || "ملف"}</strong><small>جاهز للتنزيل</small></div><button type="button" className="secondary compact" disabled={busy || !["ready", "downloaded"].includes(item.status)} onClick={() => void download()}>تنزيل</button></article>;
}
function IncomingItem({ item }: { item: TransferView }) {
  return item.contentType === "file" ? <IncomingFileItem item={item} /> : <LegacyIncomingItem item={item} />;
}

function Incoming({ items }: { items: TransferView[] }) {
  const incoming = items.filter(
    (item) => item.receiver === "mini-app" && ["ready", "downloaded"].includes(item.status),
  );
  return (
    <section className="panel incoming">
      <h2>العناصر الواردة</h2>
      {incoming.length === 0 ? (
        <p className="empty">لا توجد عناصر واردة بعد.</p>
      ) : (
        incoming.map((item) => <IncomingItem key={item.id} item={item} />)
      )}
    </section>
  );
}

export function MiniApp() {
  const [session, setSession] = useState<AppSession | null>(() =>
      readStoredSession(),
    ),
    [authError, setAuthError] = useState(""),
    [pair, setPair] = useState<PairingStatusView | null>(null);
  useEffect(() => {
    if (session) return;
    const exchangeToken = new URLSearchParams(location.search).get(
      "exchange_token",
    );
    if (!exchangeToken) {
      setAuthError("لم تصل جلسة Super Badi. أعد فتح Mini App من التطبيق.");
      return;
    }
    exchange(exchangeToken)
      .then((nextSession) => {
        history.replaceState({}, document.title, location.pathname);
        setSession(nextSession);
      })
      .catch((error) =>
        setAuthError(
          error instanceof DOMException && error.name === "AbortError"
            ? "انتهت مهلة التحقق من جلسة Super Badi. تحقق من اتصال API ثم أعد المحاولة."
            : "تعذر التحقق من جلسة Super Badi. أعد المحاولة من التطبيق.",
        ),
      );
  }, [session]);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["pairing", pair?.id],
    queryFn: () => pairing(pair!.id),
    enabled: !!pair,
    refetchInterval: false,
  });
  const incoming = useQuery({
    queryKey: ["transfers", pair?.id],
    queryFn: () => listTransfers(pair!.id),
    enabled: status.data?.status === "active",
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!pair) return;
    return connectRealtime(pair.id, () => {
      void queryClient.invalidateQueries({ queryKey: ["pairing", pair.id] });
      void queryClient.invalidateQueries({ queryKey: ["transfers", pair.id] });
    }, () => undefined);
  }, [pair, queryClient]);
  const current = pair?.status === "active" || pair?.status === "rejected" ? pair : status.data || pair;
  if (authError)
    return (
      <main className="center">
        <section className="panel">
          <p className="eyebrow">نَقلة داخل Super Badi</p>
          <h1>تسجيل الدخول مطلوب</h1>
          <p role="alert">{authError}</p>
          <button type="button" onClick={() => location.reload()}>
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  if (!session)
    return (
      <main className="center" aria-live="polite">
        <div className="loader" />
        <p>جارٍ التحقق من حسابك…</p>
      </main>
    );
  if (!current) return <PairingClaim onClaim={setPair} />;
  if (current.status === "claimed")
    return <Confirmation pair={current} onUpdate={setPair} />;
  if (["rejected", "expired", "closed"].includes(current.status))
    return (
      <main className="center">
        <section className="panel">
          <p className="eyebrow">نَقلة</p>
          <h1>
            {current.status === "rejected"
              ? "تم رفض الاقتران"
              : "انتهت جلسة الاقتران"}
          </h1>
          <p>أنشئ جلسة جديدة من الكمبيوتر ثم حاول مرة أخرى.</p>
          <button type="button" onClick={() => setPair(null)}>
            محاولة جديدة
          </button>
        </section>
      </main>
    );
  return (
    <main className="workspace">
      <header>
        <div>
          <p className="eyebrow">نَقلة</p>
          <h1>مساحة النقل</h1>
        </div>
        <button
          type="button"
          className="secondary compact"
          onClick={() =>
            close(current.id)
              .then(() => setPair({ ...current, status: "closed" }))
              .catch((error) =>
                toast.error(messageOf(error, "تعذر إنهاء الجلسة")),
              )
          }
        >
          إنهاء الجلسة
        </button>
      </header>
      <div className="connected">
        <span className="dot" /> متصل مؤقتاً بالكمبيوتر
      </div>
      <Composer id={current.id} />
      <Incoming items={incoming.data || []} />
    </main>
  );
}
