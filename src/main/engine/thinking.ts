export function stripThinking(text: string): [string, string] {
  let thinking = '';

  const thinkMatch = text.match(/<think>(.*?)<\/think>/s);
  if (thinkMatch) {
    thinking = thinkMatch[1] ?? '';
    text = text.replace(/<think>.*?<\/think>\s*/s, '');
  } else if (text.includes('<think>') && !text.includes('</think>')) {
    const index = text.indexOf('<think>');
    thinking = text.slice(index + 7);
    text = text.slice(0, index);
  } else {
    const thinkingProcessMatch = text.match(
      /^Thinking Process:\s*\n(.*?)(?=\n\n[A-Z`#]|\Z)/s,
    );
    if (thinkingProcessMatch) {
      thinking = thinkingProcessMatch[1] ?? '';
      text = text.slice(thinkingProcessMatch[0].length);
    }
  }

  return [text.trim(), thinking.trim()];
}
