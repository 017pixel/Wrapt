import Fastify from "fastify";
import { expect, it } from "vitest";
import { toApiError } from "../utils/api-errors.js";

it("lehnt zu große JSON-Bodies mit 413 und klarem Code ab", async () => {
  const app = Fastify({ bodyLimit: 1_024 });
  app.setErrorHandler((error, request, reply) => {
    const mapped = toApiError(error);
    return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message, requestId: request.id } });
  });
  app.post("/json", async () => ({ ok: true }));
  try {
    const small = await app.inject({ method: "POST", url: "/json", payload: { value: "x" } });
    expect(small.statusCode).toBe(200);
    const large = await app.inject({ method: "POST", url: "/json", payload: { value: "x".repeat(4_096) } });
    expect(large.statusCode).toBe(413);
    expect(large.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  } finally {
    await app.close();
  }
});

it("meldet einen nicht unterstützten Inhaltstyp als 415", async () => {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    const mapped = toApiError(error);
    return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } });
  });
  app.post("/json", async () => ({ ok: true }));
  try {
    const response = await app.inject({ method: "POST", url: "/json", headers: { "content-type": "application/xml" }, payload: "<hallo/>" });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
  } finally {
    await app.close();
  }
});
