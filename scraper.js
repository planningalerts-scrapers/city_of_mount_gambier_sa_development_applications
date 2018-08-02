// Parses the development applications at the South Australian City of Mount Gambier web site and
// places them in a database.
//
// Michael Bone
// 2nd August 2018

"use strict";

let cheerio = require("cheerio");
let request = require("request-promise-native");
let sqlite3 = require("sqlite3").verbose();
let moment = require("moment");

const DevelopmentApplicationsUrl = "https://ecouncil.mountgambier.sa.gov.au/eservice/daEnquiryInit.do?nodeNum=21461";
const CommentUrl = "mailto:city@mountgambier.sa.gov.au";

// Sets up an sqlite database.

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}

// Inserts a row in the database if it does not already exist.

async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function(error, row) {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);

                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Parses the development applications.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the first page.

    console.log(`Retrieving page: ${DevelopmentApplicationsUrl}`);
    let body = await request(DevelopmentApplicationsUrl);
    let $ = cheerio.load(body);

    // Examine the HTML to determine how many pages need to be retrieved.

    let pageCount = Math.max(1, $("tr.pagerRow td").length - 1);
    let eventValidation = $("input[name='__EVENTVALIDATION']").val();
    let viewState = $("input[name='__VIEWSTATE']").val();

    if (pageCount === 1)
        console.log(`There is ${pageCount} page to parse.`)
    else
        console.log(`There are ${pageCount} pages to parse.`)

    // Process the text from each page.
    //
    // for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    //     console.log(`Parsing page ${pageIndex} of ${pageCount}.`);
    //
    //     // Retrieve a subsequent page.
    //
    //     if (pageIndex >= 2) {
    //         try {
    //             let body = await request.post({
    //                 url: DevelopmentApplicationsUrl,
    //                 headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //                 form: {
    //                     __EVENTARGUMENT: `Page$${pageIndex}`,
    //                     __EVENTTARGET: "ctl00$Content$cusResultsGrid$repWebGrid$ctl00$grdWebGridTabularView",
    //                     __EVENTVALIDATION: eventValidation,
    //                     __VIEWSTATE: viewState
    //             }});
    //             $ = cheerio.load(body);
    //         } catch (ex) {
    //             console.log(ex);
    //             console.log("Continuing to the next page.");
    //             continue;
    //         }
    //     }
    //
    //     // Use cheerio to find all development applications listed in the current page.
    //
    //     for (let element of $("table.grid td a").get()) {
    //         // Check that a valid development application number was provided.
    //
    //         let applicationNumber = element.children[0].data.trim();
    //         if (!/^[0-9]{3}\/[0-9]{5}\/[0-9]{2}$/.test(applicationNumber))
    //             continue;
    //
    //         // Retrieve the page that contains the details of the development application.
    //
    //         let developmentApplicationUrl = DevelopmentApplicationUrl + encodeURIComponent(applicationNumber);
    //         let body = null;
    //         try {
    //             body = await request(developmentApplicationUrl);
    //         } catch (ex) {
    //             console.log(ex);
    //             console.log("Continuing to the next development application.");
    //             continue;
    //         }
    //
    //         // Extract the details of the development application and insert those details into the
    //         // database as a row in a table.
    //
    //         let $ = cheerio.load(body);
    //         let receivedDate = moment($("td.headerColumn:contains('Lodgement Date') ~ td").text().trim(), "D/MM/YYYY", true);  // allows the leading zero of the day to be omitted
    //         let address = $($("table.grid th:contains('Address')").parent().parent().find("tr.normalRow td")[0]).text().trim();
    //         let reason = $("td.headerColumn:contains('Description') ~ td").text().trim();  
    //
    //         if (address.length > 0) {
    //             await insertRow(database, {
    //                 applicationNumber: applicationNumber,
    //                 address: address,
    //                 reason: reason,
    //                 informationUrl: developmentApplicationUrl,
    //                 commentUrl: CommentUrl,
    //                 scrapeDate: moment().format("YYYY-MM-DD"),
    //                 receivedDate: receivedDate.isValid ? receivedDate.format("YYYY-MM-DD") : ""
    //             });
    //         }
    //     }
    // }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
