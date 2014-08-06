"use strict";

var http = require('http');
var path = require('path');
var _ = require('lodash');
var Firebase = require('firebase');
var MongoClient = require('mongodb').MongoClient;

var curTourneyRef = new Firebase('https://weeklypgapool.firebaseio.com/tournaments/current'),
		dataUrl, last_updated,
		pgaJson;

// Local functions

function ExitNode() {
	process.exit();
}

function PutPgaJsonIntoFb(pgaJson) {
	curTourneyRef.child('data').set(pgaJson, ExitNode());
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

function GetPgaJson(dataUrl) {
	http.get(dataUrl, function (resp) {
		pgaJson = "";
		resp.on('data', function (chunk) {
			pgaJson += chunk;
		});
		resp.on('end', function () {
			pgaJson = JSON.parse(pgaJson);
			if (pgaJson.last_updated === last_updated) { process.exit(); };
			pgaJson = FormatPgaJson(pgaJson);
			PutPgaJsonIntoFb(pgaJson);
		});
	}).end();
}

// ----  Main Processing

// Exit if not Thu thru Sun, or too early, or too late
var now = new Date();
var dow = now.getDay();
// Ensure that it's Thu thru Sun
if (dow === 0 || (dow >= 4 && dow <= 6)) {
	// Ensure that time is reasonable - between 4 am PST and 8 pm PST
	var time = dow.getTime();
	if (time >= 1407236400000 && time <= 1407294000000) {
		// Get the website url for the current tournament.  This value is currently
		// manually entered into the fb.  Data transfer is done inside GetPgaJson()
		curTourneyRef.child('dataUrl').once('value', function (snap) {
			dataUrl = snap.val();
			curTourneyRef.child('data/last_updated').once('value', function (snap) {
				last_updated = snap.val();
				pgaJson = GetPgaJson(dataUrl);
			});
		});
	} else {
		console.log('Not between 4 am and 8 pm');
		process.exit();
	}
} else {
	console.log('Not Thu thru Sun');
	process.exit();
};




//if (today is monday thru wed) quit
//if (time is > 6 pm) quit
//if (time is < 5 am) quit
//download from pga site
//if (is_started) {
//	//tourney has started, continue
//	if ()
//	
//}
//

//// Load last update info stored in Mongodb
//MongoClient.connect('mongodb://weeklypgapool:wpgap0333@ds050087.mongolab.com:50087/weeklypgapool', function(err, db) {
//	if (err) { process.exit(1); }
//	var coll = db.collection('last_update_cache');
//	
//});


