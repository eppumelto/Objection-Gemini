const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const OLLAMA_NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX || '16384', 10);
const AI_MOCK = process.env.AI_MOCK === '1';

export async function* generateAIStream(systemPrompt: string, userPrompt: string, mockOutput?: string) {
  if (AI_MOCK && mockOutput) {
    if (userPrompt.includes('#fail')) {
      throw new Error('Injected failure');
    }
    const words = mockOutput.split(' ');
    for (const word of words) {
      yield word + ' ';
      await new Promise(r => setTimeout(r, 20));
    }
    return;
  }

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: true,
      options: {
        num_ctx: OLLAMA_NUM_CTX,
        think: false,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader available');

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.response) {
          yield parsed.response;
        }
      } catch (e) {
        // Ignore parse errors on valid lines
      }
    }
  }
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      if (parsed.response) yield parsed.response;
    } catch (e) {}
  }
}
