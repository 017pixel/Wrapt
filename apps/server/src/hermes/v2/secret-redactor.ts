import { hermesV2Policy, type HermesV2Policy } from "./policy.js";
import { GatewayError } from "./errors.js";
import { HERMES_V2_TEXT_MAX_LENGTH } from "@wrapt/contracts/hermes-v2";
export interface RedactionRange { start: number; end: number; jsonValue?: boolean }

/** Nur flüchtig: verhindert das Zurücksenden gerade eingegebener Secrets in Toolausgaben. */
export class SecretRedactor {
  private readonly values = new Set<string>();
  private readonly tails = new Map<string, string>();
  private readonly failures = new Map<string, Uint32Array>();
  private streamSuppressed = false;

  constructor(private readonly policy: HermesV2Policy = hermesV2Policy) {}

  remember(value: string): void {
    if (!value) return;
    const additions = new Set([value]);
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && "password" in parsed && typeof parsed.password === "string") {
        if (parsed.password) additions.add(parsed.password);
      }
    } catch { /* Normale Secret-Eingaben sind kein JSON. */ }
    for (const secret of [...additions]) additions.add(JSON.stringify(secret).slice(1, -1));
    const next = new Set([...this.values, ...additions]);
    if (next.size > this.policy.secretValues || [...next].reduce((sum, secret) => sum + secret.length, 0) > this.policy.secretBytes) {
      // Bereits übertragene Werte bleiben bis zum Pool-Ende bekannt. Neue Antworten werden abgewiesen.
      throw new GatewayError("RATE_LIMITED", "Der flüchtige Secret-Schutz ist ausgelastet. Die Antwort wurde nicht gesendet.");
    }
    for (const secret of additions) this.values.add(secret);
  }

  scrub(value: unknown): unknown {
    if (typeof value === "string") return this.text(value);
    if (Array.isArray(value)) return value.map((item) => this.scrub(item));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [this.text(key), this.scrub(entry)]));
    }
    return value;
  }

  text(value: string, ranges: readonly RedactionRange[] = []): string {
    // Kurze Secrets dürfen durch längere Masken keine fachlichen Feldgrenzen sprengen.
    return this.mask(value, false, ranges).text.slice(0, Math.max(value.length, 3));
  }

  /** Erst vollständige Werte maskieren; auch früher abgeschnittene Präfixe bleiben geschützt. */
  boundedText(value: string, maximum: number, bytes = false): string {
    return this.bounded(value, maximum, bytes).text;
  }

  /** Die Kürzung bezieht sich auf den maskierten Inhalt, einschließlich wachsender Masken. */
  bounded(value: string, maximum: number, bytes = false, ranges: readonly RedactionRange[] = []): { text: string; truncated: boolean } {
    const bound = (entry: string) => bytes
      ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(Buffer.from(entry, "utf8").subarray(0, maximum), { stream: true })
      : entry.slice(0, maximum);
    const size = (entry: string) => bytes ? Buffer.byteLength(entry) : entry.length;
    // Volltreffer und mögliche bereits gekürzte Präfixe gemeinsam am Rohtext schützen.
    const protectedValue = this.mask(value, true, ranges);
    const masked = protectedValue.text + (protectedValue.tail ? "***" : "");
    let output = bound(masked);
    let retain = 0;
    for (const secret of this.values) retain = Math.max(retain, this.overlap(secret, output));
    if (retain) output = output.slice(0, -retain) + "***";
    return { text: bound(output), truncated: size(masked) > maximum || size(output) > maximum };
  }

  stream(channel: string, chunk: string, ranges?: (raw: string) => readonly RedactionRange[]): string {
    if (this.streamSuppressed) return "***";
    const combined = (this.tails.get(channel) ?? "") + chunk;
    this.tails.delete(channel);
    const masked = this.mask(combined, true, ranges?.(combined));
    if (masked.tail) {
      if (this.tails.size >= this.policy.secretStreams || [...this.tails.values()].reduce((sum, tail) => sum + tail.length, 0) + masked.tail.length > this.policy.secretBufferBytes) {
        // Bei Überlastung Text unterdrücken, statt Teilwerte zu vergessen und später auszugeben.
        this.streamSuppressed = true;
        this.tails.clear();
        return "***";
      }
      this.tails.set(channel, masked.tail);
    }
    // Der Prefixschutz wird auf dem vollständigen Inhalt berechnet, erst danach die Ausgabe begrenzt.
    return masked.text.slice(0, HERMES_V2_TEXT_MAX_LENGTH);
  }

  finish(channelPrefix: string): void {
    for (const channel of this.tails.keys()) if (channel.startsWith(channelPrefix)) this.tails.delete(channel);
  }

  clear(): void { this.values.clear(); this.tails.clear(); this.failures.clear(); this.streamSuppressed = false; }

  private failure(secret: string): Uint32Array {
    let failure = this.failures.get(secret);
    if (!failure) {
      failure = new Uint32Array(secret.length);
      let prefix = 0;
      for (let index = 1; index < secret.length; index++) {
        while (prefix > 0 && secret[index] !== secret[prefix]) prefix = failure[prefix - 1]!;
        if (secret[index] === secret[prefix]) prefix++;
        failure[index] = prefix;
      }
      this.failures.set(secret, failure);
    }
    return failure;
  }

  /** Alle Treffer am unveränderten Eingang vereinigen, auch teilweise überlappende. */
  private mask(value: string, streaming = false, ranges: readonly RedactionRange[] = []): { text: string; tail: string } {
    let ends: Uint32Array | undefined;
    const jsonValues = new Map<number, number>();
    for (const range of ranges) {
      ends ??= new Uint32Array(value.length);
      ends[range.start] = Math.max(ends[range.start]!, range.end);
      if (range.jsonValue) jsonValues.set(range.start, range.end);
    }
    let retain = 0;
    // Gemeinsam kompilierte kurze Literale vermeiden einen Volltextscan je Wert.
    // Lookahead erhält Treffer an jedem Start; am gleichen Start genügt der längste.
    // Lange Werte bleiben außerhalb des Regex, damit dessen Größe begrenzt bleibt.
    const shortValues = [...this.values].filter((secret) => secret.length <= 64);
    if (shortValues.length > 1) {
      const literals = shortValues.sort((left, right) => right.length - left.length)
        .map((secret) => secret.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"));
      const search = new RegExp(`(?=(${literals.join("|")}))`, "g");
      for (const match of value.matchAll(search)) {
        ends ??= new Uint32Array(value.length);
        ends[match.index] = Math.max(ends[match.index]!, match.index + match[1]!.length);
      }
    }
    for (const secret of this.values) {
      if (shortValues.length > 1 && secret.length <= 64) {
        if (streaming) retain = Math.max(retain, this.overlap(secret, value));
        continue;
      }
      const failure = this.failure(secret);
      const period = secret.length - failure[secret.length - 1]!;
      let matched = 0;
      if (period * 2 >= secret.length) {
        // Kein zweiter Volltreffer kann vor der kleinsten belegten Periode starten.
        // Native Suche spart den JS-Volltextscan je nicht stark periodischem Wert.
        for (let start = value.indexOf(secret); start >= 0; start = value.indexOf(secret, start + period)) {
          ends ??= new Uint32Array(value.length);
          ends[start] = Math.max(ends[start]!, start + secret.length);
        }
        if (streaming) matched = this.overlap(secret, value);
      } else {
        // Dichte lange Überlappungen dürfen nicht denselben Langwert millionenfach
        // nativ vergleichen. Der bestehende KMP-Scan teilt ihre bereits belegten Zeichen.
        for (let index = 0; index < value.length; index++) {
          while (matched > 0 && value[index] !== secret[matched]) matched = failure[matched - 1]!;
          if (value[index] === secret[matched]) matched++;
          if (matched === secret.length) {
            ends ??= new Uint32Array(value.length);
            const start = index - secret.length + 1;
            ends[start] = Math.max(ends[start]!, index + 1);
            matched = failure[matched - 1]!;
          }
        }
      }
      if (streaming) retain = Math.max(retain, matched);
    }
    let stop = value.length - retain;
    if (!ends) return { text: value.slice(0, stop), tail: value.slice(stop) };
    const output: string[] = [];
    const pieces: string[] = [];
    const append = (piece: string) => {
      if (piece) pieces.push(piece);
      // Millionen Einzeltreffer behalten nicht Millionen Arrayplätze bis zum Join.
      if (pieces.length >= 1_024) { output.push(pieces.join("")); pieces.length = 0; }
    };
    let cursor = 0; let start = -1; let end = 0;
    const flush = () => {
      if (end > stop) stop = Math.min(stop, start);
      else { append(value.slice(cursor, start)); append(jsonValues.get(start) === end ? '"***"' : "***"); cursor = end; }
    };
    for (let index = 0; index < ends.length; index++) {
      if (!ends[index]) continue;
      if (index < end) end = Math.max(end, ends[index]!);
      else { if (start >= 0) flush(); start = index; end = ends[index]!; }
    }
    flush(); append(value.slice(cursor, stop)); output.push(pieces.join(""));
    return { text: output.join(""), tail: value.slice(stop) };
  }

  private overlap(secret: string, chunk: string): number {
    const failure = this.failure(secret);
    let matched = 0;
    for (let index = Math.max(0, chunk.length - secret.length + 1); index < chunk.length; index++) {
      while (matched > 0 && chunk[index] !== secret[matched]) matched = failure[matched - 1]!;
      if (chunk[index] === secret[matched]) matched++;
      if (matched === secret.length) matched = failure[matched - 1]!;
    }
    return matched;
  }
}
