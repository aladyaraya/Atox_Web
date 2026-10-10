"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { Language, messages } from "@/lib/i18n";
const Context = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (typeof messages)[Language];
} | null>(null);
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("language-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("language-change", callback);
  };
}
function snapshot(): Language {
  try {
    return localStorage.getItem("hackathon-language") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
function serverSnapshot(): Language {
  return "zh";
}
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  const setLanguage = (value: Language) => {
    localStorage.setItem("hackathon-language", value);
    window.dispatchEvent(new Event("language-change"));
  };
  return (
    <Context.Provider value={{ language, setLanguage, t: messages[language] }}>
      {children}
    </Context.Provider>
  );
}
export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error("LanguageProvider is required");
  return context;
}
