import Foundation
import Observation
import SwiftUI
import SlackClawProtocol
import SlackClawClient

public protocol SlackClawChatTransport: Sendable {
    func fetchOverview() async throws -> ChatOverview
    func fetchThread(threadId: String) async throws -> ChatThreadDetail
    func createThread(memberId: String) async throws -> ChatActionResponse
    func sendMessage(threadId: String, message: String, clientMessageId: String?) async throws -> ChatActionResponse
    func abort(threadId: String) async throws -> ChatActionResponse
    func events() async throws -> AsyncThrowingStream<ChatStreamEvent, Error>
}

public struct DaemonChatTransport: SlackClawChatTransport {
    private let client: SlackClawAPIClient

    public init(client: SlackClawAPIClient) {
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
public final class SlackClawChatViewModel {
    public private(set) var overview = ChatOverview(threads: [])
    public private(set) var selectedThread: ChatThreadDetail?
    public private(set) var errorMessage: String?
    public var draftMessage = ""

    private let transport: SlackClawChatTransport
    private var eventTask: Task<Void, Never>?

    public init(transport: SlackClawChatTransport) {
        self.transport = transport
    }

    public func start() async {
        await refresh()
        guard eventTask == nil else { return }
        eventTask = Task { [weak self] in
            guard let self else { return }
            do {
                let stream = try await self.transport.events()
                for try await event in stream {
                    await MainActor.run {
                        self.apply(event)
                    }
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    public func refresh() async {
        do {
            let overview = try await transport.fetchOverview()
            self.overview = overview
            if let current = selectedThread?.id ?? overview.threads.first?.id {
                self.selectedThread = try await transport.fetchThread(threadId: current)
            }
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func selectThread(_ threadId: String) async {
        do {
            self.selectedThread = try await transport.fetchThread(threadId: threadId)
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func createThread(memberId: String) async {
        do {
            let response = try await transport.createThread(memberId: memberId)
            self.overview = response.overview
            self.selectedThread = response.thread
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func sendCurrentMessage() async {
        guard let threadId = selectedThread?.id, !draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        let message = draftMessage
        draftMessage = ""
        let clientMessageId = UUID().uuidString

        do {
            let response = try await transport.sendMessage(threadId: threadId, message: message, clientMessageId: clientMessageId)
            self.overview = response.overview
            if let thread = response.thread {
                self.selectedThread = thread
            } else {
                self.selectedThread = try await transport.fetchThread(threadId: threadId)
            }
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    public func abortCurrentRun() async {
        guard let threadId = selectedThread?.id else { return }
        do {
            let response = try await transport.abort(threadId: threadId)
            self.overview = response.overview
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
            if selectedThread?.id == threadId {
                selectedThread = detail
            }
        case let .messageCreated(threadId, message):
            guard selectedThread?.id == threadId else { return }
            if selectedThread?.messages.contains(where: { $0.id == message.id }) == false {
                selectedThread?.messages.append(message)
            }
        case let .runStarted(threadId, message, _):
            guard selectedThread?.id == threadId else { return }
            if selectedThread?.messages.contains(where: { $0.id == message.id }) == false {
                selectedThread?.messages.append(message)
            }
        case let .assistantThinking(threadId, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "thinking")
        case let .assistantToolStatus(threadId, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "thinking")
        case let .assistantDelta(threadId, message, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "streaming")
            guard selectedThread?.id == threadId else { return }
            if let index = selectedThread?.messages.firstIndex(where: { $0.id == message.id }) {
                selectedThread?.messages[index] = message
            } else {
                selectedThread?.messages.append(message)
            }
        case let .assistantCompleted(_, detail, _),
             let .assistantAborted(_, detail, _):
            upsert(detail: detail)
            if selectedThread?.id == detail.id {
                selectedThread = detail
            }
        case let .assistantFailed(threadId, error, detail, activityLabel):
            updateComposer(threadId: threadId, activityLabel: activityLabel, status: "error", error: error)
            if let detail, selectedThread?.id == threadId {
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

    private func updateComposer(threadId: String, activityLabel: String?, status: String, error: String? = nil) {
        guard let index = overview.threads.firstIndex(where: { $0.id == threadId }) else { return }
        overview.threads[index].composerState.status = status
        overview.threads[index].composerState.activityLabel = activityLabel
        overview.threads[index].composerState.error = error
        if selectedThread?.id == threadId {
            selectedThread?.composerState.status = status
            selectedThread?.composerState.activityLabel = activityLabel
            selectedThread?.composerState.error = error
        }
    }
}

public struct SlackClawChatTranscriptView: View {
    public let messages: [ChatMessage]

    public init(messages: [ChatMessage]) {
        self.messages = messages
    }

    public var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(messages) { message in
                    HStack {
                        if message.role == "user" { Spacer(minLength: 60) }
                        VStack(alignment: .leading, spacing: 6) {
                            Text(message.text)
                                .textSelection(.enabled)
                            if let timestamp = message.timestamp {
                                Text(timestamp)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(12)
                        .background(message.role == "user" ? Color.accentColor.opacity(0.9) : Color.secondary.opacity(0.12))
                        .foregroundStyle(message.role == "user" ? Color.white : Color.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        if message.role != "user" { Spacer(minLength: 60) }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding()
        }
    }
}
