import { randomUUID } from "crypto";
import { WgConfig } from "wireguard-tools";
import { Connection } from "../../@types/reseda";
import supabase from "../../client";
import { connections } from "../../space_allocator";
import log_usage from "../log_usage";

const createOnDeleteListener = (config: WgConfig) => {
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

			await log_usage({
				id: randomUUID(),
				userId: data.author,
				up: client?.up?.toString()! ?? "", 
				down: client?.down?.toString()! ?? "",
				serverId: process.env.SERVER! ?? "",
				connStart: client?.start_time ? new Date(client?.start_time) : new Date(Date.now())
			}).then(e => console.log(e.reason))

			if(data.client_pub_key) {
				await config.down();
				await config.removePeer(data.client_pub_key); 
				await config.save({ noUp: true });
				await config.up();
			}

			connections.remove(data.client_number);
		}).subscribe();
}

export default createOnDeleteListener;