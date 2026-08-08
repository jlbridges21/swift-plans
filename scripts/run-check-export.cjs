#!/usr/bin/env node
/**
 * Runner for check-export.ts — jiti loads TSX + @/ aliases.
 */
const path = require("node:path");
const { createJiti } = require("jiti");

const root = path.join(__dirname, "..");
globalThis.React = require("react");

const jiti = createJiti(__filename, {
  interopDefault: true,
  jsx: true,
  alias: {
    "@/": path.join(root, "src") + "/",
  },
});

jiti(path.join(__dirname, "check-export.ts"));
