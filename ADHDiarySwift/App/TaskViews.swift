import SwiftUI

struct TaskRowView: View {
    let task: DiaryTask
    var onToggle: () -> Void
    var onEdit: () -> Void
    var onMoveTomorrow: () -> Void
    var onMoveTomorrowPenalty: () -> Void
    var onReframe: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onToggle) {
                Image(systemName: task.done ? "checkmark.square.fill" : "square")
                    .foregroundStyle(task.done ? .blue : .secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 5) {
                Text(task.name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(task.done ? .secondary : .primary)
                    .strikethrough(task.done)
                HStack {
                    Text(task.category.rawValue)
                    Text("\(task.points) pts")
                    if task.important && !task.done { Text("Important") }
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            }

            Spacer()

            Menu {
                Button("Reframe", systemImage: "sparkles", action: onReframe)
                Button("Edit", systemImage: "pencil", action: onEdit)
                Button("Move to tomorrow", systemImage: "arrow.right", action: onMoveTomorrow)
                Button("Move tomorrow, -5", systemImage: "minus.circle", action: onMoveTomorrowPenalty)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 8)
    }
}

struct TaskFormView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: DiaryStore

    var existing: DiaryTask?

    @State private var name = ""
    @State private var category: TaskCategory = .work
    @State private var date = Date()
    @State private var points = 10
    @State private var important = false
    @State private var breakdown: [DiaryTask] = []

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Task", text: $name)
                    Picker("Category", selection: $category) {
                        ForEach(TaskCategory.allCases) { Text($0.rawValue).tag($0) }
                    }
                    DatePicker("Day", selection: $date, displayedComponents: .date)
                    Picker("Points", selection: $points) {
                        Text("Quick 5").tag(5)
                        Text("Standard 10").tag(10)
                        Text("Bigger task 20").tag(20)
                    }
                    Toggle("Important", isOn: $important)
                }

                Section {
                    Button("Break into smaller tasks", systemImage: "sparkles") {
                        breakdown = AIHelpers.breakdown(for: draftTask)
                    }
                    ForEach(breakdown) { task in
                        Text(task.name)
                    }
                    if !breakdown.isEmpty {
                        Button("Add these tasks") {
                            breakdown.forEach { store.addTask($0) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "Add Task" : "Edit Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if var existing {
                            existing.name = name
                            existing.category = category
                            existing.date = date
                            existing.points = points
                            existing.important = important
                            store.updateTask(existing)
                        } else {
                            store.addTask(draftTask)
                        }
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                guard let existing else { return }
                name = existing.name
                category = existing.category
                date = existing.date
                points = existing.points
                important = existing.important
            }
        }
    }

    private var draftTask: DiaryTask {
        DiaryTask(name: name, category: category, date: date, points: points, important: important)
    }
}
