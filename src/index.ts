require('dotenv').config()

import { createClient } from '@supabase/supabase-js'
import { checkWgIsInstalled, WgConfig, writeConfig } from 'wireguard-tools'
import path from 'path'
import ip from "ip"

if(!process.env.KEY) void(0);

const supabase = createClient("https://xsmomhokxpwacbhotdmk.supabase.co", process.env.KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDU4MTE3MiwiZXhwIjoxOTU2MTU3MTcyfQ.nGtdGflJcGTdegPJwg3FkSQJvKz_VGNzmmml2hj6rQg") 
const filePath = path.join(__dirname, '/configs', './reseda.conf');

type Connection = {
	id: number,
	author: string,
	server: string,
	client_pub_key: string,
	svr_pub_key: string,
	client_number: number,
	awaiting: boolean,
	server_endpoint: string
}

class SpaceAllocator {
	space: Map<number, Connection>;

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

	fill(index: number, data: Connection) {
		this.space.set(index, data);
	}

	totalUsers() {
		return this.space.size;
	}

	at(index: number) {
		return this.space.get(index);
	}
}

const connections = new SpaceAllocator();

const server = async () => {
	await verifyIntegrity();

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

	console.log(`
	 
	 ██████╗ ███████╗███████╗███████╗██████╗  █████╗ ██╗   ██╗██████╗ ███╗   ██╗
	 ██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗██╔══██╗██║   ██║██╔══██╗████╗  ██║
	 ██████╔╝█████╗  ███████╗█████╗  ██║  ██║███████║██║   ██║██████╔╝██╔██╗ ██║
	 ██╔══██╗██╔══╝  ╚════██║██╔══╝  ██║  ██║██╔══██║╚██╗ ██╔╝██╔═══╝ ██║╚██╗██║
	 ██║  ██║███████╗███████║███████╗██████╔╝██║  ██║ ╚████╔╝ ██║     ██║ ╚████║
	 ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝     ╚═╝  ╚═══╝  ▄▀▀ ██▀ █▀▄ █ █ ██▀ █▀▄
	 ___________________________________________________________________________  ▄██ █▄▄ █▀▄ ▀▄▀ █▄▄ █▀▄
	`)

	console.log(`[DATA]\t> Registering ${process.env.SERVER} (@ ${ip.address()})`);

	svr_config.peers?.forEach(e => {
		console.log("IP", e.allowedIps);
		// connections.fill()
	})

	// Register Server
	await supabase
		.from('server_registry')
		.insert({
			id: process.env.SERVER,
			location: process.env.TZ,
			country: process.env.COUNTRY,
			virtual: process.env.VIRTUAL,
			hostname: ip.address()
		});

    await svr_config.generateKeys(); //{ preSharedKey: true }
	await svr_config.writeToFile();

	await svr_config.up();

	supabase
		.from('open_connections')
		.on('DELETE', (payload) => {
			const data: Connection = payload.old;
			// How do we update connections, as the left user may not be the last user,
			// Hence - we may need to include a map of available spots and propagate top to bottom (FCFS)

			if(data.client_pub_key) svr_config.removePeer(data.client_pub_key);
			console.log("REMOVING::", data, payload);
		}).subscribe();

	supabase
		.from('open_connections')
		.on('INSERT', (payload) => {
			const data: Partial<Connection> = payload.new;
			if(data.server !== process.env.SERVER) return;
			
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
					server_endpoint: ip.address()
				});

			console.log("[CONN]\t> Publishing to SUPABASE", connections.at(user_position));
			supabase
				.from("open_connections")
				.update({
					client_number: user_position,
					awaiting: false,
					svr_pub_key: svr_config.publicKey,
					server_endpoint: ip.address()
				}).match({ id: data.id })
				.then(async e => {
					console.log(e);
					await svr_config.save({ noUp: true });
				});
		
		}).subscribe();

	process.on("SIGINT", () => quitQuietly("s"));
	process.on("exit", () => quitQuietly("e"));
	process.on("uncaughtException", () => quitQuietly("s"));
}

const quitQuietly = (type: string) => {
	console.log(`Process Quitting > Sending Finalized`);

	supabase
		.from("server_registry")
		.delete()
		.match({
			id: process.env.SERVER
		}).then(e => {
			console.log(`Process Quit.`);
			if(type == "s") process.exit(2);
			else return;
		})
}

const verifyIntegrity = async () => {
	if(!process.env.SERVER || !process.env.TZ || !process.env.COUNTRY || !process.env.VIRTUAL) {
		console.error("[ERR MISSING ENV] Missing Environment Variables, Requires 'SERVER', 'TZ', 'COUNTRY', and 'VIRTUAL'. These should be stored in a .env file at the root of the project directory. ");
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

server();