# ADHDeeds SwiftUI Starter

This folder contains the Swift code for a native iOS version of ADHDeeds with day-one WidgetKit support.

## Xcode Setup

1. Create a new iOS App in Xcode named `ADHDeeds`.
2. Choose SwiftUI for the interface.
3. Add a Widget Extension named `ADHDeedsWidgets`.
4. Add an App Group capability to both targets.
5. Replace `group.com.yourname.adhdeeds` in `DiaryStore.swift` and `ADHDeedsWidgets.swift` with your real App Group ID.
6. Add files from:
   - `Shared/` to both the app target and widget target
   - `App/` to the app target only
   - `Widgets/` to the widget target only
7. Delete Xcode's default `ContentView.swift` and default widget file if they conflict.

## Included

- Today, Week, Habits, and Tasks tabs
- Add/edit/delete tasks
- Add/edit/delete habits
- Move task to tomorrow with or without a 5 point deduction
- Category-specific "Worth doing next"
- Local AI-style task breakdown, daily plan, and kind reframe
- Small and medium widgets using a shared widget snapshot
