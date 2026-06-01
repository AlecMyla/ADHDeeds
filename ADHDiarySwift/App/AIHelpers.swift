import Foundation

enum EnergyMode: String, CaseIterable, Identifiable {
    case low = "Low"
    case normal = "Normal"
    case push = "Push"

    var id: String { rawValue }
}

struct AIHelpers {
    static func breakdown(for task: DiaryTask) -> [DiaryTask] {
        let lower = task.name.lowercased()
        let points = max(5, min(10, task.points / 2))
        let names: [String]

        if lower.contains("call") || lower.contains("gp") {
            names = ["Find the number", "Write the 3 things to ask", "Make the call"]
        } else if lower.contains("email") || lower.contains("send") {
            names = ["Open the right thread", "Draft the shortest acceptable message", "Send it"]
        } else if lower.contains("submit") || lower.contains("application") {
            names = ["Open the form", "Gather missing details", "Submit the application"]
        } else if lower.contains("find") || lower.contains("order") || lower.contains("buy") {
            names = ["Choose where to look first", "Pick one good enough option", "Finish the order or decision"]
        } else {
            names = ["Open or prepare it", "Do the smallest visible step", "Finish it"]
        }

        return names.map {
            DiaryTask(name: $0, category: task.category, date: task.date, points: points)
        }
    }

    static func dailyPlan(today: Date, tasks: [DiaryTask], habits: [Habit], energy: EnergyMode) -> [String] {
        let limit = energy == .low ? 2 : energy == .push ? 5 : 3
        let chosenTasks = tasks
            .filter { $0.date.isSameDay(as: today) && !$0.done }
            .sorted { lhs, rhs in
                if lhs.important != rhs.important { return lhs.important && !rhs.important }
                return lhs.points > rhs.points
            }
            .prefix(limit)
            .map { "\($0.name) (\($0.points) pts)" }

        let habit = habits.first { !$0.ticks.contains(today.dayKey) }.map { "\($0.name) (\($0.points) pts)" }
        let plan = Array(chosenTasks) + (habit.map { [$0] } ?? [])
        return plan.isEmpty ? ["Everything visible for today is already clear."] : plan
    }

    static func reframe(_ task: DiaryTask) -> (firstStep: String, note: String) {
        let lower = task.name.lowercased()
        if lower.contains("call") {
            return ("Write the first sentence for \(task.name)", "Make the call easier to begin before you try to finish it.")
        }
        if lower.contains("submit") || lower.contains("application") {
            return ("Open \(task.name) and find the first required field", "This only needs to become visible first.")
        }
        if lower.contains("send") || lower.contains("email") {
            return ("Write a rough two-line draft for \(task.name)", "Messy draft first. Polished message second.")
        }
        return ("Spend 10 minutes starting \(task.name)", "Make the task smaller than your resistance to it.")
    }
}
