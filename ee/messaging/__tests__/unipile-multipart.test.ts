import { describe, expect, it } from "vitest";
import { createClient, createConfig } from "@unipile/sdk/dist/client";

import { encodeMultipart, multipartRequest } from "../unipile-multipart";

const image = { content: Buffer.from([0, 1, 2, 255]).toString("base64"), content_type: "image/png", filename: "a.png" };
const decode = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("multipart bodies for Unipile", () => {
  it("keeps a text field's line feeds exactly as given", () => {
    const bytes = decode(encodeMultipart({ text: "a\n\nb" }, "XYZ"));
    expect(bytes).toBe('--XYZ\r\nContent-Disposition: form-data; name="text"\r\n\r\na\n\nb\r\n--XYZ--\r\n');
    expect(bytes).not.toContain("a\r\n\r\nb");
  });

  it("encodes the post text, nested fields and attachment bytes so a server parses them back unchanged", async () => {
    const text = "First paragraph.\n\nSecond paragraph,\nwith a line break. Ümlaut ✓";
    const body = encodeMultipart({ text, attachments: [image], post_as: "org", can_read: "anyone" }, "B0UNDARY");
    const form = await new Response(body, {
      headers: { "content-type": "multipart/form-data; boundary=B0UNDARY" },
    }).formData();
    expect(form.get("text")).toBe(text);
    expect(form.get("post_as")).toBe("org");
    const file = form.get("attachments[0]") as File;
    expect(file.name).toBe("a.png");
    expect(file.type).toBe("image/png");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([0, 1, 2, 255]);
  });

  it("escapes quotes and line breaks in names so a file name cannot add headers", () => {
    const bytes = decode(encodeMultipart({ attachments: [{ ...image, filename: 'x".png\r\nX-Evil: 1' }] }, "B"));
    expect(bytes).toContain('filename="x%22.png%0D%0AX-Evil: 1"');
    expect(bytes).not.toContain("\r\nX-Evil");
  });

  it("sends the body through the Unipile client with its boundary and keeps other headers", async () => {
    let sent: Request | undefined;
    const client = createClient(
      createConfig({
        baseUrl: "https://unipile.test",
        fetch: (input: URL | RequestInfo) => {
          sent = input as Request;
          return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
        },
      }),
    );
    const multipart = multipartRequest();
    await client.post({
      url: "/api/v1/posts",
      body: { text: "a\n\nb", attachments: [image] },
      bodySerializer: multipart.bodySerializer,
      headers: { "x-customermates-timeout-ms": "60000", ...multipart.headers },
    });
    if (!sent) throw new Error("No request was sent");
    expect(sent.headers.get("content-type")).toBe(multipart.headers["Content-Type"]);
    expect(sent.headers.get("x-customermates-timeout-ms")).toBe("60000");
    const raw = decode(new Uint8Array(await sent.arrayBuffer()));
    expect(raw).toContain('name="text"\r\n\r\na\n\nb\r\n');
    expect(raw).not.toContain("a\r\n\r\nb");
  });
});
