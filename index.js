import { WebSocketServer } from "ws";
import handChecks from "./handChecks.js";

const server = new WebSocketServer({
    port: 8080
});

let clientId = 0;
const clients = [];

let tableId = -1;
const tables = [];

let position = 0;
let blind = 1000;
let defBalance = 10000;

// Table 
//{
//     tableId: Number,
//     players: Player[],
//     inProgress: bool,
//     dealer: Number,
//     deck: [],
//     pot: Number,
//     inAction: Number,  --currently acting player
//     runningBet: Number,  --running bet players have to call,
//     inPlay: number, --number of people currently in a game,
//     communityCards: [], -- the community cards everyone can see
// }

//Player
// {
//     'socket': socket,
//     'id': Number,
//     'name': string,
//     'table': number,
//     'position': number,
//     'hand': [],
//     'isPlaying': bool,
//     'bet': number,
//     'balance' : number,
//     'ready' : bool,
//     'checking' : bool
//     'allin' : bool
// }

// max players at a table: 10
// min players to start a table: 2 

server.on('connection', (socket) => {
    socket.on('message', (message) => {
        const msg = JSON.parse(message);
        if (msg.type == 'init') {
            let myTableId;
            if (clients.length > 0) {
                // console.log(clients);
                let usedIds = clients.map(x => x.clientId);
                for (let i = 1; i < Math.max(...clients.map(x => x.clientId)) + 2; i++) {
                    if (!usedIds.includes(i)) {
                        clientId = i;
                        break;
                    }
                }
            } else {
                clientId = 1;
            }

            if (tables.length > 0 && tables.find(x => x.players.length < 10 && x.inProgress == false) != null) {
                let lasttable = tables.find(x => x.players.length < 10 && x.inProgress == false);
                let usedPositions = lasttable.players.map(x => x.position);
                for (let i = 0; i < 10; i++) {
                    if (!usedPositions.includes(i)) {
                        position = i;
                        break; // find free position at table and put user there
                    }
                }
                myTableId = tables.findIndex(x => x.tableId == lasttable.tableId);

                lasttable.players.push({
                    'socket': socket,
                    'clientId': clientId,
                    'name': msg.userName,
                    'tableId': myTableId,
                    'position': position,
                    'balance': defBalance,
                    'isPlaying': (lasttable.inProgress ? false : true),
                    'ready': false,
                    'checking': false,
                    'allin': false
                })
                // console.log(lasttable.players);
            } else {
                // create new table
                tableId++;
                myTableId = tableId;
                position = 0
                tables.push({
                    tableId: myTableId, players: [
                        {
                            'socket': socket,
                            'clientId': clientId,
                            'name': msg.userName,
                            'tableId': myTableId,
                            'position': position,
                            'balance': defBalance,
                            'ready': false,
                            'checking': false,
                            'allin': false
                        }],
                    inProgress: false
                })
            }

            clients.push({
                'socket': socket,
                'clientId': clientId,
                'name': msg.userName,
                'tableId': myTableId,
                'position': position,
                'balance': defBalance
            });

            let currTable = tables.find(x => x.tableId == myTableId);
            let userList = getUserList(myTableId);

            socket.send(JSON.stringify({
                type: 'init',
                userId: clientId,
                position: position,
                tableId: myTableId,
                userList: userList,
                inProgress: currTable.inProgress,
                balance: defBalance
            }))
            broadcastToTable(currTable.tableId, { type: 'join', userId: clientId, userName: msg.userName, tableId: myTableId, position: position, userList: userList, inProgress: currTable.inProgress });
            console.log(`init: U${clientId} conn. to T${myTableId} @P ${position}`);
            return;
        }

        // console.log(msg);
        let currTable = tables.findIndex(x => x.players.findIndex(x => x.clientId == msg.userId) != -1);
        if (msg.type == 'disc') {
            if (currTable != -1) {
                let user = tables[currTable].players.find(x => x.clientId == msg.userId);
                if (user.isPlaying) {
                    tables[currTable].inPlay--;
                }
                user.socket.close();
                if (checkGameOver(currTable)) {
                    gameOver(currTable);
                }
                tables[currTable].players.splice(tables[currTable].players.indexOf(user), 1)
                clients.splice(clients.findIndex(x => x.clientId == user.clientId), 1)
                if (tables[currTable].players.length == 0) {
                    tables.splice(currTable, 1);
                    console.log(`dc: user disconnected; T${currTable} has been deleted`);
                }else{
                    broadcastToTable(currTable, { type: 'disc', userId: msg.userId, userName: msg.userName, position: msg.position });
                    console.log('dc: U' + user.clientId + ' disconnect successful, T' + tables[currTable].tableId + ' ' + tables[currTable].players.length + 'players left');
                }
            } else {
                console.error('dc: disconnect failed');
            }
            return;
        }
        let currPlayer = tables[currTable].players.findIndex(x => x.clientId == msg.userId);
        if (msg.type == 'ready') {
            if (tables[currTable].players[currPlayer].ready == false) {
                tables[currTable].players[currPlayer].ready = true;
                console.log(`ready: U${tables[currTable].players[currPlayer].clientId} has readied up, waiting for other players`)
            } else {
                tables[currTable].players[currPlayer].ready = false;
                console.log(`ready: U${tables[currTable].players[currPlayer].clientId} has unreadied, waiting for other players`)
            }
            let readyPlayers = tables[currTable].players.map(x => x.ready);
            broadcastToTable(currTable, { type: 'ready', ready: readyPlayers.filter(x => x == true).length, balance: tables[currTable].players.length })
            if (currTable != -1 && tables[currTable].players.length >= 2 && readyPlayers.includes(true) && new Set(readyPlayers).size == 1) {
                startTable(currTable);
            }
            return;
        }
        if (msg.type == 'fold' && tables[currTable].players[currPlayer].position == tables[currTable].inAction) {
            console.log(`fold: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@P${tables[currTable].players[currPlayer].position} folds, surrendering their cards`);
            tables[currTable].players[currPlayer].isPlaying = false;
            tables[currTable].pot += tables[currTable].players[currPlayer].bet;
            tables[currTable].inPlay--;
            // savePlayer(currTable, currPlayer);
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'bet' && tables[currTable].players[currPlayer].position == tables[currTable].inAction) {
            tables[currTable].players[currPlayer].bet += msg.bet;
            if (tables[currTable].players[currPlayer].bet > tables[currTable].runningBet) {
                tables[currTable].runningBet = tables[currTable].players[currPlayer].bet
            }
            tables[currTable].players[currPlayer].balance -= tables[currTable].players[currPlayer].bet;
            // savePlayer(currTable, currPlayer);
            console.log(`bet: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@P${tables[currTable].players[currPlayer].position} bets ${msg.bet}, total: ${tables[currTable].players[currPlayer].bet} `);
            tables[currTable].players[currPlayer].checking = false;
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'blind') {
            tables[currTable].players[currPlayer].bet = msg.bet;
            if (tables[currTable].players[currPlayer].bet > tables[currTable].runningBet) {
                tables[currTable].runningBet = tables[currTable].players[currPlayer].bet
            }
            tables[currTable].players[currPlayer].balance -= tables[currTable].players[currPlayer].bet;
            broadcastToTable(currTable, { type: 'blind', userList: getUserList(currTable) })
            // savePlayer(currTable, currPlayer);
            console.log(`blind: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@P${tables[currTable].players[currPlayer].position} bets ${msg.bet}, total pot: ${tables[currTable].pot} `);
            return;
        }
        if (msg.type == 'check' && tables[currTable].players[currPlayer].position == tables[currTable].inAction) {
            console.log(`check: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@P${tables[currTable].players[currPlayer].position} checks`);
            tables[currTable].players[currPlayer].checking = true;
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'allin') {
            tables[currTable].players[currPlayer].allin = true;
            tables[currTable].players[currPlayer].bet += tables[currTable].players[currPlayer].balance;
            tables[currTable].players[currPlayer].balance = 0;
            if (tables[currTable].players[currPlayer].bet > tables[currTable].runningBet) {
                tables[currTable].runningBet = tables[currTable].players[currPlayer].bet
            }
            console.log(`bet: T${currTable} - U${tables[currTable].players[currPlayer].clientId} has gone all in`);
            endPlayerTurn(currTable);
            return;
        }
    })
    socket.on('close', ()=>{
        try {
            let currTable = tables.findIndex(x=>x.players.find(x=>x.socket == socket) != undefined);
            let user = tables[currTable].players.find(x=>x.socket == socket);
            if (user.isPlaying) {
                tables[currTable].inPlay--;
            }
            user.socket.close();
            if (checkGameOver(currTable)) {
                gameOver(currTable);
            }
            tables[currTable].players.splice(tables[currTable].players.indexOf(user), 1)
            clients.splice(clients.findIndex(x => x.clientId == user.clientId), 1)
            if (tables[currTable].players.length == 0) {
                tables.splice(currTable, 1);
                console.log(`dc: user disconnected; T${currTable} has been deleted`);
            }else{
                broadcastToTable(currTable, { type: 'disc', userId: user.clientId, userName: user.name, position: user.position });
                console.log('dc: U' + user.clientId + ' disconnect successful, T' + tables[currTable].tableId + ' ' + tables[currTable].players.length + 'players left');
            }
        } catch (error) {
            console.error(`dc: disconnect failed: ${error}`);
        }
    })
});

