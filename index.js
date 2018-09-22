const fs = require("fs");
const parser = new (require("rss-parser"))();
const express = require("express");
const bodyParser = require("body-parser");
const md5 = require("md5");

const config = require("./config");

function stringify(obj) {
	if (config.prettyPrint) {
		return JSON.stringify(obj, null, 4);
	} else {
		return JSON.stringify(obj);
	}
}

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
	constructor(id, feedID, guid, title, link, creator, createdDate, content, read = false, readDate = null) {
		this.id = id;
		this.feedID = feedID;
		this.guid = guid;
		this.title = title;
		this.link = link;
		this.creator = creator;
		this.createdDate = createdDate;
		this.content = content;
		this.read = read;
		this.readDate = readDate;
	}

	static fromPersistedJSON(obj) {
		return new FeedItem(obj.id, obj.feedID, obj.guid, obj.title, obj.link, obj.creator, obj.createdDate, obj.content, obj.read, obj.readDate);
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
			created_on_time: this.createdDate / 1000 // JS dates are in miliseconds, Fever wants Unix time in seconds
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
let maxFeedID, maxID;
let readGUIDs;

fs.readFile("data/ids.json", (err, data) => {
	const ids = err ? {maxFeedID: 0, maxItemID: 0} : JSON.parse(data);
	maxFeedID = ids.maxFeedID;
	maxID = ids.maxItemID;

	fs.readFile("data/read.json", (err, data) => {
		readGUIDs = err ? [] : JSON.parse(data);

		fs.readFile("data/feeds.json", (err, data) => {
			feeds = err ? [] : JSON.parse(data).map(Feed.fromPersistedJSON);

			console.log("Existing feeds: " + feeds.map(it => it.title));

			fs.readFile("data/items.json", (err, data) => {
				items = err ? [] : JSON.parse(data).map(FeedItem.fromPersistedJSON);

				updateFeeds();
				setInterval(updateFeeds, 1000 * 60 * 15);
			});
		});
	});
});

function updateFeeds() {
	console.log("Updating feeds...");

	const promises = config.feeds.map(url => {
		let existingFeed = feeds.find(feed => feed.feedURL === url);
		if (existingFeed) { // existing feed
			let existingItems = existingFeed.items.map(id => items.find(item => item.id === id));
			return parser.parseURL(url).then(parsed => {
				existingFeed.lastUpdated = Date.now();
				parsed.items.forEach(item => {
					const itemGUID = item.guid ? item.guid : item.link;
					const hasExistingItem = existingItems.some(existing => existing.guid === itemGUID);
					const isRead = readGUIDs.includes(itemGUID);
					if (!hasExistingItem && !isRead) {
						const id = maxID++;
						existingFeed.items.push(id);
						items.push(new FeedItem(id, existingFeed.id, itemGUID, item.title, item.link, item.creator, Date.parse(item.isoDate), item.content));
					}
				});
			});
		} else { // new feed
			return parser.parseURL(url).then(parsed => {
				const feedID = maxFeedID++;
				let feed = new Feed(feedID, parsed.title, url, parsed.link, Date.now());
				feed.items = parsed.items.map(item => {
					const id = maxID++;
					const guid = item.guid ? item.guid : item.link;
					items.push(new FeedItem(id, feedID, guid, item.title, item.link, item.creator, Date.parse(item.isoDate), item.content));
					return id;
				});
				feeds.push(feed);
			});
		}
	});

	Promise.all(promises).then(() => {
		console.log("Finished updating feeds.");
		const [discard, keep] = items.partition(item => item.read && Date.now() - item.readDate > 1000 * 60 * 60 * 24 * 7);
		discard.forEach(item => {
			const feed = feeds.find(feed => feed.id === item.feedID);
			const i = feed.items.indexOf(item.id);
			if (i > -1) feed.items.splice(i, 1);
			readGUIDs.push(item.guid);
		});
		items = keep;
		console.log(`Pruned ${discard.length} read items.`);
		console.log("Saving data...");
		fs.writeFile("data/feeds.json", stringify(feeds), (err) => {
			if (err) throw err;
			fs.writeFile("data/items.json", stringify(items), (err) => {
				if (err) throw err;
				fs.writeFile("data/ids.json", stringify({maxFeedID: maxFeedID, maxItemID: maxID}), (err) => {
					if (err) throw err;
					fs.writeFile("data/read.json", stringify(readGUIDs), (err) => {
						if (err) throw err;
						console.log("Finished saving data.");
					});
				});
			});
		});
	});
}

function exitHandler() {
	fs.writeFileSync("data/feeds.json", stringify(feeds));
	fs.writeFileSync("data/items.json", stringify(items));
	fs.writeFileSync("data/ids.json", stringify({maxFeedID: maxFeedID, maxItemID: maxID}));
	fs.writeFileSync("data/read.json", stringify(readGUIDs));
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
	const unread = items.filter(item => !item.read).map(item => item.id).join(",");
	response["unread_item_ids"] = unread;
	return Promise.resolve(response);
}

function createSaved(response) {
	response["saved_item_ids"] = "";
	return Promise.resolve(response);
}

function createItems(response, since, max, ids) {
	if (ids !== undefined) {
		response["items"] = ids.map(id => items.find(item => item.id === id));
	} else if (since !== undefined) {
		response["items"] = items.filter(item => item.id > since).sort((a, b) => a.id - b.id).slice(0, 50);
	} else if (max !== undefined) {
		response["items"] = items.filter(item => item.id < since).sort((a, b) => a.id - b.id).slice(0, 50);
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
	const query = req.query, body = req.body;

	console.log(`Handling request: ${req.originalUrl} | ${JSON.stringify(req.body)}`);

	if (!query.hasOwnProperty("api")) {
		res.status(400).end();
		return;
	}

	const apiKey = body["api_key"];
	if (apiKey !== validAPIKey) {
		const response = {
			api_version: 2,
			auth: 0
		};
		res.status(401).json(response).end();
		return;
	}

	let response = Promise.resolve({
		api_version: 2,
		auth: 1
	});

	// Actions
	if (body["mark"] === "item" && body["as"] === "read") {
		const id = parseInt(body["id"]);
		const item = items.find(item => item.id === id);
		item.read = true;
		item.readDate = Date.now();
	}
	if (body["unread_recently_read"] === 1) {
		items.filter(item => item.read && Date.now() - item.readDate <= 1000 * 60 * 60).forEach(item => {
			item.read = false;
			item.readDate = null;
		});
	}

	// Responses
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