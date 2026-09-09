/**
 * Static server for the PERMISSA operator console (Cloud Run).
 *
 * This file must exist at the repository root, must bind process.env.PORT on
 * 0.0.0.0, and must use only Node built-ins: the runtime image carries no
 * node_modules at all, so anything imported from a package would be missing.
 *
 * It serves the Vite output in dist/, plus one runtime endpoint:
 *
 *   GET /__/config.json
 *
 * That endpoint returns the console's public client configuration (the API
 * origin and the Firebase web config). Those values are public by
 * construction, but they are served at runtime rather than baked into the
 * bundle because Dockerfile.console fails the build if any AIza-prefixed key
 * appears in dist/ -- the guard that stops a Gemini API key reaching a public
 * URL, since Gemini keys share that prefix. Serving the config here keeps that
 * guard intact and lets the API origin or Firebase app change without a
 * rebuild.
 *
 * No secrets are read, and no clearance logic runs here.
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

// Allowlist, not a passthrough. Echoing the whole environment value would turn
// a deployment mistake into a public credential leak; only these fields can
// ever leave this process.
const PUBLIC_FIREBASE_FIELDS = [
	"apiKey",
	"authDomain",
	"projectId",
	"appId",
	"messagingSenderId",
]

const REQUIRED_FIREBASE_FIELDS = [
	"apiKey",
	"authDomain",
	"projectId",
	"appId",
]

/**
 * Build the public runtime configuration once, at startup.
 */
function buildRuntimeConfig() {
	const apiBaseUrl = (process.env.PERMISSA_API_BASE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	const raw = (process.env.PERMISSA_FIREBASE_WEB_CONFIG ?? "").trim()

	if (!raw) {
		return {
			apiBaseUrl,
			firebase: null,
			configError:
				"PERMISSA_FIREBASE_WEB_CONFIG is not set on this service, so sign-in is disabled.",
		}
	}

	// Refuse rather than serve. If a service account key is ever pasted into
	// this variable by mistake, it must not reach a browser.
	if (/BEGIN [A-Z ]*PRIVATE KEY/.test(raw)) {
		console.error(
			"PERMISSA_FIREBASE_WEB_CONFIG contains private key material. Refusing to serve it.",
		)
		return {
			apiBaseUrl,
			firebase: null,
			configError: "The console configuration is invalid and was not served.",
		}
	}

	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		console.error("PERMISSA_FIREBASE_WEB_CONFIG is not valid JSON.")
		return {
			apiBaseUrl,
			firebase: null,
			configError: "PERMISSA_FIREBASE_WEB_CONFIG is not valid JSON.",
		}
	}

	if (!parsed || typeof parsed !== "object") {
		return {
			apiBaseUrl,
			firebase: null,
			configError: "PERMISSA_FIREBASE_WEB_CONFIG is not a JSON object.",
		}
	}

	const firebase = {}
	for (const field of PUBLIC_FIREBASE_FIELDS) {
		const value = parsed[field]
		if (typeof value === "string" && value.trim()) {
			firebase[field] = value.trim()
		}
	}

	const missing = REQUIRED_FIREBASE_FIELDS.filter((field) => !firebase[field])
	if (missing.length > 0) {
		console.error(
			"PERMISSA_FIREBASE_WEB_CONFIG is missing: " + missing.join(", "),
		)
		return {
			apiBaseUrl,
			firebase: null,
			configError:
				"PERMISSA_FIREBASE_WEB_CONFIG is missing: " + missing.join(", "),
		}
	}

	return { apiBaseUrl, firebase, configError: null }
}

const RUNTIME_CONFIG = buildRuntimeConfig()
const RUNTIME_CONFIG_BODY = JSON.stringify(RUNTIME_CONFIG)

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
		const pathOnly = urlPath.split("?")[0].split("#")[0]

		// Liveness endpoint for this static shell. It says nothing about the API.
		if (pathOnly === "/_healthz") {
			sendPlain(res, 200, "ok")
			return
		}

		// Public client configuration. Never cached: rotating the Firebase app or
		// moving the API origin must take effect on the next page load.
		if (pathOnly === "/__/config.json") {
			res.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"content-length": String(Buffer.byteLength(RUNTIME_CONFIG_BODY)),
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
			})
			res.end(req.method === "HEAD" ? undefined : RUNTIME_CONFIG_BODY)
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
	console.log(
		RUNTIME_CONFIG.firebase
			? "Sign-in enabled for Firebase project " +
					RUNTIME_CONFIG.firebase.projectId
			: "Sign-in DISABLED: " + RUNTIME_CONFIG.configError,
	)
})

for (const signal of ["SIGTERM", "SIGINT"]) {
	process.on(signal, () => {
		server.close(() => process.exit(0))
	})
}
