import XCTest
@testable import TextToSpeechApp

final class LayoutGuidanceTests: XCTestCase {
    func testHorizontalPaddingForCompactWidths() {
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 800, isMinimalist: true), 8)
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 800, isMinimalist: false), 12)
    }

    func testHorizontalPaddingForMediumWidths() {
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 1000, isMinimalist: true), 12)
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 1000, isMinimalist: false), 16)
    }

    func testHorizontalPaddingForWideWidths() {
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 1400, isMinimalist: true), 16)
        XCTAssertEqual(LayoutGuidance.horizontalPadding(for: 1400, isMinimalist: false), 20)
    }
}
