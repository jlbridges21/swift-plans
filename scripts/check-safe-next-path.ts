import { safeNextPath } from "../src/lib/auth/paths";

const origin = "https://swift.example";
const fallback = "/dashboard";

// Actual backslash characters (string escapes so the path contains `\`).
const backslashEvil = "/\\evil.com";
const backslashSlashEvil = "/\\/evil.com";

const cases: Array<[string, string]> = [
  ["/dashboard", "/dashboard"],
  [backslashEvil, fallback],
  [backslashSlashEvil, fallback],
  ["//evil.com", fallback],
  ["https://evil.com", fallback],
  ["/dashboard?x=1", "/dashboard?x=1"],
  ["/reset-password", "/reset-password"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = safeNextPath(input, fallback, origin);
  const ok = got === expected;
  console.log(
    ok ? "ok" : "FAIL",
    JSON.stringify(input),
    "→",
    got,
    ok ? "" : `(expected ${expected})`,
  );
  if (!ok) failed += 1;
}

const hostile = new URL(backslashEvil, origin);
console.log("whatwg without guard would be", hostile.href);

process.exit(failed === 0 ? 0 : 1);
