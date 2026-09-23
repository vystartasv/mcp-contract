export const LIMITS = Object.freeze({
  maxInputBytes: 1_048_576,
  maxEventBytes: 262_144,
  maxDiagnostics: 100,
  maxTools: 1_000,
  maxToolNameBytes: 128,
  maxDescriptionBytes: 4_096,
  maxFieldBytes: 16_384,
  maxProperties: 256,
  maxEnumValues: 64,
  maxSchemaDepth: 12,
});

export const EXIT_CODES = Object.freeze({ ok: 0, invalid: 2, usage: 3, internal: 4 });

export type Diagnostic = { path: string; code: string; message: string };
export type CheckResult = { ok: boolean; diagnostics: Diagnostic[]; value?: unknown };

const supportedSchemaTypes = new Set(["object", "string", "number", "integer", "boolean", "array", "null"]);
const schemaKeys = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "description"]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function jsonSize(value: unknown): number {
  try {
    return byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function add(diagnostics: Diagnostic[], diagnostic: Diagnostic): void {
  if (diagnostics.length < LIMITS.maxDiagnostics) diagnostics.push(diagnostic);
}

function finish(diagnostics: Diagnostic[], value?: unknown): CheckResult {
  diagnostics.sort((a, b) => compareText(a.path, b.path) || compareText(a.code, b.code) || compareText(a.message, b.message));
  if (diagnostics.length === LIMITS.maxDiagnostics) {
    diagnostics[diagnostics.length - 1] = {
      path: "$",
      code: "DIAGNOSTICS_TRUNCATED",
      message: `more than ${LIMITS.maxDiagnostics - 1} diagnostics; input is bounded`,
    };
  }
  return { ok: diagnostics.length === 0, diagnostics, ...(value === undefined ? {} : { value }) };
}

function unknownFields(value: Record<string, unknown>, allowed: Set<string>, path: string, diagnostics: Diagnostic[]): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) add(diagnostics, { path: `${path}.${key}`, code: "UNKNOWN_FIELD", message: "field is not in the supported contract" });
  }
}

function validateString(value: unknown, path: string, label: string, maxBytes: number, diagnostics: Diagnostic[], nonEmpty = true): void {
  if (typeof value !== "string") {
    add(diagnostics, { path, code: "INVALID_STRING", message: `${label} must be a string` });
    return;
  }
  if (nonEmpty && value.length === 0) add(diagnostics, { path, code: "EMPTY_STRING", message: `${label} must not be empty` });
  if (byteLength(value) > maxBytes) add(diagnostics, { path, code: "FIELD_TOO_LARGE", message: `${label} exceeds ${maxBytes} bytes` });
}

