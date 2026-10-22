"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("adexe-theme") as Theme;
    if (["light", "dark", "system"].includes(stored)) setTheme(stored);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, ready]);
  return (
    <div className="theme-switch" role="group" aria-label="Tema tampilan">
      {(
        [
          { id: "light", label: "Terang", icon: Sun },
          { id: "dark", label: "Gelap", icon: Moon },
          { id: "system", label: "Sistem", icon: Monitor },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          title={`Tema ${label.toLowerCase()}`}
          aria-label={`Tema ${label.toLowerCase()}`}
          aria-pressed={theme === id}
          onClick={() => {
            localStorage.setItem("adexe-theme", id);
            setTheme(id);
          }}
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
