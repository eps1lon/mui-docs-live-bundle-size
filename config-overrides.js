module.exports = function override(config, env) {
	config.module.rules.push({
		test: /\.worker\.js$/,
		use: { loader: require.resolve("worker-loader") }
	});

	// fix "Uncaught ReferenceError: window is not defined"
	config.output.globalObject = "globalThis";

	return config;
};
