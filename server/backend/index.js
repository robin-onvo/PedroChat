require("dotenv").config();

const fs = require("fs");
const http = require("http");
const https = require("https");

const express = require("express");
const cors = require("cors");
const path = require("path");

const MultiplayerServer = require("./MultiplayerServer.js");


class Server {
	certificate = null;
	privateKey = null;
	httpServer = null;
	httpsServer = null;

	constructor() {
		this.app = express();

		if (process.env.FORCE_HTTPS == "true") {
			this.app.use((req, res, next) => {
				// The 'x-forwarded-proto' check is for load balancers
				if (!req.secure && req.get("x-forwarded-proto") !== "https" && process.env.NODE_ENV !== "development") {
					return res.redirect("https://" + req.get("host") + req.url);
				}
				next();
			});
		}

		this.httpServer = http.createServer(this.app);

		this.httpServer.on('clientError', (err, socket) => {
			console.error('Client error:', err.message);

			if (socket.writable)
				socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');

			socket.destroy();
		});

		if (fs.existsSync(process.env.HTTPS_CERT + "/fullchain.pem") && fs.existsSync(process.env.HTTPS_CERT + "/privkey.pem")) {
			this.certificate = fs.readFileSync(process.env.HTTPS_CERT + "/fullchain.pem", "utf8");
			this.privateKey = fs.readFileSync(process.env.HTTPS_CERT + "/privkey.pem", "utf8");
		} else {
			console.log("HTTPS certs not found");
		}

		if (this.certificate && this.privateKey) this.httpsServer = https.createServer({ key: this.privateKey, cert: this.certificate }, this.app);

		this.httpServer.listen(process.env.HTTP_PORT, () => {
			console.log("HTTP server running on port " + process.env.HTTP_PORT);
		});

		if (this.httpsServer) {
			this.httpsServer.listen(process.env.HTTPS_PORT, () => {
				console.log("HTTPS server running on port " + process.env.HTTPS_PORT);
			});
		}

		let servers = [];

		if (this.httpServer)
			servers.push(this.httpServer);

		if (this.httpsServer)
			servers.push(this.httpsServer);

		this.multiplayer = new MultiplayerServer(servers, {
			tcpPort: 9001
		});


		this.app.use(cors());
		this.app.use(express.json({ limit: "500mb" }));

		this.app.use(express.static("frontend"));

		// This must be the last route
		this.app.use("*", (req, res) => {
			return res.status(404).json({
				message: "Page not found"
			});
		});
	}
}

const server = new Server();

module.exports = server;
