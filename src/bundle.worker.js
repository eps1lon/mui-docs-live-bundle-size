import * as rollup from "rollup/dist/rollup.browser";
import virtual from "@rollup/plugin-virtual";
import { minify } from "terser";
import urlResolve from "url-resolve-browser";

/* eslint-disable no-restricted-globals */
self.onmessage = function handleMessage(message) {
	const { data: action } = message;

	switch (action.type) {
		case "bundle":
			self.postMessage("ack bundle");
			handleBundle(action.source, { terserOptions: action.terserOptions });
			break;
		case "abort":
			self.postMessage("ack abort");
			handleAbort(action.source);
			break;
		default:
			throw new TypeError(`unrecognized type '${action.type}'`);
	}
};

async function handleBundle(input, options) {
	let bundle;
	try {
		bundle = await rollup.rollup({
			external: [
				// mainly modules that can't be loaded since they're in commonJS
				"hoist-non-react-statics",
				"prop-types",
				"react",
				"react-dom",
				"react-is",
				"scheduler"
			],
			input: "source",
			plugins: [
				virtual({ source: input }),
				// load imports from unpkg
				{
					async resolveId(source, importer) {
						if (source.startsWith(".")) {
							// these might be urls that redirect to the actual files
							// e.g. https://unpkg.com/@material-ui/core@4.9.7/esm/AppBar
							// will not be the actual file location so resolve has the wrong source
							if (importer.startsWith("https://")) {
								const response = await cachedFetch(importer);
								return urlResolve(response.url, source);
							}
							// is this reachable?
							console.warn(
								`not sure if we should urlResolve(${importer}, ${source})`
							);
							return urlResolve(importer, source);
						} else {
							const packageUrl = `https://unpkg.com/${source}`;
							const manifestResponse = await cachedFetch(
								`${packageUrl}/package.json`
							);

							if (!manifestResponse.ok) {
								return packageUrl;
							}

							const manifest = await manifestResponse.json();
							const { module } = manifest;
							if (module === undefined) {
								throw new Error(
									`Can only bundle ESModules but ${source} appears to be in commonJS.`
								);
							}
							return urlResolve(`${packageUrl}/`, module);
						}
					},
					async load(id) {
						if (id.startsWith("https://")) {
							const url = id;

							const response = await cachedFetch(url);
							const source = await response.text();
							return source;
						}
						return null;
					}
				}
			],
			inlineDynamicImports: true
		});

		self.postMessage({ type: "status", message: "created bundle" });
	} catch (error) {
		console.error(error);
		// assume invalid syntax while typing
		self.postMessage({ type: "error" });
		return;
	}

	const { output } = await bundle.generate({
		format: "esm",
		plugins: [
			// rollup-plugin-terser requires cjs
			{
				name: "terser-browser",
				renderChunk(code, chunk, outputOptions) {
					// importing from rollup/dist prefixes the generated code
					// with `undefined` for some reason
					return minify(code.replace(/^undefined(.+)/, "$1"), {
						ecma: 6,
						...options.terserOptions
					});
				}
			}
		]
	});

	self.postMessage({ type: "bundled", input, output });
}

async function handleAbort(source) {
	/* self.postMessage(
		"abort not implemented. will keep on bundling. expect race conditions"
	); */
}

const privateFetchCache = new Map();
/**
 *
 * @returns {ReturnType<typeof fetch>}
 */
function cachedFetch(url, ...args) {
	// no strategy for caching based on args
	if (args.length > 0) {
		return fetch(url, ...args);
	}

	if (!privateFetchCache.has(url)) {
		privateFetchCache.set(url, fetch(url));
	}
	return privateFetchCache.get(url).then(response => {
		// since we call .json() or .body() on the same response multiple times
		// everyone that has a ref to this response needs a clone
		// https://stackoverflow.com/a/54115314/3406963
		return response.clone();
	});
}