function validateSchema(value: unknown, path: string, diagnostics: Diagnostic[], depth: number): void {
  if (depth > LIMITS.maxSchemaDepth) {
    add(diagnostics, { path, code: "SCHEMA_TOO_DEEP", message: `schema depth exceeds ${LIMITS.maxSchemaDepth}` });
    return;
  }
  if (!isRecord(value)) {
    add(diagnostics, { path, code: "INVALID_SCHEMA", message: "inputSchema must be an object" });
    return;
  }
  if (jsonSize(value) > LIMITS.maxFieldBytes) add(diagnostics, { path, code: "FIELD_TOO_LARGE", message: `schema exceeds ${LIMITS.maxFieldBytes} bytes` });
  unknownFields(value, schemaKeys, path, diagnostics);
  if (!("type" in value)) {
    add(diagnostics, { path: `${path}.type`, code: "MISSING_SCHEMA_TYPE", message: "schema type is required" });
    return;
  }
  if (typeof value.type !== "string" || !supportedSchemaTypes.has(value.type)) {
    add(diagnostics, { path: `${path}.type`, code: "UNSUPPORTED_SCHEMA_TYPE", message: "supported types are object, string, number, integer, boolean, array, and null" });
    return;
  }
  if ("description" in value) validateString(value.description, `${path}.description`, "schema description", LIMITS.maxDescriptionBytes, diagnostics, false);
  if ("enum" in value) {
    if (!Array.isArray(value.enum)) add(diagnostics, { path: `${path}.enum`, code: "INVALID_ENUM", message: "enum must be an array" });
    else if (value.enum.length > LIMITS.maxEnumValues) add(diagnostics, { path: `${path}.enum`, code: "TOO_MANY_ENUM_VALUES", message: `enum has more than ${LIMITS.maxEnumValues} values` });
  }
  if ("additionalProperties" in value && typeof value.additionalProperties !== "boolean") add(diagnostics, { path: `${path}.additionalProperties`, code: "INVALID_SCHEMA_VALUE", message: "additionalProperties must be a boolean" });
  if (value.type === "object") {
    if ("properties" in value) {
      if (!isRecord(value.properties)) add(diagnostics, { path: `${path}.properties`, code: "INVALID_SCHEMA_VALUE", message: "properties must be an object" });
      else {
        const names = Object.keys(value.properties).sort();
        if (names.length > LIMITS.maxProperties) add(diagnostics, { path: `${path}.properties`, code: "TOO_MANY_PROPERTIES", message: `properties has more than ${LIMITS.maxProperties} entries` });
        for (const name of names) validateSchema(value.properties[name], `${path}.properties.${name}`, diagnostics, depth + 1);
      }
    }
    if ("required" in value) {
      if (!Array.isArray(value.required) || value.required.some((name) => typeof name !== "string")) add(diagnostics, { path: `${path}.required`, code: "INVALID_SCHEMA_VALUE", message: "required must be an array of strings" });
      else {
        const required = [...value.required];
        if (new Set(required).size !== required.length) add(diagnostics, { path: `${path}.required`, code: "DUPLICATE_REQUIRED_NAME", message: "required names must be unique" });
        const properties = isRecord(value.properties) ? value.properties : {};
        for (const name of required) if (!(name in properties)) add(diagnostics, { path: `${path}.required`, code: "UNKNOWN_REQUIRED_NAME", message: `required name ${JSON.stringify(name)} is not declared in properties` });
      }
    }
    for (const key of ["items"]) if (key in value) add(diagnostics, { path: `${path}.${key}`, code: "UNSUPPORTED_SCHEMA_KEY", message: `${key} is only supported for array schemas` });
  } else if (value.type === "array") {
    if (!("items" in value)) add(diagnostics, { path: `${path}.items`, code: "MISSING_SCHEMA_VALUE", message: "array schemas require items" });
    else validateSchema(value.items, `${path}.items`, diagnostics, depth + 1);
    for (const key of ["properties", "required", "additionalProperties"]) if (key in value) add(diagnostics, { path: `${path}.${key}`, code: "UNSUPPORTED_SCHEMA_KEY", message: `${key} is only supported for object schemas` });
  } else {
    for (const key of ["properties", "required", "additionalProperties", "items"]) if (key in value) add(diagnostics, { path: `${path}.${key}`, code: "UNSUPPORTED_SCHEMA_KEY", message: `${key} is not supported for ${value.type} schemas` });
  }
}

function validateManifestObject(value: unknown, path = "$", diagnostics: Diagnostic[] = []): CheckResult {
  if (!isRecord(value)) {
    add(diagnostics, { path, code: "INVALID_ROOT", message: "manifest must be an object" });
    return finish(diagnostics, value);
  }
  unknownFields(value, new Set(["tools"]), path, diagnostics);
  if (!Array.isArray(value.tools)) {
    add(diagnostics, { path: `${path}.tools`, code: "INVALID_TOOLS", message: "tools must be an array" });
    return finish(diagnostics, value);
  }
  if (value.tools.length > LIMITS.maxTools) add(diagnostics, { path: `${path}.tools`, code: "TOO_MANY_TOOLS", message: `tools has more than ${LIMITS.maxTools} entries` });
  const names = new Map<string, number>();
  for (let index = 0; index < value.tools.length; index += 1) {
    const toolPath = `${path}.tools[${index}]`;
    const tool = value.tools[index];
    if (!isRecord(tool)) {
      add(diagnostics, { path: toolPath, code: "INVALID_TOOL", message: "tool must be an object" });
      continue;
    }
    unknownFields(tool, new Set(["name", "description", "inputSchema"]), toolPath, diagnostics);
    for (const key of ["name", "description", "inputSchema"]) if (!(key in tool)) add(diagnostics, { path: `${toolPath}.${key}`, code: "MISSING_FIELD", message: `${key} is required` });
    if ("name" in tool) {
      validateString(tool.name, `${toolPath}.name`, "tool name", LIMITS.maxToolNameBytes, diagnostics);
      if (typeof tool.name === "string") {
        if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(tool.name)) add(diagnostics, { path: `${toolPath}.name`, code: "INVALID_TOOL_NAME", message: "name must match ^[A-Za-z][A-Za-z0-9._-]{0,127}$" });
        if (names.has(tool.name)) add(diagnostics, { path: `${toolPath}.name`, code: "DUPLICATE_TOOL_NAME", message: `duplicates tool at index ${names.get(tool.name)}` });
        else names.set(tool.name, index);
      }
    }
    if ("description" in tool) validateString(tool.description, `${toolPath}.description`, "description", LIMITS.maxDescriptionBytes, diagnostics);
    if ("inputSchema" in tool) validateSchema(tool.inputSchema, `${toolPath}.inputSchema`, diagnostics, 0);
  }
  return finish(diagnostics, value);
}

