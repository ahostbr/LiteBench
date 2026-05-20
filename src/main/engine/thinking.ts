export interface ThinkingExtraction {
  cleaned: string;
  thinking: string;
  truncated: boolean;
}

export function extractThinking(text: string): ThinkingExtraction {
  let cleaned = text;
  let thinking = '';
  let truncated = false;

  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinking = thinkMatch[1] ?? '';
    cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/s, '');
    return {
      cleaned: cleaned.trim(),
      thinking: thinking.trim(),
      truncated: false,
    };
  }

  if (text.includes('<think>') && !text.includes('</think>')) {
    const index = text.indexOf('<think>');
    thinking = text.slice(index + 7);
    cleaned = text.slice(0, index);
    truncated = true;
    return {
      cleaned: cleaned.trim(),
      thinking: thinking.trim(),
      truncated,
    };
  }

  if (!text.includes('<think>') && text.includes('</think>')) {
    const index = text.indexOf('</think>');
    thinking = text.slice(0, index);
    cleaned = text.slice(index + 8);
    return {
      cleaned: cleaned.trim(),
      thinking: thinking.trim(),
      truncated: false,
    };
  }

  const thinkingProcessMatch = text.match(
    /^Thinking Process:\s*\n(.*?)(?=\n\n[A-Z`#]|\Z)/s,
  );
  if (thinkingProcessMatch) {
    thinking = thinkingProcessMatch[1] ?? '';
    cleaned = text.slice(thinkingProcessMatch[0].length);
    return {
      cleaned: cleaned.trim(),
      thinking: thinking.trim(),
      truncated: false,
    };
  }

  return {
    cleaned: text.trim(),
    thinking: '',
    truncated: false,
  };
}

export function stripThinking(text: string): [string, string] {
  const extracted = extractThinking(text);
  return [extracted.cleaned, extracted.thinking];
}
