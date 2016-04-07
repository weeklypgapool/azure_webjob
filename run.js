"use strict";

var http = require('http');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var Firebase = require('firebase');

var curTourneyRef = new Firebase('https://weeklypgapool.firebaseio.com/tournaments/current'),
		dataUrl,
		last_updated,
		pgaJson,
		round_state,
		isGolfDotCom = false,
		config = {};

// Authenticate to fb
curTourneyRef.auth('uOdRH5Zyzy4QzGSB1HFO2thq6KsKrTWx3FTSKd8A');

// Local functions

function ExitNode() {
	process.exit();
}

function PutPgaJsonIntoFb(pgaJson) {
	var lb = pgaJson.leaderboard;
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

function PutPgaJsonIntoFbGolfDotCom(pgaJson) {
	var lb = pgaJson.leaderboard;
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
//	json.start_date = pgaJson.start_date;
//	json.end_date = pgaJson.end_date;
//	json.is_started = pgaJson.is_started;
//	json.is_finished = pgaJson.is_finished;
	players = pgaJson.players;
	json.leaderboard = _.map(players, function (player) {
		return {
			"name": player.player_bio.first_name + ' ' + player.player_bio.last_name,
			"is_amateur": player.player_bio.is_amateur,
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

function FormatPgaJsonGolfDotCom(pgaJson, callback) {
	var json = {};
	var players = [];
	json.last_updated = pgaJson.cts;
	json.round_state = pgaJson.crst;
	json.tournament_name = pgaJson.tn;
	json.current_round = pgaJson.cr;
	pgaJson.pu = pgaJson.pu.replace(/[$,]/g,'');
	json.money = {'total_purse': parseInt(pgaJson.pu)};
	players = pgaJson.ps.p;
	json.leaderboard = _.map(players, function (player) {	
		return {
			"name": player.fn + ' ' + player.ln,
			"player_id": player.pid,
			"current_position": player.cp,
			"total_strokes": player.ts,
			"thru": player.th,
			"today": player.cpr,
			"total": player.tpr,
			"tee_times": getTeeTimesGolfDotCom(player)
		};
	});
	ComputeMoneyAndPutInJsonGolfDotCom(json, function () {
		callback(json);
	});
}

function ComputeMoneyAndPutInJsonGolfDotCom(json, callback) {
	var totalPurse,
			moneyByPos;
	if (config.money_computed_manually) {
		moneyByPos = config.payouts;
		ProcessPayoutsGolfDotCom(json, moneyByPos);
		callback();
	} else {
		totalPurse = json.money.total_purse;
		moneyByPos = BuildMoneyArray(totalPurse);
		ProcessPayoutsGolfDotCom(json, moneyByPos);
		callback();
	}
}
	
// function ProcessPayoutsGolfDotCom(json, moneyByPos) {
// 	var	prevPos = json.leaderboard[0].current_position,
// 		amateur_count = 0,
// 		tieStart = 1,
// 		tieCount = 0,
// 		tieMoney = 0;
// 	_.forEach(json.leaderboard, function (player, idx) {
// 		if (player.is_amateur) {		
// 			amateur_count++;
// 			json.leaderboard[idx].money_event = 0;
// 			return;
// 		}
// 		if (player.current_position !== prevPos) {
// 			// Compute and store prev position(s)
// 			for (var i = 0; i < tieCount; i++) {
// 				json.leaderboard[tieStart + i - 1 + amateur_count].money_event = Math.round(tieMoney / tieCount);
// 			}
// 			// Save new pos
// 			prevPos = player.current_position;
// 			// Reset counters
// 			tieCount = 1;
// 			tieMoney = moneyByPos[idx + 1 - amateur_count];
// 			// Mark position of possible tie
// 			tieStart = idx + 1;
// 		} else {
// 			// Accumulate
// 			tieCount++;
// 			tieMoney = tieMoney + moneyByPos[idx + 1 - amateur_count];
// 		}
// 	});
// 	// Last 'group' of players
// 	for (var i = 0; i < tieCount; i++) {
// 		json.leaderboard[tieStart + i - 1].money_event = Math.round(tieMoney / tieCount);
// 	}
// }

function ProcessPayoutsGolfDotCom(json, moneyByPos) {
	var moneyIdx = 1;
	var playerCount = 0;
	var sumMoney = 0;
	var savePos = json.leaderboard[0].current_position;
	_.forEach(json.leaderboard, function (player, idx) {
		if (player.current_position !== savePos) spreadMoney(idx);
		if (player.is_amateur) {
			json.leaderboard[idx].money_event = 0;
		} else {
			sumMoney += moneyByPos[moneyIdx];
			moneyIdx++;
			playerCount++;
		} 
	});

	function spreadMoney (idx) {
		var money = Math.round(sumMoney / playerCount);
		savePos = json.leaderboard[idx].current_position;
		while (playerCount > 0) {
			if (!json.leaderboard[idx - 1].is_amateur) {  // check if amateur
				json.leaderboard[idx - 1].money_event = money;
				playerCount--;
			}
			idx--;  // move player pointer back
		}
		sumMoney = 0;
	}

}




function BuildMoneyArray(purse) {
	var arr = [];
	arr[1] = Math.round(purse * 0.18);
	arr[2] = Math.round(purse * 0.108);
	arr[3] = Math.round(purse * 0.068);
	arr[4] = Math.round(purse * 0.048);
	arr[5] = Math.round(purse * 0.04);
	arr[6] = Math.round(purse * 0.036);
	arr[7] = Math.round(purse * 0.0335);
	arr[8] = Math.round(purse * 0.031);
	arr[9] = Math.round(purse * 0.029);
	arr[10] = Math.round(purse * 0.027);
	arr[11] = Math.round(purse * 0.025);
	arr[12] = Math.round(purse * 0.023);
	arr[13] = Math.round(purse * 0.021);
	arr[14] = Math.round(purse * 0.019);
	arr[15] = Math.round(purse * 0.018);
	arr[16] = Math.round(purse * 0.017);
	arr[17] = Math.round(purse * 0.016);
	arr[18] = Math.round(purse * 0.015);
	arr[19] = Math.round(purse * 0.014);
	arr[20] = Math.round(purse * 0.013);
	arr[21] = Math.round(purse * 0.012);
	arr[22] = Math.round(purse * 0.0112);
	arr[23] = Math.round(purse * 0.0104);
	arr[24] = Math.round(purse * 0.0096);
	arr[25] = Math.round(purse * 0.0088);
	arr[26] = Math.round(purse * 0.0080);
	arr[27] = Math.round(purse * 0.0077);
	arr[28] = Math.round(purse * 0.0074);
	arr[29] = Math.round(purse * 0.0071);
	arr[30] = Math.round(purse * 0.0068);
	arr[31] = Math.round(purse * 0.0065);
	arr[32] = Math.round(purse * 0.0062);
	arr[33] = Math.round(purse * 0.0059);
	arr[34] = Math.round(purse * 0.00565);
	arr[35] = Math.round(purse * 0.00540);
	arr[36] = Math.round(purse * 0.00515);
	arr[37] = Math.round(purse * 0.00490);
	arr[38] = Math.round(purse * 0.00470);
	arr[39] = Math.round(purse * 0.00450);
	arr[40] = Math.round(purse * 0.00430);
	arr[41] = Math.round(purse * 0.00410);
	arr[42] = Math.round(purse * 0.00390);
	arr[43] = Math.round(purse * 0.00370);
	arr[44] = Math.round(purse * 0.00350);
	arr[45] = Math.round(purse * 0.00330);
	arr[46] = Math.round(purse * 0.00310);
	arr[47] = Math.round(purse * 0.00290);
	arr[48] = Math.round(purse * 0.00274);
	arr[49] = Math.round(purse * 0.00260);
	arr[50] = Math.round(purse * 0.00252);
	arr[51] = Math.round(purse * 0.00246);
	arr[52] = Math.round(purse * 0.00240);
	arr[53] = Math.round(purse * 0.00236);
	arr[54] = Math.round(purse * 0.00232);
	arr[55] = Math.round(purse * 0.00230);
	arr[56] = Math.round(purse * 0.00228);
	arr[57] = Math.round(purse * 0.00226);
	arr[58] = Math.round(purse * 0.00224);
	arr[59] = Math.round(purse * 0.00222);
	arr[60] = Math.round(purse * 0.00220);
	arr[61] = Math.round(purse * 0.00218);
	arr[62] = Math.round(purse * 0.00216);
	arr[63] = Math.round(purse * 0.00214);
	arr[64] = Math.round(purse * 0.00212);
	arr[65] = Math.round(purse * 0.00210);
	arr[66] = Math.round(purse * 0.00208);
	arr[67] = Math.round(purse * 0.00206);
	arr[68] = Math.round(purse * 0.00204);
	arr[69] = Math.round(purse * 0.00202);
	arr[70] = Math.round(purse * 0.00200);
	arr[71] = arr[70] - 100;
	arr[72] = arr[70] - 200;
	arr[73] = arr[70] - 300;
	arr[74] = arr[70] - 400;
	arr[75] = arr[70] - 500;
	arr[76] = arr[70] - 600;
	arr[77] = arr[70] - 700;
	arr[78] = arr[70] - 800;
	arr[79] = arr[70] - 900;
	arr[80] = arr[70] - 1000;
	return arr;
}

function getTeeTimesGolfDotCom(player) {
	var teeTimes = [];
	_.forEach(player.tt.rnd, function (rnd, idx) {
		teeTimes[idx + 1] = rnd.tt;
	});
	return teeTimes;
}

function ExtractPgaDataIntoFb(dataUrl) {
	http.get(dataUrl, function (resp) {
		pgaJson = "";
		resp.on('data', function (chunk) {
			pgaJson += chunk;
		});
		resp.on('end', function () {
			if (isGolfDotCom) {
				pgaJson = pgaJson.replace(/callbackWrapper\(/, '');
				pgaJson = pgaJson.substring(0, pgaJson.length - 2);
			}
			pgaJson = JSON.parse(pgaJson);
			// Check if no reason to hit FB
			if (isGolfDotCom) {
				pgaJson = pgaJson.lb;
				if (pgaJson.cts === last_updated) { ExitNode(); }
				if (pgaJson.crst !== 'In Progress'
							&& (pgaJson.crst === round_state)) { ExitNode(); }
					FormatPgaJsonGolfDotCom(pgaJson, function (formattedJson) {
						pgaJson = formattedJson;
						PutPgaJsonIntoFbGolfDotCom(pgaJson);
				});
			} else {
				if (pgaJson.last_updated === last_updated) { ExitNode(); }
				if (pgaJson.round_state !== 'In Progress'
							&& (pgaJson.round_state === round_state)) { ExitNode(); }
				pgaJson = FormatPgaJson(pgaJson);
				// if pgatour not providing money, then compute it like code for golf.com
				if (pgaJson.leaderboard[0].money_event === 0) {	
					pgaJson.money = {};
					pgaJson.money.total_purse = config.purse;
					ComputeMoneyAndPutInJsonGolfDotCom(pgaJson, function () {
						PutPgaJsonIntoFb(pgaJson);
					});
				} else {
					PutPgaJsonIntoFb(pgaJson);
				}		
			}
		});
	}).end();
}

function IsWithinWindow(callback) {
	// Check if should force new data
	curTourneyRef.child('forceNewData').once('value', function (snap) {
		if (snap.val() === true) {
			curTourneyRef.child('forceNewData').set(false);
			callback();
		} else {
			curTourneyRef.child('custom_config').once('value', function (snap) {
				config = snap.val();
				// Exit if not Thu thru Sun, or too early, or too late
				var now = new Date();
				var dow = now.getDay();
				// check for custom window
				if (config.window_start) {
					if (now < Date(config.window_start) || now > Date(config.window_end)) {
						ExitNode();
					}
				} else if (dow !== 0 && (dow < 4 || dow > 7)) {   // Ensure that it's Thu thru Sun
					console.log('Not within time window');
					ExitNode();
				}
				callback();
			});
		}
	});
}

function DoWork() {
	// Get the website url for the current tournament.  This value is currently
	// manually entered into the fb.  Data transfer is done inside GetPgaJson()
	curTourneyRef.child('dataUrl').once('value', function (snap) {
		dataUrl = snap.val();
		isGolfDotCom = (dataUrl.indexOf("data.golf.com") > -1);
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

