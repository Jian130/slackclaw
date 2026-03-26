import SwiftUI

private struct NativePageHeader<Actions: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let actions: Actions

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text(subtitle)
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            actions
        }
    }
}

struct WorkspaceScaffold<Actions: View, Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let actions: Actions
    @ViewBuilder let content: Content

    init(
        title: String,
        subtitle: String,
        @ViewBuilder actions: () -> Actions = { EmptyView() },
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.actions = actions()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NativeUI.sectionGap) {
                NativePageHeader(title: title, subtitle: subtitle) {
                    actions
                }
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(NativeUI.pagePadding)
        }
    }
}

struct OperationsScaffold<Actions: View, Activity: View, Hero: View, Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let actions: Actions
    @ViewBuilder let activity: Activity
    @ViewBuilder let hero: Hero
    @ViewBuilder let content: Content

    init(
        title: String,
        subtitle: String,
        @ViewBuilder actions: () -> Actions = { EmptyView() },
        @ViewBuilder activity: () -> Activity = { EmptyView() },
        @ViewBuilder hero: () -> Hero,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.actions = actions()
        self.activity = activity()
        self.hero = hero()
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NativeUI.sectionGap) {
                NativePageHeader(title: title, subtitle: subtitle) {
                    actions
                }
                activity
                hero
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(NativeUI.pagePadding)
        }
    }
}

struct SplitContentScaffold<Actions: View, Sidebar: View, Detail: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let actions: Actions
    @ViewBuilder let sidebar: Sidebar
    @ViewBuilder let detail: Detail

    init(
        title: String,
        subtitle: String,
        @ViewBuilder actions: () -> Actions = { EmptyView() },
        @ViewBuilder sidebar: () -> Sidebar,
        @ViewBuilder detail: () -> Detail
    ) {
        self.title = title
        self.subtitle = subtitle
        self.actions = actions()
        self.sidebar = sidebar()
        self.detail = detail()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NativePageHeader(title: title, subtitle: subtitle) {
                actions
            }
            .padding(.horizontal, NativeUI.pagePadding)
            .padding(.top, NativeUI.pagePadding)
            .padding(.bottom, 18)

            HSplitView {
                sidebar
                detail
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, NativeUI.pagePadding)
            .padding(.bottom, NativeUI.pagePadding)
        }
    }
}

struct GuidedFlowScaffold<Header: View, Content: View, Footer: View, Aside: View>: View {
    @ViewBuilder let header: Header
    @ViewBuilder let content: Content
    @ViewBuilder let footer: Footer
    @ViewBuilder let aside: Aside
    let asideWidth: CGFloat

    init(
        asideWidth: CGFloat = 320,
        @ViewBuilder header: () -> Header,
        @ViewBuilder content: () -> Content,
        @ViewBuilder footer: () -> Footer = { EmptyView() },
        @ViewBuilder aside: () -> Aside = { EmptyView() }
    ) {
        self.header = header()
        self.content = content()
        self.footer = footer()
        self.aside = aside()
        self.asideWidth = asideWidth
    }

    var body: some View {
        GeometryReader { geometry in
            let wideLayout = geometry.size.width >= 1180

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if wideLayout {
                        HStack(alignment: .top, spacing: 20) {
                            VStack(alignment: .leading, spacing: 20) {
                                content
                                footer
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)

                            aside
                                .frame(width: asideWidth, alignment: .top)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 20) {
                            content
                            aside
                            footer
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(NativeUI.pagePadding)
            }
        }
    }
}
