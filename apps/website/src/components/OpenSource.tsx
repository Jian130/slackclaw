import { Code, GitFork, Github, Heart, Star, Users } from "lucide-react";

import { figmaAssets } from "../assets/figmaAssets.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { websiteLinks } from "../links.js";

export function OpenSource() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-[#2D2D2D] py-24 text-white" id="open-source">
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px"
          }}
        />
      </div>

      <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-[#FF6A3D] opacity-10 blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 h-80 w-80 rounded-full bg-[#FF8866] opacity-10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 backdrop-blur-sm">
            <Code className="mr-2 text-[#FF6A3D]" size={16} />
            <span className="font-semibold whitespace-nowrap">{t.openSource.badge}</span>
          </div>

          <h2 className="mb-6 text-4xl font-bold lg:text-5xl">{t.openSource.title}</h2>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-white/80">{t.openSource.description}</p>
        </div>

        <div className="mb-16 grid gap-8 lg:grid-cols-3">
          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] shadow-xl">
              <Code size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature1}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature1Desc}</p>
          </div>

          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8866] to-[#FFA07A] shadow-xl">
              <Users size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature2}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature2Desc}</p>
          </div>

          <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-[#FF6A3D]/50 hover:bg-white/10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A3D] to-[#E55A2F] shadow-xl">
              <Heart size={32} />
            </div>
            <h3 className="mb-3 text-2xl font-bold">{t.openSource.feature3}</h3>
            <p className="leading-relaxed text-white/70">{t.openSource.feature3Desc}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border-2 border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md">
          <div className="grid items-center gap-12 p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <h3 className="mb-6 text-3xl font-bold lg:text-4xl">{t.openSource.communityTitle}</h3>
              <p className="mb-8 text-lg leading-relaxed text-white/80">{t.openSource.communityDescription}</p>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row">
                <a
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-4 font-semibold whitespace-nowrap text-[#2D2D2D] shadow-xl transition-all hover:-translate-y-1 hover:bg-[#FF6A3D] hover:text-white hover:shadow-2xl"
                  href={websiteLinks.repository}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Github className="mr-2 flex-shrink-0" size={20} />
                  <span className="whitespace-nowrap">{t.openSource.viewSource}</span>
                  <Star className="ml-2 flex-shrink-0" size={20} />
                </a>

                <a
                  className="inline-flex items-center justify-center rounded-2xl border-2 border-white/30 bg-white/10 px-8 py-4 font-semibold whitespace-nowrap text-white shadow-lg transition-all hover:-translate-y-1 hover:border-white/50 hover:bg-white/20 hover:shadow-xl"
                  href={websiteLinks.fork}
                  rel="noreferrer"
                  target="_blank"
                >
                  <GitFork className="mr-2 flex-shrink-0" size={20} />
                  <span className="whitespace-nowrap">{t.openSource.contribute}</span>
                </a>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FF6A3D]">2.5k+</div>
                  <div className="text-sm text-white/60">Stars</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FF8866]">350+</div>
                  <div className="text-sm text-white/60">Forks</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                  <div className="mb-1 text-3xl font-bold text-[#FFA07A]">85+</div>
                  <div className="text-sm text-white/60">Contributors</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative aspect-square">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#FF6A3D] to-[#FF8866] opacity-20 blur-2xl" />
                <div className="relative flex h-full w-full items-center justify-center rounded-3xl border-2 border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-8">
                  <img alt="ChillClaw Builder Mascot" className="h-full w-full object-contain" src={figmaAssets.builderMascot} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
