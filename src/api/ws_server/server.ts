import { connections } from "../../space_allocator"
import express from "express"
import http from 'http'
import { Server } from "socket.io"
import { Connection } from "../../@types/reseda"

// Can listen to incoming traffic and manage connections, pinging delete and create events.

/**
 * Socket Server Enables a few advantages over the *supabase* implementation.
 * 1. Speed - It is a direct connection using a minimal format so implements requests faster.
 * 2. Updatability - As it is connected in realtime, allows for simple and easy implementations of real-time usage logging etc.
 * 3. Componentizisation - As it is directly attached to the server there is no 3rd party intermediary, increases speed, stability and security.
 * 4. Security - As you connect directly to the server, and not to a database, there is no logs of the request, only the data usage afterwards for payment purposes.
 * 
 * Implementation works as follows:
 * 1. Client Connects to SOCKET.IO server passing in the following information: userId, serverId (check eq.) cPk
 * 2. Server completes the information packet and replies with the following: sPk, client_number, endpoint, start_time
 * 3. Client and Server Create Connection using WireGuard
 * 4. Post-Connection; Server fetches data from db about maximum bandwidth allowance and current used allowance - creating a session max allowance.
 * 5. Connection is monitored by the server, providing usage reports through socket connection to user at 10s intervals. If usage exceeds maximum - user is notified.
 * 6. If user receives disconnect warning, client performs a safe disconnect within a 10s interval. If user has not disconnected within the time period, wireguard connection is removed server-side. 
 * 
 * Inputs: none,
 * Returns: none
 */
const start_websocket_server = (origin: string) => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: `http://${origin}`,
            credentials: true
        }
    });
    
    // RESEDA PORT - 6231.
    server.listen(6231, () => {
        console.log('Websocket Server Listening on [6231]');
    });

    io.on('connection', (socket) => {
        console.log('a user connected');

        socket.on('request_connect', () => {

        })
    });

    // Client Connects as so:: var socket = io("http://{server_hostname}:6231/", { auth: connection_data });
    io.use(async (socket, next) => {
        console.log("Query: ", socket.handshake.auth);

        const partial_connection: Partial<Connection> = socket.handshake.auth.connection_data;
        console.log(partial_connection);

        return next();
    });
}

export default start_websocket_server;