"use client";
import { useRef, useState } from "react";
import { adminRequest, AdminApiError } from "@/modules/admin/client";
import { AdminDialog } from "@/modules/admin/components/shared";
import type { MaterialReviewItem, MaterialReviewDetail } from "../contracts";
import { useReviewText } from "./shared";
import { useReviewClock, windowError } from "./window";
export function RevokeDialog({
  item,
  close,
  onSaved,
}: {
  item: MaterialReviewItem;
  close: () => void;
  onSaved: (material: MaterialReviewDetail) => void;
}) {
  const { t, language } = useReviewText(),
    zh = language === "zh",
    { state } = useReviewClock(item.reviewPolicy);
  const [reason, setReason] = useState(""),
    [internalNote, setInternalNote] = useState(""),
    [error, setError] = useState<unknown>(null),
    [locked, setLocked] = useState(false),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || locked || state !== "open" || !reason.trim())
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      const value = await adminRequest<{ material: MaterialReviewDetail }>(
        `/materials/${item.id}/revoke-approval`,
        "POST",
        {
          revision: item.revision,
          submittedRevision: item.submittedRevision,
          reason,
          ...(internalNote.trim() ? { internalNote } : {}),
        },
      );
      onSaved(value.material);
    } catch (value) {
      setError(value);
      if (
        !(value instanceof AdminApiError) ||
        value.status >= 500 ||
        value.status === 409
      )
        setLocked(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <AdminDialog
      title={zh ? "撤回通过" : "Revoke approval"}
      busy={busy}
      close={close}
    >
      <p>
        {item.eventName[language]} · {item.projectName} · v
        {item.submittedRevision}
      </p>
      <p>
        {zh ? "原通过时间" : "Originally approved"}: {item.processedAt ?? "—"}
      </p>
      <p>
        {zh
          ? "同一正式版本将恢复待审核，选手会看到撤回原因；不删除材料、不延长提交期，也不改变公开发布。"
          : "The same formal version returns to pending. The participant sees your reason; materials, submission deadlines and publication are unchanged."}
      </p>
      {error != null && (
        <p role="alert" className="adm-error">
          {windowError(error, zh) ?? (locked ? t.conflict : t.network)}
        </p>
      )}
      {locked && (
        <p>
          {t.uncertain}{" "}
          {zh
            ? "关闭后读取最新状态再确认。"
            : "Close and read the latest state before retrying."}
        </p>
      )}
      <form className="mr-review" onSubmit={submit}>
        <fieldset disabled={busy || locked || state !== "open"}>
          <label htmlFor="mr-revoke-reason">
            {zh ? "给选手的撤回说明" : "Revocation reason for participant"}
            <textarea
              id="mr-revoke-reason"
              required
              maxLength={5000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label htmlFor="mr-revoke-note">
            {zh
              ? "本次内部备注（选填，留空保留原备注）"
              : "Internal note (optional; blank keeps existing note)"}
            <textarea
              id="mr-revoke-note"
              maxLength={5000}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
            />
          </label>
          <button className="adm-button" disabled={!reason.trim()}>
            {zh ? "确认撤回通过" : "Confirm revocation"}
          </button>
        </fieldset>
      </form>
      <button disabled={busy} onClick={close}>
        {t.cancel}
      </button>
    </AdminDialog>
  );
}
