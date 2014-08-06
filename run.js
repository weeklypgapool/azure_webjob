"use strict";

var http = require('http');
var path = require('path');
var _ = require('lodash');
var Firebase = require('firebase');
//var MongoClient = require('mongodb').MongoClient;

var curTourneyRef = new Firebase('https://weeklypgapool.firebaseio.com/tournaments/current'),
		dataUrl, last_updated,
		pgaJson;

// Local functions

function ExitNode() {
	process.exit();
}

function PutPgaJsonIntoFb(pgaJson) {
	var lb = {
		"leaderboard": pgaJson.leaderboard
	};
	delete pgaJson.leaderboard;
	curTourneyRef.child('data').set(lb, function () {
		curTourneyRef.child('data/stats').set(pgaJson, function (err) {
			if (err) {
				console.log(err);
			} else {
				console.log('success');
				ExitNode();
			}
		});
	});
}

function FormatPgaJson(pgaJson) {
	var json = {};
	var players = [];
	json.last_updated = pgaJson.last_updated;
	pgaJson = pgaJson.leaderboard;
	json.tournament_name = pgaJson.tournament_name;
	json.current_round = pgaJson.current_round;
	json.round_state = pgaJson.round_state;
	json.start_date = pgaJson.start_date;
	json.end_date = pgaJson.end_date;
	json.is_started = pgaJson.is_started;
	json.is_finished = pgaJson.is_finished;
	players = pgaJson.players;
	json.leaderboard = _.map(players, function (player) {
		return {
			"name": player.player_bio.first_name + ' ' + player.player_bio.last_name,
			"player_id": player.player_id,
			"current_position": player.current_position,
			"total_strokes": player.total_strokes,
			"thru": player.thru,
			"today": player.today,
			"total": player.total,
			"money_event": player.rankings.projected_money_event
		};
	});
	return json;
}

function ExtractPgaDataIntoFb(dataUrl) {
	http.get(dataUrl, function (resp) {
		pgaJson = "";
		resp.on('data', function (chunk) {
			pgaJson += chunk;
		});
		resp.on('end', function () {
			pgaJson = JSON.parse(pgaJson);
			if (pgaJson.last_updated === last_updated) { ExitNode(); }
			pgaJson = FormatPgaJson(pgaJson);
			PutPgaJsonIntoFb(pgaJson);
		});
	}).end();
}

function IsWithinWindow() {
	// Exit if not Thu thru Sun, or too early, or too late
	var now = new Date();
	var dow = now.getDay();
	// Ensure that it's Thu thru Sun
	if (dow !== 0 && (dow < 4 || dow > 6)) { return false; }
	// Ensure that time is reasonable - between 4 am PST and 8 pm PST
	var time = dow.getTime();
	if (time < 1407236400000 || time > 1407294000000) { return false; }
	return true;
}

// ----  Main Processing

if (IsWithinWindow()) {
	// Get the website url for the current tournament.  This value is currently
	// manually entered into the fb.  Data transfer is done inside GetPgaJson()
	curTourneyRef.child('dataUrl').once('value', function (snap) {
		dataUrl = snap.val();
		curTourneyRef.child('data/last_updated').once('value', function (snap) {
			last_updated = snap.val();
			ExtractPgaDataIntoFb(dataUrl);
		});
	});
} else {
	console.log('Not within time window');
	ExitNode();
}


// Load last update info stored in Mongodb
//MongoClient.connect('mongodb://weeklypgapool:wpgap0333@ds050087.mongolab.com:50087/weeklypgapool', function(err, db) {
//	if (err) { process.exit(1); }
//	var coll = db.collection('last_update_cache');
//	
//});


