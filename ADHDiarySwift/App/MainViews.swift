import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var store: DiaryStore
    @State private var energy: EnergyMode = .normal
    @State private var editingTask: DiaryTask?
    @State private var addingTask = false
    @State private var reframe: (task: DiaryTask, firstStep: String, note: String)?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Today")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(Date(), format: .dateTime.weekday(.wide).day().month(.wide))
                            .font(.title.bold())
                        Text("\(store.points) points this week")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                Section("Daily plan") {
                    Picker("Energy", selection: $energy) {
                        ForEach(EnergyMode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    ForEach(Array(AIHelpers.dailyPlan(today: Date(), tasks: store.weekTasks, habits: store.data.habits, energy: energy).enumerated()), id: \.offset) { index, item in
                        Text("\(index + 1). \(item)")
                    }
                }

                Section("Today's tasks") {
                    ForEach(store.weekTasks.filter { $0.date.isSameDay(as: Date()) }) { task in
                        TaskRowView(
                            task: task,
                            onToggle: { store.toggleTask(task) },
                            onEdit: { editingTask = task },
                            onMoveTomorrow: { moveTomorrow(task, penalise: false) },
                            onMoveTomorrowPenalty: { moveTomorrow(task, penalise: true) },
                            onReframe: { openReframe(task) }
                        )
                    }
                }

                Section("Worth doing next") {
                    ForEach(store.worthDoingNextByCategory(), id: \.1.id) { category, task in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(category.rawValue).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text(task.name).font(.headline)
                            Text("\(task.points) points").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("ADHDeeds")
            .toolbar {
                Button("Add", systemImage: "plus") { addingTask = true }
            }
            .sheet(isPresented: $addingTask) { TaskFormView() }
            .sheet(item: $editingTask) { TaskFormView(existing: $0) }
            .sheet(item: reframeBinding) { item in
                ReframeView(task: item.task, firstStep: item.firstStep, note: item.note)
            }
        }
    }

    private func moveTomorrow(_ task: DiaryTask, penalise: Bool) {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: task.date) ?? task.date
        store.moveTask(task, to: tomorrow, penalise: penalise)
    }

    private func openReframe(_ task: DiaryTask) {
        let result = AIHelpers.reframe(task)
        reframe = (task, result.firstStep, result.note)
    }

    private var reframeBinding: Binding<ReframeItem?> {
        Binding {
            reframe.map { ReframeItem(task: $0.task, firstStep: $0.firstStep, note: $0.note) }
        } set: { _ in
            reframe = nil
        }
    }
}

struct ReframeItem: Identifiable {
    let id = UUID()
    let task: DiaryTask
    let firstStep: String
    let note: String
}

struct ReframeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: DiaryStore
    let task: DiaryTask
    let firstStep: String
    let note: String

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text(note)
                VStack(alignment: .leading, spacing: 8) {
                    Text("First step").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Text(firstStep).font(.headline)
                }
                .padding()
                .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                Button("Add first step as task") {
                    store.addTask(DiaryTask(name: firstStep, category: task.category, date: task.date, points: 5))
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .padding()
            .navigationTitle("Kind Reframe")
            .toolbar { Button("Done") { dismiss() } }
        }
    }
}
