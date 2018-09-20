// const parser = new (require("rss-parser"))();
// const Sequelize = require("sequelize");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const md5 = require("md5");

const config = require("./config");
const validAPIKey = md5(`${config.email}:${config.password}`);
console.log(`API key: ${validAPIKey}`);

function createGroups(response) {
	response["groups"] = [];
	response["feeds_groups"] = [];
	return response;
}

function createFeeds(response) {
	return new Promise((resolve, reject) => {
		fs.readFile("feeds.json", (err, data) => {
			const feeds = err ? [] : JSON.parse(data);
			response["feeds"] = feeds;
			response["feeds_groups"] = [];
			resolve(response);
		});
	});
}

const app = express();

app.use(bodyParser.urlencoded({
	extended: false
}));

app.get("/fever", (req, res) => {
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

	response.then(response => {
		res.json(response).status(200).end();
	});
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`Listening on port ${process.env.PORT || 3000}`);
});