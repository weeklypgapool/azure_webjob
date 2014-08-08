"use strict";

var http = require('http');
var path = require('path');
var _ = require('lodash');
var Firebase = require('firebase');

var curTourneyRef = new Firebase('https://weeklypgapool.firebaseio.com/tournaments/current'),
		dataUrl, last_updated,
		pgaJson, round_state;

// Authenticate to fb
curTourneyRef.auth('uOdRH5Zyzy4QzGSB1HFO2thq6KsKrTWx3FTSKd8A');

// Local functions

function ExitNode() {
	process.exit();
}

function PutPgaJsonIntoFb(pgaJson) {
	var lb = pgaJson.leaderboard
	delete pgaJson.leaderboard;
	// Remove all '.' not allowed as FB key
	var lbStr = JSON.stringify(lb);
	lbStr =	lbStr.replace(/\./g, '');
	lb = JSON.parse(lbStr);
	curTourneyRef.child('data/stats').update(pgaJson);
	curTourneyRef.child('data/leaderboard').set(lb, function (err) {
		if (err) {
			console.log(err);
		} else {
			console.log('success');
			ExitNode();
		}
	});
}

function FormatPgaJson(pgaJson) {
	var json = {};
	var players = [];
	json.last_updated = pgaJson.last_updated;
	pgaJson = pgaJson.leaderboard;
	json.round_state = pgaJson.round_state;
	json.tournament_name = pgaJson.tournament_name;
	json.current_round = pgaJson.current_round;
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
			"money_event": player.rankings.projected_money_event,
			"tee_times": {
				"1": player.rounds['0'].tee_time,
				"2": player.rounds['1'].tee_time,
				"3": player.rounds['2'].tee_time,
				"4": player.rounds['3'].tee_time
			}
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
			if (pgaJson.round_state !== 'In Progress'
		 				&& (pgaJson.round_state === round_state)) { ExitNode(); }
			pgaJson = FormatPgaJson(pgaJson);
			PutPgaJsonIntoFb(pgaJson);
		});
	}).end();
}

function IsWithinWindow(callback) {
	// Check if should force new data
	curTourneyRef.child('forceNewData').once('value', function (snap) {
		if (snap.val() == true) {
			curTourneyRef.child('forceNewData').set(false);
			callback();
		} else {
			// Exit if not Thu thru Sun, or too early, or too late
			var now = new Date();
			var dow = now.getDay();
			// Ensure that it's Thu thru Sun
			if (dow !== 0 && (dow < 4 || dow > 6)) {
				console.log('Not within time window');
				ExitNode();
			}
			// Ensure that time is reasonable - between 4 am PST and 8 pm PST
			var time = now.getHours();
			if (time < 4 || time > 22) {
				console.log('Not within time window');
				ExitNode();
			}
			callback();
		}
	});
}

function DoWork() {
	// Get the website url for the current tournament.  This value is currently
	// manually entered into the fb.  Data transfer is done inside GetPgaJson()
	curTourneyRef.child('dataUrl').once('value', function (snap) {
		dataUrl = snap.val();
		curTourneyRef.child('data/last_updated').once('value', function (snap) {
			last_updated = snap.val();
			curTourneyRef.child('data/stats/round_state').once('value', function (snap) {
				round_state = snap.val();
				ExtractPgaDataIntoFb(dataUrl);
			});
		});
	});
}

// ----  Main Processing
IsWithinWindow(DoWork);
