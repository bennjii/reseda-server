require('dotenv').config()

import { createClient } from '@supabase/supabase-js'
import { checkWgIsInstalled, WgConfig, writeConfig } from 'wireguard-tools'
import path from 'path'
import displayTitle from './title'
import ip from 'ip';
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { Connection, ResedaUser } from './@types/reseda'
import fetch from "node-fetch"

const envIP = process.env.IP;
if(!process.env.KEY) void(0);

const supabase = createClient("https://xsmomhokxpwacbhotdmk.supabase.co", process.env.KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDU4MTE3MiwiZXhwIjoxOTU2MTU3MTcyfQ.nGtdGflJcGTdegPJwg3FkSQJvKz_VGNzmmml2hj6rQg") 
const filePath = path.join(__dirname, '/configs', './reseda.conf');

class SpaceAllocator {
	space: Map<number, Partial<Connection>>;

	constructor() {
		this.space = new Map<number, Connection>();
	}

	lowestAvailablePosition(smallest_key: number = 2) {
		let lowest_free_space = smallest_key;

		this.space.forEach((__, key: number) => {
			if(key == lowest_free_space) lowest_free_space = key+1; 
		});
	  
		return lowest_free_space;
	}

	setMaximum(index: number, up: number, down: number) {
		const loc = this.at(index);

		if(loc) {
			loc.max_up = up; loc.max_down = down;
			return true;
		}

		else return false
	}

	fill(index: number, data: Partial<Connection>) {
		this.space.set(index, data);
	}

	totalUsers() {
		return this.space.size;
	}

	at(index: number) {
		return this.space.get(index);
	}

	withKey(key: string) {
		let exists = false;

		this.space.forEach(e => { if(e.client_pub_key == key) exists = true });
		return exists;
  	}

	remove(index: number) {
		return this.space.delete(index);
	}

	fromId(public_key: string): Partial<Connection> {
		let client;

		this.space.forEach(e => {
			if(e.client_pub_key == public_key) client = e;
		});

		return client ?? {};
	}
}

const connections = new SpaceAllocator();
const server = async () => {
	await verifyIntegrity();
	const ip_a = await envIP ?? ip.address()

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

	console.log(`[DATA]\t> Registering ${process.env.SERVER} (@ ${ip_a})`);

	svr_config.peers?.forEach(e => {
		console.log("IP", e.allowedIps);
		// connections.fill()
	});

	// Register Server
	await supabase
		.from('server_registry')
		.insert({
			id: process.env.SERVER,
			location: process.env.TZ,
			country: process.env.COUNTRY,
			virtual: process.env.VIRTUAL,
			flag: process.env.FLAG,
			hostname: ip_a,
		});

	// Duplicate Publish to Reseda PlanetScale Server as Well - for cross-compatibility
	await fetch("https://reseda.app/api/server/register", {
		method: "POST",
		body: JSON.stringify({
			id: process.env.SERVER,
			location: process.env.TZ,
			country: process.env.COUNTRY,
			virtual: process.env.VIRTUAL,
			flag: process.env.FLAG,
			hostname: ip_a,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});

    await svr_config.generateKeys(); //{ preSharedKey: true }
	await svr_config.writeToFile();

	await svr_config.up();

	supabase
		.from('open_connections')
		.on('DELETE', async (payload) => {
			const data: Connection = payload.old;
			// How do we update connections, as the left user may not be the last user,
			// Hence - we may need to include a map of available spots and propagate top to bottom (FCFS)

			const client = connections.at(data.client_number);
			if(!client) return; 

			await supabase
				.from('data_usage')
				.insert({
					id: randomUUID(),
					author: data.author,
					up: client?.up, 
					down: client?.down,
					server: process.env.SERVER,
					conn_start: client?.start_time ? new Date(client?.start_time) : new Date(Date.now())
				}).then(e => e.error ?? console.log(e.error));	

			if(data.client_pub_key) {
				await svr_config.down();
				await svr_config.removePeer(data.client_pub_key); 
				await svr_config.save({ noUp: true });
				await svr_config.up();
			}

			connections.remove(data.client_number);
		}).subscribe();

	supabase
		.from('open_connections')
		.on('INSERT', (payload) => {
			const data: Partial<Connection> = payload.new;
			if(data.server !== process.env.SERVER) return;
			if(data.client_pub_key && connections.withKey(data.client_pub_key)) return;
			
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
					id: data.id ?? 0,
					author: data.author ?? "",
					server: data.server ?? process.env.SERVER ?? "error-0",
					client_pub_key: data.client_pub_key ?? "",
					svr_pub_key: svr_config.publicKey ?? "",
					client_number: user_position,
					awaiting: false,
					server_endpoint: ip_a,
					start_time: new Date().getTime()
				});
			
			supabase.from('users').select("*").match({
				id: data.author
			}).then(async e => {
				const data: ResedaUser = e.body?.[0];
				if(!data) return;

				// Query current 'monthy'-design'd month - usage statistics - determine current remaining usage, for active disconnect ability 
				// (will not execute under pre-release - unlimited data cap leniency).
				// use maximum and known theoretical from ResedaUser to derive the current usage remaining under the [FREE-TIER].
				// If the user is a paid user, they do not conform to this, and their usage is monitored for payment use only, 
				// but their maximum becomes 150GB as a reference usage, but is not acted upon - only for statistical analysis (deviation as such).
				
				/**
				 * curl -X POST 'https://xsmomhokxpwacbhotdmk.supabase.co/rest/v1/rpc/get_monthy_usage' \
				   -d '{ "user_id": "b78e7286-c7ad-4b7d-b427-28f541894fbd" }' \
				   -H "Content-Type: application/json" \
				   -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwNTgxMTcyLCJleHAiOjE5NTYxNTcxNzJ9.mJh_6JQJe5lLsE8zv1seOnSMXNtJL4kfV-exQLEi4bM" \
				   -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwNTgxMTcyLCJleHAiOjE5NTYxNTcxNzJ9.mJh_6JQJe5lLsE8zv1seOnSMXNtJL4kfV-exQLEi4bM"
				 */

				if(data.tier == "FREE") {
					let { data: usage, error } = await supabase
						.rpc('get_monthy_usage', {
							user_id: data.id
						})
				
					if(usage) {
						const used_in: number = usage.map(item => item.up).reduce((prev, curr) => prev + curr, 0);
						const used_out: number = usage.map(item => item.down).reduce((prev, curr) => prev + curr, 0);

						connections.setMaximum(user_position, data.max_up - used_in, data.max_down - used_out)
					}
				}else {
					connections.setMaximum(user_position, data.max_up, data.max_down)

				}
			});
			
			console.log("[CONN]\t> Publishing to SUPABASE");
			supabase
				.from("open_connections")
				.update({
					client_number: user_position,
					awaiting: false,
					svr_pub_key: svr_config.publicKey,
					server_endpoint: ip_a
				}).match({ id: data.id })
				.then(async e => {
					await svr_config.down().catch(e => console.error(e)).then(e => console.log(e));
					await svr_config.save({ noUp: true });
					await svr_config.up().catch(e => console.error(e)).then(e => console.log(e));
				});
		}).subscribe();

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

/** 
 * Exits the program whilst ensuring a proper disconnect of the reseda-server from the mesh.
 * 
 * @returns async void
 */
const quitQuietly = async (type: "forced" | "err", config: WgConfig) => {
	console.log(`Process Quitting > Sending Finalized`);

	// Remove all Wireguard Peers from the connection, as disconnect handlers will no longer respond 
	// such that users may be stuck between connections as by the server with open-ended propagations and protocols. 
	config.peers?.forEach(peer => {
		if(peer?.publicKey) config.removePeer(peer.publicKey);
	});

	// Pull down the client and disconnect all peers. Peers must now listen for the following registry removal, and disconnect themselves both virtually and physically.
	await config.down();

	// Remove the server from the registry as it will no longer
	supabase
		.from("server_registry")
		.delete()
		.match({
			id: process.env.SERVER
		}).then(e => {
			process.exit(0);
		})
}

/**
 * Verifies the install of reseda-server, by validating both the existence and value of the following:
 * - Environment-File: reseda-server requires `SERVER`, `TZ`, `COUNTRY`, and `VIRTUAL` tags under a .env stored in the servers root directory, or passed into the container.
 * - Supabase: supabase-js is a required install for reseda-server and is installed automatically after running yarn.
 * - Wireguard: reseda works under the wireguard protocol and requires both the wireguard-tools node library, and a working new install of wireguard from https://wireguard.com
 * @returns async - A promised truthy boolean if valid, otherwise - exits with exit code `2`. 
 */
const verifyIntegrity = async () => {
	if(!process.env.SERVER || !process.env.TZ || !process.env.COUNTRY || !process.env.VIRTUAL || !process.env.KEY || !process.env.FLAG || !process.env.THROTTLED) {
		console.error("[ERR MISSING ENV] Missing Environment Variables, Requires 'SERVER', 'TZ', 'COUNTRY', 'VIRTUAL', 'KEY', 'THROTTLED' and 'FLAG'. These should be stored in a .env file at the root of the project directory. ");
		process.exit(2);
	}else if(!supabase) {
		console.error("[ERR NO SUPABASE] Reseda VPN requires supabase in order to verify integrity and maintain tunnels, try running `yarn install` or `npm install` to install all package dependencies. ");
		process.exit(2);
	}else if(!checkWgIsInstalled()) {
		console.error("[ERR NO WIREGUARD] Reseda VPN Server Requires an installation of wireguard to operate, the latest version can be installed from www.wireguard.com ");
		process.exit(2);
	}

	return true;
}

/**
 * From all current connections, service will set the local allocation transfers for each user.
 * When disconnecting, or committing a usage report - the usage will be pulled from the last update.
 * @returns void
 */
const updateTransferInfo = () => {
	const log = execSync("wg show reseda transfer")
	const transfers = log.toString().split("\n").filter(e => e !== '');

	transfers.forEach(transfer => {
		const [ public_key, up, down ] = transfer.split("\t");
		if(!public_key || !up || !down) return; 


		const client_num = connections.fromId(public_key).client_number;

		if(client_num) {
			const client = connections.at(client_num);

			if(client) {
				client.up = parseInt(up);
				client.down = parseInt(down);

				console.log(`${public_key} :: UP: ${client.up} / ${client.max_up} (${client.up / (client?.max_up ?? 1)}%)  DOWN: ${client.down} / ${client.max_down}  (${client.down / (client?.max_down ?? 1)}%)`);
			}
		}
	})
}

server();