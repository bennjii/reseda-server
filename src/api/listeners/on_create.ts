import { WgConfig } from "wireguard-tools";
import { Connection, ResedaUser } from "../../@types/reseda";
import supabase from "../../client";
import { connections } from "../../space_allocator";

const createOnCreateListener = (config: WgConfig, IP: string) => {
    supabase
		.from('open_connections')
		.on('INSERT', (payload) => {
			const data: Partial<Connection> = payload.new;
			if(data.server !== process.env.SERVER) return;
			if(data.client_pub_key && connections.withKey(data.client_pub_key)) return;
			
			const user_position = connections.lowestAvailablePosition();

			console.log(`[CONN]\t> Adding Peer`);
			config
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
					svr_pub_key: config.publicKey ?? "",
					client_number: user_position,
					awaiting: false,
					server_endpoint: IP,
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
					svr_pub_key: config.publicKey,
					server_endpoint: IP
				}).match({ id: data.id })
				.then(async e => {
					await config.down().catch(e => console.error(e)).then(e => console.log(e));
					await config.save({ noUp: true });
					await config.up().catch(e => console.error(e)).then(e => console.log(e));
				});
		}).subscribe();
}

export default createOnCreateListener;