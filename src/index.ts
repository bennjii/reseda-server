require('dotenv').config()

import { WgConfig, writeConfig } from 'wireguard-tools'
import path from 'path'
import displayTitle from './title'
import ip from 'ip';

import register_server from './api/register_server'

import { quitQuietly, updateTransferInfo, verifyIntegrity } from './helpers';
import start_websocket_server from './api/ws_server/server';

const envIP = process.env.IP;
if(!process.env.KEY) void(0);

const filePath = path.join(__dirname, '/configs', './reseda.conf');

const server = async () => {
	await verifyIntegrity();
	const IP = await envIP ?? ip.address()

	const svr_config = new WgConfig({
		wgInterface: {
			address: ['192.168.69.1/24'],
			name: process.env.SERVER ?? "default-1",
			postUp: ['iptables -A FORWARD -i reseda -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE'],
			postDown: ['iptables -D FORWARD -i reseda -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE'],
			listenPort: 51820,
		},
		filePath,
	});

	writeConfig({ 
		filePath, 
		config: svr_config
	});

	await svr_config.down();

	displayTitle();

	console.log(`[DATA]\t> Registering ${process.env.SERVER} (@ ${IP})`);

	await register_server(IP, true).then(e => console.log(e.reason));

    await svr_config.generateKeys();
	await svr_config.writeToFile();

	await svr_config.up();

	// Instantiate SocketIO Server
	start_websocket_server(IP, svr_config);

	// This should never execute by code, rather as a result of the following handlers - handles normal exit protocols.
	process.on("exit", () => { console.log(`Process has exited normally.`) });

	// Handle CTRL + C forced quits.
	process.on("SIGINT", () => { quitQuietly("forced", svr_config) });

	// Handle error quits.
	process.on("uncaughtException", () => { quitQuietly("err", svr_config) });

	// Update all transfer information every 10s.
	setInterval(() => {
		updateTransferInfo();
	}, 10000);
}

console.log("\n\n\n\nBooting...");
server();