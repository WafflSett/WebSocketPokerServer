import { WebSocketServer } from "ws";

const server = new WebSocketServer({
    port: 8081
});

let clientId = 0;
const clients = [];

let tableId = 0;
const tables = [];

// {
//     tableId: Number,
//     players: Player[]
// }

// max players at a table: 10
// min players to start a table: 2 

server.on('connection',(socket)=>{
    socket.on('message', (message)=>{
        const msg = JSON.parse(message);
        // console.log(msg);
        if (msg.type == 'init') {
            if (clients.length > 0) {
                clientId = Math.max(...clients.map(x=>x.id))+1;
            }else if (clientId<=0) {
                clientId++;
            }else{
                clientId = 1;
            }

            if (tables.length>0 && tables[tables.length-1].players.length < 10) {
                tables[tables.length-1].players.push()
            }else{
                tableId++;
                tables.push({tableId: tableId, players: [{
                    'socket': socket, 
                    'id':clientId,
                    'name':msg.userName,
                    'table':tableId,
                    'position':0
                }]})
            }
            clients.push({
                'socket': socket, 
                'id':clientId,
                'name':msg.userName,
                'table':tableId
            });
            // console.log(clients);
            let userList = [];
            let currTable = tables.find(x=>x.tableId == tableId);
            currTable.players.forEach(player=>{
                userList.push({
                    userId:player.id,
                    userName:player.name
                })
            })
            socket.send(JSON.stringify({
                type:'init',
                userId: clientId
            }))
            currTable.find(x=>x.tableId == tableId).players.forEach(player=>{
                userList.push({
                    userId:player.id,
                    userName:player.name
                })
            })
        }
        if (msg.type == 'disc') {
            // console.log(clients);
            console.log(msg);
            let currTable = tables.find(x=>x.tableId == msg.tableId);
            currTable.players.find(x=>x.id==msg.userId).socket.close();
            currTable.players.forEach(client=>{
                client.socket.send(JSON.stringify({type:'disced', userId:msg.userId, userName: msg.userName}))
            })
        }
    })
})

server.on('close', ()=>{
})

server.on('error', (error)=>{
    console.log(error.message);
})

console.log('Server online!');


//npx nodemon index.js for development
//node index.js for release