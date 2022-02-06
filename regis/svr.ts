import http from "http"

http.createServer((req, res) => {
	res.writeHead(200, {"Content-Type": "text/plain"});
    res.write("Hello Internet!");
	res.end();
}).listen(55251);

console.log("Alive!");