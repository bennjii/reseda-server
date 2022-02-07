import { connections } from "../../space_allocator"
import express from "express"
import http from 'http'
import { Server } from "socket.io"
import { Connection } from "../../@types/reseda"
import { WgConfig } from "wireguard-tools"
import { randomUUID } from "crypto"
import log_usage from "../log_usage"

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
const start_websocket_server = (origin: string, config: WgConfig) => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: [`http://${origin}`, 'http://localhost:8888', 'https://reseda.app'],
            credentials: true
        }
    });
    
    // RESEDA PORT - 6231.
    server.listen(6231, () => {
        console.log('Websocket Server Listening on [6231]');
    });

    io.on('connection', (socket) => {
        const conn = async () => {
            const partial_connection: Partial<Connection> = socket.handshake.auth;
            console.log(partial_connection);

            if(partial_connection.client_pub_key && connections.withKey(partial_connection.client_pub_key)) return;
            const user_position = connections.lowestAvailablePosition();

            config
                .addPeer({
                    publicKey: partial_connection.client_pub_key,
                    allowedIps: [`192.168.69.${user_position}/24`],
                    persistentKeepalive: 25
                });

            connections
                .fill(user_position, {
                    id: socket.id ? socket.id.toString() : "",
                    author: partial_connection.author ?? "",
                    server: partial_connection.server ?? process.env.SERVER ?? "error-0",
                    client_pub_key: partial_connection.client_pub_key ?? "",
                    svr_pub_key: config.publicKey ?? "",
                    client_number: user_position,
                    awaiting: false,
                    server_endpoint: origin,
                    start_time: new Date().getTime()
                });

            const connection = connections.fromId(partial_connection.client_pub_key ?? "");

            socket.emit("request_accepted", connection);
            await config.down().catch(e => console.error(e)).then(e => console.log(e));
            await config.save({ noUp: true });
            await config.up().catch(e => console.error(e)).then(e => console.log(e));
        }

        conn();

        // Handle Disconnection
        socket.on('request_disconnect', async ({ cPk }) => {
            // Extrapolate Information from SessionDB
            const connection = connections.fromRawId(socket.id);
            
            // Prioritize Disconnecting User
            if(connection.client_pub_key) {
				await config.down();
				await config.removePeer(connection.client_pub_key); 
				await config.save({ noUp: true });
				await config.up();
			}

            // Remove Local Instance
			if(connection.client_number) connections.remove(connection.client_number);

            // Log the Session's Usage
            await log_usage({
				id: randomUUID(),
				userId: connection.author! ?? "",
				up: connection?.up?.toString()! ?? "", 
				down: connection?.down?.toString()! ?? "",
				serverId: process.env.SERVER! ?? "",
				connStart: connection?.start_time ? new Date(connection?.start_time) : new Date(Date.now())
			}).then(e => console.log(e.reason))
        });
    });

    // Client Connects as so:: var socket = io("http://{server_hostname}:6231/", { auth: connection_data });
    io.use(async (socket, next) => {
        console.log("Query: ", socket.handshake.auth);
        return next();
    });
}

export default start_websocket_server;