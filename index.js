const fs = require("fs");
const parser = new (require("rss-parser"))();
const express = require("express");
const bodyParser = require("body-parser");
const md5 = require("md5");

const config = require("./config");
const validAPIKey = md5(`${config.email}:${config.password}`);
console.log(`API key: ${validAPIKey}`);

class Feed {
	constructor(id, title, feedURL, siteURL, lastUpdated, items = []) {
		this.id = id;
		this.faviconID = id;
		this.title = title;
		this.feedURL = feedURL;
		this.siteURL = siteURL;
		this.lastUpdated = lastUpdated;
		this.items = items;
	}

	static fromPersistedJSON(obj) {
		return new Feed(obj.id, obj.title, obj.feedURL, obj.siteURL, obj.lastUpdated, obj.items);
	}

	toFeverJSON() {
		return {
			id: this.id,
			favicon_id: this.faviconID,
			title: this.title,
			url: this.feedURL,
			site_url: this.siteURL,
			last_updated_on_time: this.lastUpdated,
			is_spark: false
		};
	}
}

class FeedItem {
	constructor(id, feedID, guid, title, link, creator, createdDate, content, read = false) {
		this.id = id;
		this.feedID = feedID;
		this.guid = guid;
		this.title = title;
		this.link = link;
		this.creator = creator;
		this.createdDate = createdDate;
		this.content = content;
		this.read = read;
	}

	static fromPersistedJSON(obj) {
		return new FeedItem(obj.id, obj.feedID, obj.guid, obj.title, obj.link, obj.creator, obj.createdDate, obj.content, obj.read);
	}

	toFeverJSON() {
		return {
			id: this.id,
			feed_id: this.feedID,
			title: this.title,
			author: this.creator,
			html: this.content,
			url: this.link,
			is_saved: 0,
			is_read: this.read ? 1 : 0,
			created_on_time: this.createdDate
		};
	}
}

Array.prototype.partition = function(func) {
	let first = [], second = [];
	for (const el of this) {
		(func(el) ? first : second).push(el);
	}
	return [first, second];
};

let feeds, items;

fs.readFile("data/feeds.json", (err, data) => {
	feeds = err ? [] : JSON.parse(data).map(Feed.fromPersistedJSON);
	

	console.log("Existing feeds: " + feeds.map(it => it.title));

	fs.readFile("data/items.json", (err, data) => {
		items = err ? [] : JSON.parse(data).map(FeedItem.fromPersistedJSON);

		updateFeeds();
		setInterval(updateFeeds, 1000 * 60 * 15);
	});
});

let maxFeedID;
let maxID;

function updateFeeds() {
	console.log("Updating feeds...");

	maxFeedID = feeds.length;
	maxID = items.length;

	const promises = config.feeds.map(url => {
		let existingFeed = feeds.find(feed => feed.feedURL === url);
		if (existingFeed) { // existing feed
			let existingItems = existingFeed.items.map(id => items[id]);
			return parser.parseURL(url).then(parsed => {
				existingFeed.lastUpdated = Date.now();
				parsed.items.forEach(item => {
					if (!existingItems.some(existing => existing.guid === item.guid)) {
						const id = maxID++;
						existingFeed.items.push(id);
						items.push(new FeedItem(id, item.guid, item.title, item.link, item.creator, Date.parse(item.isoDate), item.content));
					}
				});
			});
		} else { // new feed
			return parser.parseURL(url).then(parsed => {
				let feed = new Feed(maxFeedID++, parsed.title, url, parsed.link, Date.now());
				feed.items = parsed.items.map(item => {
					const id = maxID++;
					items.push(new FeedItem(id, item.guid, item.title, item.link, item.creator, Date.parse(item.isoDate), item.content));
					return id;
				});
				feeds.push(feed);
			});
		}
	});

	Promise.all(promises).then(() => {
		console.log("Finished updating feeds.");
	});
}

function exitHandler() {
	fs.writeFileSync("data/feeds.json", JSON.stringify(feeds, null, 4));
	fs.writeFileSync("data/items.json", JSON.stringify(items, null, 4));
	process.exit();
}

process.on("exit", exitHandler);
process.on("SIGINT", exitHandler);

function createGroups(response) {
	response["groups"] = [];
	response["feeds_groups"] = [];
	return response;
}

function createFeeds(response) {
	response["feeds"] = feeds.map(feed => feed.toFeverJSON());
	response["feed_groups"] = [];
	return Promise.resolve(response);
}

function createFavicons(response) {
	response["favicons"] = [];
	return Promise.resolve(response);
}

function createLinks(response) {
	response["links"] = [];
	return Promise.resolve(response);
}

function createUnread(response) {
	response["unread_item_ids"] = "";
	response["saved_item_ids"] = "";
	return Promise.resolve(response);
}

function createSaved(response) {
	response["saved_item_ids"] = "";
	return Promise.resolve(response);
}

function createItems(response, since, max, ids) {
	if (ids !== undefined) {
		response["items"] = ids.map(id => items[id]);
	} else if (since !== undefined) {
		repsonse["items"] = items.filter(item => item.id > since).sort((a, b) => a.id - b.id).slice(0, 50);
	} else if (max !== undefined) {
		repsonse["items"] = items.filter(item => item.id < since).sort((a, b) => a.id - b.id).slice(0, 50);
	} else {
		response["items"] = items.sort((a, b) => a.id - b.id).slice(0, 50);
	}
	response["items"] = response["items"].map(item => item.toFeverJSON());
	response["total_items"] = response["items"].length;
	return Promise.resolve(response);
}

const app = express();

app.use(bodyParser.urlencoded({
	extended: false
}));

app.post("/fever", (req, res) => {
	const query = req.query;

	if (!query.hasOwnProperty("api")) {
		res.status(400).end();
		return;
	}

	const apiKey = req.body["api_key"];
	if (apiKey !== validAPIKey) {
		res.status(401).end();
		return;
	}

	let response = Promise.resolve({});

	if (query.hasOwnProperty("groups")) {
		response = response.then(createGroups);
	}
	if (query.hasOwnProperty("feeds")) {
		response = response.then(createFeeds);
	}
	if (query.hasOwnProperty("favicons")) {
		response = response.then(createFavicons);
	}
	if (query.hasOwnProperty("links")) {
		response = response.then(createLinks);
	}
	if (query.hasOwnProperty("unread_item_ids")) {
		response = response.then(createUnread);
	}
	if (query.hasOwnProperty("saved_item_ids")) {
		response = response.then(createSaved);
	}
	if (query.hasOwnProperty("items")) {
		let since = query.hasOwnProperty("since_id") ? parseInt(query["since_id"]) : undefined;
		let max = query.hasOwnProperty("max_id") ? parseInt(query["max_id"]) : undefined;
		let ids = query.hasOwnProperty("with_ids") ? query["with_ids"].split(",").map(it => parseInt(it)) : undefined;
		response = response.then(res => createItems(res, since, max, ids));
	}

	response.then(response => {
		res.json(response).status(200).end();
	});
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`Listening on port ${process.env.PORT || 3000}`);
});