//return true if there are no remaining players
const checkGameOver = (currTable) => {
    if (tables[currTable].inProgress && (tables[currTable].players.length < 2 || tables[currTable].inPlay < 2)) {
        return true;
    }
    return false;
}

const resetTable = (currTable) => {
    console.log(`reset: T${tables[currTable].tableId} has been reset`);
    tables[currTable].inProgress = false;
    tables[currTable].pot = 0;
    tables[currTable].runningBet = 0;
    tables[currTable].communityCards = null;
    tables[currTable].inAction = null;
    tables[currTable].players.forEach(x => {
        x.ready = false;
        x.checking = false;
        x.allin = false;
    })
}

const startTable = (currTable) => {
    tables[currTable].inProgress = true;
    tables[currTable].deck = getFreshDeck();
    tables[currTable].inPlay = tables[currTable].players.length;
    tables[currTable].pot = 0;
    tables[currTable].runningBet = blind;
    sendPrivateHands(currTable);    // IMPORTANT: ALSO SETS PLAYER.isPlaying TO TRUE
    let dealer = getNextDealer(currTable);
    let smallBlind = getSmallBigBlind(currTable, dealer, true);
    let bigBlind = getSmallBigBlind(currTable, dealer, false);
    console.log(`getblind: s: ${smallBlind}, b: ${bigBlind}`);
    
    tables[currTable].smallBlind = smallBlind;
    tables[currTable].bigBlind = bigBlind;
    // console.log(`blinds: Small: ${smallBlind}, Big: ${bigBlind}`);
    broadcastToTable(currTable, { type: 'start', dealer: dealer, userList: getUserList(currTable), bet: blind, sBlind: smallBlind, bBlind: bigBlind })
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
    console.log(`start: T${tables[currTable].tableId} - started the game, Dealer: ${tables[currTable].dealer}`);
}

