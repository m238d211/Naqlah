import { useEffect, useState } from "react";

type Activity = { direction: "upload" | "download"; status: "active" | "complete" | "failed"; percentage: number; filename?: string };

export function TransferActivity() {
  const [activity, setActivity] = useState<Activity | null>(null);
  useEffect(() => {
    const onTransfer = (event: Event) => {
      const next = (event as CustomEvent<Activity>).detail;
      setActivity(next);
      if (next.status !== "active") window.setTimeout(() => setActivity((current) => current === next ? null : current), 2200);
    };
    window.addEventListener("naqlah:transfer", onTransfer);
    return () => window.removeEventListener("naqlah:transfer", onTransfer);
  }, []);
  if (!activity) return null;
  const label = activity.status === "active" ? `${activity.direction === "upload" ? "جارٍ رفع" : "جارٍ تنزيل"} ${activity.filename || "الملف"}` : activity.status === "complete" ? "اكتمل نقل الملف" : "فشل نقل الملف";
  return <div className={`transfer-activity ${activity.status}`} role={activity.status === "failed" ? "alert" : "status"}><strong>{label}</strong>{activity.status === "active" && <><progress max="100" value={activity.percentage} /><span>{activity.percentage}%</span></>}</div>;
}
