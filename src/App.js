import React from "react";
import prettyBytes from "pretty-bytes";
import styled from "styled-components";
import WebpackWorker from "./webpack.worker.js";

const worker = new WebpackWorker();

const Main = styled.main({
	padding: 16,
	paddingTop: 0
});

const Source = styled.textarea({
	display: "block",
	font: "monospace",
	width: "120ch",
	height: "70vh"
});

const AccessibleSummary = styled.summary({
	padding: 8
});

const Output = styled.output({
	display: "block"
});

function Code({ children }) {
	return (
		<pre>
			{String(children).replace(
				/\\n/g,
				`
`
			)}
		</pre>
	);
}

export default function App() {
	const [{ source, output, state }, dispatch] = React.useReducer(
		(current, action) => {
			const next = { ...current };
			switch (action.type) {
				case "sourceChange":
					next.source = action.payload;
					next.state = "dirty";
					break;
				case "submitted":
					next.state = "loading";
					break;
				case "bundled":
					const { input, output } = action.payload;
					if (input === next.source) {
						next.output = output;
						next.state = "done";
					}
					break;
				default:
					throw new TypeError(`unrecognized action '${action.type}'`);
			}

			return next;
		},
		{
			source:
				"import Button from '@material-ui/core/Button'; console.log(Button)",
			output: [],
			state: "initial"
		}
	);

	React.useEffect(() => {
		function handleMessage(event) {
			console.log(event.data);

			switch (event.data?.type) {
				case "bundled":
					dispatch({
						type: "bundled",
						payload: { input: event.data.input, output: event.data.output }
					});
					break;
				default:
					break;
			}
		}

		worker.addEventListener("message", handleMessage);
		return () => {
			worker.removeEventListener("message", handleMessage);
		};
	}, []);

	const [terserOptions, setTerserOptions] = React.useState({ mangle: true });

	const handleSubmit = React.useCallback(
		event => {
			event.preventDefault();
			dispatch({ type: "submitted" });
			worker.postMessage({ type: "bundle", source, terserOptions });
			// needs abortable rollup
			// React.useEffect
			/* return () => {
				worker.postMessage({ type: "abort", source });
			}; */
		},
		[source, terserOptions]
	);

	let bundlesize = output.reduce((size, chunk) => size + chunk.code.length, 0);

	return (
		<Main>
			<h1>meassure bundle size in browser</h1>
			<p>Only supports ES6 (this means no JSX!)</p>
			<form aria-label="bundle size" onSubmit={handleSubmit}>
				<label>
					source code:
					<Source
						id="source"
						onChange={event =>
							dispatch({
								type: "sourceChange",
								payload: event.currentTarget.value
							})
						}
						value={source}
					/>
				</label>
				<input type="submit" />
				<TerserOptions onChange={setTerserOptions} options={terserOptions} />
				<p>State: {state}</p>
				<Output htmlFor="source">
					{prettyBytes(bundlesize)}
					<details open>
						<AccessibleSummary>bundled code</AccessibleSummary>
						<code>
							<Code>{output[0]?.code}</Code>
						</code>
					</details>
					<details open>
						<AccessibleSummary>rollup output</AccessibleSummary>
						<pre>{JSON.stringify(output, null, 2)}</pre>
					</details>
				</Output>
			</form>
		</Main>
	);
}

function TerserOptions(props) {
	const { onChange, options } = props;

	function handleChange(event) {
		onChange({
			...options,
			[event.currentTarget.name]: event.currentTarget.checked
		});
	}

	return (
		<fieldset>
			<legend>Terser options</legend>
			<label>
				mangle:{" "}
				<input
					checked={options.mangle}
					name="mangle"
					onChange={handleChange}
					type="checkbox"
				/>
			</label>
		</fieldset>
	);
}
