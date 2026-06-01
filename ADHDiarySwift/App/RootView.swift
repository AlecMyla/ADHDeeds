import SwiftUI

struct RootView: View {
    enum Tab {
        case today, week, habits, tasks
    }

    @State private var tab: Tab = .today

    var body: some View {
        TabView(selection: $tab) {
            TodayView()
                .tabItem { Label("Today", systemImage: "house") }
                .tag(Tab.today)

            WeekView()
                .tabItem { Label("Week", systemImage: "calendar") }
                .tag(Tab.week)

            HabitsView()
                .tabItem { Label("Habits", systemImage: "flame") }
                .tag(Tab.habits)

            TasksView()
                .tabItem { Label("Tasks", systemImage: "chart.bar") }
                .tag(Tab.tasks)
        }
        .tint(Color(red: 0.21, green: 0.47, blue: 0.87))
    }
}
