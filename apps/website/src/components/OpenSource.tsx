import { Code, GitFork, Github, Heart, Star, Users } from "lucide-react";

import { websiteLinks } from "../links.js";
import { useLanguage } from "../i18n/LanguageContext.js";

export function OpenSource() {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#1a2b2e] to-[#2a3b3e] py-20 text-white">
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px"
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center rounded-full bg-white/10 px-5 py-2.5 backdrop-blur-sm">
            <Code className="mr-2" size={16} />
            <span>{t.openSource.badge}</span>
          </div>

          <h2 className="mb-4 text-4xl font-bold lg:text-5xl">{t.openSource.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-white/80">{t.openSource.description}</p>
        </div>

        <div className="mb-12 grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm transition-all hover:bg-white/15">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5eb3b8]">
              <Code size={28} />
            </div>
            <h3 className="mb-2 text-xl font-semibold">{t.openSource.feature1}</h3>
            <p className="text-white/70">{t.openSource.feature1Desc}</p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm transition-all hover:bg-white/15">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5c563]">
              <Users size={28} />
            </div>
            <h3 className="mb-2 text-xl font-semibold">{t.openSource.feature2}</h3>
            <p className="text-white/70">{t.openSource.feature2Desc}</p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm transition-all hover:bg-white/15">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffa463]">
              <Heart size={28} />
            </div>
            <h3 className="mb-2 text-xl font-semibold">{t.openSource.feature3}</h3>
            <p className="text-white/70">{t.openSource.feature3Desc}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md md:p-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex-1 text-center md:text-left">
              <h3 className="mb-4 text-2xl font-bold lg:text-3xl">Join the ChillClaw Community</h3>
              <p className="mb-6 text-lg text-white/80 md:mb-0">
                Star the repo, fork it, contribute code, or just say hi. We welcome all contributions!
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                className="group inline-flex items-center justify-center rounded-2xl bg-white px-8 py-4 text-[#1a2b2e] shadow-lg transition-all hover:bg-gray-100 hover:shadow-2xl"
                href={websiteLinks.repository}
                rel="noreferrer"
                target="_blank"
              >
                <Github className="mr-2" size={20} />
                {t.openSource.viewSource}
              </a>
              <a
                className="inline-flex items-center justify-center rounded-2xl border-2 border-white bg-transparent px-8 py-4 text-white transition-all hover:bg-white/10"
                href={websiteLinks.stargazers}
                rel="noreferrer"
                target="_blank"
              >
                <Star className="mr-2" size={20} />
                {t.openSource.starOnGithub}
              </a>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/20 pt-8 md:grid-cols-4">
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center">
                <Star className="text-[#f5c563]" size={24} />
              </div>
              <div className="text-2xl font-bold">2.5k+</div>
              <div className="text-sm text-white/60">Stars</div>
            </div>
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center">
                <GitFork className="text-[#5eb3b8]" size={24} />
              </div>
              <div className="text-2xl font-bold">450+</div>
              <div className="text-sm text-white/60">Forks</div>
            </div>
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center">
                <Users className="text-[#ffa463]" size={24} />
              </div>
              <div className="text-2xl font-bold">120+</div>
              <div className="text-sm text-white/60">Contributors</div>
            </div>
            <div className="text-center">
              <div className="mb-2 flex items-center justify-center">
                <Heart className="fill-[#ffa463] text-[#ffa463]" size={24} />
              </div>
              <div className="text-2xl font-bold">100%</div>
              <div className="text-sm text-white/60">Community</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
