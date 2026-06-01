import Foundation
import WidgetKit

@MainActor
final class DiaryStore: ObservableObject {
    @Published var data: DiaryData {
        didSet {
            save()
            writeWidgetSnapshot()
        }
    }

    private let dataKey = "adhdeeds_swift_data_v1"
    private let widgetKey = "adhdeeds_widget_snapshot_v1"

    // Replace this with your real App Group once created in Xcode.
    private let appGroupID = "group.com.yourname.adhdeeds"

    init() {
        if let saved = UserDefaults.standard.data(forKey: dataKey),
           let decoded = try? JSONDecoder().decode(DiaryData.self, from: saved) {
            data = decoded
        } else {
            data = .seeded
        }
        writeWidgetSnapshot()
    }

    var weekStart: Date {
        Calendar.current.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
    }

    var weekDays: [Date] {
        (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: weekStart) }
    }

    var weekTasks: [DiaryTask] {
        data.tasks.filter { task in
            weekDays.contains { $0.isSameDay(as: task.date) }
        }
    }

    var points: Int {
        let taskPoints = weekTasks.filter(\.done).reduce(0) { $0 + $1.points }
        let habitPoints = data.habits.reduce(0) { total, habit in
            total + weekDays.filter { habit.ticks.contains($0.dayKey) }.count * habit.points
        }
        return taskPoints + habitPoints
    }

    func addTask(_ task: DiaryTask) {
        data.tasks.append(task)
    }

    func updateTask(_ task: DiaryTask) {
        guard let index = data.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        data.tasks[index] = task
    }

    func deleteTask(_ task: DiaryTask) {
        data.tasks.removeAll { $0.id == task.id }
    }

    func toggleTask(_ task: DiaryTask) {
        guard let index = data.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        data.tasks[index].done.toggle()
    }

    func moveTask(_ task: DiaryTask, to date: Date, penalise: Bool = false) {
        guard let index = data.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        data.tasks[index].date = date
        if penalise {
            data.tasks[index].points = max(0, data.tasks[index].points - 5)
        }
    }

    func addHabit(_ habit: Habit) {
        data.habits.append(habit)
    }

    func updateHabit(_ habit: Habit) {
        guard let index = data.habits.firstIndex(where: { $0.id == habit.id }) else { return }
        data.habits[index] = habit
    }

    func deleteHabit(_ habit: Habit) {
        data.habits.removeAll { $0.id == habit.id }
    }

    func toggleHabit(_ habit: Habit, on date: Date) {
        guard let index = data.habits.firstIndex(where: { $0.id == habit.id }) else { return }
        let key = date.dayKey
        if data.habits[index].ticks.contains(key) {
            data.habits[index].ticks.remove(key)
        } else {
            data.habits[index].ticks.insert(key)
        }
    }

    func worthDoingNextByCategory() -> [(TaskCategory, DiaryTask)] {
        TaskCategory.allCases.compactMap { category in
            let task = weekTasks
                .filter { $0.category == category && !$0.done }
                .sorted { lhs, rhs in
                    if lhs.important != rhs.important { return lhs.important && !rhs.important }
                    return lhs.points > rhs.points
                }
                .first
            return task.map { (category, $0) }
        }
    }

    private func save() {
        guard let encoded = try? JSONEncoder().encode(data) else { return }
        UserDefaults.standard.set(encoded, forKey: dataKey)
    }

    private func writeWidgetSnapshot() {
        let todayTasks = data.tasks.filter { $0.date.isSameDay(as: Date()) }
        let next = todayTasks.filter { !$0.done }.sorted { $0.points > $1.points }.first
        let snapshot = WidgetSnapshot(
            points: points,
            completedToday: todayTasks.filter(\.done).count,
            totalToday: todayTasks.count,
            nextTaskName: next?.name,
            nextTaskCategory: next?.category.rawValue,
            nextTaskPoints: next?.points
        )
        guard let encoded = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(encoded, forKey: widgetKey)
        UserDefaults(suiteName: appGroupID)?.set(encoded, forKey: widgetKey)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
