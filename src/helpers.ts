import { execSync } from 'child_process'
import { checkWgIsInstalled, WgConfig } from 'wireguard-tools';
import { connections } from './space_allocator';

/** 
 * Exits the program whilst ensuring a proper disconnect of the reseda-server from the mesh.
 * 
 * @returns async void
 */
export const quitQuietly = async (type: "forced" | "err", config: WgConfig) => {
	console.log(`Process Quitting > Sending Finalized`);

	// Remove all Wireguard Peers from the connection, as disconnect handlers will no longer respond 
	// such that users may be stuck between connections as by the server with open-ended propagations and protocols. 
	config.peers?.forEach(peer => {
		if(peer?.publicKey) config.removePeer(peer.publicKey);
	});

	// Pull down the client and disconnect all peers. Peers must now listen for the following registry removal, and disconnect themselves both virtually and physically.
	await config.down();

	// Remove the server from the registry as it will no longer
	// supabase
    //     .from("server_registry")
	// 	.delete()
	// 	.match({
	// 		id: process.env.SERVER
	// 	}).then(e => {
	// 		process.exit(0);
	// 	})
}

/**
 * Verifies the install of reseda-server, by validating both the existence and value of the following:
 * - Environment-File: reseda-server requires `SERVER`, `TZ`, `COUNTRY`, and `VIRTUAL` tags under a .env stored in the servers root directory, or passed into the container.
 * - Supabase: supabase-js is a required install for reseda-server and is installed automatically after running yarn.
 * - Wireguard: reseda works under the wireguard protocol and requires both the wireguard-tools node library, and a working new install of wireguard from https://wireguard.com
 * @returns async - A promised truthy boolean if valid, otherwise - exits with exit code `2`. 
 */
export const verifyIntegrity = async () => {
	if(!process.env.SERVER || !process.env.TZ || !process.env.COUNTRY || !process.env.VIRTUAL || !process.env.KEY || !process.env.FLAG || !process.env.THROTTLED) {
		console.error("[ERR MISSING ENV] Missing Environment Variables, Requires 'SERVER', 'TZ', 'COUNTRY', 'VIRTUAL', 'KEY', 'THROTTLED' and 'FLAG'. These should be stored in a .env file at the root of the project directory. ");
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
export const updateTransferInfo = () => {
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

				if(client?.max_up && (client?.max_up > client.up)) {
					console.log(`EXCEEDED UP LIMIT.`)
				}
				
				if(client?.max_down && (client?.max_down > client.down)) {
					console.log(`EXCEEDED DOWN LIMIT.`)
				}

				console.log(`${public_key} :: UP: ${client.up} / ${client.max_up} (${client.up / (client?.max_up ?? 1)}%)  DOWN: ${client.down} / ${client.max_down}  (${client.down / (client?.max_down ?? 1)}%)`);
			}
		}
	})
}