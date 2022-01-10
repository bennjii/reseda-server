"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const supabase_js_1 = require("@supabase/supabase-js");
const wireguard_tools_1 = require("wireguard-tools");
const path_1 = __importDefault(require("path"));
const title_1 = __importDefault(require("./title"));
const ip_1 = __importDefault(require("ip"));
const getIP = require('external-ip')();
if (!process.env.KEY)
    void (0);
const supabase = supabase_js_1.createClient("https://xsmomhokxpwacbhotdmk.supabase.co", (_a = process.env.KEY) !== null && _a !== void 0 ? _a : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDU4MTE3MiwiZXhwIjoxOTU2MTU3MTcyfQ.nGtdGflJcGTdegPJwg3FkSQJvKz_VGNzmmml2hj6rQg");
const filePath = path_1.default.join(__dirname, '/configs', './reseda.conf');
class SpaceAllocator {
    constructor() {
        this.space = new Map();
    }
    lowestAvailablePosition(smallest_key = 2) {
        let lowest_free_space = smallest_key;
        this.space.forEach((__, key) => {
            if (key == lowest_free_space)
                lowest_free_space = key + 1;
        });
        return lowest_free_space;
    }
    fill(index, data) {
        this.space.set(index, data);
    }
    totalUsers() {
        return this.space.size;
    }
    at(index) {
        return this.space.get(index);
    }
}
const connections = new SpaceAllocator();
const server = () => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    yield verifyIntegrity();
    const ip_a = (_b = yield getIP((__, ip) => ip)) !== null && _b !== void 0 ? _b : ip_1.default.address();
    const svr_config = new wireguard_tools_1.WgConfig({
        wgInterface: {
            address: ['192.168.69.1/24'],
            name: (_c = process.env.SERVER) !== null && _c !== void 0 ? _c : "default-1",
            postUp: ['iptables -A FORWARD -i reseda -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE'],
            postDown: ['iptables -D FORWARD -i reseda -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE'],
            listenPort: 51820,
        },
        filePath,
    });
    wireguard_tools_1.writeConfig({
        filePath,
        config: svr_config
    });
    yield svr_config.down();
    title_1.default();
    console.log(`[DATA]\t> Registering ${process.env.SERVER} (@ ${ip_a})`);
    (_d = svr_config.peers) === null || _d === void 0 ? void 0 : _d.forEach(e => {
        console.log("IP", e.allowedIps);
        // connections.fill()
    });
    console.log(connections);
    // Register Server
    yield supabase
        .from('server_registry')
        .insert({
        id: process.env.SERVER,
        location: process.env.TZ,
        country: process.env.COUNTRY,
        virtual: process.env.VIRTUAL,
        hostname: ip_a
    });
    yield svr_config.generateKeys(); //{ preSharedKey: true }
    yield svr_config.writeToFile();
    yield svr_config.up();
    supabase
        .from('open_connections')
        .on('DELETE', (payload) => {
        const data = payload.old;
        // How do we update connections, as the left user may not be the last user,
        // Hence - we may need to include a map of available spots and propagate top to bottom (FCFS)
        if (data.client_pub_key)
            svr_config.removePeer(data.client_pub_key);
        console.log("REMOVING::", data, payload);
    }).subscribe();
    supabase
        .from('open_connections')
        .on('INSERT', (payload) => {
        var _a, _b, _c, _d, _e, _f;
        const data = payload.new;
        if (data.server !== process.env.SERVER)
            return;
        const user_position = connections.lowestAvailablePosition();
        console.log(`[CONN]\t> Adding Peer`);
        svr_config
            .addPeer({
            publicKey: data.client_pub_key,
            allowedIps: [`192.168.69.${user_position}/24`],
            persistentKeepalive: 25
        });
        console.log(`[ALLOC]\t> Allocating INDEX::${user_position}`);
        connections
            .fill(user_position, {
            id: (_a = data.id) !== null && _a !== void 0 ? _a : 0,
            author: (_b = data.author) !== null && _b !== void 0 ? _b : "",
            server: (_d = (_c = data.server) !== null && _c !== void 0 ? _c : process.env.SERVER) !== null && _d !== void 0 ? _d : "error-0",
            client_pub_key: (_e = data.client_pub_key) !== null && _e !== void 0 ? _e : "",
            svr_pub_key: (_f = svr_config.publicKey) !== null && _f !== void 0 ? _f : "",
            client_number: user_position,
            awaiting: false,
            server_endpoint: ip_a
        });
        console.log("[CONN]\t> Publishing to SUPABASE", connections.at(user_position));
        supabase
            .from("open_connections")
            .update({
            client_number: user_position,
            awaiting: false,
            svr_pub_key: svr_config.publicKey,
            server_endpoint: ip_a
        }).match({ id: data.id })
            .then((e) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(e);
            yield svr_config.save();
        }));
    }).subscribe();
    // This should never execute by code, rather as a result of the following handlers - handles normal exit protocols.
    process.on("exit", () => { console.log(`Process has exited normally.`); });
    // Handle CTRL + C forced quits.
    process.on("SIGINT", () => { quitQuietly("forced", svr_config); });
    // Handle error quits.
    process.on("uncaughtException", () => { quitQuietly("err", svr_config); });
});
/**
 * Exits the program whilst ensuring a proper disconnect of the reseda-server from the mesh.
 *
 * @returns async void
 */
