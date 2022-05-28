import { connections } from "../space_allocator"
import express from "express"
import http from 'http'
import https from 'https'
import { Server, Socket } from "socket.io"
import { Connection } from "../@types/reseda"
import { WgConfig } from "wireguard-tools"
import { randomUUID } from "crypto"
import log_usage from "./log_usage"
import cors from "cors"
import fs from "fs"
import { disconnect } from "process"
import { prisma } from "@prisma/client"
import get_user_limit from "./get_user_limit"
import { config } from ".."

type RequestPacket = {
    server: string,
    client_pub_key: string,
    author: string
}

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
const start_websocket_server = () => {
    const app = express();

    const key = fs.readFileSync('./key.pem');
    const cert = fs.readFileSync('./cert.pem');

    app.use(express.json()) // for parsing application/json
    app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

    app.use(cors({
        origin: '*'
    }));

    const server = https.createServer({
        key, cert
    }, app);
    
    const io = new Server(server, {
        cors: {
            origin: true, //[`http://${origin}`, 'http://localhost:3000', 'https://reseda.app'],
            credentials: true,
            allowedHeaders: ['Access-Control-Allow-Origin']
        }
    });

    app.get("/", (req, res) => {
        res.status(200).json({ 
            status: "OK",
            load: connections.totalUsers()
        });
    })
    
    // RESEDA PORT - 6231.
    server.listen(443, () => {
        console.log('Websocket Server Listening on [6231]');
    });
    
    io.on('connection', async (socket) => {
        if(socket.handshake.auth.type == "initial") {
            initial_connection(socket);
        }else if(socket.handshake.auth.type == "secondary") {
            resume_connection(socket);
        }else {
            user_disconnect(socket);
        }
    });

    // Client Connects as so:: var socket = io("http://{server_hostname}:6231/", { auth: connection_data });
    io.use(async (socket, next) => {
        return next();
    });

    
}

const send_failure = async (socket: Socket, args: { type: "exceeded_user_connections" | "exceeded_throughput" | "general_failure" | "public_key_clash", reason: string }) => {
    socket.emit('failure', args);
    user_disconnect(socket);
}

const initial_connection = async (socket: Socket) => {
    const partial_connection: Partial<Connection> = socket.handshake.auth;
    console.log(partial_connection);

    if(partial_connection.client_pub_key && connections.withKey(partial_connection.client_pub_key)) {
        // There exists an existing connection to this server with the SAME public key (likely same user, twice)...
        // Hence, we will need to disconnect the old user to connect the new one, otherwise they will no longer
        // be able to connect if they fail a disconnect or encounter a bug. This adds repeatability to the service
        // and prevents unknown disconnects.
        send_failure(socket, {
            type: "public_key_clash",
            reason: `A user already exists with this public key.`
        })
        return;
    };

    // TODO: Check if there is another user with the same user_id, and check IF their account allows for that...
    // Also, how is id spoofing going to be managed? rn anyone with any id can just log on and have a free vpn charged under the owners acc...
    if(partial_connection.author) {
        const len = connections.fromRawId(partial_connection.author).length;
        if(len > 0) {
            send_failure(socket, {
                type: "exceeded_user_connections",
                reason: `Your account does not allow more than 1 concurrent connection, current connections: ${len}`
            })
        }
    }else {
        send_failure(socket, {
            type: "general_failure",
            reason: "Expected key `author`, was not provided."
        })
        return;
    }

    const user_position = connections.lowestAvailablePosition();

    config.getConfig()
        .addPeer({
            publicKey: partial_connection.client_pub_key,
            allowedIps: [`192.168.69.${user_position}/24`],
            persistentKeepalive: 25
        });

    connections
        .fill(user_position, {
            id: partial_connection.author ?? "",
            author: partial_connection.author ?? "",
            server: partial_connection.server ?? process.env.SERVER ?? "error-0",
            client_pub_key: partial_connection.client_pub_key ?? "",
            svr_pub_key: config.getConfig().publicKey ?? "",
            client_number: user_position,
            awaiting: false,
            server_endpoint: origin,
            start_time: new Date().getTime(),
            socket: socket
        });

    const connection = connections.fromId(partial_connection.client_pub_key ?? "");

    socket.emit("request_accepted", connection);
    await config.getConfig().down().catch(e => console.error(e)).then(e => console.log(e));
    await config.getConfig().save({ noUp: true });
    await config.getConfig().up().catch(e => console.error(e)).then(e => console.log(e));

    // After connection, find and set the limits of the user for reference. Now, we can determine if the user exceeds that limit!
    const lim = await get_user_limit(partial_connection.author);
    connections.setMaximum(user_position, lim.up, lim.down);
}

const resume_connection = async (socket: Socket) => {
    console.log("Entering Pick off Connection...");

    const partial_connection: Partial<Connection> = socket.handshake.auth;
    const connection = connections.fromId(partial_connection.client_pub_key ?? "");

    socket.emit("request_response", {
        connection
    });
}

const user_disconnect = async (socket: Socket) => {
    console.log("Entering Disconnect Phase")
    console.time("disconnectClient");

    console.log(socket.handshake.auth);

    // Extrapolate Information from SessionDB
    const connection = connections.fromId(socket.handshake.auth.client_pub_key);

    if(!connection) {
        console.log(`Failed to remove user, unable to match private and public keys.`);
        return;
    };

    // User disconnected, now its our job to remove them from the server and wireguard pool.
    console.log(`Received Disconnect Message from ${connection.author}`);
    console.timeLog("disconnectClient");
    
    // Prioritize Disconnecting User
    console.log(connection);
    if(connection.client_pub_key) {
        await config.getConfig().down();
        await config.getConfig().removePeer(connection.client_pub_key); 
        await config.getConfig().save({ noUp: true });
        await config.getConfig().up();
    }

    console.log("Removed Peer");
    console.timeLog("disconnectClient");

    // Remove Local Instance
    if(connection.client_number) connections.remove(connection.client_number);

    console.log("Peer Cleaned");
    console.timeLog("disconnectClient");

    // Let user know that its okay to pull plug now. 
    socket.emit("OK");

    // Log the Session's Usage
    await log_usage({
        id: randomUUID(),
        userId: connection.author! ?? "",
        up: connection?.up?.toString()! ?? "", 
        down: connection?.down?.toString()! ?? "",
        serverId: process.env.SERVER! ?? "",
        connStart: connection?.start_time ? new Date(connection?.start_time) : new Date(Date.now())
    }).then(e => console.log(e.reason));

    console.log("Usage Report Created.");
    console.timeEnd("disconnectClient");
}

export default start_websocket_server;