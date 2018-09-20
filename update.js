const fs = require("fs");
const parser = new (require("rss-parser"))();

const config = require("./config");

fs.readFile("data/items.json", (err, data) => {
	let items = err ? [] : JSON.parse(data);

	Promise.all(config.feeds.map(url => {
		return parser.parseURL(url).then(feed => {
			for (const item of feed.items) {
				if (!items.some(el => el.guid === item.guid)) {
					items.push(item);
					console.log("Added item: " + item.link);
				}
			}
		});
	})).then(() => {
		fs.writeFile("items.json", JSON.stringify(items, null, 4), (err) => {
			if (err) throw err;
		});
	});
});

Promise.all(config.feeds.map(url => {
	return parser.parseURL(url).then(feed => {
		return {
			id: config.feeds.indexOf(url),
			favicon_id: config.feeds.indexOf(url),
			title: feed.title,
			url: feed.feedUrl,
			site_url: feed.link,
			is_spark: 0,
			last_updated_on_time: Date.now()
		};
	});
})).then(feeds => {
	fs.writeFile("data/feeds.json", JSON.stringify(feeds, null, 4), (err) => {
		if (err) throw err;
	});
});