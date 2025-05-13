import { WebSocketServer } from "ws";

const server = new WebSocketServer({
    port: 8081
});

let clientId = 0;
const clients = [];

let tableId = 0;
const tables = [];

let position = 0;

// Table 
//{
//     tableId: Number,
//     players: Player[],
//     inProgress: bool,
//     dealer: Number,
//     deck: [].
//     pot: Number
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
        // console.log(msg);
        if (msg.type == 'init') {
            if (clients.length > 0) {
                console.log(clients);
                
                let usedIds = clients.map(x => x.id);
                
                for (let i = 1; i < Math.max(...clients.map(x=>x.id))+2; i++) {
                    console.log(i);
                    if (!usedIds.includes(i)) {
                        clientId = i;
                        break;
                    }
                }
            } else {
                clientId=1;
            }
            console.log('init: new user connecting...');
            

            if (tables.length > 0 && tables.find(x=>x.players.length < 10)!=null) {
                let lasttable = tables.find(x=>x.players.length < 10);
                let usedPositions = lasttable.players.map(x => x.position);
                // console.log(usedPositions);
                for (let i = 0; i < 10; i++) {
                    if (!usedPositions.includes(i)) {
                        position = i;
                        break;
                    }
                }

                lasttable.players.push({
                    'socket': socket,
                    'id': clientId,
                    'name': msg.userName,
                    'table': tableId,
                    'position': position,
                })
            } else {
                // create new table
                tableId++;
                position = 0
                tables.push({
                    tableId: tableId, players: [
                        {
                            'socket': socket,
                            'id': clientId,
                            'name': msg.userName,
                            'table': tableId,
                            'position': position
                        }],
                    inProgress: false
                })
            }
            clients.push({
                'socket': socket,
                'id': clientId,
                'name': msg.userName,
                'table': tableId,
                'position': position
            });
            // console.log(clients);
            let userList = [];
            let currTable = tables.find(x => x.tableId == tableId);
            currTable.players.forEach(player => {
                userList.push({
                    userId: player.id,
                    userName: player.name,
                    position: player.position
                })
            })

            console.log(`init: User ${clientId} connected to table ${tableId} at position ${position}`);

            socket.send(JSON.stringify({
                type: 'init',
                userId: clientId,
                position: position
            }))

            broadcastToTable(currTable, { type: 'join', userId:clientId, userName: msg.userName, tableId, position: position });
            broadcastToTable(currTable, { type: 'userlist', userList: userList })
            return;
        }

        // console.log(msg);
        let currTable = tables.find(x => x.players.find(x=>x.id == msg.userId) != null);
        if (msg.type == 'disc') {
            // console.log(currTable);
            let user = currTable.players.find(x => x.id == msg.userId);
            console.log('dc: user '+user.id+' disconnecting...');
            user.socket.close();
            currTable.players.splice(currTable.players.indexOf(user), 1)
            clients.splice(clients.findIndex(x=>x.id == user.id), 1)
            broadcastToTable(currTable, { type: 'disced', userId: msg.userId, userName: msg.userName })
            console.log('dc: User '+user.id+' disconnect successful');
            return;
        }
        if (msg.type == 'ready') {
            console.log(`Table ${currTable.tableId} `);
            currTable.inProgress = true;
            currTable.deck = getFreshDeck();
            broadcastToTable(currTable, {type: 'start', dealer: getNextDealer(currTable)})
            return;
        }
        if (msg.type == '') {
            
            return;
        }
    })
})

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

server.on('close', () => {
})

server.on('error', (error) => {
    console.log(error.message);
})

console.log('Server online!');


//npx nodemon index.js for development
//node index.js for release