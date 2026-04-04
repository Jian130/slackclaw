import Foundation
import Observation
import SwiftUI
import ChillClawProtocol
import ChillClawClient

public protocol ChillClawChatTransport: Sendable {
    func fetchOverview() async throws -> ChatOverview
    func fetchThread(threadId: String) async throws -> ChatThreadDetail
    func createThread(memberId: String) async throws -> ChatActionResponse
    func sendMessage(threadId: String, message: String, clientMessageId: String?) async throws -> ChatActionResponse
    func abort(threadId: String) async throws -> ChatActionResponse
    func events() async throws -> AsyncThrowingStream<ChatStreamEvent, Error>
}

public struct DaemonChatTransport: ChillClawChatTransport {
    private let client: ChillClawAPIClient

    public init(client: ChillClawAPIClient) {
        self.client = client
    }

    public func fetchOverview() async throws -> ChatOverview { try await client.fetchChatOverview() }
    public func fetchThread(threadId: String) async throws -> ChatThreadDetail { try await client.fetchChatThread(threadId: threadId) }
    public func createThread(memberId: String) async throws -> ChatActionResponse { try await client.createThread(memberId: memberId) }
    public func sendMessage(threadId: String, message: String, clientMessageId: String?) async throws -> ChatActionResponse {
        try await client.sendMessage(threadId: threadId, message: message, clientMessageId: clientMessageId)
    }
    public func abort(threadId: String) async throws -> ChatActionResponse { try await client.abortThread(threadId: threadId) }
    public func events() async throws -> AsyncThrowingStream<ChatStreamEvent, Error> { try await client.chatEvents() }
}

@MainActor
@Observable
public final class ChillClawChatViewModel {
    public private(set) var overview = ChatOverview(threads: [])
    public private(set) var selectedThread: ChatThreadDetail?
    public private(set) var errorMessage: String?
    public var draftMessage = ""
    public var canSendCurrentDraft: Bool {
        guard let selectedThread else { return false }
        return canSendChatDraft(draftMessage, canSend: selectedThread.composerState.canSend)
    }

    private let transport: ChillClawChatTransport
    private var eventTask: Task<Void, Never>?
    private var selectedThreadLoadTask: Task<Void, Never>?
    private var isStarting = false

    public init(transport: ChillClawChatTransport) {
        self.transport = transport
    }

    public func start() async {
        guard eventTask == nil, !isStarting else { return }
        isStarting = true
        defer { isStarting = false }
        await refresh()
        guard eventTask == nil else { return }
        eventTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let stream = try await self.transport.events()
                    await MainActor.run {
                        self.errorMessage = nil
                    }
                    for try await event in stream {
                        if Task.isCancelled {
                            break
                        }
                        await MainActor.run {
                            self.apply(event)
                        }
                    }
                } catch {
                    await MainActor.run {
                        self.errorMessage = error.localizedDescription
                    }
                }

                if Task.isCancelled {
                    break
                }

