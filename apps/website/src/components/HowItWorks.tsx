import { Download, MessageSquare, Sparkles } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext.js";

export function HowItWorks() {
  const { t } = useLanguage();

  const steps = [
    {
      description: t.howItWorks.step1Desc,
      icon: Download,
      number: "01",
      title: t.howItWorks.step1Title
    },
    {
      description: t.howItWorks.step2Desc,
      icon: MessageSquare,
      number: "02",
      title: t.howItWorks.step2Title
    },
    {
      description: t.howItWorks.step3Desc,
      icon: Sparkles,
      number: "03",
      title: t.howItWorks.step3Title
    }
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#FFF5ED] via-[#FFF8F3] to-[#FFEEE6] py-24" id="how-it-works">
      <div className="absolute top-10 left-10 h-96 w-96 rounded-full bg-[#FF6A3D] opacity-[0.04] blur-3xl" />
      <div className="absolute top-1/3 right-10 h-80 w-80 rounded-full bg-[#FF8866] opacity-[0.05] blur-3xl" />
      <div className="absolute bottom-10 left-1/4 h-72 w-72 rounded-full bg-[#FFEEE6] opacity-[0.6] blur-3xl" />
      <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFF5ED] opacity-[0.7] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-[#FFEEE6]/30" />
      <div className="pointer-events-none absolute top-0 right-0 h-full w-1/3 bg-gradient-to-bl from-[#FF6A3D]/[0.02] to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-full w-1/3 bg-gradient-to-tr from-[#FF8866]/[0.02] to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-[#FF6A3D]/10 bg-white px-4 py-2 shadow-[0_2px_16px_rgba(255,106,61,0.12)]">
            <span className="text-sm font-semibold whitespace-nowrap text-[#FF6A3D]">{t.howItWorks.badge}</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">{t.howItWorks.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#666666]">{t.howItWorks.description}</p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              className="group relative rounded-2xl border-2 border-[#FF6A3D]/10 bg-white/90 p-8 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-[#FF6A3D]/30 hover:shadow-[0_8px_32px_rgba(255,106,61,0.15)]"
              key={step.number}
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white via-transparent to-[#FFF8F3]/50" />
              {index < steps.length - 1 ? (
                <div className="absolute top-1/2 -right-8 z-20 hidden h-[2px] w-8 bg-gradient-to-r from-[#FF6A3D]/30 to-transparent md:block" />
              ) : null}
              <div className="absolute -bottom-2 -right-2 h-24 w-24 rounded-full bg-gradient-to-tl from-[#FF6A3D]/5 to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />

              <div className="absolute -top-4 -left-4 z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-[0_4px_16px_rgba(255,106,61,0.4)] transition-transform duration-300 group-hover:scale-110">
                <span className="text-lg font-bold text-white">{step.number}</span>
              </div>

              <div className="relative z-10 mt-4 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFEEE6] to-[#FFF8F3] shadow-sm transition-all duration-300 group-hover:from-[#FF6A3D]/10 group-hover:to-[#FF8866]/5">
                <step.icon className="text-[#FF6A3D] transition-transform duration-300 group-hover:scale-110" size={28} />
              </div>

              <h3 className="relative z-10 mb-3 text-2xl font-bold text-[#2D2D2D]">{step.title}</h3>
              <p className="relative z-10 leading-relaxed text-[#666666]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
