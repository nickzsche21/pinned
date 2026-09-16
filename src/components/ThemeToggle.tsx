"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "pinned.theme";

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    let saved: Mode = "system";
    try { saved = (localStorage.getItem(KEY) as Mode) || "system"; } catch { /* private mode */ }
    setMode(saved);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (mode === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", mode);
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  }, [mode]);

  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface p-0.5">
      {(["light", "system", "dark"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className="mono rounded-[6px] px-2.5 py-1 text-[11px] transition-colors"
          style={{
            background: mode === m ? "var(--card)" : "transparent",
            color: mode === m ? "var(--fg)" : "var(--muted)",
            boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,.08)" : "none",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
