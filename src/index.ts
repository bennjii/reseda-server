require('dotenv').config()

import displayTitle from './title'
import ip from 'ip';

import register_server from './api/register_server'

import { quitQuietly, updateTransferInfo, verifyIntegrity } from './helpers';
import start_websocket_server from './api/server';
import { config } from './config';

const envIP = process.env.IP;
if(!process.env.KEY) void(0);

const server = async () => {
	await verifyIntegrity();
	const IP = await envIP ?? ip.address()	

	await config.getConfig().down();

	displayTitle();

	console.log(`[DATA]\t> Registering ${process.env.SERVER} (@ ${IP})`);

	await register_server(IP, true).then(e => console.log(e.reason));

    await config.getConfig().generateKeys();
	await config.getConfig().writeToFile();

	await config.getConfig().up();

	// Instantiate SocketIO Server
	start_websocket_server();

	// This should never execute by code, rather as a result of the following handlers - handles normal exit protocols.
	process.on("exit", () => { console.log(`Process has exited normally.`) });

	// Handle CTRL + C forced quits.
	process.on("SIGINT", () => { quitQuietly("forced", config.getConfig()) });

	// Handle error quits.
	process.on("uncaughtException", () => { quitQuietly("err", config.getConfig()) });

	// Update all transfer information every 10s.
	setInterval(() => {
		updateTransferInfo();
	}, 10000);

	return config.getConfig();
}

console.log("\n\n\n\nBooting...");
server();
