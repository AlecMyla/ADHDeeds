import SwiftUI
import WidgetKit

struct DiaryWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct DiaryTimelineProvider: TimelineProvider {
    private let widgetKey = "adhdeeds_widget_snapshot_v1"
    private let appGroupID = "group.com.yourname.adhdeeds"

    func placeholder(in context: Context) -> DiaryWidgetEntry {
        DiaryWidgetEntry(date: Date(), snapshot: sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (DiaryWidgetEntry) -> Void) {
        completion(DiaryWidgetEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DiaryWidgetEntry>) -> Void) {
        let entry = DiaryWidgetEntry(date: Date(), snapshot: loadSnapshot())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func loadSnapshot() -> WidgetSnapshot {
        let defaults = UserDefaults(suiteName: appGroupID) ?? .standard
        guard let data = defaults.data(forKey: widgetKey),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else {
            return sample
        }
        return snapshot
    }

    private var sample: WidgetSnapshot {
        WidgetSnapshot(points: 35, completedToday: 1, totalToday: 3, nextTaskName: "Call my GP", nextTaskCategory: "Health", nextTaskPoints: 20)
    }
}

struct NextTaskWidgetView: View {
    let entry: DiaryWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Next")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(entry.snapshot.nextTaskName ?? "All clear")
                .font(.headline)
                .lineLimit(3)
            Spacer()
            if let category = entry.snapshot.nextTaskCategory, let points = entry.snapshot.nextTaskPoints {
                Text("\(category) · \(points) pts")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

struct TodayWidgetView: View {
    let entry: DiaryWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ADHDeeds")
                    .font(.headline)
                Spacer()
                Text("\(entry.snapshot.points) pts")
                    .font(.headline)
            }
            Text("\(entry.snapshot.completedToday) of \(entry.snapshot.totalToday) tasks today")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Divider()
            Text(entry.snapshot.nextTaskName ?? "Nothing planned next")
                .font(.body.weight(.semibold))
                .lineLimit(2)
            if let category = entry.snapshot.nextTaskCategory {
                Text(category)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

struct NextTaskWidget: Widget {
    let kind = "NextTaskWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DiaryTimelineProvider()) { entry in
            NextTaskWidgetView(entry: entry)
        }
        .configurationDisplayName("Next Task")
        .description("Shows the task worth doing next.")
        .supportedFamilies([.systemSmall])
    }
}

struct TodaySummaryWidget: Widget {
    let kind = "TodaySummaryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DiaryTimelineProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today Summary")
        .description("Shows today's progress and next task.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct ADHDeedsWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextTaskWidget()
        TodaySummaryWidget()
    }
}
