/**
 * Minimal well-formedness check for SVG/XML strings (no npm dependency).
 * Verifies a single root element and balanced tags; not a full XML validator.
 */

export class XMLParser {
  parse(xml: string): void {
    const text = xml.replace(/<\?xml[^?]*\?>/g, "").trim();
    if (!text.startsWith("<")) {
      throw new Error("Expected XML markup");
    }
    // Strip CDATA and comments
    const cleaned = text
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const stack: string[] = [];
    const tagRe = /<\/?([A-Za-z_][\w:.-]*)([^>]*?)\/?>/g;
    let m: RegExpExecArray | null;
    let rootCount = 0;
    while ((m = tagRe.exec(cleaned)) !== null) {
      const full = m[0]!;
      const name = m[1]!;
      const rest = m[2] ?? "";
      if (full.startsWith("</")) {
        const top = stack.pop();
        if (top !== name) {
          throw new Error(
            `Mismatched close tag </${name}> (expected </${top ?? "?"}>)`,
          );
        }
        continue;
      }
      const selfClosing = full.endsWith("/>") || /\/\s*$/.test(rest);
      if (stack.length === 0) rootCount += 1;
      if (!selfClosing) stack.push(name);
    }
    if (stack.length !== 0) {
      throw new Error(`Unclosed tag(s): ${stack.join(", ")}`);
    }
    if (rootCount !== 1) {
      throw new Error(`Expected exactly one root element, found ${rootCount}`);
    }
  }
}
