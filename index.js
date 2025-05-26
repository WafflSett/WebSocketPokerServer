import { WebSocketServer } from "ws";

const server = new WebSocketServer({
    port: 8081
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
//     'ready' : bool
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

            if (tables.length > 0 && tables.find(x => x.players.length < 10) != null) {
                let lasttable = tables.find(x => x.players.length < 10);
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
                    'isPlaying': (lasttable.inProgress ? false : true),
                    'ready' : false
                })
                // console.log(lasttable.players);
            } else {
                // create new table
                tableId++;
                myTableId = tableId;
                position = 0
                tables.push({
                    tableId: tableId, players: [
                        {
                            'socket': socket,
                            'clientId': clientId,
                            'name': msg.userName,
                            'tableId': myTableId,
                            'position': position,
                            'balance': defBalance,
                            'ready' : false
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

            let currTable = tables.find(x => x.tableId == tableId);
            let userList = getUserList(currTable.tableId);

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
            console.log(`init: U${clientId} conn. to T${tableId} @pos ${position}`);
            return;
        }

        // console.log(msg);
        let currTable = tables.findIndex(x => x.players.findIndex(x => x.clientId == msg.userId) != -1);
        if (msg.type == 'disc') {
            if (currTable != null) {
                let user = tables[currTable].players.find(x => x.clientId == msg.userId);
                if (user.isPlaying) {
                    tables[currTable].inPlay--;
                }
                user.socket.close();
                tables[currTable].players.splice(tables[currTable].players.indexOf(user), 1)
                
                clients.splice(clients.findIndex(x => x.clientId == user.clientId), 1)
                broadcastToTable(currTable, { type: 'disc', userId: msg.userId, userName: msg.userName, position: msg.position })
                console.log('dc: U' + user.clientId + ' disconnect successful');
            } else {
                console.error('dc: disconnect failed');
            }
            checkGameOver(currTable)
            return;
        }
        let currPlayer = tables[currTable].players.findIndex(x => x.clientId == msg.userId);
        if (msg.type == 'ready') {
            if (tables[currTable].players[currPlayer].ready==false) {
                tables[currTable].players[currPlayer].ready = true;
                console.log(`ready: U${tables[currTable].players[currPlayer].clientId} has readied up, waiting for other players`)
            }else{
                tables[currTable].players[currPlayer].ready = false;
                console.log(`ready: U${tables[currTable].players[currPlayer].clientId} has unreadied, waiting for other players`)
            }
            let readyPlayers = tables[currTable].players.map(x=>x.ready);
            broadcastToTable(currTable, {type: 'ready', ready: readyPlayers.filter(x=>x == true).length, balance: tables[currTable].players.length})
            if (currTable != null && tables[currTable].players.length >= 2 && readyPlayers.includes(true) && new Set(readyPlayers).size == 1) {
                startTable(currTable);
            }
            return;
        }
        if (msg.type == 'fold' && tables[currTable].players[currPlayer].position == tables[currTable].inAction) {
            console.log(`fold: User ${tables[currTable].players[currPlayer].clientId} folds, surrendering their cards, at table ${tables[currTable].players[currPlayer].tableId}`);
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
            console.log(`bet: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@pos${tables[currTable].players[currPlayer].position} bets ${msg.bet}, total: ${tables[currTable].players[currPlayer].bet} `);
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'blind') {
            tables[currTable].players[currPlayer].bet += msg.bet;
            if (tables[currTable].players[currPlayer].bet > tables[currTable].runningBet) {
                tables[currTable].runningBet = tables[currTable].players[currPlayer].bet
            }
            // savePlayer(currTable, currPlayer);
            console.log(`blind: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@pos${tables[currTable].players[currPlayer].position} bets ${msg.bet}, total: ${tables[currTable].players[currPlayer].bet} `);
            return;
        }
        if (msg.type == 'check' && tables[currTable].players[currPlayer].position == tables[currTable].inAction) {
            console.log(`check: T${tables[currTable].players[currPlayer].tableId} - U${tables[currTable].players[currPlayer].clientId}@post${tables[currTable].players[currPlayer].position} checks`);
            endPlayerTurn(currTable);
            return;
        }
    })
})
//return true if there are no remaining players
const checkGameOver = (currTable) => {
    if (tables[currTable].inPlay < 2) {
        try {
            let winner = tables[currTable].players.find(x => x.isPlaying == true)
            broadcastToTable(currTable, { type: 'win', clientId: winner.clientId, position: winner.position });
            console.log(`win: T${tables[currTable].tableId} - U${winner.clientId} won the round`);
        } catch (error) {
            console.log(`error: T${tables[currTable].tableId}: ${error}`);
        }
        resetTable(currTable);
        return true;
    }
    return false;
}

const resetTable = (currTable) => {
    console.log(`reset: T${tables[currTable].tableId} has been reset`);
    tables[currTable].inProgress = false;
    tables[currTable].pot = 0;
    tables[currTable].runningBet = 0;
    tables[currTable].players.forEach(x=>{
        x.ready = false;
    })
}

const startTable = (currTable) => {
    tables[currTable].inProgress = true;
    tables[currTable].deck = getFreshDeck();
    tables[currTable].inPlay = tables[currTable].players.length;
    // in case someone else joins or leaves, we dont want to fuck up positions, still requires more refining
    tables[currTable].pot = 0;
    tables[currTable].runningBet = blind;
    //deal 2 cards to each player after small and big blind forced bets
    sendPrivateHands(currTable);    // IMPORTANT: ALSO SETS PLAYER.isPlaying TO TRUE
    // send send the dealer's placement, the minimum bet, and the list of all users at the table
    let dealer = getNextDealer(currTable);
    let smallBlind = getSmallBigBlind(currTable, dealer, true);
    let bigBlind =  getSmallBigBlind(currTable, dealer, false);
    console.log(`blinds: Small: ${smallBlind}, Big: ${bigBlind}`);
    broadcastToTable(currTable, { type: 'start', dealer: dealer, userList: getUserList(currTable), bet: blind, sBlind: smallBlind, bBlind: bigBlind})
    // send green light to next player
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
    console.log(`start: T${tables[currTable].tableId} - started the game, Dealer: ${tables[currTable].dealer}`);
}

