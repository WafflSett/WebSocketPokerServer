import { WebSocketServer } from "ws";

const server = new WebSocketServer({
    port: 8081
});

let clientId = 0;
const clients = [];

let tableId = -1;
const tables = [];

let position = 0;

// Table 
//{
//     tableId: Number,
//     players: Player[],
//     inProgress: bool,
//     dealer: Number,
//     deck: [].
//     pot: Number,
//     inAction: Number
// }

//Player
// {
//     'socket': socket,
//     'id': Number,
//     'name': string,
//     'table': number,
//     'position': number,
//     'hand': []
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
                for (let i = 1; i < Math.max(...clients.map(x=>x.clientId))+2; i++) {
                    if (!usedIds.includes(i)) {
                        clientId = i;
                        break;
                    }
                }
            } else {
                clientId=1;
            }

            if (tables.length > 0 && tables.find(x=>x.players.length < 10)!=null) {
                let lasttable = tables.find(x=>x.players.length < 10);
                let usedPositions = lasttable.players.map(x => x.position);
                for (let i = 0; i < 10; i++) {
                    if (!usedPositions.includes(i)) {
                        position = i;
                        break; // find free position at table and put user there
                    }
                }
                myTableId = tables.findIndex(x=>x.tableId==lasttable.tableId);
                
                lasttable.players.push({
                    'socket': socket,
                    'clientId': clientId,
                    'name': msg.userName,
                    'table': myTableId,
                    'position': position,
                })
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
                            'table': myTableId,
                            'position': position
                        }],
                    inProgress: false
                })
            }
            clients.push({
                'socket': socket,
                'clientId': clientId,
                'name': msg.userName,
                'table': myTableId,
                'position': position
            });
            
            let currTable = tables.find(x => x.tableId == tableId);
            let userList = getUserList(currTable);
            
            socket.send(JSON.stringify({
                type: 'init',
                userId: clientId,
                position: position,
                tableId: myTableId,
                userList: userList
            }))
            
            broadcastToTable(currTable, { type: 'join', userId:clientId, userName: msg.userName, tableId: myTableId, position: position });
            // broadcastToTable(currTable, { type: 'userlist', userList: userList, tableId: myTableId })
            
            console.log(`init: User ${clientId} connected to table ${tableId} at position ${position}`);
            return;
        }

        // console.log(msg);
        let currTable = tables.find(x => x.players.findIndex(x=>x.clientId == msg.userId) != -1);
        if (msg.type == 'disc') {
            if (currTable != null) {
                let user = currTable.players.find(x => x.clientId == msg.userId);
                user.socket.close();
                currTable.players.splice(currTable.players.indexOf(user), 1)
                clients.splice(clients.findIndex(x=>x.clientId == user.clientId), 1)
                broadcastToTable(currTable, { type: 'disc', userId: msg.userId, userName: msg.userName })
                console.log('dc: User '+user.clientId+' disconnect successful');
            }else{
                console.error('dc: disconnect failed');
            }
            return;
        }
        if (msg.type == 'ready') {
            if (currTable != null) {
                console.log(`ready: Table ${currTable.tableId} started the game`);
                currTable.inProgress = true;
                currTable.deck = getFreshDeck();
                let userList = getUserList(currTable);
                let dealer = getNextDealer(currTable);
                currTable.pot = 1500;
                broadcastToTable(currTable, {type: 'ready', dealer: dealer, userList: userList})    
                broadcastToTable(currTable, {type: 'upnext', position: getNextPlayer(currTable)});
            }else{
                console.error('ready: table cannot be readied')
            }
            return;
        }
        if (msg.type == '') {
            
            return;
        }
    })
})

const getUserList = (currTable) =>{
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

const getFreshDeck = ()=>{
    const suits = ['♣', '♠', '♥', '♦'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push(suit+rank);
        });
    });
    //return shuffled deck
    return deck.map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);
}

const broadcastToTable = (table, message)=>{
    table.players.forEach(client => {
        client.socket.send(JSON.stringify(message))
    })
}

const getNextDealer = (table)=>{
    if (table.dealer == null) {
        return 0;
    }else{
        if (table.dealer+1 <= table.players.length) {
            return table.dealer+1;
        }else{
            return 0;
        }
    }
}

const getNextPlayer = (table)=>{
    if (table.inAction == null) {
        return decideFirstToAct(table);
    }else{
        if (table.inAction+1 < table.players.length) {
            return table.dealer+1;
        }else{
            return 0;
        }
    }
}

const decideFirstToAct = (table)=>{
    let playerCount = table.players.length;
    if (playerCount>3) {
        return 3;
    }else{
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