const checkEndOfRound = (currTable) => {
    let checkingCount = tables[currTable].players.filter(x => x.checking == true).length; //number of people checking
    if (checkingCount <= 0 || checkingCount == tables[currTable].inPlay) {
        if (tables[currTable].players.filter(x=>x.allin == true).length>0) {
            // check how many people are all-in 
            // if its either all of them OR their bets match the runningbet of the table
            // if their count matches the number of players still in play => END ROUND
            if (tables[currTable].players.filter(x => x.isPlaying == true && (x.allin==true||x.bet == tables[currTable].runningBet)).length == tables[currTable].inPlay) {
                return true
            }
        }else{
            // check how many different bets are in play
            // once they are all the same: end the round
            if (([...new Set(tables[currTable].players.filter(x => x.isPlaying == true).map(x => x.bet))].length == 1)) {
                return true
            }
        }
    }
    return false;
}

const endPlayerTurn = (currTable) => {
    if (!checkGameOver(currTable)) {  // check if there are sufficient players in the game
        if (!checkEndOfRound(currTable)) {  // check if there is another bet to be made -> no=>true, yes=>false
            broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
            return;
        }
        if ((tables[currTable].communityCards!=null && tables[currTable].communityCards.length == 5)) {
            gameOver(currTable);
            return;
        }
        newRound(currTable);
        return;
    }
    gameOver(currTable);
}

const gameOver = (currTable)=>{
    let winner;
    collectPot(currTable);
    if (tables[currTable].communityCards!= null && tables[currTable].communityCards.length==5 && tables[currTable].inPlay!=0) {
        winner = showDown(currTable);
    }else{
        try {
            winner = tables[currTable].players.find(x => x.isPlaying == true)
        } catch (error) {
            console.log(`error: T${tables[currTable].tableId}: ${error}`);
        }
    }
    if (winner != null) {
        console.log(`win: T${tables[currTable].tableId} - U${winner.clientId}@P${winner.position} won the round, earning: ${tables[currTable].pot}`);
        broadcastToTable(currTable, { type: 'win', pot: tables[currTable].pot, clientId: winner.clientId, position: winner.position, userName: winner.name, userList: getUserList(currTable, true) });
    }
    resetTable(currTable);
}

