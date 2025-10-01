import XCTest
@testable import TextToSpeechApp

final class RedditContentParserTests: XCTestCase {
    func testParsesPostWithNestedComments() throws {
        let json = """
        [
          {
            "kind": "Listing",
            "data": {
              "children": [
                {
                  "kind": "t3",
                  "data": {
                    "title": "Sample Thread",
                    "selftext": "Body text",
                    "author": "poster",
                    "url": "https://example.com/post"
                  }
                }
              ]
            }
          },
          {
            "kind": "Listing",
            "data": {
              "children": [
                {
                  "kind": "t1",
                  "data": {
                    "author": "commenter",
                    "body": "Top comment",
                    "replies": {
                      "kind": "Listing",
                      "data": {
                        "children": [
                          {
                            "kind": "t1",
                            "data": {
                              "author": "replier",
                              "body": "Nested reply"
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
        """.data(using: .utf8)!

        let text = try RedditContentParser.buildThreadText(from: json)

        XCTAssertTrue(text.contains("Sample Thread"))
        XCTAssertTrue(text.contains("Posted by u/poster"))
        XCTAssertTrue(text.contains("Body text"))
        XCTAssertTrue(text.contains("Comments:"))
        XCTAssertTrue(text.contains("> u/commenter: Top comment"))
        XCTAssertTrue(text.contains(">> u/replier: Nested reply"))
    }

    func testAddsTruncationNoticeWhenCommentLimitExceeded() throws {
        let commentEntries = (0..<85).map { index in
            """
            {
              "kind": "t1",
              "data": {
                "author": "user\(index)",
                "body": "Comment \(index)"
              }
            }
            """
        }.joined(separator: ",")

        let jsonString = """
        [
          {
            "kind": "Listing",
            "data": {
              "children": [
                {
                  "kind": "t3",
                  "data": {
                    "title": "Overflowing Thread",
                    "selftext": "Body text",
                    "author": "poster"
                  }
                }
              ]
            }
          },
          {
            "kind": "Listing",
            "data": {
              "children": [
                \(commentEntries)
              ]
            }
          }
        ]
        """

        let data = jsonString.data(using: .utf8)!
        let text = try RedditContentParser.buildThreadText(from: data)

        XCTAssertTrue(text.contains("Overflowing Thread"))
        XCTAssertTrue(text.contains("...comments truncated for brevity."))
    }
}