export function checkManifestText(text: string): CheckResult {
  const diagnostics: Diagnostic[] = [];
  if (byteLength(text) > LIMITS.maxInputBytes) return finish([{ path: "$", code: "INPUT_TOO_LARGE", message: `input exceeds ${LIMITS.maxInputBytes} bytes` }]);
  try {
    return validateManifestObject(JSON.parse(text));
  } catch {
    add(diagnostics, { path: "$", code: "MALFORMED_JSON", message: "input is not valid JSON" });
    return finish(diagnostics);
  }
}

function idKey(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0 && byteLength(value) <= LIMITS.maxFieldBytes) return `s:${value}`;
  if (typeof value === "number" && Number.isSafeInteger(value)) return `n:${value}`;
  return undefined;
}

function validateRpcBase(value: Record<string, unknown>, path: string, diagnostics: Diagnostic[]): void {
  if (value.jsonrpc !== "2.0") add(diagnostics, { path: `${path}.jsonrpc`, code: "INVALID_JSONRPC_VERSION", message: "jsonrpc must be exactly 2.0" });
  if (jsonSize(value) > LIMITS.maxEventBytes) add(diagnostics, { path, code: "EVENT_TOO_LARGE", message: `event exceeds ${LIMITS.maxEventBytes} bytes` });
}

function checkId(value: Record<string, unknown>, path: string, diagnostics: Diagnostic[]): string | undefined {
  if (!("id" in value)) {
    add(diagnostics, { path: `${path}.id`, code: "MISSING_ID", message: "fixture requests and responses require an id" });
    return undefined;
  }
  const key = idKey(value.id);
  if (key === undefined) add(diagnostics, { path: `${path}.id`, code: "INVALID_ID", message: "id must be a non-empty string or safe integer" });
  return key;
}

