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
//     'bet': number
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
                    'isPlaying': (lasttable.inProgress ? false : true)
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
                            'position': position
                        }],
                    inProgress: false
                })
            }
            clients.push({
                'socket': socket,
                'clientId': clientId,
                'name': msg.userName,
                'tableId': myTableId,
                'position': position
            });

            let currTable = tables.find(x => x.tableId == tableId);
            let userList = getUserList(currTable);

            socket.send(JSON.stringify({
                type: 'init',
                userId: clientId,
                position: position,
                tableId: myTableId,
                userList: userList,
                inProgress: currTable.inProgress
            }))
            broadcastToTable(currTable, { type: 'join', userId: clientId, userName: msg.userName, tableId: myTableId, position: position, userList: userList});
            console.log(`init: U${clientId} conn. to T${tableId} @pos ${position}`);
            return;
        }

        // console.log(msg);
        let currTable = tables.find(x => x.players.findIndex(x => x.clientId == msg.userId) != -1);
        if (msg.type == 'disc') {
            if (currTable != null) {
                let user = currTable.players.find(x => x.clientId == msg.userId);
                if (user.isPlaying) {
                    currTable.inPlay--;
                }
                user.socket.close();
                currTable.players.splice(currTable.players.indexOf(user), 1)
                clients.splice(clients.findIndex(x => x.clientId == user.clientId), 1)
                broadcastToTable(currTable, { type: 'disc', userId: msg.userId, userName: msg.userName, position: msg.position })
                console.log('dc: U' + user.clientId + ' disconnect successful');
            } else {
                console.error('dc: disconnect failed');
            }
            checkGameOver(currTable)
            return;
        }
        if (msg.type == 'ready') {
            if (currTable != null && currTable.players.length >= 2) {
                startTable(currTable);
            } else {
                console.error('ready: table cannot be readied')
            }
            return;
        }
        let currPlayer = currTable.players.find(x => x.clientId == msg.userId)
        if (msg.type == 'fold') {
            console.log(`fold: User ${currPlayer.clientId} folds, surrendering their cards, at table ${currPlayer.tableId}`);
            currPlayer.isPlaying = false;
            currTable.pot += currPlayer.bet;
            currTable.inPlay--;
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'bet') {
            currPlayer.bet += msg.bet;
            if (currPlayer.bet > currTable.runningBet) {
                currTable.runningBet = currPlayer.bet
            }
            console.log(`bet: T${currPlayer.tableId} - U${currPlayer.clientId}@pos${currPlayer.position} bets ${msg.bet}, total: ${currPlayer.bet} `);
            endPlayerTurn(currTable);
            return;
        }
        if (msg.type == 'blind') {
            currPlayer.bet += msg.bet;
            if (currPlayer.bet > currTable.runningBet) {
                currTable.runningBet = currPlayer.bet
            }
            console.log(`blind: T${currPlayer.tableId} - U${currPlayer.clientId}@pos${currPlayer.position} bets ${msg.bet}, total: ${currPlayer.bet} `);
        }
        if (msg.type == 'check') {
            console.log(`check: T${currPlayer.tableId} - U${currPlayer.clientId}@post${currPlayer.position} checks`);
            endPlayerTurn(currTable);
            return;
        }
        saveTable(currTable);
    })
})

const saveTable = (currTable)=>{
    tables[tables.findIndex(x=>x.tableId==currTable.tableId)] = currTable;
}

//return true if there are no remaining players
const checkGameOver = (currTable) => {
    if (currTable.inPlay < 2) {
        try {
            let winnerId = currTable.players.find(x => x.isPlaying == true).clientId;
            broadcastToTable(currTable, { type: 'win', clientId: winnerId });
            console.log(`win: T${currTable.tableId} - U${winnerId} won the round`);
        } catch (error) {
            console.log(`error: T${currTable.tableId} has no players left`);
        }
        resetTable(currTable);
        return true;
    }
    return false;
}

const resetTable = (currTable) => {
    console.log(`reset: T${currTable.tableId} has been reset`);
    currTable.inProgress = false;
    currTable.pot = 0;
    currTable.runningBet = 0;
    saveTable(currTable);
}

const startTable = (currTable) => {
    currTable.inProgress = true;
    currTable.deck = getFreshDeck();
    currTable.inPlay = currTable.players.length;
    // in case someone else joins or leaves, we dont want to fuck up positions, still requires more refining
    currTable.pot = 0;
    currTable.runningBet = blind;
    //deal 2 cards to each player after small and big blind forced bets
    sendPrivateHands(currTable);    // IMPORTANT: ALSO SETS PLAYER.isPlaying TO TRUE
    // send send the dealer's placement, the minimum bet, and the list of all users at the table
    broadcastToTable(currTable, { type: 'ready', dealer: getNextDealer(currTable), userList: getUserList(currTable), bet: blind })
    // send green light to next player
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: currTable.pot, runningBet: currTable.runningBet });
    console.log(`start: T${currTable.tableId} - started the game`);
    saveTable(currTable);
}

