import { MousePointerClick, Rocket, Smile, Sparkles } from "lucide-react";

import workflowImage480 from "../assets/4-480.webp";
import workflowImage720 from "../assets/4-720.webp";
import { useLanguage } from "../i18n/LanguageContext.js";

export function Architecture() {
  const { t } = useLanguage();

  const steps = [
    { icon: MousePointerClick, title: t.howItWorks.step1Title, description: t.howItWorks.step1Desc, color: "text-[#5eb3b8]", bgColor: "bg-[#5eb3b8]/10" },
    { icon: Sparkles, title: t.howItWorks.step2Title, description: t.howItWorks.step2Desc, color: "text-[#f5c563]", bgColor: "bg-[#f5c563]/10" },
    { icon: Rocket, title: t.howItWorks.step3Title, description: t.howItWorks.step3Desc, color: "text-[#ffa463]", bgColor: "bg-[#ffa463]/10" },
    { icon: Smile, title: t.howItWorks.step4Title, description: t.howItWorks.step4Desc, color: "text-[#5eb3b8]", bgColor: "bg-[#5eb3b8]/10" }
  ];

  return (
    <section className="bg-gradient-to-br from-[#f8fafa] to-[#e8f3f4] py-20" id="how-it-works">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="relative">
              <div className="relative rounded-[3rem] bg-gradient-to-br from-[#f5c563] to-[#ffa463] p-8 shadow-2xl">
                <img
                  alt="ChillClaw AI Employee"
                  className="relative z-10 mx-auto h-auto w-full max-w-md"
                  sizes="(min-width: 1024px) 28rem, 80vw"
                  src={workflowImage720}
                  srcSet={`${workflowImage480} 480w, ${workflowImage720} 720w`}
                />
              </div>

              <div className="absolute -top-6 -right-6 animate-bounce rounded-2xl border-2 border-[#5eb3b8] bg-white p-4 shadow-xl">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-[#5eb3b8]" size={20} />
                  <span className="font-semibold text-[#1a2b2e]">{t.howItWorks.readyBadge}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 space-y-8 lg:order-2">
            <div>
              <div className="mb-6 inline-block rounded-full border-2 border-[#5eb3b8] bg-white px-5 py-2">
                <span className="font-medium text-[#5eb3b8]">{t.howItWorks.badge}</span>
              </div>
              <h2 className="mb-4 text-4xl font-bold text-[#1a2b2e] lg:text-5xl">{t.howItWorks.title}</h2>
              <p className="text-xl text-[#6b8284]">{t.howItWorks.description}</p>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div className="flex items-start gap-4 rounded-2xl border-2 border-[#5eb3b8]/20 bg-white p-5 transition-all hover:border-[#5eb3b8] hover:shadow-lg" key={step.title}>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-2xl font-bold text-[#5eb3b8]">{index + 1}</div>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${step.bgColor}`}>
                        <Icon className={step.color} size={24} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 text-lg font-semibold text-[#1a2b2e]">{step.title}</div>
                      <div className="text-[#6b8284]">{step.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border-2 border-[#5eb3b8]/30 bg-gradient-to-br from-[#5eb3b8]/10 to-[#f5c563]/10 p-6">
              <div className="flex items-start gap-4">
                <div className="text-4xl">✨</div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-[#1a2b2e]">{t.howItWorks.simpleTitle}</h3>
                  <p className="text-[#6b8284]">{t.howItWorks.simpleDesc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