export function checkTranscriptText(text: string): CheckResult {
  const diagnostics: Diagnostic[] = [];
  if (byteLength(text) > LIMITS.maxInputBytes) return finish([{ path: "$", code: "INPUT_TOO_LARGE", message: `input exceeds ${LIMITS.maxInputBytes} bytes` }]);
  const requests = new Map<string, number>();
  const responses = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const path = `$[${index}]`;
    if (line.trim() === "") {
      add(diagnostics, { path, code: "EMPTY_EVENT", message: "blank lines are not part of the transcript contract" });
      continue;
    }
    if (byteLength(line) > LIMITS.maxEventBytes) {
      add(diagnostics, { path, code: "EVENT_TOO_LARGE", message: `event exceeds ${LIMITS.maxEventBytes} bytes` });
      continue;
    }
    let value: unknown;
    try { value = JSON.parse(line); } catch { add(diagnostics, { path, code: "MALFORMED_JSON", message: "event is not valid JSON" }); continue; }
    if (!isRecord(value)) { add(diagnostics, { path, code: "INVALID_EVENT", message: "event must be an object" }); continue; }
    const isRequest = "method" in value;
    const isResponse = "result" in value || "error" in value;
    if (isRequest) {
      unknownFields(value, new Set(["jsonrpc", "id", "method", "params"]), path, diagnostics);
      validateRpcBase(value, path, diagnostics);
      const key = checkId(value, path, diagnostics);
      if (typeof value.method !== "string" || value.method !== "tools/list") add(diagnostics, { path: `${path}.method`, code: "INVALID_METHOD", message: "method must be tools/list" });
      if ("params" in value && !isRecord(value.params)) add(diagnostics, { path: `${path}.params`, code: "INVALID_PARAMS", message: "params must be an object when present" });
      if (key !== undefined) {
        if (requests.has(key)) add(diagnostics, { path: `${path}.id`, code: "DUPLICATE_REQUEST_ID", message: `duplicates request at event ${requests.get(key)}` });
        else requests.set(key, index);
      }
    } else if (isResponse) {
      unknownFields(value, new Set(["jsonrpc", "id", "result", "error"]), path, diagnostics);
      validateRpcBase(value, path, diagnostics);
      const key = checkId(value, path, diagnostics);
      if (("result" in value) === ("error" in value)) add(diagnostics, { path, code: "INVALID_RESPONSE", message: "response must contain exactly one of result or error" });
      if ("result" in value) validateManifestObject(value.result, `${path}.result`, diagnostics);
      if ("error" in value) {
        if (!isRecord(value.error)) add(diagnostics, { path: `${path}.error`, code: "INVALID_ERROR", message: "error must be an object" });
        else {
          unknownFields(value.error, new Set(["code", "message", "data"]), `${path}.error`, diagnostics);
          if (!Number.isInteger(value.error.code)) add(diagnostics, { path: `${path}.error.code`, code: "INVALID_ERROR_CODE", message: "error code must be an integer" });
          validateString(value.error.message, `${path}.error.message`, "error message", LIMITS.maxDescriptionBytes, diagnostics);
          if ("data" in value.error && jsonSize(value.error.data) > LIMITS.maxFieldBytes) add(diagnostics, { path: `${path}.error.data`, code: "FIELD_TOO_LARGE", message: `error data exceeds ${LIMITS.maxFieldBytes} bytes` });
        }
      }
      if (key !== undefined) {
        if (responses.has(key)) add(diagnostics, { path: `${path}.id`, code: "DUPLICATE_RESPONSE_ID", message: `duplicates response at event ${responses.get(key)}` });
        else responses.set(key, index);
        if (!requests.has(key)) add(diagnostics, { path: `${path}.id`, code: "MISMATCH_RESPONSE_ID", message: "response id has no matching request" });
      }
    } else {
      unknownFields(value, new Set(["jsonrpc", "id", "method", "params", "result", "error"]), path, diagnostics);
      add(diagnostics, { path, code: "UNKNOWN_EVENT", message: "event must be a tools/list request or response" });
    }
  }
  for (const [key, index] of requests) if (!responses.has(key)) add(diagnostics, { path: `$[${index}].id`, code: "MISSING_RESPONSE", message: "request has no matching response" });
  return finish(diagnostics);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function diffManifests(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  const a = new Map((left.tools as Array<Record<string, unknown>>).map((tool) => [String(tool.name), tool]));
  const b = new Map((right.tools as Array<Record<string, unknown>>).map((tool) => [String(tool.name), tool]));
  const names = [...new Set([...a.keys(), ...b.keys()])].sort();
  return names.flatMap((name) => {
    if (!a.has(name)) return [`+ ${name}`];
    if (!b.has(name)) return [`- ${name}`];
    return stableJson(a.get(name)) === stableJson(b.get(name)) ? [] : [`~ ${name}`];
  });
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function htmlReport(inputName: string, result: CheckResult): string {
  const title = escapeHtml(`mcp-contract report: ${inputName}`);
  const status = result.ok ? "PASS" : "FAIL";
  const lines = result.diagnostics.length === 0 ? ["No diagnostics."] : result.diagnostics.map((item) => `${item.code} ${item.path}: ${item.message}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${status}</p><pre>${escapeHtml(lines.join("\n"))}</pre></body></html>\n`;
}

export function demoManifest(): Record<string, unknown> {
  return { tools: [
    { name: "echo", description: "Return text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
    { name: "health", description: "Report health", inputSchema: { type: "object", additionalProperties: false } },
  ] };
}
