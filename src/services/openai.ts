import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function extractTask(input: {
  describe: string;
  priority: string;
  repoContext: Array<{ repo: string; path: string; url: string }>;
}) {
  const schema = {
    name: "task_payload",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        labels: { type: "array", items: { type: "string" } }
      },
      required: ["title", "body"]
    },
    strict: true
  } as const;

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: "Return a concise task derived from the user text. Use provided repo links as references only."
      },
      { role: "user", content: `Text: ${input.describe}\nPriority: ${input.priority}\nContext:\n${input.repoContext.map(r => r.url).join('\n')}` }
    ],
    text: {
      format: { type: "json_schema", json_schema: schema }
    }
  } as any);

  const json = JSON.parse(resp.output_text!);
  return json as { title: string; body: string; labels?: string[] };
}
