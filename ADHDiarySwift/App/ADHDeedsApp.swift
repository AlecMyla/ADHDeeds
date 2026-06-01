import SwiftUI

@main
struct ADHDeedsApp: App {
    @StateObject private var store = DiaryStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
        }
    }
}
