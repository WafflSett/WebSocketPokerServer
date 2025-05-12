import { WebSocketServer } from "ws";

const server = new WebSocketServer({
    port: 8081
});

let clientId = 0;
const clients = [];

let tableId = 0;
const tables = [];

let position = 0;
// {
//     tableId: Number,
//     players: Player[],
//     inProgress: bool
// }

// max players at a table: 10
// min players to start a table: 2 

server.on('connection', (socket) => {
    socket.on('message', (message) => {
        const msg = JSON.parse(message);
        // console.log(msg);
        if (msg.type == 'init') {
            if (clients.length > 0) {
                clientId = Math.max(...clients.map(x => x.id)) + 1;
            } else if (clientId <= 0) {
                clientId++;
            } else {
                clientId = 1;
            }

            if (tables.length > 0 && tables.find(x=>x.players.length < 10)!=null) {
                let lasttable = tables.find(x=>x.players.length < 10);
                if (lasttable.players.find(x => x.position == 9) == null) {
                    position++;
                } else {
                    let usedPositions = lasttable.player.map(x => x.position);
                    for (let i = 0; i < 10; i++) {
                        if (!usedPositions.contains(i)) {
                            position = i;
                            break;
                        }
                    }
                }
                lasttable.players.push({
                    'socket': socket,
                    'id': clientId,
                    'name': msg.userName,
                    'table': tableId,
                    'position': position
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

            socket.send(JSON.stringify({
                type: 'init',
                userId: clientId,
                position: position
            }))

            currTable.players.forEach(player => {
                player.socket.send(JSON.stringify({ type: 'join', userId:clientId, position: position }));
            })
            // currTable.players.forEach(player => {
            //     player.socket.send(JSON.stringify({ type: 'userlist', userList: userList }));
            // })
        }
        if (msg.type == 'disc') {
            // console.log(clients);
            // console.log(msg);
            let currTable = tables.find(x => x.tableId == msg.tableId);
            currTable.players.find(x => x.id == msg.userId).socket.close();
            currTable.players.forEach(client => {
                client.socket.send(JSON.stringify({ type: 'disced', userId: msg.userId, userName: msg.userName }))
            })
        }
        if (msg.type == 'start') {
            tables.find(x => x.tableId == msg.tableId).inProgress = true;
        }
    })
})

server.on('close', () => {
})

server.on('error', (error) => {
    console.log(error.message);
})

console.log('Server online!');


//npx nodemon index.js for development
//node index.js for release