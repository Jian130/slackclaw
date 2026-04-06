import { ArrowRight, Check, Download, Github, Sparkles } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";

export function Hero() {
  const { t } = useLanguage();

  const trustPoints = [t.hero.feature1, t.hero.feature2, t.hero.feature4, t.hero.feature3];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF8F3] via-[#FFEEE6] to-[#FFE5D9] pt-32 pb-16 lg:pt-44 lg:pb-24" id="top">
      <div className="absolute top-20 right-10 h-64 w-64 rounded-full bg-[#FF6A3D] opacity-10 blur-3xl" />
      <div className="absolute bottom-20 left-10 h-96 w-96 rounded-full bg-[#FF8866] opacity-10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-8 text-center lg:text-left">
            <h1 className="text-5xl leading-tight font-bold text-[#2D2D2D] lg:text-7xl">
              {t.hero.title1}{" "}
              <span className="relative inline-block text-[#FF6A3D]">
                <span className="relative z-10">{t.hero.title2}</span>
                <span className="absolute bottom-3 left-0 h-4 w-full -rotate-1 bg-[#FF6A3D] opacity-20" />
              </span>{" "}
              {t.hero.title3}
            </h1>

            <p className="mx-auto max-w-xl text-xl leading-relaxed text-[#666666] lg:mx-0">{t.hero.description}</p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                className="group inline-flex items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-[#FF6A3D]/90 via-[#FF6A3D]/85 to-[#E55A2F]/90 px-8 py-4 text-lg font-semibold text-white shadow-[0_8px_32px_rgba(255,106,61,0.35),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-0.5 hover:from-[#FF6A3D] hover:via-[#E55A2F] hover:to-[#E55A2F] hover:shadow-[0_12px_40px_rgba(255,106,61,0.45),inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.15)]"
                href={websiteLinks.downloadMac}
              >
                <Download className="mr-2" size={22} />
                {t.hero.downloadMac}
                <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={22} />
              </a>

              <a
                className="inline-flex items-center justify-center rounded-2xl border-2 border-[#2D2D2D]/80 bg-white/80 px-8 py-4 text-lg font-semibold text-[#2D2D2D] shadow-[0_8px_24px_rgba(0,0,0,0.12),inset_0_2px_4px_rgba(255,255,255,0.5)] transition-all hover:-translate-y-0.5 hover:bg-[#2D2D2D] hover:text-white"
                href={websiteLinks.repository}
                rel="noreferrer"
                target="_blank"
              >
                <Github className="mr-2" size={22} />
                {t.hero.viewGithub}
              </a>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              {trustPoints.map((point) => (
                <div
                  className="flex items-center gap-3 rounded-xl border-2 border-[#FF6A3D]/20 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm"
                  key={point}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#FF6A3D] to-[#E55A2F] shadow-md">
                    <Check className="text-white" size={18} strokeWidth={3} />
                  </div>
                  <span className="font-semibold text-[#2D2D2D]">{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative aspect-square w-full max-w-lg">
              <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] opacity-20 blur-2xl" />
              <div className="absolute inset-0 flex items-center justify-center rounded-[3rem] border-2 border-[#FF6A3D]/20 bg-white/80 p-8 shadow-2xl backdrop-blur-sm lg:p-12">
                <img alt="ChillClaw Mini Claw mascot" className="relative z-10 h-full w-full object-contain" src={figmaAssets.heroMascot} />
                <div className="absolute top-8 right-8 h-3 w-3 animate-pulse rounded-full bg-[#FF6A3D]" />
                <div className="absolute top-16 right-16 h-2 w-2 animate-pulse rounded-full bg-[#FF8866] delay-100" />
                <div className="absolute bottom-16 left-8 h-3 w-3 animate-pulse rounded-full bg-[#FF6A3D] delay-200" />
              </div>

              <div className="absolute -bottom-6 -left-6 z-20 hidden rounded-2xl border-2 border-[#FF6A3D] bg-white p-5 shadow-2xl sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-md">
                    <Sparkles className="text-white" size={24} />
                  </div>
                  <div>
                    <div className="text-base font-bold whitespace-nowrap text-[#2D2D2D]">Mini Claw</div>
                    <div className="text-sm whitespace-nowrap text-[#666666]">Ready to Deploy</div>
                  </div>
                </div>
              </div>

              <div className="absolute -top-6 -right-6 hidden rounded-xl border border-[#FF6A3D]/20 bg-white/90 p-4 shadow-lg backdrop-blur-sm lg:block">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-[#FF6A3D]" />
                  <span className="text-sm font-medium text-[#2D2D2D]">Mini Claw Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