// return the winning player
const showDown = (currTable) => {
    // map is a dictionary with hand scores and their respective players
    let map = new Map(); 
    let commCards = tables[currTable].communityCards
    tables[currTable].players.forEach(player=>{
        let allcards = commCards.concat(player.hand);
        if (handChecks.checkRoyalFlush(allcards)) {
            addToMap(map, player, 1);
        } else if (handChecks.checkStraightFlush(allcards)) {
            addToMap(map, player,2);
        } else if (handChecks.checkFourOfAKind(allcards)) {
            addToMap(map, player,3);
        } else if (handChecks.checkFullHouse(allcards)) {
            addToMap(map, player,4);
        } else if (handChecks.checkFlush(allcards)) {
            addToMap(map, player,5);
        } else if (handChecks.checkStraight(allcards)) {
            addToMap(map, player,6);
        } else if (handChecks.checkThreeOfAKind(allcards)) {
            addToMap(map, player,7);
        } else if (handChecks.checkTwoPair(allcards)) {
            addToMap(map, player,8);
        } else if (handChecks.checkPair(allcards)) {
            addToMap(map, player,9);
        } else if (handChecks.checkHighCard(allcards)) {
            addToMap(map, player,10);
        } 
    })
    // console.log(map);
    let smallestHandValue=100;
    map.forEach((value, key, map)=>{
        console.log(`SHOWDOWN: hand value=>${key}; # of hands=>${value.length}`);
        if (Number(key)<smallestHandValue) {
            smallestHandValue = Number(key);
        }
    })
    console.log(smallestHandValue);
    
    if (smallestHandValue != 100) {
        let winnerHands = map.get(smallestHandValue);
        if (winnerHands.length==1) {
            return winnerHands[0];
        }else{
            winnerHands.sort((a,b) => {
                return handChecks.getHandValue(a.hand)-handChecks.getHandValue(b.hand);
            });
            // no tiebreak yet!! WIP
            return winnerHands[0];
        }
    }
    return;
}

const addToMap=(map, player, n)=>{
    try {
        // console.log('before addition' + [map.get(n)]);
        if (map.get(n)==null) {
            map.set(n, [player]);
        }else{
            let newList = map.get(n);
            newList.push(player);
            map.set(n, newList);
        }
        // console.log('after addition'+map.get(n));
    } catch (error) {
        console.log(`error: player couldnt be added to map\n${error}`);
    }
}

const collectPot = (currTable) => {
    // add each players bet to the pot
    tables[currTable].players.forEach(x => {
        if (x.isPlaying) {
            tables[currTable].pot += x.bet;
            console.log(`collected: ${x.bet} - total: ${tables[currTable].pot}`);
            x.bet = 0;
            x.checking = false;
            x.allin = false;
        }
    })
}

const newRound = (currTable) => {
    collectPot(currTable);
    // based on gamestate lay out community cards and begin another round of betting
    if (tables[currTable].communityCards == null) {
        tables[currTable].communityCards = drawCards(currTable, 3);
    } else if (tables[currTable].communityCards.length >= 3) {
        tables[currTable].communityCards.push(drawCards(currTable, 1)[0]);
    }
    // tables[currTable].inAction = -1;
    tables[currTable].runningBet = 0;
    console.log(`roundend: T${tables[currTable].tableId} ended betting, CC: ${tables[currTable].communityCards}`);
    broadcastToTable(currTable, { type: 'roundend', hand: tables[currTable].communityCards }) //using hand again so the TS is not too cluttered xdd
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
}

const getUserList = (currTable, winner) => {
    let userList = [];
    try{    
        tables[currTable].players.forEach(client => {
            if (winner != null) {    
                userList.push({
                    userId: client.clientId,
                    userName: client.name,
                    position: client.position,
                    bet: client.bet,
                    isPlaying: client.isPlaying,
                    hand : client.hand
                })
            }else{
                userList.push({
                    userId: client.clientId,
                    userName: client.name,
                    position: client.position,
                    bet: client.bet,
                    isPlaying: client.isPlaying
                })
            }
        })
    }catch (error){
        console.log(`error: while getting userlist: ${error}`);
        
    }
    return userList;
}

const getFreshDeck = () => {
    const suits = ['♣', '♠', '♥', '♦'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push(suit + rank);
        });
    });
    //return shuffled deck
    return deck.map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);
}

const broadcastToTable = (currTable, message) => {
    try {
        tables[currTable].players.forEach(client => {
            client.socket.send(JSON.stringify(message))
        })
    } catch (error) {
        console.log(`error: failed broadcast: ${error}`);
    }
}

const getNextDealer = (currTable) => {
    if (tables[currTable].dealer == null) {
        tables[currTable].dealer = 0;
        return 0;
    } else {
        let failsafe = 0;
        do {
            if (tables[currTable].dealer + 1 < tables[currTable].players.length) {
                tables[currTable].dealer++;
            } else {
                tables[currTable].dealer = 0;
            }
            if (checkPlayerIsPlaying(tables[currTable].players, tables[currTable].dealer)) {
                break;
            }
            failsafe++;
        } while (failsafe < 20)
        console.log(`dealer: T${tables[currTable].tableId} - P${tables[currTable].dealer} is the next dealer`);
        return tables[currTable].dealer;
    }
}

