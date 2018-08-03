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

const DevelopmentApplicationMainUrl = "https://ecouncil.mountgambier.sa.gov.au/eservice/daEnquiryInit.do?nodeNum=21461";
const DevelopmentApplicationSearchUrl = "https://ecouncil.mountgambier.sa.gov.au/eservice/daEnquiry.do?number=&lodgeRangeType=on&dateFrom={0}&dateTo={1}&detDateFromString=&detDateToString=&streetName=&suburb=0&unitNum=&houseNum=0%0D%0A%09%09%09%09%09&planNumber=&strataPlan=&lotNumber=&propertyName=&searchMode=A&submitButton=Search";
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

    // Retrieve the main page.

    console.log(`Retrieving page: ${DevelopmentApplicationMainUrl}`);
    let jar = request.jar();  // this cookie jar will end up containing the JSESSIONID_live cookie after the first request; the cookie is required for the second request
    await request({ url: DevelopmentApplicationMainUrl, jar: jar });

    // Retrieve the results of a search.

    let dateFrom = encodeURIComponent(moment().subtract(1, "months").format("DD/MM/YYYY"));
    let dateTo = encodeURIComponent(moment().format("DD/MM/YYYY"));
    let developmentApplicationSearchUrl = DevelopmentApplicationSearchUrl.replace(/\{0\}/g, dateFrom).replace(/\{1\}/g, dateTo);
    console.log(`Retrieving search results for: ${developmentApplicationSearchUrl}`);

    let body = await request({ url: developmentApplicationSearchUrl, jar: jar });
    let $ = cheerio.load(body);

    // Parse the search results.

    for (let element of $("h4.non_table_headers").get()) {
        let applicationNumber = "";
        let address = $(element).text().trim().replace(/\s\s+/g, " ");
        let reason = "";
        let receivedDate = "";
        for (let subElement of $(element).next("div").get()) {
            for (let pairElement of $(subElement).find("p.rowDataOnly").get()) {
                let key = $(pairElement).children("span.key").text().trim();
                let value = $(pairElement).children("span.inputField").text().trim();
                if (key === "Type of Work")
                    reason = value;
                else if (key === "Application No.")
                    applicationNumber = value;
                else if (key === "Date Lodged")
                    receivedDate = value;
            }
        }
        let parsedReceivedDate = moment(receivedDate, "D/MM/YYYY", true);  // allows the leading zero of the day to be omitted
        if (applicationNumber !== "" && address !== "") {
            await insertRow(database, {
                applicationNumber: applicationNumber,
                address: address,
                reason: reason,
                informationUrl: DevelopmentApplicationMainUrl,
                commentUrl: CommentUrl,
                scrapeDate: moment().format("YYYY-MM-DD"),
                receivedDate: parsedReceivedDate.isValid ? parsedReceivedDate.format("YYYY-MM-DD") : ""
            });
        }
    }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
