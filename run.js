"use strict";

var axios = require('axios');

var http = require('http');
var path = require('path');
var url = require('url');
var _ = require('lodash');
// var Firebase = require('firebase');

// New fb auth api using the firebase-auth module
var admin = require("firebase-admin");

var serviceAccount = require("./firebase-weeklypgapool-firebase-adminsdk-tmwr1-3ead64904a.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://weeklypgapool.firebaseio.com"
});

var db = admin.database();
var curTourneyRef = db.ref('tournaments/current');

var	dataUrl,
		forceNewData,
		last_updated,
		pgaJson,
		round_state,
		isGolfDotCom = false,
		isUSOpen = false,
		config = {};

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
	curTourneyRef.child('data/stats').update(pgaJson)
		.then(function() {
			return curTourneyRef.child('data/leaderboard').set(lb);
		})
		.then(function() {
			ExitNode();
		});
}

function PutPgaJsonIntoFbGolfDotCom(pgaJson) {
	var lb = pgaJson.leaderboard;
	delete pgaJson.leaderboard;
	// Remove all '.' not allowed as FB key
	var lbStr = JSON.stringify(lb);
	lbStr =	lbStr.replace(/\./g, '');
	lb = JSON.parse(lbStr);
	curTourneyRef.child('data/stats').update(pgaJson)
		.then(function() {
			return curTourneyRef.child('data/leaderboard').set(lb);
		})
		.then(function() {
			ExitNode();
		});
}

function isV2(pgaJson) {
  return !pgaJson.leaderboard;
}

