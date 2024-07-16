import type { EventMessageStream } from "@azure/core-sse";

async function* streamResponse(stream: EventMessageStream) {
  let content = "";
  for await (const event of stream) {
    if (event.data === "[DONE]") {
      return;
    }
    const ev = JSON.parse(event.data);
    if (ev.choices.length === 0) {
      continue;
    }
    const choice = ev.choices[0];
    if (choice.finish_reason !== null) {
      if (choice.finish_reason !== "stop")
        content += ` [stopped for ${choice.finish_reason}]`;
      yield content;
      return;
    } else {
      if (choice.delta.content !== undefined) {
        content += choice.delta.content;
        yield content;
      }
    }
  }
}

export default streamResponse;
