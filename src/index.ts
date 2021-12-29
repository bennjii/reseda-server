require('dotenv').config()

import { createClient } from '@supabase/supabase-js'
import { WgConfig, writeConfig } from 'wireguard-tools'
import path from 'path'
import ip from "ip"

if(!process.env.KEY) void(0);

const supabase = createClient("https://xsmomhokxpwacbhotdmk.supabase.co", process.env.KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDU4MTE3MiwiZXhwIjoxOTU2MTU3MTcyfQ.nGtdGflJcGTdegPJwg3FkSQJvKz_VGNzmmml2hj6rQg") 
const filePath = path.join(__dirname, '/configs', './reseda.conf');

var connections = 0;

type Packet = {
	id: number,
	author: string,
	server: string,
	client_pub_key: string,
	svr_pub_key: string,
	client_number: number,
	awaiting: boolean,
	server_endpoint: string
}

const server = async () => {
	const svr_config = new WgConfig({
		wgInterface: {
			address: ['192.126.69.1/24'],
			name: process.env.SERVER ?? "default-1",
			postUp: ['iptables -A FORWARD -i reseda -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE'],
			postDown: ['iptables -D FORWARD -i reseda -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE'],
			listenPort: 51820,
		},
		filePath
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

	console.log(`Registering ${process.env.SERVER} (@ ${ip.address()}`);

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
		.on('*', (payload) => {
			const data: Packet = payload.new;
			console.log(`Connecting [${data.author}] \t no. (${data.client_number})`);

			if(
				data.server == process.env.SERVER 
				&& data.awaiting 
				&& (payload.eventType == "INSERT" || payload.eventType == "UPDATE")
			) {
				connections++;

				svr_config.addPeer({
					publicKey: data.client_pub_key,
					allowedIps: [`192.168.69.${connections+1 ?? '2'}`],
					persistentKeepalive: 25
				});

				supabase.from("open_connections").update({
					client_number: connections,
					awaiting: false,
					svr_pub_key: svr_config.publicKey,
					server_endpoint: ip.address()
				}).match({ id: data.id }).then(async e => {
					await svr_config.save();
				});
			}else if(
				data.server == process.env.SERVER 
				&& payload.eventType == "DELETE"
			) {
				if(data.client_pub_key) svr_config.removePeer(data.client_pub_key);
			}else {
				console.log(data, payload.old);
			}
		
		}).subscribe();
}

server();