import SwiftUI
#if os(iOS)
import UIKit
#endif

enum ResurfaceStyle {
    static let background = dynamic(
        light: Color(red: 0.97, green: 0.96, blue: 0.93),
        dark: Color(red: 0.05, green: 0.07, blue: 0.09)
    )
    static let panel = dynamic(
        light: Color(red: 1.00, green: 0.99, blue: 0.96),
        dark: Color(red: 0.09, green: 0.12, blue: 0.15)
    )
    static let card = dynamic(
        light: Color(red: 1.00, green: 1.00, blue: 0.98),
        dark: Color(red: 0.12, green: 0.16, blue: 0.20)
    )
    static let ink = dynamic(
        light: Color(red: 0.13, green: 0.15, blue: 0.16),
        dark: Color(red: 0.94, green: 0.91, blue: 0.84)
    )
    static let muted = dynamic(
        light: Color(red: 0.38, green: 0.42, blue: 0.43),
        dark: Color(red: 0.62, green: 0.66, blue: 0.68)
    )
    static let accent = Color(red: 0.84, green: 0.66, blue: 0.38)
    static let danger = Color(red: 0.83, green: 0.32, blue: 0.28)

    static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    private static func dynamic(light: Color, dark: Color) -> Color {
#if os(iOS)
        Color(uiColor: UIColor { traits in
            UIColor(traits.userInterfaceStyle == .dark ? dark : light)
        })
#else
        light
#endif
    }
}

extension View {
    func resurfaceScreen() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(ResurfaceStyle.background)
            .foregroundStyle(ResurfaceStyle.ink)
    }
}
