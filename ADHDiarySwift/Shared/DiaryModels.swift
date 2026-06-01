import Foundation

enum TaskCategory: String, CaseIterable, Codable, Identifiable {
    case work = "Work"
    case personal = "Personal"
    case home = "Home"
    case health = "Health"
    case family = "Family"
    case finance = "Finance"

    var id: String { rawValue }
}

enum HabitMode: String, CaseIterable, Codable, Identifiable {
    case daily = "Daily"
    case optional = "Optional"
    case weekly = "Weekly"

    var id: String { rawValue }
}

struct DiaryTask: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var category: TaskCategory
    var date: Date
    var points: Int
    var done: Bool = false
    var important: Bool = false
}

struct Habit: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var detail: String
    var points: Int
    var mode: HabitMode
    var ticks: Set<String> = []
}

struct DiaryData: Codable {
    var tasks: [DiaryTask]
    var habits: [Habit]

    static var seeded: DiaryData {
        let calendar = Calendar.current
        let monday = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        func day(_ offset: Int) -> Date { calendar.date(byAdding: .day, value: offset, to: monday) ?? monday }

        return DiaryData(
            tasks: [
                DiaryTask(name: "HDI email", category: .work, date: day(0), points: 10, done: true),
                DiaryTask(name: "Order contact lenses", category: .personal, date: day(0), points: 5),
                DiaryTask(name: "Roland onboarding sessions", category: .work, date: day(1), points: 20),
                DiaryTask(name: "Call my GP", category: .health, date: day(1), points: 20, important: true),
                DiaryTask(name: "Organise Hartford call", category: .work, date: day(2), points: 10),
                DiaryTask(name: "Send QBE DocuSign", category: .work, date: day(3), points: 10, important: true),
                DiaryTask(name: "Find styles for holiday / summer", category: .personal, date: day(4), points: 10),
                DiaryTask(name: "Find bridge for water pipe", category: .home, date: day(5), points: 10),
                DiaryTask(name: "Submit PSA application", category: .personal, date: day(6), points: 20)
            ],
            habits: [
                Habit(name: "7+ hours sleep", detail: "Daily goal", points: 5, mode: .daily),
                Habit(name: "Walk the dogs", detail: "Every day", points: 5, mode: .daily),
                Habit(name: "Clean clothes put away", detail: "When laundry is done", points: 5, mode: .optional),
                Habit(name: "Go into the office", detail: "Once each week", points: 15, mode: .weekly)
            ]
        )
    }
}

struct WidgetSnapshot: Codable {
    var points: Int
    var completedToday: Int
    var totalToday: Int
    var nextTaskName: String?
    var nextTaskCategory: String?
    var nextTaskPoints: Int?
}

extension Date {
    var dayKey: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: self)
    }

    func isSameDay(as other: Date) -> Bool {
        Calendar.current.isDate(self, inSameDayAs: other)
    }
}
