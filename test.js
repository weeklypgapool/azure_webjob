
var json = {
  leaderboard: [
    {current_position: 1, is_amateur: false},
    {current_position: 2, is_amateur: false},
    {current_position: 2, is_amateur: true},
    {current_position: 4, is_amateur: false},
    {current_position: 5, is_amateur: false},
    {current_position: 5, is_amateur: false},
    {current_position: 5, is_amateur: false},
    {current_position: 5, is_amateur: false},
    {current_position: 9, is_amateur: false},
    {current_position: 10, is_amateur: false},
  ]
};

var moneyByPos = {
  "1": 4000,
  "2": 3000,
  "3": 2000,
  "4": 1000,
};

processPayoutsGolfDotCom(json, moneyByPos);
console.log(json);

function processPayoutsGolfDotCom(json, moneyByPos) {
	var lb = json.leaderboard;
	var playerIdx = 0;
	var moneyIdx = 1;
	while (moneyByPos[moneyIdx]) {
		var proCount = !lb[playerIdx].is_amateur ? 1 : 0;
		var amCount = !lb[playerIdx].is_amateur ? 0 : 1;
		var moneySum = moneyByPos[moneyIdx];
		while (lb[playerIdx].current_position === lb[playerIdx + 1].current_position) {
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
