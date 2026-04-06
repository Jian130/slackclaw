import { AtSign, CheckCircle, Clock, Code, FileText, Filter, Folder, Image as ImageIcon, Loader, Plus, Send } from "lucide-react";

export function ProductPreview() {
  return (
    <section className="bg-gradient-to-br from-[#FFF8F3] to-[#FFEEE6] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="mb-6 text-4xl font-bold text-[#2D2D2D] lg:text-5xl">An AI Workstation That Actually Delivers</h2>
          <p className="mx-auto max-w-3xl text-xl text-[#666666]">
            Your AI Mini Claw doesn&apos;t just chat. It plans, executes, and delivers real results.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border-2 border-[#FF6A3D]/20 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#2D2D2D] to-[#3D3D3D] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-[#FF6A3D]" />
                <div className="h-3 w-3 rounded-full bg-[#FF8866]" />
                <div className="h-3 w-3 rounded-full bg-[#FFA07A]" />
              </div>
              <span className="ml-4 text-sm font-medium text-white/80">ChillClaw AI Workstation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-[#FF6A3D]" />
              <span className="text-xs text-white/60">Mini Claw Active</span>
            </div>
          </div>

          <div className="grid h-[600px] grid-cols-12">
            <div className="col-span-3 border-r border-[#FF6A3D]/10 bg-[#FFEEE6]/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-[#2D2D2D]">Tasks</h3>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6A3D] shadow-md transition-colors hover:bg-[#E55A2F]" type="button">
                  <Plus className="text-white" size={16} />
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2">
                <button className="flex items-center gap-2 rounded-lg bg-[#FF6A3D] px-3 py-1.5 text-sm font-medium text-white shadow-sm" type="button">
                  <Filter size={14} />
                  All
                </button>
                <button className="rounded-lg bg-white px-3 py-1.5 text-sm text-[#666666] transition-colors hover:bg-[#FFF5ED]" type="button">
                  Active
                </button>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border-l-4 border-[#FF6A3D] bg-white p-3 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Loader className="animate-spin text-[#FF6A3D]" size={14} />
                    <span className="text-xs font-semibold text-[#FF6A3D]">Running</span>
                  </div>
                  <p className="text-sm font-medium text-[#2D2D2D]">Research AI trends</p>
                  <p className="mt-1 text-xs text-[#666666]">2 min ago</p>
                </div>

                <div className="rounded-xl border-l-4 border-green-500 bg-white p-3 opacity-60 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={14} />
                    <span className="text-xs font-semibold text-green-600">Completed</span>
                  </div>
                  <p className="text-sm font-medium text-[#2D2D2D]">Analyze competitor</p>
                  <p className="mt-1 text-xs text-[#666666]">5 min ago</p>
                </div>

                <div className="rounded-xl border-l-4 border-blue-500 bg-white p-3 opacity-60 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Clock className="text-blue-600" size={14} />
                    <span className="text-xs font-semibold text-blue-600">Planning</span>
                  </div>
                  <p className="text-sm font-medium text-[#2D2D2D]">Draft email copy</p>
                  <p className="mt-1 text-xs text-[#666666]">8 min ago</p>
                </div>
              </div>
            </div>

            <div className="col-span-6 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="max-w-md rounded-2xl rounded-tr-sm bg-[#2D2D2D] px-5 py-3 text-white shadow-md">
                      <p className="text-sm">Research the latest AI trends and create a summary report</p>
                    </div>
                  </div>

                  <div className="flex">
                    <div className="max-w-md rounded-2xl rounded-tl-sm border border-[#FF6A3D]/20 bg-[#FFEEE6] px-5 py-3 shadow-sm">
                      <p className="mb-3 text-sm text-[#2D2D2D]">I&apos;ll help you with that. Here&apos;s my plan:</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="text-green-600" size={16} />
                          <span className="text-[#666666]">Search latest AI news</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="text-green-600" size={16} />
                          <span className="text-[#666666]">Analyze key trends</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Loader className="animate-spin text-[#FF6A3D]" size={16} />
                          <span className="font-medium text-[#2D2D2D]">Creating summary...</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm opacity-50">
                          <Clock className="text-[#666666]" size={16} />
                          <span className="text-[#666666]">Generate report</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-[#FF6A3D]/20 bg-gradient-to-r from-[#FF6A3D]/10 to-[#FF8866]/10 px-4 py-3">
                    <Loader className="animate-spin text-[#FF6A3D]" size={18} />
                    <span className="text-sm font-medium text-[#2D2D2D]">Mini Claw is analyzing data...</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#FF6A3D]/10 bg-white p-4">
                <div className="flex items-center gap-3 rounded-2xl border-2 border-[#FF6A3D]/20 bg-[#FFF8F3] px-4 py-3">
                  <button className="rounded-lg p-2 transition-colors hover:bg-[#FFEEE6]" type="button">
                    <Folder className="text-[#666666]" size={18} />
                  </button>
                  <button className="rounded-lg p-2 transition-colors hover:bg-[#FFEEE6]" type="button">
                    <ImageIcon className="text-[#666666]" size={18} />
                  </button>
                  <button className="rounded-lg p-2 transition-colors hover:bg-[#FFEEE6]" type="button">
                    <AtSign className="text-[#666666]" size={18} />
                  </button>
                  <input
                    className="flex-1 bg-transparent text-[#2D2D2D] outline-none placeholder:text-[#999999]"
                    placeholder="Give your Mini Claw a task..."
                    type="text"
                  />
                  <button
                    className="rounded-lg bg-gradient-to-b from-[#FF6A3D] to-[#E55A2F] p-2 shadow-md transition-all hover:from-[#E55A2F] hover:to-[#D14E25]"
                    type="button"
                  >
                    <Send className="text-white" size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="col-span-3 border-l border-[#FF6A3D]/10 bg-[#FFEEE6]/30 p-4">
              <h3 className="mb-4 font-semibold text-[#2D2D2D]">Results</h3>

              <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 shadow-sm">
                <button className="flex-1 rounded-lg bg-gradient-to-b from-[#FF6A3D] to-[#E55A2F] px-3 py-2 text-xs font-medium text-white shadow-sm" type="button">
                  <FileText className="mr-1 inline" size={14} />
                  Artifacts
                </button>
                <button className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-[#666666] transition-colors hover:bg-[#FFF5ED]" type="button">
                  Files
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-[#FF6A3D]/20 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText className="text-[#FF6A3D]" size={16} />
                    <span className="text-sm font-medium text-[#2D2D2D]">AI Trends Report</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#666666]">
                    <Loader className="animate-spin" size={12} />
                    <span>Generating...</span>
                  </div>
                </div>

                <div className="rounded-xl border border-green-500/20 bg-white p-3 opacity-70 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Code className="text-green-600" size={16} />
                    <span className="text-sm font-medium text-[#2D2D2D]">Analysis Data</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle size={12} />
                    <span>Ready</span>
                  </div>
                </div>

                <div className="rounded-xl border border-green-500/20 bg-white p-3 opacity-70 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={16} />
                    <span className="text-sm font-medium text-[#2D2D2D]">Preview</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle size={12} />
                    <span>Available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="mx-auto max-w-3xl text-lg text-[#666666]">
            ChillClaw&apos;s AI Mini Claw doesn&apos;t just answer questions. It plans execution steps, shows progress in real time,
            and delivers tangible outputs like reports, files, and previews.
          </p>
        </div>
      </div>
    </section>
  );
}
