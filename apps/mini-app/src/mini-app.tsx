import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  claimManual,
  exchange,
  pairing,
  confirm,
  reject,
  listTransfers,
} from "./api";
import type {
  AppSession,
  PairingStatusView,
  TransferView,
} from "@naqlah/shared-types";
export function MiniApp() {
  const [session, setSession] = useState<AppSession | null>(null),
    [authError, setAuthError] = useState(""),
    [pair, setPair] = useState<PairingStatusView | null>(null),
    [code, setCode] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      exchangeToken = params.get("exchange_token");
    if (!exchangeToken) {
      setAuthError("لم تصل جلسة Super Badi. أعد فتح Mini App من التطبيق.");
      return;
    }
    exchange(exchangeToken)
      .then((x) => {
        history.replaceState({}, document.title, location.pathname);
        setSession(x);
      })
      .catch((error) =>
        setAuthError(
          error instanceof DOMException && error.name === "AbortError"
            ? "انتهت مهلة التحقق من جلسة Super Badi. تحقق من اتصال API ثم أعد المحاولة."
            : "تعذر التحقق من جلسة Super Badi. أعد المحاولة من التطبيق.",
        ),
      );
  }, []);
  const q = useQuery({
    queryKey: ["pairing", pair?.id],
    queryFn: () => pairing(pair!.id),
    enabled: !!pair,
    refetchInterval: 2000,
  });
  const incoming = useQuery({
    queryKey: ["transfers", pair?.id],
    queryFn: () => listTransfers(pair!.id),
    enabled: q.data?.status === "active",
    refetchInterval: 2000,
  });
  if (authError)
    return (
      <main className="center">
        <section className="panel">
          <p className="eyebrow">نقلة داخل Super Badi</p>
          <h1>تسجيل الدخول مطلوب</h1>
          <p>{authError}</p>
        </section>
      </main>
    );
  if (!session)
    return (
      <main className="center">
        <div className="loader" />
        <p>جارٍ التحقق من حسابك…</p>
      </main>
    );
  if (!pair)
    return (
      <main className="center">
        <section className="panel claim">
          <p className="eyebrow">مرحباً {session.user.name}</p>
          <h1>اربط جهازاً</h1>
          <p>امسح رمز QR من شاشة الكمبيوتر أو أدخل رمز الاقتران.</p>
          <button
            className="scan"
            onClick={() =>
              toast.info(
                "افتح كاميرا Super Badi لمسح رمز QR ثم ألصق الحمولة هنا في النسخة التجريبية",
              )
            }
          >
            مسح رمز QR
          </button>
          <label htmlFor="code">رمز الاقتران</label>
          <input
            id="code"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7M4-P9Q2"
            maxLength={9}
          />
          <button
            disabled={!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)}
            onClick={() =>
              claimManual(code)
                .then(setPair)
                .catch((e) => toast.error(e.message))
            }
          >
            متابعة
          </button>
        </section>
      </main>
    );
  if (q.data?.status === "active")
    return (
      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">نقلة</p>
            <h1>متصل بالكمبيوتر</h1>
          </div>
        </header>
        <section className="panel">
          <h2>العناصر الواردة</h2>
          {(incoming.data || []).filter((x) => x.receiver === "mini-app")
            .length ? (
            <ul>
              {(incoming.data || [])
                .filter((x) => x.receiver === "mini-app")
                .map((x: TransferView) => (
                  <li key={x.id}>
                    <strong>{x.displayFilename || x.url || "نص"}</strong>
                    <small>{x.status}</small>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="empty">لا توجد عناصر واردة بعد.</p>
          )}
        </section>
      </main>
    );
  return (
    <main className="center">
      <section className="panel claim">
        <p className="eyebrow">طلب اقتران جديد</p>
        <h1>هل توافق على الاتصال؟</h1>
        <div className="device">
          <span className="device-mark">⌘</span>
          <div>
            <strong>{pair.device.browser || "متصفح الكمبيوتر"}</strong>
            <small>
              {pair.device.operatingSystem || "جهاز كمبيوتر"} · جلسة مؤقتة
            </small>
          </div>
        </div>
        <p>لن يتم حفظ الجهاز بشكل دائم، ويمكنك إنهاء الجلسة في أي وقت.</p>
        <div className="actions">
          <button
            onClick={() =>
              confirm(pair.id)
                .then(() => setPair({ ...pair, status: "active" }))
                .catch((e) => toast.error(e.message))
            }
          >
            موافقة
          </button>
          <button
            className="secondary"
            onClick={() =>
              reject(pair.id).then(() =>
                setPair({ ...pair, status: "rejected" }),
              )
            }
          >
            رفض
          </button>
        </div>
      </section>
    </main>
  );
}