const getSmallBigBlind = (currTable, dealer, small) => {
    let activePlayers = tables[currTable].players.filter(x => x.isPlaying);
    console.log(activePlayers.length);
    // console.log(activePlayers);
    if (activePlayers.length > 2) {
        let failsafe = 0;
        let nextPosition = dealer;
        do {
            if (small) {
                if (nextPosition + 1 <= Math.max(...activePlayers.map(x => x.position))) {
                    nextPosition++;
                } else {
                    nextPosition = 0;
                }
            } else {
                if (nextPosition + 2 <= Math.max(...activePlayers.map(x => x.position))) {
                    if (nextPosition == dealer) {
                        nextPosition += 2;
                    }else{
                        nextPosition++;
                    }
                } else {
                    nextPosition = 0;
                }
            }
            if (checkPlayerIsPlaying(activePlayers, nextPosition)) {
                break;
            }
            failsafe++;
        } while (failsafe < 20);
        return nextPosition;
    } else {
        if (small) {
            return dealer;
        } else {
            // console.log(activePlayers.map(x=>x.position).filter(x=>x!=dealer));
            return activePlayers.map(x => x.position).filter(x => x != dealer);
        }
    }
}

// true if is in play -> valid for action, false if is not in play -> not valid for action
const checkPlayerIsPlaying = (players, position) => {
    try {
        if (players.find(x => x.position == position).isPlaying == true) {
            return true
        }
    } catch (error) {
        console.log(error);
    }
    return false
}

const drawCards = (currTable, n) => {
    if (tables[currTable].deck == null) {
        tables[currTable].deck = getFreshDeck();
    }
    let cards = [];
    for (let i = 0; i < n; i++) {
        if (tables[currTable].deck.length > 0) {
            cards.push(tables[currTable].deck.pop())
        } else {
            tables[currTable].deck = getFreshDeck();
            cards.push(tables[currTable].deck.pop())
        }
    }
    return cards;
}

// IMPORTANT: THIS ALSO SETS PLAYER.isPlaying TO TRUE
const sendPrivateHands = (currTable) => {
    if (tables[currTable].deck == null || tables[currTable].deck.length <= 0) {
        tables[currTable].deck = getFreshDeck();
    }
    tables[currTable].deck.pop(); // burn first card (no practical point, just done traditionally and i thought it would be fun)
    tables[currTable].players.forEach(user => {
        user.bet = 0;
        user.isPlaying = true;
        user.checking = false;
        user.hand = drawCards(currTable, 2);
        user.socket.send(JSON.stringify({ type: 'hand', hand: user.hand }));
    });
}

const getNextPlayer = (currTable) => {
    if (tables[currTable].inAction == null) {
        tables[currTable].inAction = decideFirstToAct(currTable);
        return tables[currTable].inAction;
    }

    let failsafe = 0;
    do {
        if (tables[currTable].inAction + 1 < tables[currTable].players.length) {
            tables[currTable].inAction++;
        } else {
            tables[currTable].inAction = 0;
        }
        if (checkPlayerIsPlaying(tables[currTable].players, tables[currTable].inAction)) {
            break;
        }
        failsafe++;
    } while (failsafe < 20)
    // saveTable(currTable)
    console.log(`action: T${tables[currTable].tableId} - P${tables[currTable].inAction} takes action`);
    return tables[currTable].inAction;
}

const decideFirstToAct = (currTable) => {
    let failsafe = 0;
    let nextPosition = tables[currTable].dealer;
    do {
        if (nextPosition + 1 < tables[currTable].players.length) {
            nextPosition++;
        } else {
            nextPosition = 0;
        }
        // long af condition xd
        if (checkPlayerIsPlaying(tables[currTable].players, nextPosition) && ((tables[currTable].players.length > 3 && (tables[currTable].dealer != nextPosition) && (tables[currTable].smallBlind != nextPosition) && (tables[currTable].bigBlind != nextPosition)) || ((tables[currTable].players.length == 2 || tables[currTable].players.length == 3) && tables[currTable].dealer == nextPosition))) {
            break;
        }
        failsafe++;
    } while (failsafe < 20)
    return nextPosition;
}

server.on('close', () => {})

server.on('error', (error) => {
    console.log(error.message);
})

console.log('Server online!');


//npx nodemon index.js for development
//node index.js for release