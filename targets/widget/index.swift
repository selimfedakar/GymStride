// GymStride — Streak home-screen widget (WidgetKit)
// Reads the shared app-group UserDefaults written by the RN app
// (lib/widget.ts) and renders the current streak. No network access.
import WidgetKit
import SwiftUI

private let appGroup = "group.com.selimfedakar.gymstride"

struct StreakEntry: TimelineEntry {
  let date: Date
  let current: Int
  let longest: Int
}

struct Provider: TimelineProvider {
  private func read() -> StreakEntry {
    let defaults = UserDefaults(suiteName: appGroup)
    let current = defaults?.integer(forKey: "current_streak") ?? 0
    let longest = defaults?.integer(forKey: "longest_streak") ?? 0
    return StreakEntry(date: Date(), current: current, longest: longest)
  }

  func placeholder(in context: Context) -> StreakEntry {
    StreakEntry(date: Date(), current: 5, longest: 12)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    completion(read())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    // Refresh a little after midnight so the streak stays current.
    let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date()
    completion(Timeline(entries: [read()], policy: .after(next)))
  }
}

struct StreakWidgetEntryView: View {
  var entry: Provider.Entry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(entry.current > 0 ? "🔥" : "💤")
        .font(.system(size: 34))
      Text("\(entry.current)-day")
        .font(.system(size: 22, weight: .heavy))
        .foregroundColor(.white)
      Text("streak")
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(.orange)
      Spacer()
      Text("Best \(entry.longest)d")
        .font(.system(size: 11))
        .foregroundColor(.gray)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding()
    .background(Color(red: 0.04, green: 0.04, blue: 0.04))
  }
}

@main
struct StreakWidget: Widget {
  let kind: String = "GymStrideStreak"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      StreakWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("GymStride Streak")
    .description("Keep your training streak in sight.")
    .supportedFamilies([.systemSmall])
  }
}
