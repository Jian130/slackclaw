import { MousePointer, Smile, Target, Wrench } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export function HowItWorks() {
  const { t } = useLanguage();

  const steps = [
    { description: t.howItWorks.step1Desc, icon: MousePointer, number: "01", title: t.howItWorks.step1Title },
    { description: t.howItWorks.step2Desc, icon: Wrench, number: "02", title: t.howItWorks.step2Title },
    { description: t.howItWorks.step3Desc, icon: Target, number: "03", title: t.howItWorks.step3Title },
    { description: t.howItWorks.step4Desc, icon: Smile, number: "04", title: t.howItWorks.step4Title }
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF8F3] to-[#FFEEE6] py-24" id="how-it-works">
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-[#FF6A3D] opacity-5 blur-3xl" />
      <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-[#FF8866] opacity-5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full bg-white px-4 py-2 shadow-sm">
            <span className="text-sm font-semibold text-[#FF6A3D]">{t.howItWorks.badge}</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">{t.howItWorks.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#666666]">{t.howItWorks.description}</p>
        </div>

        <div className="mb-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              className="group relative rounded-2xl border-2 border-[#FF6A3D]/10 bg-white p-8 transition-all hover:-translate-y-1 hover:border-[#FF6A3D]/30 hover:shadow-xl"
              key={step.number}
            >
              <div className="absolute -top-4 -left-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-lg">
                <span className="text-lg font-bold text-white">{step.number}</span>
              </div>

              <div className="mt-4 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFEEE6] transition-colors group-hover:bg-[#FF6A3D]/10">
                <step.icon className="text-[#FF6A3D]" size={28} />
              </div>

              <h3 className="mb-3 text-2xl font-bold text-[#2D2D2D]">{step.title}</h3>
              <p className="leading-relaxed text-[#666666]">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border-2 border-[#FF6A3D]/20 bg-white p-12 shadow-2xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h3 className="mb-6 text-3xl font-bold text-[#2D2D2D]">{t.howItWorks.mascotTitle}</h3>
              <p className="mb-8 text-lg leading-relaxed text-[#666666]">{t.howItWorks.mascotDescription}</p>
              <div className="space-y-4">
                {[t.howItWorks.mascotBullet1, t.howItWorks.mascotBullet2, t.howItWorks.mascotBullet3].map((item, index) => (
                  <div className="flex items-center gap-4" key={item}>
                    <div className={`h-3 w-3 rounded-full ${index === 1 ? "bg-[#FF8866]" : "bg-[#FF6A3D]"}`} />
                    <span className="font-medium text-[#2D2D2D]">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="relative aspect-square">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] opacity-20 blur-2xl" />
                <div className="relative flex h-full w-full items-center justify-center rounded-3xl bg-gradient-to-br from-[#FFEEE6] to-[#FFF5ED] p-8">
                  <img alt="ChillClaw Mini Claw" className="h-full w-full object-contain" src={figmaAssets.heroMascot} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