                try? await Task.sleep(nanoseconds: 250_000_000)
            }
        }
    }

    public func refresh() async {
        do {
            let overview = normalizeOverview(try await transport.fetchOverview())
            self.overview = overview
            self.errorMessage = nil
            guard let current = selectedThreadID(for: overview) else {
                selectedThreadLoadTask?.cancel()
                selectedThreadLoadTask = nil
                selectedThread = nil
                return
            }
            showThreadPlaceholder(threadId: current, overview: overview)
            loadThreadDetail(threadId: current)
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func selectThread(_ threadId: String) async {
        showThreadPlaceholder(threadId: threadId, overview: overview)
        errorMessage = nil
        loadThreadDetail(threadId: threadId)
    }

    public func createThread(memberId: String) async {
        do {
            let response = try await transport.createThread(memberId: memberId)
            self.overview = normalizeOverview(response.overview)
            self.selectedThread = response.thread
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func sendCurrentMessage() async {
        guard let threadId = selectedThread?.id, let thread = selectedThread, canSendCurrentDraft else {
            return
        }

        selectedThreadLoadTask?.cancel()
        selectedThreadLoadTask = nil

        let message = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let clientMessageId = UUID().uuidString
        let previousOverview = overview
        let previousThread = selectedThread

        let optimistic = optimisticThreadDetail(thread: thread, message: message, clientMessageId: clientMessageId)
        draftMessage = ""
        errorMessage = nil
        selectedThread = optimistic
        upsert(detail: optimistic)

        do {
            let response = try await transport.sendMessage(threadId: threadId, message: message, clientMessageId: clientMessageId)
            self.overview = normalizeOverview(response.overview)
            self.errorMessage = nil
            if let thread = response.thread {
                self.selectedThread = thread
            } else {
                self.selectedThread = try await transport.fetchThread(threadId: threadId)
            }
        } catch {
            self.overview = previousOverview
            self.selectedThread = previousThread
            self.draftMessage = message
            self.errorMessage = error.localizedDescription
        }
    }

    public func abortCurrentRun() async {
        guard let threadId = selectedThread?.id else { return }
        do {
            let response = try await transport.abort(threadId: threadId)
            self.overview = normalizeOverview(response.overview)
            self.errorMessage = nil
            if let thread = response.thread {
                self.selectedThread = thread
            }
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    private func apply(_ event: ChatStreamEvent) {
        switch event {
        case let .threadCreated(thread):
            upsert(thread: thread)
        case let .historyLoaded(threadId, detail):
            upsert(detail: detail)
            if selectedThreadID == threadId {
                selectedThread = detail
            }
        case let .messageCreated(threadId, message):
            mutateSelectedThread(ifMatching: threadId) { thread in
                thread.messages = upsertChatMessages(thread.messages, message: message)
            }
        case let .runStarted(threadId, message, _):
            updateComposer(threadId: threadId, activityLabel: "Thinking…", status: "thinking", toolActivities: [])
            mutateSelectedThread(ifMatching: threadId) { thread in
                thread.messages = upsertChatMessages(thread.messages, message: message)
            }
        case let .assistantThinking(threadId, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "thinking")
        case let .connectionState(threadId, state, detail):
            updateComposer(threadId: threadId, activityLabel: detail, bridgeState: state)
        case let .assistantToolStatus(threadId, _, _, activityLabel, toolActivity):
            updateComposer(
                threadId: threadId,
                activityLabel: activityLabel,
                status: "thinking",
                bridgeState: .connected,
                toolActivities: upsertToolActivity(threadId: threadId, toolActivity: toolActivity)
            )
        case let .assistantDelta(threadId, message, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "streaming")
            mutateSelectedThread(ifMatching: threadId) { thread in
                thread.messages = upsertChatMessages(thread.messages, message: message)
            }
        case let .assistantCompleted(threadId, detail, _),
             let .assistantAborted(threadId, detail, _):
            upsert(detail: detail)
            if selectedThreadID == detail.id {
                selectedThread = detail
            }
            updateComposer(threadId: threadId, activityLabel: nil, status: "idle", bridgeState: .connected, toolActivities: [])
        case let .assistantFailed(threadId, error, detail, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "error", error: error, bridgeState: .connected, toolActivities: [])
            if let detail, selectedThreadID == threadId {
                selectedThread = detail
            }
        case let .threadUpdated(thread):
            upsert(thread: thread)
        }
    }

    private func upsert(thread: ChatThreadSummary) {
        if let index = overview.threads.firstIndex(where: { $0.id == thread.id }) {
            overview.threads[index] = thread
        } else {
            overview.threads.insert(thread, at: 0)
        }
        overview = normalizeOverview(overview)
    }

    private func upsert(detail: ChatThreadDetail) {
        let summary = ChatThreadSummary(
            id: detail.id,
            memberId: detail.memberId,
            agentId: detail.agentId,
            sessionKey: detail.sessionKey,
            title: detail.title,
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
            lastPreview: detail.lastPreview,
            lastMessageAt: detail.lastMessageAt,
            unreadCount: detail.unreadCount,
            activeRunState: detail.activeRunState,
            historyStatus: detail.historyStatus,
            composerState: detail.composerState
        )
        upsert(thread: summary)
    }

    private func updateComposer(
        threadId: String,
        activityLabel: String?,
        status: String? = nil,
        error: String? = nil,
        bridgeState: ChatBridgeState? = nil,
        toolActivities: [ChatToolActivity]? = nil
    ) {
        guard let index = overview.threads.firstIndex(where: { $0.id == threadId }) else { return }
        if let status {
            overview.threads[index].composerState.status = status
            let availability = composerAvailability(for: status)
            overview.threads[index].composerState.canSend = availability.canSend
            overview.threads[index].composerState.canAbort = availability.canAbort
            overview.threads[index].activeRunState = status == "idle" ? nil : status
        }
        overview.threads[index].composerState.activityLabel = activityLabel
        overview.threads[index].composerState.error = error
        if let bridgeState {
            overview.threads[index].composerState.bridgeState = bridgeState
        }
        if let toolActivities {
            overview.threads[index].composerState.toolActivities = toolActivities
        }
        mutateSelectedThread(ifMatching: threadId) { thread in
            if let status {
                thread.composerState.status = status
                let availability = composerAvailability(for: status)
                thread.composerState.canSend = availability.canSend
                thread.composerState.canAbort = availability.canAbort
                thread.activeRunState = status == "idle" ? nil : status
            }
            thread.composerState.activityLabel = activityLabel
            thread.composerState.error = error
            if let bridgeState {
                thread.composerState.bridgeState = bridgeState
            }
            if let toolActivities {
                thread.composerState.toolActivities = toolActivities
            }
        }
    }

    private func upsertToolActivity(threadId: String, toolActivity: ChatToolActivity) -> [ChatToolActivity] {
        guard let index = overview.threads.firstIndex(where: { $0.id == threadId }) else {
            return [toolActivity]
        }

        var activities = overview.threads[index].composerState.toolActivities ?? []
        if let existingIndex = activities.firstIndex(where: { $0.id == toolActivity.id }) {
            activities[existingIndex] = toolActivity
        } else {
            activities.append(toolActivity)
        }

        return activities
    }

    private func selectedThreadID(for overview: ChatOverview) -> String? {
        if let selectedThread, overview.threads.contains(where: { $0.id == selectedThread.id }) {
            return selectedThread.id
        }

        return overview.threads.first?.id
    }

    private func normalizeOverview(_ overview: ChatOverview) -> ChatOverview {
        ChatOverview(threads: collapseDuplicateThreads(overview.threads))
    }

    private func collapseDuplicateThreads(_ threads: [ChatThreadSummary]) -> [ChatThreadSummary] {
        let sorted = threads.sorted { left, right in
            if left.updatedAt != right.updatedAt {
                return left.updatedAt > right.updatedAt
            }
            if left.createdAt != right.createdAt {
                return left.createdAt > right.createdAt
            }
            return left.id > right.id
        }
        var seenKeys = Set<String>()
        return sorted.filter { thread in
            let key = thread.memberId.isEmpty || thread.agentId.isEmpty
                ? "thread:\(thread.id)"
                : "\(thread.memberId):\(thread.agentId)"
            return seenKeys.insert(key).inserted
        }
    }

    private var selectedThreadID: String? {
        selectedThread?.id
    }

    private func mutateSelectedThread(ifMatching threadId: String, _ mutate: (inout ChatThreadDetail) -> Void) {
        guard var thread = selectedThread, thread.id == threadId else { return }
        mutate(&thread)
        selectedThread = thread
    }

    private func showThreadPlaceholder(threadId: String, overview: ChatOverview) {
        guard let summary = overview.threads.first(where: { $0.id == threadId }) else { return }
        let existingDetail = selectedThread?.id == threadId ? selectedThread : nil
        selectedThread = placeholderThreadDetail(summary: summary, existingDetail: existingDetail)
    }

    private func loadThreadDetail(threadId: String) {
        selectedThreadLoadTask?.cancel()
        let transport = self.transport

        selectedThreadLoadTask = Task { [weak self] in
            do {
                let detail = try await transport.fetchThread(threadId: threadId)
                guard !Task.isCancelled else { return }

                await MainActor.run {
                    guard let self, self.selectedThread?.id == threadId else { return }
                    self.selectedThread = detail
                    self.errorMessage = nil
                }
            } catch {
                guard !Task.isCancelled else { return }

                await MainActor.run {
                    guard let self, self.selectedThread?.id == threadId else { return }
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
}

public struct ChillClawChatTranscriptView: View {
    public let thread: ChatThreadDetail

    public init(thread: ChatThreadDetail) {
        self.thread = thread
    }

    public var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                ForEach(thread.messages) { message in
                    let isUser = message.role == "user"

                    HStack(alignment: .bottom, spacing: 10) {
                        if isUser { Spacer(minLength: 72) }

                        VStack(alignment: .leading, spacing: 8) {
                            if nativeChatMessageIsThinking(message) {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .controlSize(.small)
                                    Text(thread.composerState.activityLabel ?? "Thinking…")
                                        .font(.callout)
                                }
                            } else {
                                Text(message.text)
                                    .textSelection(.enabled)
                            }
                            if let toolActivities = nativeChatInlineToolActivities(thread: thread, message: message), !toolActivities.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(toolActivities, id: \.id) { activity in
                                        HStack(alignment: .top, spacing: 8) {
                                            Text(activity.status.rawValue.capitalized)
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(.secondary)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(activity.label)
                                                    .font(.caption.weight(.semibold))
                                                if let detail = activity.detail, !detail.isEmpty {
                                                    Text(detail)
                                                        .font(.caption)
                                                        .foregroundStyle(.secondary)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if let error = message.error {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                            if let status = message.status, !nativeChatMessageIsThinking(message) {
                                Text(status.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                            Text(nativeChatDisplayTimestamp(message.timestamp))
                                .font(.caption)
                                .foregroundStyle(isUser ? Color.white.opacity(0.84) : .secondary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(
                                    isUser
                                        ? AnyShapeStyle(
                                            LinearGradient(
                                                colors: [
                                                    Color.blue,
                                                    Color.blue.opacity(0.78)
                                                ],
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        : AnyShapeStyle(Color.white.opacity(0.94))
                                )
                                .shadow(color: Color.black.opacity(0.05), radius: 18, x: 0, y: 10)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .stroke(isUser ? Color.clear : Color.black.opacity(0.06), lineWidth: 1)
                        )
                        .foregroundStyle(isUser ? Color.white : Color.primary)

                        if !isUser { Spacer(minLength: 72) }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
        }
    }
}

private func nativeChatDisplayTimestamp(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "" }
    guard let date = ISO8601DateFormatter().date(from: value) else { return value }

    if Calendar.current.isDateInToday(date) {
        return date.formatted(.dateTime.hour().minute())
    }

    return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
}

private func canSendChatDraft(_ draft: String, canSend: Bool) -> Bool {
    canSend && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

private func composerAvailability(for status: String) -> (canSend: Bool, canAbort: Bool) {
    switch status.lowercased() {
    case "sending":
        return (false, false)
    case "thinking", "streaming", "aborting":
        return (false, true)
    case "error", "idle":
        return (true, false)
    default:
        return (true, false)
    }
}

private func upsertChatMessages(_ messages: [ChatMessage], message: ChatMessage) -> [ChatMessage] {
    var next = messages
    if let index = next.firstIndex(where: {
        $0.id == message.id ||
        ($0.clientMessageId != nil && $0.clientMessageId == message.clientMessageId)
    }) {
        next[index] = message
        return next
    }

    next.append(message)
    return next
}

private func optimisticThreadDetail(thread: ChatThreadDetail, message: String, clientMessageId: String) -> ChatThreadDetail {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let userMessage = ChatMessage(
        id: "\(thread.id):user:\(clientMessageId)",
        role: "user",
        text: message,
        timestamp: timestamp,
        clientMessageId: clientMessageId,
        status: "pending"
    )
    let assistantMessage = ChatMessage(
        id: "\(thread.id):assistant:stream",
        role: "assistant",
        text: "",
        timestamp: timestamp,
        status: "pending",
        pending: true
    )

    return ChatThreadDetail(
        id: thread.id,
        memberId: thread.memberId,
        agentId: thread.agentId,
        sessionKey: thread.sessionKey,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: timestamp,
        lastPreview: message,
        lastMessageAt: timestamp,
        unreadCount: thread.unreadCount,
        activeRunState: "sending",
        historyStatus: thread.historyStatus,
        composerState: ChatComposerState(
            status: "sending",
            canSend: false,
            canAbort: false,
            activityLabel: "Sending…",
            error: nil,
            bridgeState: thread.composerState.bridgeState,
            toolActivities: []
        ),
        messages: upsertChatMessages(upsertChatMessages(thread.messages, message: userMessage), message: assistantMessage),
        historyError: thread.historyError
    )
}

private func placeholderThreadDetail(summary: ChatThreadSummary, existingDetail: ChatThreadDetail?) -> ChatThreadDetail {
    ChatThreadDetail(
        id: summary.id,
        memberId: summary.memberId,
        agentId: summary.agentId,
        sessionKey: summary.sessionKey,
        title: summary.title,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        lastPreview: summary.lastPreview ?? existingDetail?.lastPreview,
        lastMessageAt: summary.lastMessageAt ?? existingDetail?.lastMessageAt,
        unreadCount: summary.unreadCount,
        activeRunState: summary.activeRunState,
        historyStatus: summary.historyStatus,
        composerState: summary.composerState,
        messages: existingDetail?.messages ?? [],
        historyError: existingDetail?.historyError
    )
}

private func nativeChatMessageIsThinking(_ message: ChatMessage) -> Bool {
    (message.pending ?? false) && message.role == "assistant" && message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

private func nativeChatInlineToolActivities(thread: ChatThreadDetail, message: ChatMessage) -> [ChatToolActivity]? {
    guard
        message.role == "assistant",
        let toolActivities = thread.composerState.toolActivities,
        !toolActivities.isEmpty,
        ["sending", "thinking", "streaming", "aborting"].contains(thread.composerState.status.lowercased())
    else {
        return nil
    }

    let activeStreamMessageId = "\(thread.id):assistant:stream"
    let activeAssistantMessage = thread.messages.last(where: { $0.role == "assistant" })
    guard message.id == activeStreamMessageId || activeAssistantMessage?.id == message.id else {
        return nil
    }

    return toolActivities
}
