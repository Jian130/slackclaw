import { Github, Heart, MessageCircle } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";
import { Logo } from "./Logo.js";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#2D2D2D] py-16 text-[#999999]" id="help">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-12 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="mb-6 inline-flex rounded-2xl bg-white px-4 py-3 shadow-sm">
              <Logo size="lg" theme="light" variant="horizontal" />
            </div>
            <p className="text-sm leading-relaxed">{t.footer.tagline}</p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-white uppercase">{t.footer.product}</h3>
            <ul className="space-y-3">
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href="#features">
                  {t.footer.features}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href="#how-it-works">
                  {t.footer.howItWorks}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.downloadMac}>
                  {t.footer.download}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.changelog} rel="noreferrer" target="_blank">
                  {t.footer.releaseNotes}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-white uppercase">{t.footer.resources}</h3>
            <ul className="space-y-3">
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.docs} rel="noreferrer" target="_blank">
                  {t.footer.documentation}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.workflowMap} rel="noreferrer" target="_blank">
                  {t.footer.workflowMap}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.issues} rel="noreferrer" target="_blank">
                  {t.footer.helpCenter}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
                  {t.footer.community}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wider text-white uppercase">{t.footer.company}</h3>
            <ul className="space-y-3">
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.readme} rel="noreferrer" target="_blank">
                  {t.footer.about}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
                  {t.footer.openSource}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.releases} rel="noreferrer" target="_blank">
                  {t.footer.releases}
                </a>
              </li>
              <li>
                <a className="text-sm transition-colors hover:text-[#FF6A3D]" href={websiteLinks.license} rel="noreferrer" target="_blank">
                  {t.footer.license}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <div className="flex items-center gap-2 text-sm">
            <span>{t.footer.madeWith}</span>
            <Heart className="fill-[#FF6A3D] text-[#FF6A3D]" size={14} />
            <span>{t.footer.forPeople}</span>
          </div>

          <div className="flex items-center space-x-6">
            <a className="transition-colors hover:text-[#FF6A3D]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
              <Github size={20} />
            </a>
            <a className="transition-colors hover:text-[#FF6A3D]" href={websiteLinks.docs} rel="noreferrer" target="_blank">
              <MessageCircle size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
