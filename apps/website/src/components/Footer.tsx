import { BookOpen, Github, Heart, MessageCircle } from "lucide-react";

import { websiteLinks } from "../links.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#1a2b2e] py-12 text-[#6b8284]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="mb-4 text-2xl font-bold text-[#5eb3b8]">ChillClaw</div>
            <p className="text-sm">{t.footer.tagline}</p>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-white">{t.footer.product}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href="#features">
                  {t.footer.features}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href="#how-it-works">
                  {t.footer.howItWorks}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.releases} rel="noreferrer" target="_blank">
                  {t.footer.download}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
                  {t.footer.pricing}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-white">{t.footer.resources}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.readme} rel="noreferrer" target="_blank">
                  {t.footer.gettingStarted}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.docs} rel="noreferrer" target="_blank">
                  {t.footer.helpCenter}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.workflowMap} rel="noreferrer" target="_blank">
                  {t.footer.tutorials}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.issues} rel="noreferrer" target="_blank">
                  {t.footer.community}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold text-white">{t.footer.company}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
                  {t.footer.about}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.changelog} rel="noreferrer" target="_blank">
                  {t.footer.blog}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.readme} rel="noreferrer" target="_blank">
                  {t.footer.privacy}
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.license} rel="noreferrer" target="_blank">
                  {t.footer.terms}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#5eb3b8]/20 pt-8 md:flex-row">
          <div className="mb-4 flex items-center gap-2 text-sm md:mb-0">
            <span>{t.footer.madeWith}</span>
            <Heart className="fill-[#ffa463] text-[#ffa463]" size={14} />
            <span>{t.footer.forPeople}</span>
          </div>

          <div className="flex items-center space-x-6">
            <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.repository} rel="noreferrer" target="_blank">
              <Github size={20} />
            </a>
            <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.docs} rel="noreferrer" target="_blank">
              <BookOpen size={20} />
            </a>
            <a className="transition-colors hover:text-[#5eb3b8]" href={websiteLinks.issues} rel="noreferrer" target="_blank">
              <MessageCircle size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