const checkEndOfRound = (currTable) => {
    // check how many different bets are in play
    // once they are all the same: end the round
    if ([...new Set(tables[currTable].players.filter(x => x.isPlaying == true).map(x => x.bet))].length == 1) {
        return true
    }
    return false;
}

const endPlayerTurn = (currTable) => {
    if (!checkGameOver(currTable)) {  // check if there are sufficient players in the game
        if (!checkEndOfRound(currTable)) {  // check if there is another bet to be made -> no=>true, yes=>false
            // send green light to next player
            let nextPosition = getNextPlayer(currTable);
            broadcastToTable(currTable, { type: 'upnext', position: nextPosition, pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
            console.log(`action: T${tables[currTable].tableId} - p${nextPosition} takes action`);
        } else {
            newRound(currTable);
        }
    }
}

const showDown = (currTable) => {

    return;
}

const newRound = (currTable) => {
    // add each players bet to the pot
    tables[currTable].players.forEach(x => {
        tables[currTable].pot += x.bet;
        x.bet = 0;
    })
    // based on gamestate lay out community cards and begin another round of betting
    if (tables[currTable].communityCards == null) {
        tables[currTable].communityCards = drawCards(currTable, 3);
    } else if (tables[currTable].communityCards.length == 5) {
        //SHOWDOWN
        showDown(currTable);
        return;
    } else if (tables[currTable].communityCards.length >= 3) {
        tables[currTable].communityCards.push(drawCards(currTable, 1)[0]);
    }
    tables[currTable].inAction = tables[currTable].dealer;
    tables[currTable].runningBet = 0;
    console.log(`roundend: T${tables[currTable].tableId} ended betting, CC: ${tables[currTable].communityCards}`);
    broadcastToTable(currTable, { type: 'roundend', hand: tables[currTable].communityCards }) //using hand again so the TS is not too cluttered xdd
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: tables[currTable].pot, runningBet: tables[currTable].runningBet, userList: getUserList(currTable) });
    
}

const getUserList = (currTable) => {
    let userList = [];
    tables[currTable].players.forEach(client => {
        userList.push({
            userId: client.clientId,
            userName: client.name,
            position: client.position,
            bet: client.bet
        })
    })
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
    tables[currTable].players.forEach(client => {
        client.socket.send(JSON.stringify(message))
    })
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
            if (checkPlayerIsPlaying(tables[currTable].players, tables[currTable].inAction)) {
                break;
            }

            failsafe++;
            if (failsafe > 20) {
                break;
            }
        } while (true)
        console.log(`dealer: T${tables[currTable].tableId} - P${tables[currTable].inAction} is the next dealer`);
        return tables[currTable].inAction;
    }
}

const getSmallBigBlind = (currTable, dealer, small)=>{
    let activePlayers = tables[currTable].players.filter(x=>x.isPlaying);
    if (activePlayers.length > 2) {
        let failsafe = 0;
        let nextPosition = dealer;
        do {
            if (small) {
                if (nextPosition + 1 < Math.max(activePlayers.map(x=>x.position))) {
                    nextPosition++;
                } else {
                    nextPosition = 0;
                }
            }else{
                if (nextPosition + 2 < Math.max(activePlayers.map(x=>x.position))) {
                    nextPosition+=2;
                } else {
                    nextPosition = 0;
                }
            }
            if (checkPlayerIsPlaying(activePlayers, nextPosition)) {
                break;
            }
            failsafe++;
            if (failsafe>20) {
                break;
            }
        } while (true);
        return nextPosition;
    }else{
        if (small) {
            return dealer;
        }else{
            // console.log(activePlayers.map(x=>x.position).filter(x=>x!=dealer));
            return activePlayers.map(x=>x.position).filter(x=>x!=dealer);
        }
    }
}

// true if is in play -> valid for action, false if is not in play -> not valid for action
const checkPlayerIsPlaying = (players, position) => {
    if (players.find(x => x.position == position).isPlaying == true) {
        return true
    }
    return false
}

const drawCards = (currTable, n) => {
    if (tables[currTable].deck == null) {
        tables[currTable].deck = getFreshDeck();
    }
    tables[currTable].deck.pop(); // burn first card
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
    tables[currTable].players.forEach(user => {
        user.bet = 0;
        user.isPlaying = true;
        user.hand = drawCards(currTable, 2)
        user.socket.send(JSON.stringify({ type: 'hand', hand: user.hand }))
    });
    // saveTable(currTable)
}

const getNextPlayer = (currTable) => {
    if (tables[currTable].inAction == null) {
        tables[currTable].inAction = decideFirstToAct(currTable);
        
        return tables[currTable].inAction;
    } else {
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
            if (failsafe > 20) {
                break;
            }
        } while (true)
        // saveTable(currTable)
        console.log(`action: T${tables[currTable].tableId} - P${tables[currTable].inAction} takes action`);
        return tables[currTable].inAction;
    }
}

const decideFirstToAct = (currTable) => {
    let playerCount = tables[currTable].players.length;
    if (playerCount > 3) {
        return 3;
    } else {
        return 0
    }
}


server.on('close', () => {
})

server.on('error', (error) => {
    console.log(error.message);
})

console.log('Server online!');


//npx nodemon index.js for development
//node index.js for release