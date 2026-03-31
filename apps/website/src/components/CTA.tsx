import { ArrowRight, Download, Sparkles } from "lucide-react";

import ctaImage480 from "../assets/6-480.webp";
import ctaImage720 from "../assets/6-720.webp";
import { websiteLinks } from "../links.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export function CTA() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#5eb3b8] to-[#4da0a5] py-20" id="help">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px"
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1">
            <div className="relative">
              <div className="relative rounded-[3rem] bg-white/10 p-8 backdrop-blur-sm">
                <img
                  alt="ChillClaw character hugging a white kitten"
                  className="relative z-10 h-auto w-full max-w-sm"
                  sizes="(min-width: 1024px) 24rem, 80vw"
                  src={ctaImage720}
                  srcSet={`${ctaImage480} 480w, ${ctaImage720} 720w`}
                />
              </div>

              <div className="absolute -top-4 -right-4 text-6xl animate-bounce">✨</div>
            </div>
          </div>

          <div className="order-1 space-y-8 text-white lg:order-2">
            <div className="mb-2 inline-flex items-center rounded-full bg-white/20 px-5 py-2.5 backdrop-blur-sm">
              <Sparkles className="mr-2" size={16} />
              <span>{t.cta.badge}</span>
            </div>

            <h2 className="text-4xl leading-tight font-bold lg:text-6xl">{t.cta.title}</h2>

            <p className="text-xl text-white/90">{t.cta.description}</p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                className="group inline-flex items-center justify-center rounded-2xl bg-white px-8 py-4 text-[#5eb3b8] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-2xl"
                href={websiteLinks.releases}
                rel="noreferrer"
                target="_blank"
              >
                <Download className="mr-2" size={20} />
                {t.cta.downloadMac}
                <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={20} />
              </a>

              <a
                className="inline-flex items-center justify-center rounded-2xl border-2 border-white bg-transparent px-8 py-4 text-white transition-all hover:bg-white/10"
                href={websiteLinks.docs}
                rel="noreferrer"
                target="_blank"
              >
                {t.cta.watchDemo}
              </a>
            </div>

            <div className="border-t border-white/30 pt-6">
              <div className="grid grid-cols-3 gap-8 text-center">
                <div>
                  <div className="mb-1 text-3xl font-bold">{t.cta.stat1}</div>
                  <div className="text-sm text-white/80">{t.cta.stat1Label}</div>
                </div>
                <div>
                  <div className="mb-1 text-3xl font-bold">{t.cta.stat2}</div>
                  <div className="text-sm text-white/80">{t.cta.stat2Label}</div>
                </div>
                <div>
                  <div className="mb-1 text-3xl font-bold">{t.cta.stat3}</div>
                  <div className="text-sm text-white/80">{t.cta.stat3Label}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
