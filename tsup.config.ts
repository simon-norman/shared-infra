import { defineConfig } from "tsup";

export default defineConfig({
	target: "esnext",
	format: ["esm", "cjs"],
	entry: ["src/index.ts"],
	sourcemap: true,
	clean: true,
	dts: true,
	treeshake: true,
});
