import SwiftUI

struct WeekView: View {
    @EnvironmentObject private var store: DiaryStore
    @State private var editingTask: DiaryTask?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        MetricCard(title: "Weekly score", value: "\(store.points)", detail: "points")
                        MetricCard(title: "Progress", value: "\(store.weekTasks.filter(\.done).count) / \(store.weekTasks.count)", detail: "tasks")
                    }

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 8) {
                        ForEach(store.weekDays, id: \.dayKey) { day in
                            DayColumn(day: day, tasks: store.weekTasks.filter { $0.date.isSameDay(as: day) }, editingTask: $editingTask)
                        }
                    }

                    Text("Worth doing next")
                        .font(.headline)
                    ForEach(store.worthDoingNextByCategory(), id: \.1.id) { category, task in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(category.rawValue).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text(task.name).font(.subheadline.weight(.semibold))
                            Text("\(task.points) points").font(.caption).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }
                }
                .padding()
            }
            .navigationTitle("Week")
            .sheet(item: $editingTask) { TaskFormView(existing: $0) }
        }
    }
}

struct DayColumn: View {
    @EnvironmentObject private var store: DiaryStore
    let day: Date
    let tasks: [DiaryTask]
    @Binding var editingTask: DiaryTask?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(day, format: .dateTime.weekday(.abbreviated))
                .font(.caption.weight(.bold))
            Text(day, format: .dateTime.day().month(.abbreviated))
                .font(.caption2)
                .foregroundStyle(.secondary)

            ForEach(tasks) { task in
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.name)
                        .font(.caption)
                        .lineLimit(3)
                    Text("\(task.points) pts")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 10))
                .onTapGesture { editingTask = task }
            }

            Spacer(minLength: 20)
        }
        .padding(8)
        .frame(minHeight: 240, alignment: .top)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.title2.bold())
            Text(detail).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct HabitsView: View {
    @EnvironmentObject private var store: DiaryStore
    @State private var editingHabit: Habit?
    @State private var addingHabit = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.data.habits) { habit in
                    HabitRow(habit: habit)
                        .swipeActions {
                            Button("Delete", role: .destructive) { store.deleteHabit(habit) }
                            Button("Edit") { editingHabit = habit }.tint(.blue)
                        }
                }
            }
            .navigationTitle("Habits")
            .toolbar {
                Button("Add", systemImage: "plus") { addingHabit = true }
            }
            .sheet(isPresented: $addingHabit) { HabitFormView() }
            .sheet(item: $editingHabit) { HabitFormView(existing: $0) }
        }
    }
}

struct HabitRow: View {
    @EnvironmentObject private var store: DiaryStore
    let habit: Habit

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading) {
                    Text(habit.name).font(.headline)
                    Text("\(habit.detail) · \(habit.points) points").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(store.weekDays.filter { habit.ticks.contains($0.dayKey) }.count)")
                    .font(.title3.bold())
            }
            HStack {
                ForEach(store.weekDays, id: \.dayKey) { day in
                    Button {
                        store.toggleHabit(habit, on: day)
                    } label: {
                        Image(systemName: habit.ticks.contains(day.dayKey) ? "checkmark.square.fill" : "square")
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

struct HabitFormView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: DiaryStore
    var existing: Habit?

    @State private var name = ""
    @State private var detail = ""
    @State private var points = 5
    @State private var mode: HabitMode = .daily

    var body: some View {
        NavigationStack {
            Form {
                TextField("Habit", text: $name)
                TextField("Detail", text: $detail)
                Picker("Mode", selection: $mode) {
                    ForEach(HabitMode.allCases) { Text($0.rawValue).tag($0) }
                }
                Picker("Points", selection: $points) {
                    ForEach([5, 10, 15, 20], id: \.self) { Text("\($0) pts").tag($0) }
                }
            }
            .navigationTitle(existing == nil ? "Add Habit" : "Edit Habit")
            .toolbar {
                Button("Cancel") { dismiss() }
                Button("Save") {
                    let habit = Habit(id: existing?.id ?? UUID(), name: name, detail: detail, points: points, mode: mode, ticks: existing?.ticks ?? [])
                    existing == nil ? store.addHabit(habit) : store.updateHabit(habit)
                    dismiss()
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .onAppear {
                guard let existing else { return }
                name = existing.name
                detail = existing.detail
                points = existing.points
                mode = existing.mode
            }
        }
    }
}

struct TasksView: View {
    @EnvironmentObject private var store: DiaryStore
    @State private var addingTask = false
    @State private var editingTask: DiaryTask?

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.weekTasks.sorted { $0.date < $1.date }) { task in
                    TaskRowView(
                        task: task,
                        onToggle: { store.toggleTask(task) },
                        onEdit: { editingTask = task },
                        onMoveTomorrow: { moveTomorrow(task, penalise: false) },
                        onMoveTomorrowPenalty: { moveTomorrow(task, penalise: true) },
                        onReframe: {}
                    )
                    .swipeActions {
                        Button("Delete", role: .destructive) { store.deleteTask(task) }
                    }
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                Button("Add", systemImage: "plus") { addingTask = true }
            }
            .sheet(isPresented: $addingTask) { TaskFormView() }
            .sheet(item: $editingTask) { TaskFormView(existing: $0) }
        }
    }

    private func moveTomorrow(_ task: DiaryTask, penalise: Bool) {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: task.date) ?? task.date
        store.moveTask(task, to: tomorrow, penalise: penalise)
    }
}
