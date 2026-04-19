"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

import { HeroPanel } from "@/components/hero-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { type DashboardData } from "@/lib/types";

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("reclipa-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.classList.toggle("dark", saved === "dark");
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("reclipa-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-slate-400" />
      ) : (
        <Moon className="h-4 w-4 text-slate-600" />
      )}
    </button>
  );
}

function FloatingNav({ isScrolled }: { isScrolled: boolean }) {
  return (
    <header
      className={`
        fixed w-full top-0 z-[1000]
        md:left-1/2 md:w-auto md:-translate-x-1/2 md:max-w-fit
        transition-all duration-500 ease-in-out
        ${isScrolled ? "md:top-4 lg:top-6" : "md:top-4"}
      `}
    >
      {/* Floating pill background */}
      <div
        className={`
          absolute inset-0 -z-10 transition-all duration-500
          md:rounded-full border-b md:border
          ${
            isScrolled
              ? "bg-white/70 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:bg-slate-900/80 dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-slate-200/50 dark:border-slate-800/50"
              : "bg-transparent border-transparent dark:border-transparent"
          }
        `}
      />

      <div className={`h-2 ${isScrolled ? "-mt-2" : ""} md:hidden`} />
      <div className="px-2 md:px-0">
        <div
          className={`
            relative z-50 flex items-center justify-between gap-4 px-2 text-sm transition-all duration-500
            ${isScrolled ? "h-14 md:h-12 md:px-4" : "h-16 md:h-14 md:px-3"}
          `}
        >
          {/* Left side: Logo + Nav */}
          <nav className="flex items-center md:gap-2">
            <a
              href="/"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 font-bold text-slate-800 transition-colors hover:text-accent-600 dark:text-slate-200 dark:hover:text-accent-400"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-600 text-sm font-bold text-white shadow-lg shadow-accent-500/25">
                R
              </span>
              <span className="hidden sm:inline">Reclipa</span>
            </a>

            {/* Desktop links */}
            <ul className="hidden items-center gap-1 md:flex">
              <li>
                <a
                  href="#studio"
                  className="flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400"
                >
                  Studio
                </a>
              </li>
              <li>
                <a
                  href="#hooks"
                  className="flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400"
                >
                  Hooks
                </a>
              </li>
              <li>
                <a
                  href="#ops"
                  className="flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:text-accent-600 dark:text-slate-400 dark:hover:text-accent-400"
                >
                  Outputs
                </a>
              </li>
            </ul>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Availability badge */}
            <div className="hidden items-center gap-2 rounded-full border border-slate-200/50 bg-white/60 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-md sm:flex dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>localhost</span>
            </div>

            <div className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

function HomePageClient({ data }: { data: DashboardData }) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 0);
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <FloatingNav isScrolled={isScrolled} />

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-4 pt-24 pb-12 sm:px-6 lg:px-8">
        <section>
          <HeroPanel summary={data.summary} />
        </section>

        <WorkspaceShell data={data} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 py-8 dark:border-slate-800/50 mt-12">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-4 text-xs sm:px-6 lg:px-8">
          <div className="font-semibold text-slate-600 dark:text-slate-400">
            © {new Date().getFullYear()}, Reclipa
          </div>
          <div className="text-slate-500 dark:text-slate-500">
            Local-first AI clipping studio
          </div>
        </div>
      </footer>
    </>
  );
}

export default HomePageClient;