const checkEndOfRound = (currTable) => {
    // check how many different bets are in play
    // once they are all the same: end the round
    if ([...new Set(currTable.players.filter(x => x.isPlaying == true).map(x => x.bet))].length == 1) {
        return true
    }
    return false;
}

const endPlayerTurn = (currTable) => {
    if (!checkGameOver(currTable)) {  // check if there are sufficient players in the game
        if (!checkEndOfRound(currTable)) {  // check if there is another bet to be made -> no=>true, yes=>false
            // send green light to next player
            let nextPosition = getNextPlayer(currTable);
            broadcastToTable(currTable, { type: 'upnext', position: nextPosition, pot: currTable.pot, runningBet: currTable.runningBet });
            console.log(`action: T${currTable.tableId} - p${nextPosition} takes action`);
        } else {
            newRound(currTable);
        }
    }
}

const showDown = (currTable)=>{
    return;
}

const newRound = (currTable) => {
    // add each players bet to the pot
    currTable.players.forEach(x=>{
            currTable.pot+=x.bet;
            x.bet = 0;
    })
    // based on gamestate lay out community cards and begin another round of betting
    if (currTable.communityCards == null) {
        currTable.communityCards = drawCards(currTable, 3);
    } else if (currTable.communityCards.length == 5) {
        //SHOWDOWN
        showDown(currTable);
        return;
    } else if (currTable.communityCards.length >= 3) {
        currTable.communityCards.push(drawCards(currTable, 1)[0]);
    }
    currTable.inAction = currTable.dealer;
    console.log(`roundend: T${currTable.tableId} ended betting, CC: ${currTable.communityCards}`);
    broadcastToTable(currTable, { type: 'roundend', hand: currTable.communityCards, position: getNextPlayer(currTable) }) //using hand again so the TS is not too cluttered xdd
    broadcastToTable(currTable, { type: 'upnext', position: getNextPlayer(currTable), pot: currTable.pot, runningBet: currTable.runningBet });
    saveTable(currTable);
}

const getUserList = (currTable) => {
    let userList = [];
    currTable.players.forEach(client => {
        userList.push({
            userId: client.clientId,
            userName: client.name,
            position: client.position
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

const broadcastToTable = (table, message) => {
    table.players.forEach(client => {
        client.socket.send(JSON.stringify(message))
    })
}

const getNextDealer = (table) => {
    if (table.dealer == null) {
        table.dealer = 0;
        return 0;
    } else {
        let failsafe = 0;
        do {
            if (table.dealer + 1 < table.players.length) {
                table.dealer++;
            } else {
                table.dealer = 0;
            }
            if (checkPlayerIsPlaying(table.players, table.inAction)) {
                break;
            }
            
            failsafe++;
            if (failsafe > 20) {
                break;
            }
        } while (table.players.find(x => x.position == table.inAction) != null && table.players)
        console.log(`dealer: T${table.tableId} - P${table.inAction} is the next dealer`);
        return table.inAction;
    }
}

// true if is in play -> valid for action, false if is not in play -> not valid for action
const checkPlayerIsPlaying = (players, position)=>{
    if (players.find(x=>x.position == position).isPlaying == true) {
        return true
    }
    return false
}

const drawCards = (currTable, n) => {
    currTable.deck.pop(); // burn first card
    let cards = [];
    for (let i = 0; i < n; i++) {
        if (currTable.deck.length > 0) {
            cards.push(currTable.deck.pop())
        } else {
            currTable.deck = getFreshDeck();
            cards.push(currTable.deck.pop())
        }
    }
    saveTable(currTable);
    return cards;
}

// IMPORTANT: THIS ALSO SETS PLAYER.isPlaying TO TRUE
const sendPrivateHands = (currTable) => {
    currTable.players.forEach(user => {
        user.bet = 0;
        user.isPlaying = true;
        user.hand = drawCards(currTable, 2)
        user.socket.send(JSON.stringify({ type: 'hand', hand: user.hand }))
    });
    saveTable(currTable)
}

const getNextPlayer = (currTable) => {
    if (currTable.inAction == null) {
        currTable.inAction = decideFirstToAct(currTable);
        saveTable(currTable);
        return currTable.inAction;
    }else {
        let failsafe = 0;
        do {
            if (currTable.inAction + 1 < currTable.players.length) {
                currTable.inAction++;
            } else {
                currTable.inAction = 0;
            }
            if (checkPlayerIsPlaying(currTable.players, currTable.inAction)) {
                break;
            }
            failsafe++;
            if (failsafe > 20) {
                break;
            }
        } while (currTable.players.find(x => x.position == currTable.inAction) != null && currTable.players)
        saveTable(currTable)
        console.log(`action: T${currTable.tableId} - P${currTable.inAction} takes action`);
        return currTable.inAction;
    }
}

const decideFirstToAct = (currTable) => {
    let playerCount = currTable.players.length;
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