const quitQuietly = (type, config) => __awaiter(void 0, void 0, void 0, function* () {
    var _e;
    console.log(`Process Quitting > Sending Finalized`);
    // Remove all Wireguard Peers from the connection, as disconnect handlers will no longer respond 
    // such that users may be stuck between connections as by the server with open-ended propagations and protocols. 
    (_e = config.peers) === null || _e === void 0 ? void 0 : _e.forEach(peer => {
        if (peer === null || peer === void 0 ? void 0 : peer.publicKey)
            config.removePeer(peer.publicKey);
    });
    // Pull down the client and disconnect all peers. Peers must now listen for the following registry removal, and disconnect themselves both virtually and physically.
    yield config.down();
    // Remove the server from the registry as it will no longer
    supabase
        .from("server_registry")
        .delete()
        .match({
        id: process.env.SERVER
    }).then(e => {
        process.exit(0);
    });
});
/**
 * Verifies the install of reseda-server, by validating both the existence and value of the following:
 * - Environment-File: reseda-server requires `SERVER`, `TZ`, `COUNTRY`, and `VIRTUAL` tags under a .env stored in the servers root directory, or passed into the container.
 * - Supabase: supabase-js is a required install for reseda-server and is installed automatically after running yarn.
 * - Wireguard: reseda works under the wireguard protocol and requires both the wireguard-tools node library, and a working new install of wireguard from https://wireguard.com
 * @returns A promised truthy boolean if valid, otherwise - exits with exit code `2`.
 */
const verifyIntegrity = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.SERVER || !process.env.TZ || !process.env.COUNTRY || !process.env.VIRTUAL) {
        console.error("[ERR MISSING ENV] Missing Environment Variables, Requires 'SERVER', 'TZ', 'COUNTRY', and 'VIRTUAL'. These should be stored in a .env file at the root of the project directory. ");
        process.exit(2);
    }
    else if (!supabase) {
        console.error("[ERR NO SUPABASE] Reseda VPN requires supabase in order to verify integrity and maintain tunnels, try running `yarn install` or `npm install` to install all package dependencies. ");
        process.exit(2);
    }
    else if (!wireguard_tools_1.checkWgIsInstalled()) {
        console.error("[ERR NO WIREGUARD] Reseda VPN Server Requires an installation of wireguard to operate, the latest version can be installed from www.wireguard.com ");
        process.exit(2);
    }
    return true;
});
server();
