export type Connection = {
	id: number,
	author: string,
	server: string,
	client_pub_key: string,
	svr_pub_key: string,
	client_number: number,
	awaiting: boolean,
	server_endpoint: string,
	up: number, down: number,
	max_up: number, max_down: number,
	start_time: number
}

export type ResedaUser = {
	id: string,
	create_at: string,
	username: string,
	lcs: string,
	max_up: number,
	max_down: number
}