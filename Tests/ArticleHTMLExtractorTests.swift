import XCTest
@testable import TextToSpeechApp

final class ArticleHTMLExtractorTests: XCTestCase {
    func testExtractsArticleBodyFromArticleTag() {
        let html = """
        <html>
            <body>
                <nav>Nav Menu</nav>
                <article>
                    <header>
                        <h1>Search for missing Gus continues in remote South Australia</h1>
                    </header>
                    <p>The search resumed this morning with SES crews conducting grid sweeps across the remote scrubland near Coober Pedy.</p>
                    <p>Volunteers joined the effort as authorities expanded the perimeter and reviewed fresh sightings reported overnight by local pilots.</p>
                    <aside>Advertisement</aside>
                    <div class="related">Related content</div>
                    <p>Police confirmed they are coordinating with pastoral stations to access water tanks and sheds in case the teenager sought shelter.</p>
                </article>
                <footer>Footer links</footer>
            </body>
        </html>
        """

        let extracted = ArticleHTMLExtractor.extractPrimaryText(from: html)

        XCTAssertNotNil(extracted)
        guard let text = extracted else { return }

        XCTAssertTrue(text.contains("Search for missing Gus continues in remote South Australia"))
        XCTAssertTrue(text.contains("The search resumed this morning with SES crews"))
        XCTAssertTrue(text.contains("Police confirmed they are coordinating"))
        XCTAssertFalse(text.lowercased().contains("nav menu"))
        XCTAssertFalse(text.lowercased().contains("related content"))
        XCTAssertFalse(text.lowercased().contains("advertisement"))
    }

    func testExtractsArticleBodyFromKeywordContainer() {
        let html = """
        <html>
            <body>
                <header>Top banner</header>
                <div class="article__body">
                    <h1>Flood warnings remain as rivers keep rising</h1>
                    <p>Emergency crews are monitoring several catchments after heavy rainfall soaked much of the state's north overnight.</p>
                    <p>Residents in low-lying areas have been asked to prepare to move to higher ground if conditions worsen later today.</p>
                    <div class="share-tools">Share this story</div>
                    <p>Authorities will reassess the levee network this afternoon once peak flows pass the gauge at the main crossing.</p>
                </div>
                <div class="trending">Trending stories</div>
            </body>
        </html>
        """

        let extracted = ArticleHTMLExtractor.extractPrimaryText(from: html)

        XCTAssertNotNil(extracted)
        guard let text = extracted else { return }

        XCTAssertTrue(text.contains("Flood warnings remain as rivers keep rising"))
        XCTAssertTrue(text.contains("Emergency crews are monitoring several catchments"))
        XCTAssertTrue(text.contains("Authorities will reassess the levee network"))
        XCTAssertFalse(text.lowercased().contains("share this story"))
        XCTAssertFalse(text.lowercased().contains("trending stories"))
    }

    func testShortFragmentsAreIgnored() {
        let html = """
        <html>
            <body>
                <article>
                    <p>Short update.</p>
                </article>
            </body>
        </html>
        """

        let extracted = ArticleHTMLExtractor.extractPrimaryText(from: html)
        XCTAssertNil(extracted)
    }

    func testNavigationHeaderInsideArticleIsRemoved() {
        let html = """
        <html>
            <body>
                <article>
                    <header>
                        <nav>Main sections: news, opinion, sport, lifestyle</nav>
                    </header>
                    <p>Rescuers continued combing the desert tracks overnight with mounted patrols, drones, and local volunteers coordinating search grids across difficult terrain and sand dunes.</p>
                    <p>Police supervisors said the plan includes additional water drops, extended radio checkpoints, and fresh briefings to ensure every outstation is contacted before midday.</p>
                </article>
            </body>
        </html>
        """

        let extracted = ArticleHTMLExtractor.extractPrimaryText(from: html)

        XCTAssertNotNil(extracted)
        guard let text = extracted else { return }

        XCTAssertFalse(text.lowercased().contains("main sections"))
        XCTAssertTrue(text.contains("Rescuers continued combing the desert tracks overnight"))
        XCTAssertTrue(text.contains("Police supervisors said the plan includes additional water drops"))
    }
}
