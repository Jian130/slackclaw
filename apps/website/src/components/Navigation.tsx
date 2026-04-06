import { Download, Github, Menu, X } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";
import { LanguageSwitcher } from "./LanguageSwitcher.js";
import { Logo } from "./Logo.js";

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#FF6A3D]/10 bg-[#FFF8F3]/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex h-24 items-center lg:h-28">
          <a aria-label="ChillClaw" href="#top">
            <Logo size="xl" theme="light" variant="horizontal" />
          </a>
        </div>

        <div className="hidden items-center gap-7 md:flex">
          <a className="font-medium text-[#666666] transition-colors hover:text-[#FF6A3D]" href="#features">
            {t.nav.features}
          </a>
          <a className="font-medium text-[#666666] transition-colors hover:text-[#FF6A3D]" href="#how-it-works">
            {t.nav.howItWorks}
          </a>
          <a className="font-medium text-[#666666] transition-colors hover:text-[#FF6A3D]" href="#work-masters">
            {t.nav.workMasters}
          </a>
          <a className="font-medium text-[#666666] transition-colors hover:text-[#FF6A3D]" href="#open-source">
            {t.nav.openSource}
          </a>
          <a className="font-medium text-[#666666] transition-colors hover:text-[#FF6A3D]" href="#help">
            {t.nav.help}
          </a>
          <LanguageSwitcher />
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#2D2D2D]/90 px-5 py-2.5 font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_2px_rgba(255,255,255,0.08)] transition-all hover:-translate-y-0.5 hover:bg-[#1A1A1A] hover:shadow-[0_6px_20px_rgba(0,0,0,0.22)]"
            href={websiteLinks.repository}
            rel="noreferrer"
            target="_blank"
          >
            <Github size={16} />
            {t.nav.github}
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-br from-[#FF6A3D]/90 via-[#FF6A3D]/85 to-[#E55A2F]/90 px-6 py-2.5 font-semibold text-white shadow-[0_4px_20px_rgba(255,106,61,0.3),inset_0_1px_2px_rgba(255,255,255,0.2)] transition-all hover:-translate-y-0.5 hover:from-[#FF6A3D] hover:via-[#E55A2F] hover:to-[#E55A2F] hover:shadow-[0_6px_24px_rgba(255,106,61,0.4)]"
            href={websiteLinks.downloadMac}
          >
            <Download size={16} />
            {t.nav.download}
          </a>
        </div>

        <div className="md:hidden">
          <button
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation"
            className="rounded-xl p-2 text-[#666666] transition-colors hover:bg-[#FF6A3D]/10 hover:text-[#FF6A3D]"
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="border-t border-[#FF6A3D]/10 bg-[#FFF8F3] md:hidden">
          <div className="space-y-3 px-4 py-4">
            <a className="block rounded-xl px-3 py-2 text-[#666666] hover:bg-[#FFEEE6]" href="#features" onClick={() => setMobileMenuOpen(false)}>
              {t.nav.features}
            </a>
            <a
              className="block rounded-xl px-3 py-2 text-[#666666] hover:bg-[#FFEEE6]"
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.howItWorks}
            </a>
            <a
              className="block rounded-xl px-3 py-2 text-[#666666] hover:bg-[#FFEEE6]"
              href="#work-masters"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.workMasters}
            </a>
            <a
              className="block rounded-xl px-3 py-2 text-[#666666] hover:bg-[#FFEEE6]"
              href="#open-source"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.openSource}
            </a>
            <a className="block rounded-xl px-3 py-2 text-[#666666] hover:bg-[#FFEEE6]" href="#help" onClick={() => setMobileMenuOpen(false)}>
              {t.nav.help}
            </a>
            <div className="px-3 py-1">
              <LanguageSwitcher />
            </div>
            <a
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D2D2D] px-6 py-3 text-white"
              href={websiteLinks.repository}
              rel="noreferrer"
              target="_blank"
            >
              <Github size={16} />
              {t.nav.github}
            </a>
            <a className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A3D] px-6 py-3 font-semibold text-white" href={websiteLinks.downloadMac}>
              <Download size={16} />
              {t.nav.download}
            </a>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
