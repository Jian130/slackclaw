import { ArrowRight, Download, Github } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";

export function CTA() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF8F3] via-[#FFF5ED] to-[#FFEEE6] py-24">
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-[#FF6A3D] opacity-10 blur-3xl" />
      <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-[#FF8866] opacity-10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border-2 border-[#FF6A3D]/20 bg-white shadow-2xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="relative p-8 lg:order-2 lg:p-12">
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A3D]/10 to-[#FF8866]/10" />
              <div className="relative flex aspect-square items-center justify-center">
                <img alt="ChillClaw Mini Claw" className="h-full w-full object-contain" src={figmaAssets.heroMascot} />
              </div>
            </div>

            <div className="p-12 lg:order-1 lg:p-16">
              <div className="mb-6 inline-flex items-center rounded-full bg-[#FFEEE6] px-4 py-2">
                <span className="text-sm font-semibold text-[#FF6A3D]">{t.cta.badge}</span>
              </div>

              <h2 className="mb-6 text-4xl leading-tight font-bold text-[#2D2D2D] lg:text-5xl">
                {t.cta.titleLead} <span className="text-[#FF6A3D]">{t.cta.titleAccent}</span>
              </h2>

              <p className="mb-8 text-xl leading-relaxed text-[#666666]">{t.cta.description}</p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <a
                  className="group inline-flex items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-[#FF6A3D]/90 via-[#FF6A3D]/85 to-[#E55A2F]/90 px-8 py-4 text-lg font-semibold text-white shadow-[0_8px_32px_rgba(255,106,61,0.35),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-[#FF6A3D] hover:via-[#E55A2F] hover:to-[#E55A2F] hover:shadow-[0_12px_40px_rgba(255,106,61,0.45)]"
                  href={websiteLinks.downloadMac}
                >
                  <Download className="mr-2" size={22} />
                  {t.cta.downloadMac}
                  <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={22} />
                </a>

                <a
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-[#2D2D2D]/80 bg-white/80 px-8 py-4 text-lg font-semibold text-[#2D2D2D] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#2D2D2D] hover:text-white"
                  href={websiteLinks.repository}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Github className="mr-2" size={22} />
                  {t.hero.viewGithub}
                </a>
              </div>

              <div className="grid grid-cols-3 gap-6 border-t-2 border-[#FF6A3D]/10 pt-6">
                <div className="text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FF6A3D]">{t.cta.stat1}</div>
                  <div className="text-sm font-medium text-[#666666]">{t.cta.stat1Label}</div>
                </div>
                <div className="text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FF6A3D]">{t.cta.stat2}</div>
                  <div className="text-sm font-medium text-[#666666]">{t.cta.stat2Label}</div>
                </div>
                <div className="text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FF6A3D]">{t.cta.stat3}</div>
                  <div className="text-sm font-medium text-[#666666]">{t.cta.stat3Label}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
