/**
 * Static server for the PERMISSA operator console (AI Studio / Cloud Run).
 *
 * The AI Studio applet container starts with:
 *   /bin/sh -c "if [ -f server.js ]; then node server.js; else npm start; fi"
 *
 * This file therefore has to exist at the repository root, must bind
 * process.env.PORT on 0.0.0.0, and must use only Node built-ins: the Google
 * Node.js buildpack prunes devDependencies after `npm run build`, so anything
 * imported from node_modules here would be missing at runtime.
 *
 * It serves the Vite output in dist/ and nothing else. No secrets are read,
 * and no clearance logic runs here.
 */
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

const DIST_DIR = resolve(import.meta.dirname, "dist")
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10)
const HOST = "0.0.0.0"

const CONTENT_TYPES = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".webp", "image/webp"],
	[".gif", "image/gif"],
	[".ico", "image/x-icon"],
	[".woff", "font/woff"],
	[".woff2", "font/woff2"],
	[".ttf", "font/ttf"],
	[".map", "application/json; charset=utf-8"],
	[".txt", "text/plain; charset=utf-8"],
	[".webmanifest", "application/manifest+json"],
])

/**
 * Resolve a request path to a file inside DIST_DIR, or null if it escapes.
 */
function resolveWithinDist(urlPath) {
	const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0])
	const candidate = resolve(join(DIST_DIR, normalize(decoded)))
	if (candidate !== DIST_DIR && !candidate.startsWith(DIST_DIR + "/")) {
		return null
	}
	return candidate
}

async function statFile(path) {
	try {
		const info = await stat(path)
		return info.isFile() ? info : null
	} catch {
		return null
	}
}

function sendPlain(res, status, body) {
	res.writeHead(status, {
		"content-type": "text/plain; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
	})
	res.end(body)
}

function sendFile(req, res, path, info) {
	const ext = extname(path).toLowerCase()
	const isHtml = ext === ".html"
	res.writeHead(200, {
		"content-type": CONTENT_TYPES.get(ext) ?? "application/octet-stream",
		"content-length": String(info.size),
		// Vite fingerprints assets under /assets, so those are safe to cache hard.
		// index.html must never be cached or clients pin a stale bundle.
		"cache-control": isHtml
			? "no-cache"
			: "public, max-age=31536000, immutable",
		"x-content-type-options": "nosniff",
		"referrer-policy": "strict-origin-when-cross-origin",
	})
	if (req.method === "HEAD") {
		res.end()
		return
	}
	const stream = createReadStream(path)
	stream.on("error", () => {
		res.destroy()
	})
	stream.pipe(res)
}

const server = createServer((req, res) => {
	void (async () => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405, { allow: "GET, HEAD" })
			res.end()
			return
		}

		const urlPath = req.url ?? "/"

		// Liveness endpoint for this static shell. It says nothing about the API.
		if (urlPath === "/_healthz") {
			sendPlain(res, 200, "ok")
			return
		}

		const indexPath = join(DIST_DIR, "index.html")
		const indexInfo = await statFile(indexPath)
		if (!indexInfo) {
			// Answer rather than crash: the startup probe is a TCP check, so an
			// exit here would look like an opaque deploy failure instead of a
			// missing build.
			sendPlain(
				res,
				503,
				"PERMISSA console build is missing. Expected dist/index.html.\n" +
					"Run `npm run build` before starting this server.\n",
			)
			return
		}

		const target = resolveWithinDist(urlPath)
		if (!target) {
			sendPlain(res, 400, "Bad request")
			return
		}

		const direct = await statFile(target)
		if (direct) {
			sendFile(req, res, target, direct)
			return
		}

		// Never fall back to index.html for asset requests; a 404 is honest and
		// stops the browser parsing HTML as JavaScript.
		if (extname(target) !== "") {
			sendPlain(res, 404, "Not found")
			return
		}

		sendFile(req, res, indexPath, indexInfo)
	})().catch(() => {
		if (!res.headersSent) {
			sendPlain(res, 500, "Internal server error")
			return
		}
		res.destroy()
	})
})

server.listen(PORT, HOST, () => {
	console.log("PERMISSA console listening on " + HOST + ":" + PORT)
	console.log("Serving " + DIST_DIR)
})

for (const signal of ["SIGTERM", "SIGINT"]) {
	process.on(signal, () => {
		server.close(() => process.exit(0))
	})
}
