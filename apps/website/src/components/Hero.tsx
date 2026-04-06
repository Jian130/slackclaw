import { ArrowRight, Check, Download, Github, Sparkles } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";

export function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF8F3] via-[#FFEEE6] to-[#FFE5D9] pt-32 pb-16 lg:pt-44 lg:pb-24" id="top">
      <div className="absolute top-20 right-10 h-64 w-64 rounded-full bg-[#FF6A3D] opacity-10 blur-3xl" />
      <div className="absolute bottom-20 left-10 h-96 w-96 rounded-full bg-[#FF8866] opacity-10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-10 text-left">
            <h1 className="text-5xl leading-tight font-bold text-[#2D2D2D] lg:text-6xl">
              {t.hero.title1}
              {t.hero.title2 ? (
                <>
                  <br />
                  {t.hero.title2}
                </>
              ) : null}
            </h1>

            <div className="flex flex-col gap-4 pt-2 sm:flex-row">
              <a
                className="group inline-flex items-center justify-center rounded-lg bg-[#FF6A3D] px-6 py-3.5 font-medium whitespace-nowrap text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#E55A2F] hover:shadow-xl"
                href={websiteLinks.downloadMac}
              >
                <Download className="mr-2 flex-shrink-0" size={20} />
                <span className="whitespace-nowrap">{t.hero.downloadMac}</span>
                <ArrowRight className="ml-2 flex-shrink-0 transition-transform group-hover:translate-x-1" size={20} />
              </a>

              <a
                className="inline-flex items-center justify-center rounded-lg border-2 border-[#2D2D2D] bg-white px-6 py-3.5 font-medium whitespace-nowrap text-[#2D2D2D] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#2D2D2D] hover:text-white hover:shadow-lg"
                href={websiteLinks.repository}
                rel="noreferrer"
                target="_blank"
              >
                <Github className="mr-2 flex-shrink-0" size={20} />
                <span className="whitespace-nowrap">{t.hero.viewGithub}</span>
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[t.hero.feature1, t.hero.feature2, t.hero.feature3, t.hero.feature4].map((trustPoint) => (
                <div className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 shadow-sm" key={trustPoint}>
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#FF6A3D]">
                    <Check className="text-white" size={14} strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap text-[#2D2D2D]">{trustPoint}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative aspect-square w-full max-w-lg">
              <div className="absolute inset-0 flex items-center justify-center rounded-[2rem] border-4 border-white/60 bg-gradient-to-br from-[#FFEEE6] to-[#FFF5ED] p-10 shadow-[0_8px_32px_rgba(255,106,61,0.15),0_2px_8px_rgba(0,0,0,0.08)] backdrop-blur-sm">
                <div className="pointer-events-none absolute inset-2 rounded-[1.5rem] bg-gradient-to-br from-white/40 to-transparent" />
                <img
                  alt="ChillClaw AI Mini Claw - Orange Lobster Mascot"
                  className="relative z-10 h-full w-full object-contain drop-shadow-2xl"
                  src={figmaAssets.heroMascot}
                />
              </div>

              <div className="absolute -right-4 -bottom-4 z-20 rounded-xl border-2 border-[#FF6A3D] bg-white px-4 py-3 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6A3D] shadow-sm">
                    <Sparkles className="text-white" size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold whitespace-nowrap text-[#2D2D2D]">{t.hero.aiBadge}</div>
                    <div className="text-xs whitespace-nowrap text-[#666666]">{t.hero.deployInstantly}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
