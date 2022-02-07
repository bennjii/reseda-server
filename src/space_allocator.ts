import { Connection, ResedaUser } from './@types/reseda'

export default class SpaceAllocator {
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

export const connections = new SpaceAllocator();