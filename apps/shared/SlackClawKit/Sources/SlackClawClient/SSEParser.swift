import Foundation

public struct SSEParser: Sendable {
    private final class BufferBox: @unchecked Sendable {
        var buffer = ""
    }

    private let box = BufferBox()

    public init() {}

    public func feed(_ chunk: String) -> [String] {
        box.buffer += chunk
        var events: [String] = []

        while let range = box.buffer.range(of: "\n\n") {
            let frame = String(box.buffer[..<range.lowerBound])
            box.buffer = String(box.buffer[range.upperBound...])

            let dataLines = frame
                .split(separator: "\n", omittingEmptySubsequences: false)
                .compactMap { line -> String? in
                    if line.hasPrefix(":") {
                        return nil
                    }

                    if line.hasPrefix("data:") {
                        return String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    }

                    return nil
                }

            guard !dataLines.isEmpty else {
                continue
            }

            events.append(dataLines.joined(separator: "\n"))
        }

        return events
    }
}
