import { Download, Menu, X } from "lucide-react";
import { useState } from "react";

import { websiteLinks } from "../links.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { LanguageSwitcher } from "./LanguageSwitcher.js";

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#5eb3b8]/20 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <a className="text-2xl font-bold text-[#5eb3b8]" href="#top">
              ChillClaw
            </a>
          </div>

          <div className="hidden items-center space-x-6 md:flex">
            <a className="text-[#6b8284] transition-colors hover:text-[#5eb3b8]" href="#features">
              {t.nav.features}
            </a>
            <a className="text-[#6b8284] transition-colors hover:text-[#5eb3b8]" href="#how-it-works">
              {t.nav.howItWorks}
            </a>
            <a className="text-[#6b8284] transition-colors hover:text-[#5eb3b8]" href="#help">
              {t.nav.help}
            </a>
            <LanguageSwitcher />
            <a
              className="flex items-center gap-2 rounded-xl bg-[#5eb3b8] px-6 py-2.5 text-white shadow-md transition-all hover:bg-[#4da0a5] hover:shadow-lg"
              href={websiteLinks.releases}
              rel="noreferrer"
              target="_blank"
            >
              <Download size={16} />
              {t.nav.download}
            </a>
          </div>

          <div className="md:hidden">
            <button
              className="rounded-md p-2 text-[#6b8284] hover:bg-[#5eb3b8]/10"
              onClick={() => setMobileMenuOpen((open) => !open)}
              type="button"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-[#5eb3b8]/20 bg-white md:hidden">
          <div className="space-y-3 px-4 py-4">
            <a
              className="block rounded-md px-3 py-2 text-[#6b8284] hover:bg-[#5eb3b8]/10"
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.features}
            </a>
            <a
              className="block rounded-md px-3 py-2 text-[#6b8284] hover:bg-[#5eb3b8]/10"
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.howItWorks}
            </a>
            <a
              className="block rounded-md px-3 py-2 text-[#6b8284] hover:bg-[#5eb3b8]/10"
              href="#help"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t.nav.help}
            </a>
            <div className="px-3 py-2">
              <LanguageSwitcher />
            </div>
            <a
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5eb3b8] px-6 py-2.5 text-white shadow-md transition-all hover:bg-[#4da0a5]"
              href={websiteLinks.releases}
              onClick={() => setMobileMenuOpen(false)}
              rel="noreferrer"
              target="_blank"
            >
              <Download size={16} />
              {t.nav.download}
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
