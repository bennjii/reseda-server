import { WgConfig, writeConfig } from 'wireguard-tools'
import path from 'path'

const filePath = path.join(__dirname, '/configs', './reseda.conf');

class Configuration {
	config: WgConfig;

	constructor() {
		this.config = new WgConfig({
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
			config: this.config
		});
	}

	getConfig() {
		return this.config;
	}
} 

export const config = new Configuration();