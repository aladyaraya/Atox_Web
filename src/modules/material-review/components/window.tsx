"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest, AdminApiError } from "@/modules/admin/client";
import { AdminDialog } from "@/modules/admin/components/shared";
import type {
  ReviewPolicy,
  ReviewPolicyInput,
  ReviewPolicyState,
} from "../contracts";
import { policyState } from "../rules";
import { useReviewText } from "./shared";
export const windowNames: Record<ReviewPolicyState, [string, string]> = {
  unconfigured: [
    "未配置审核时间，仅供查看",
    "Review window not configured; read only",
  ],
  not_started: ["审核尚未开始，仅供查看", "Review has not started; read only"],
  open: ["审核中", "Review open"],
  paused: ["审核已暂停，仅供查看", "Review paused; read only"],
  closed: ["审核已截止，仅供查看", "Review closed; read only"],
};
export function useReviewClock(policy: ReviewPolicy | undefined) {
  const [tick, setTick] = useState(() => ({
    key: "",
    elapsed: 0,
    localNow: Date.now(),
  }));
  useEffect(() => {
    const start = policy?.clientReceivedAt ?? Date.now();
    const timer = setInterval(
      () =>
        setTick({
          key: policy?.serverNow ?? "",
          elapsed: Date.now() - start,
          localNow: Date.now(),
        }),
      500,
    );
    return () => clearInterval(timer);
  }, [policy]);
  const now = policy
    ? Date.parse(policy.serverNow) +
      (policy.clientReceivedAt !== undefined
        ? Math.max(0, tick.localNow - policy.clientReceivedAt)
        : tick.key === policy.serverNow
          ? tick.elapsed
          : 0)
    : 0;
  return {
    now,
    state: policy
      ? policyState(
          {
            enabled: policy.enabled,
            mode: policy.mode,
            opensAt: policy.opensAt,
            closesAt: policy.closesAt,
          },
          new Date(now),
        )
      : ("unconfigured" as ReviewPolicyState),
  };
}
export function receivedPolicy(policy: ReviewPolicy): ReviewPolicy {
  return { ...policy, clientReceivedAt: Date.now() };
}
export function windowError(error: unknown, zh: boolean) {
  if (error instanceof AdminApiError) {
    const state = error.code
      .replace(/^REVIEW_/, "")
      .toLowerCase() as ReviewPolicyState;
    if (windowNames[state]) return windowNames[state][zh ? 0 : 1];
    if (error.code === "REVIEW_DEADLINE_REQUIRED")
      return zh
        ? "重新开放须设置有效的未来截止时间。"
        : "Reopening requires a future deadline.";
    if (error.code === "INVALID_INPUT")
      return zh
        ? "请检查时间格式、顺序及必填原因。"
        : "Check time offsets, order and the required reason.";
  }
  return null;
}
export function ReviewWindow({
  policy,
  edit,
  onSaved,
  compact = false,
}: {
  policy: ReviewPolicy;
  edit?: boolean;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const { language } = useReviewText(),
    zh = language === "zh";
  const { state, now } = useReviewClock(policy);
  const [open, setOpen] = useState(false);
  const format = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", {
          dateStyle: "medium",
          timeStyle: "long",
          timeZone: policy.timeZone,
        }).format(new Date(value))
      : "—";
  return (
    <section
      className={
        compact ? "mr-window mr-window-compact" : "adm-panel mr-window"
      }
      aria-label={zh ? "活动审核窗口" : "Event review window"}
    >
      <div className="adm-heading">
        <div>
          <strong>
            {policy.mode === "unlimited"
              ? zh
                ? "不限时审核"
                : "Unlimited review"
              : policy.mode === "event"
                ? zh
                  ? "跟随活动起止时间"
                  : "Follows event dates"
                : zh
                  ? "自定义审核时间"
                  : "Custom review window"}
          </strong>
          <span className="adm-muted"> · {windowNames[state][zh ? 0 : 1]}</span>
        </div>
        {edit && (
          <button onClick={() => setOpen(true)}>
            {zh ? "设置审核时间" : "Configure review window"}
          </button>
        )}
      </div>
      {policy.mode !== "unlimited" && (
        <p>
          {format(policy.opensAt)} → {format(policy.closesAt)}
        </p>
      )}
      <p className="adm-muted">
        {policy.timeZone} ·{" "}
        {policy.mode === "unlimited"
          ? zh
            ? "不受活动起止限制；仍可手动暂停"
            : "No date restriction; can be paused manually"
          : zh
            ? "开始包含，截止不包含"
            : "Start inclusive; end exclusive"}
      </p>
      {!compact && state === "open" && policy.closesAt && (
        <p role="timer">
          {zh ? "距审核截止" : "Time remaining"}:{" "}
          {Math.max(0, Math.ceil((Date.parse(policy.closesAt!) - now) / 1000))}{" "}
          {zh ? "秒" : "seconds"}
        </p>
      )}
      {open && (
        <PolicyDialog
          eventId={policy.eventId}
          close={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      )}
    </section>
  );
}
function PolicyDialog({
  eventId,
  close,
  onSaved,
}: {
  eventId: string;
  close: () => void;
  onSaved: () => void;
}) {
  const { language, t } = useReviewText(),
    zh = language === "zh";
  const [policy, setPolicy] = useState<ReviewPolicy | null>(null),
    [input, setInput] = useState<ReviewPolicyInput>({
      revision: 0,
      enabled: true,
      opensAt: "",
      closesAt: "",
      reason: "",
    });
  const [history, setHistory] = useState<
    {
      id: string;
      actor: { label: string };
      createdAt: string;
      before: ReviewPolicy | null;
      after: ReviewPolicy & { reason: string };
    }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [error, setError] = useState<unknown>(null),
    [discard, setDiscard] = useState(false);
  const inFlight = useRef(false),
    dirty = useRef(false);
  const path = `/materials/review-policies/${encodeURIComponent(eventId)}`;
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const data = await adminRequest<{
        policy: ReviewPolicy;
        history: typeof history;
      }>(path);
      setPolicy(data.policy);
      setInput({
        revision: data.policy.revision,
        mode: data.policy.mode,
        enabled: data.policy.revision ? data.policy.enabled : true,
        opensAt: data.policy.opensAt ?? "",
        closesAt: data.policy.closesAt ?? "",
        reason: "",
      });
      setHistory(data.history);
      setLocked(false);
      setError(null);
      dirty.current = false;
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || locked || !policy) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await adminRequest(path, "PATCH", input);
      dirty.current = false;
      onSaved();
    } catch (reason) {
      setError(reason);
      if (
        !(reason instanceof AdminApiError) ||
        reason.status >= 500 ||
        reason.status === 409
      )
        setLocked(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const change = (value: Partial<ReviewPolicyInput>) => {
    dirty.current = true;
    setInput((previous) => ({ ...previous, ...value }));
  };
  return (
    <AdminDialog
      title={zh ? "设置审核时间" : "Configure review window"}
      busy={busy}
      close={() => {
        if (dirty.current) setDiscard(true);
        else close();
      }}
    >
      {discard ? (
        <>
          <p>
            {zh ? "放弃未保存的时间设置？" : "Discard unsaved window settings?"}
          </p>
          <button onClick={() => setDiscard(false)}>{t.cancel}</button>
          <button onClick={close}>
            {zh ? "放弃并关闭" : "Discard and close"}
          </button>
        </>
      ) : (
        <>
          <p>
            {eventId} · {policy?.timeZone}
          </p>
          <p>
            {zh
              ? "无需单独配置，默认跟随活动起止。也可选择不限时或自定义；暂停保留规则，变更必须留原因。"
              : "Defaults to event dates without setup. Choose unlimited or custom dates if needed. Pausing retains the rule; a change reason is required."}
          </p>
          {error != null && (
            <p role="alert" className="adm-error">
              {windowError(error, zh) ?? (locked ? t.uncertain : t.network)}
            </p>
          )}
          {locked && <p role="alert">{t.conflict}</p>}
          {(!policy || locked) && (
            <button
              disabled={busy}
              onClick={() => {
                if (dirty.current) {
                  setDiscard(true);
                } else void load();
              }}
            >
              {t.retry}
            </button>
          )}
          {locked && (
            <button
              disabled={busy}
              onClick={() => {
                dirty.current = false;
                void load();
              }}
            >
              {zh
                ? "放弃输入并读取最新设置"
                : "Discard input and read latest settings"}
            </button>
          )}
          {policy && (
            <form className="mr-review" onSubmit={save}>
              <fieldset disabled={busy || locked}>
                <label htmlFor="mr-policy-mode">
                  {zh ? "审核时间规则" : "Review timing rule"}
                </label>
                <select
                  id="mr-policy-mode"
                  value={input.mode ?? "custom"}
                  onChange={(e) =>
                    change({
                      mode: e.target.value as ReviewPolicyInput["mode"],
                    })
                  }
                >
                  <option value="event">
                    {zh
                      ? "跟随活动起止时间（默认）"
                      : "Follow event dates (default)"}
                  </option>
                  <option value="unlimited">
                    {zh ? "不限时" : "Unlimited"}
                  </option>
                  <option value="custom">
                    {zh ? "自定义审核时间" : "Custom dates"}
                  </option>
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={input.enabled}
                    onChange={(e) => change({ enabled: e.target.checked })}
                  />{" "}
                  {zh ? "启用本场审核" : "Enable review for this event"}
                </label>
                {(input.mode ?? "custom") === "custom" && (
                  <>
                    <label>
                      {zh
                        ? "审核开始时间（含时区偏移）"
                        : "Review start (include UTC offset)"}
                      <input
                        required
                        value={input.opensAt ?? ""}
                        onChange={(e) => change({ opensAt: e.target.value })}
                        placeholder="2026-10-23T09:00:00+08:00"
                      />
                    </label>
                    <label>
                      {zh
                        ? "审核截止时间（含时区偏移）"
                        : "Review end (include UTC offset)"}
                      <input
                        required
                        value={input.closesAt ?? ""}
                        onChange={(e) => change({ closesAt: e.target.value })}
                        placeholder="2026-11-01T18:00:00+08:00"
                      />
                    </label>
                  </>
                )}
                <label>
                  {zh
                    ? "时间设置变更原因"
                    : "Reason for changing the review window"}
                  <textarea
                    required
                    maxLength={5000}
                    value={input.reason}
                    onChange={(e) => change({ reason: e.target.value })}
                  />
                </label>
                <button className="adm-button" disabled={!input.reason.trim()}>
                  {zh ? "保存审核时间" : "Save review window"}
                </button>
              </fieldset>
            </form>
          )}
          <details>
            <summary>{zh ? "时间设置历史" : "Window history"}</summary>
            {history.map((row) => (
              <article key={row.id}>
                <p>
                  {row.actor.label} · {row.createdAt}
                </p>
                <p>
                  {zh ? "变更原因" : "Reason"}: {row.after.reason}
                </p>
                {(
                  [
                    ["before", row.before],
                    ["after", row.after],
                  ] as const
                ).map(([key, value]) => (
                  <p key={key}>
                    {key === "before"
                      ? zh
                        ? "调整前"
                        : "Before"
                      : zh
                        ? "调整后"
                        : "After"}
                    :{" "}
                    {value
                      ? `${value.enabled ? (zh ? "启用" : "Enabled") : zh ? "暂停" : "Paused"} · ${value.opensAt ?? "—"} → ${value.closesAt ?? "—"}`
                      : "—"}
                  </p>
                ))}
              </article>
            ))}
          </details>
        </>
      )}
    </AdminDialog>
  );
}
