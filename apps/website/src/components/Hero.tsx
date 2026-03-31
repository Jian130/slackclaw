import { ArrowRight, Download, Sparkles } from "lucide-react";

import heroImage480 from "../assets/1-480.webp";
import heroImage720 from "../assets/1-720.webp";
import { websiteLinks } from "../links.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export function Hero() {
  const { t } = useLanguage();

  return (
    <div className="relative overflow-hidden pb-20 pt-16" id="top">
      <div className="absolute inset-0 bg-gradient-to-br from-[#5eb3b8]/10 via-[#f8fafa] to-[#f5c563]/10" />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border-2 border-[#5eb3b8] bg-white px-5 py-2.5 shadow-sm">
              <Sparkles className="mr-2 text-[#5eb3b8]" size={16} />
              <span className="text-[#1a2b2e]">{t.hero.badge}</span>
            </div>

            <h1 className="text-5xl leading-tight font-bold text-[#1a2b2e] lg:text-7xl">
              {t.hero.title1}{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#5eb3b8]">{t.hero.title2}</span>
                <span className="absolute bottom-2 left-0 h-3 w-full -rotate-1 bg-[#f5c563] opacity-60" />
              </span>{" "}
              {t.hero.title3}
            </h1>

            <p className="max-w-xl text-xl leading-relaxed text-[#6b8284]">{t.hero.description}</p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                className="group inline-flex items-center justify-center rounded-2xl bg-[#5eb3b8] px-8 py-4 text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#4da0a5] hover:shadow-xl"
                href={websiteLinks.releases}
                rel="noreferrer"
                target="_blank"
              >
                <Download className="mr-2" size={20} />
                {t.hero.downloadMac}
                <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={20} />
              </a>

              <a
                className="inline-flex items-center justify-center rounded-2xl border-2 border-[#5eb3b8] bg-white px-8 py-4 text-[#1a2b2e] shadow-sm transition-all hover:bg-[#5eb3b8] hover:text-white"
                href="#how-it-works"
              >
                {t.hero.seeHow}
              </a>
            </div>

            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#5eb3b8]" />
                <span className="text-[#6b8284]">{t.hero.feature1}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#f5c563]" />
                <span className="text-[#6b8284]">{t.hero.feature2}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#ffa463]" />
                <span className="text-[#6b8284]">{t.hero.feature3}</span>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              <div className="absolute inset-0 rotate-3 rounded-[3rem] bg-gradient-to-br from-[#5eb3b8] to-[#4da0a5] opacity-20" />

              <div className="relative rounded-[3rem] bg-gradient-to-br from-[#5eb3b8] to-[#71c4c9] p-8 shadow-2xl">
                <img
                  alt="ChillClaw character with cat companion"
                  className="relative z-10 h-auto w-full"
                  sizes="(min-width: 1024px) 28rem, 80vw"
                  src={heroImage720}
                  srcSet={`${heroImage480} 480w, ${heroImage720} 720w`}
                />
              </div>

              <div className="absolute -bottom-4 -left-4 z-20 hidden rounded-2xl border-2 border-[#5eb3b8] bg-white p-5 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#5eb3b8] to-[#71c4c9]">
                    <Sparkles className="text-white" size={24} />
                  </div>
                  <div>
                    <div className="font-semibold whitespace-nowrap text-[#1a2b2e]">{t.hero.aiBadge}</div>
                    <div className="text-sm whitespace-nowrap text-[#6b8284]">{t.hero.deployInstantly}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
