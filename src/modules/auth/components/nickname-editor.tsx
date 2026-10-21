"use client";
import "./nickname-editor.css";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { profileRequest, ProfileClientError } from "../profile-client";
import type { AccountProfileDto } from "../profile-contracts";
export function NicknameEditor({
  initial,
  onSaved,
}: {
  initial: AccountProfileDto;
  onSaved?: (profile: AccountProfileDto) => void;
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [profile, setProfile] = useState(initial),
    [name, setName] = useState(initial.nickname ?? "");
  const [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [message, setMessage] = useState("");
  const guard = useRef(false);
  async function save() {
    if (guard.current || locked) return;
    guard.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await profileRequest({
        nickname: name,
        revision: profile.revision,
      });
      setProfile(result);
      setName(result.nickname!);
      onSaved?.(result);
      setMessage(zh ? "昵称已保存" : "Nickname saved");
    } catch (error) {
      if (
        error instanceof ProfileClientError &&
        error.code === "INVALID_INPUT"
      ) {
        setMessage(
          zh
            ? "昵称须为 2—30 字符，且不能包含控制字符。"
            : "Use 2–30 characters without control characters.",
        );
      } else if (
        error instanceof ProfileClientError &&
        error.code === "REVISION_CONFLICT"
      ) {
        setLocked(true);
        setMessage(
          zh
            ? "昵称已在其他页面修改，当前输入已保留，请核对最新资料。"
            : "Profile changed elsewhere. Your input is preserved; reload the latest profile.",
        );
      } else {
        setLocked(true);
        setMessage(
          zh
            ? "未能确认保存结果。输入已保留，请核对最新资料。"
            : "Could not confirm the result. Input preserved; check the latest profile.",
        );
      }
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (
      !window.confirm(
        zh
          ? "读取最新昵称并替换当前输入？"
          : "Replace your input with the latest nickname?",
      )
    )
      return;
    setBusy(true);
    try {
      const p = await profileRequest();
      setProfile(p);
      setName(p.nickname ?? "");
      setLocked(false);
      setMessage("");
      onSaved?.(p);
    } catch {
      setMessage(zh ? "读取失败，请重试。" : "Could not reload. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nickname-editor">
      <h2>{zh ? "公开昵称" : "Public nickname"}</h2>
      <p>
        {zh
          ? "评论使用此昵称，不公开邮箱。允许重名，修改后历史评论同步更新。"
          : "Comments show this name, never your email. Names need not be unique; changes update past comments."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {zh ? "昵称（2—30 字符）" : "Nickname (2–30 characters)"}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || locked}
            required
            minLength={2}
            maxLength={60}
            autoComplete="nickname"
          />
        </label>
        <button
          className="button secondary"
          disabled={
            busy ||
            locked ||
            Array.from(name.trim()).length < 2 ||
            Array.from(name.trim()).length > 30
          }
        >
          {busy
            ? zh
              ? "保存中…"
              : "Saving…"
            : zh
              ? "保存昵称"
              : "Save nickname"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {locked && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          {zh ? "核对最新昵称" : "Check latest nickname"}
        </button>
      )}
    </section>
  );
}
