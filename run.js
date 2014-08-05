"use strict";

var http = require('http');
var path = require('path');
var _ = require('lodash');
var Firebase = require('firebase');

var curTourneyRef = new Firebase('https://weeklypgapool.firebaseio.com/tournaments/current'),
		dataUrl,
		pgaJson;

// Local functions

function PutPgaJsonIntoFb(pgaJson) {
	curTourneyRef.child('data').set(pgaJson);
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
			pgaJson = FormatPgaJson(pgaJson);
			PutPgaJsonIntoFb(pgaJson);
		});
	}).end();
}

// Get the website url for the current tournament.  This value is currently
// manually entered into the fb
curTourneyRef.child('dataUrl').once('value', function (snap) {
	dataUrl = snap.val();
	pgaJson = GetPgaJson(dataUrl);
});