function FormatPgaJson(pgaJson) {
	var json = {};
  var players = [];
  if (isV2(pgaJson)) {
    json.last_updated = pgaJson.header.lastUpdated;
    json.round_state = pgaJson.roundState;
    // json.tournament_name = pgaJson.tournament_name;  NOT AVAILABLE!
    json.current_round = pgaJson.tournamentRoundId;
    // pgaJson = pgaJson.leaderboard;
  //	json.start_date = pgaJson.start_date;
  //	json.end_date = pgaJson.end_date;
  //	json.is_started = pgaJson.is_started;
  //	json.is_finished = pgaJson.is_finished;
    players = pgaJson.rows;
    json.leaderboard = _.map(players, function (player) {
      return {
        "name": player.playerNames.firstName + ' ' + player.playerNames.lastName,
        // "is_amateur": player.player_bio.is_amateur,  CAN'T DETERMINE?
        "is_amateur": false,   // TEMPORARY
        "player_id": player.playerId,
        "current_position": player.positionCurrent,
        "total_strokes": player.strokes,
        "thru": player.thru,
        "today": player.round,
        "total": player.total === '0' ? 'E' : player.total,
        // "money_event": player.rankings.projected_money_event,  CAN'T DETERMIN
        "money_event": 0,  // will need to compute
        // "tee_times": {
        //   "1": player.rounds['0'].tee_time,
        //   "2": player.rounds['1'].tee_time,
        //   "3": player.rounds['2'].tee_time,
        //   "4": player.rounds['3'].tee_time
        // }
        "tee_times": {
          "1": player.teeTime,
          "2": player.teeTime,
          "3": player.teeTime,
          "4": player.teeTime
        }
      };
    });
  } else {
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
  }
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

function FormatPgaJsonUSOpen(pgaJson, callback) {
	var json = {};
	var players = [];
	json.last_updated = pgaJson.meta.generated;
	json.round_state = getRoundStateUSOpen(pgaJson);
	json.tournament_name = 'U.S. Open';
	json.current_round = pgaJson.currentRound.number;
	players = pgaJson.standings;
	json.leaderboard = _.map(players, function (player) {
		return {
			"name": player.player.firstName + ' ' + player.player.lastName,
			"player_id": player.player.indentifier,
			"current_position": player.position.displayValue,
			// "total_strokes": player.totalScore.value,
			"thru": player.holesThrough.value,
			"today": player.toParToday.value,
			"total": player.toPar.value,
			"tee_times": [{ '1': '?' }, { '2': '?' }, { '3': '?' }, { '4': '?' }]
		};
	});
	ComputeMoneyAndPutInJsonUSOpen(json, function () {
		callback(json);
	});
}

function getRoundStateUSOpen(json) {
	if (json.standings.every(player => player.holesThrough.value === 0)) return 'Groupings Official';
	return json.standings.some(player => player.holesThrough.value !== 18) ? 'In Progress' : 'Complete';
}

function ComputeMoneyAndPutInJsonGolfDotCom(json, callback) {
	var totalPurse,
			moneyByPos;
	if (config.money_computed_manually) {
		moneyByPos = config.payouts;
		processPayoutsGolfDotCom(json, moneyByPos);
		callback();
	} else {
		totalPurse = json.money.total_purse;
		moneyByPos = BuildMoneyArray(totalPurse);
		processPayoutsGolfDotCom(json, moneyByPos);
		callback();
	}
}

function ComputeMoneyAndPutInJsonUSOpen(json, callback) {
	var totalPurse,
			moneyByPos;
	if (config.money_computed_manually) {
		moneyByPos = config.payouts;
		processPayoutsGolfDotCom(json, moneyByPos);
		callback();
	} else {
		totalPurse = config.purse;
		moneyByPos = BuildMoneyArray(totalPurse);
		processPayoutsGolfDotCom(json, moneyByPos);
		callback();
	}
}

function processPayoutsGolfDotCom(json, moneyByPos) {
	var lb = json.leaderboard;
	var playerIdx = 0;
	var moneyIdx = 1;
	while (moneyByPos[moneyIdx]) {
		var proCount = !lb[playerIdx].is_amateur ? 1 : 0;
		var amCount = !lb[playerIdx].is_amateur ? 0 : 1;
		var moneySum = moneyByPos[moneyIdx];
		while (lb[playerIdx + 1] && lb[playerIdx + 1].current_position && lb[playerIdx].current_position === lb[playerIdx + 1].current_position) {
			if (!lb[playerIdx + 1].is_amateur) {
				proCount++;
				moneyIdx++;
				if (moneyByPos[moneyIdx]) moneySum += moneyByPos[moneyIdx];
			} else {
				amCount++;
			}
			playerIdx++;
		}
		distributeMoney();
    playerIdx++;
    moneyIdx++;
	}

	function distributeMoney() {
		var numPlayers = proCount + amCount;
		var curPlayerIdx = playerIdx + 1 - numPlayers;
		var moneyPerPro = Math.round(moneySum / proCount);
		while (numPlayers > 0) {
			json.leaderboard[curPlayerIdx].money_event = (!json.leaderboard[curPlayerIdx].is_amateur) ? moneyPerPro : 0;
			curPlayerIdx++;
      numPlayers--;
		}
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
  let options;
  if (isUSOpen) {
    options = {
      url: dataUrl,
      headers: {
        // 'Cache-Control': 'max-age=0',
        // referer: dataUrl,
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': 1,
        // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
        // 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }
  } else {
    options = {
      url: dataUrl
    }
  };
  // changes have not been tested
	axios.get(dataUrl).then(function (body) {
		pgaJson = body.data;
    if (isGolfDotCom) {
      pgaJson = pgaJson.replace(/callbackWrapper\(/, '');
      pgaJson = pgaJson.substring(0, pgaJson.length - 2);
    }
    // pgaJson = JSON.parse(pgaJson);
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
    } else if (isUSOpen) {
      FormatPgaJsonUSOpen(pgaJson, function (formattedJson) {
        pgaJson = formattedJson;
        PutPgaJsonIntoFb(pgaJson);
      });
    } else {
      var thisLastUpdated = isV2(pgaJson) ?
        pgaJson.header.lastUpdated : pgaJson.last_updated;
        if (!forceNewData && thisLastUpdated === last_updated) { ExitNode(); }
      var thisRoundState = isV2(pgaJson) ?
        pgaJson.roundState : pgaJson.leaderboard.round_state;
      if (!forceNewData && thisRoundState !== 'In Progress'
            && thisRoundState === round_state) { ExitNode(); }
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
}

function IsWithinWindow(callback) {
	curTourneyRef.child('custom_config').once('value', function (snap) {
		config = snap.val();
		// Check if should force new data
		curTourneyRef.child('forceNewData').once('value', function (snap) {
			forceNewData = snap.val();
			if (forceNewData) {
				curTourneyRef.child('forceNewData').set(false);
				callback();
			} else {
				// Exit if not Thu thru Sun, or too early, or too late
				var now = new Date();
				var dow = now.getDay();
				// check for custom window
				if (config.window_start) {
					if (now < new Date(config.window_start.substr(0, 10)) || now > new Date(config.window_end.substr(0, 10))) {
						ExitNode();
					} else {
            callback();
          }
				} else if (dow !== 0 && (dow < 4 || dow > 7)) {   // Ensure that it's Thu thru Sun
					console.log('Not within time window');
					ExitNode();
				}
				callback();
			}
		});
	});
}

function DoWork() {
	// Get the website url for the current tournament.  This value is currently
	// manually entered into the fb.  Data transfer is done inside GetPgaJson()
	curTourneyRef.child('dataUrl').once('value', function (snap) {
		dataUrl = snap.val();
		// dataUrl = "http://gripapi-static-pd.usopen.com/gripapi/leaderboard.json"
		isGolfDotCom = (dataUrl.indexOf("data.golf.com") > -1);
		isUSOpen = dataUrl.includes("usopen.com");
		curTourneyRef.child('data/stats/last_updated').once('value', function (snap) {
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
