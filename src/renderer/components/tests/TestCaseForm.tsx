import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { TestCase } from '@/api/types';

interface TestCaseFormProps {
  initial?: TestCase;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function TestCaseForm({ initial, onSubmit, onCancel }: TestCaseFormProps) {
  const [testId, setTestId] = useState(initial?.test_id ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '');
  const [userPrompt, setUserPrompt] = useState(initial?.user_prompt ?? '');
  const [evalKeywords, setEvalKeywords] = useState(initial?.eval_keywords.join(', ') ?? '');
  const [evalAnti, setEvalAnti] = useState(initial?.eval_anti.join(', ') ?? '');
  const [evalJson, setEvalJson] = useState(initial?.eval_json ?? false);
  const [evalSentenceCount, setEvalSentenceCount] = useState(initial?.eval_sentence_count?.toString() ?? '');
  const [maxTokens, setMaxTokens] = useState(initial?.max_tokens?.toString() ?? '600');
  const [responseSchema, setResponseSchema] = useState(
    initial?.response_schema && Object.keys(initial.response_schema).length > 0
      ? JSON.stringify(initial.response_schema, null, 2)
      : '',
  );
  const [schemaError, setSchemaError] = useState('');
  const [evalMode, setEvalMode] = useState<'keyword' | 'schema' | 'both'>(initial?.eval_mode ?? 'keyword');

  const handleSchemaChange = (value: string) => {
    setResponseSchema(value);
    if (!value.trim()) {
      setSchemaError('');
      return;
    }
    try {
      JSON.parse(value);
      setSchemaError('');
    } catch {
      setSchemaError('Invalid JSON');
    }
  };

  const handleSubmit = () => {
    if (schemaError) return;
    let parsedSchema = {};
    if (responseSchema.trim()) {
      try {
        parsedSchema = JSON.parse(responseSchema);
      } catch {
        return;
      }
    }
    onSubmit({
      test_id: testId,
      category,
      name,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      eval_keywords: evalKeywords.split(',').map((s) => s.trim()).filter(Boolean),
      eval_anti: evalAnti.split(',').map((s) => s.trim()).filter(Boolean),
      eval_json: evalJson,
      eval_sentence_count: evalSentenceCount ? parseInt(evalSentenceCount) : null,
      response_schema: parsedSchema,
      eval_mode: evalMode,
      max_tokens: parseInt(maxTokens) || 600,
    });
  };

  const inputClass =
    'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Test ID</label>
          <input className={inputClass} value={testId} onChange={(e) => setTestId(e.target.value)} placeholder="codegen-1" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Category</label>
          <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Code Generation" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="LRU Cache" />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 mb-1 block">System Prompt</label>
        <textarea className={`${inputClass} h-16 resize-none`} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </div>

      <div>
        <label className="text-xs text-zinc-500 mb-1 block">User Prompt</label>
        <textarea className={`${inputClass} h-24 resize-none`} value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Eval Keywords (comma-separated)</label>
          <input className={inputClass} value={evalKeywords} onChange={(e) => setEvalKeywords(e.target.value)} placeholder="class, def get, def put" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Anti-keywords (comma-separated)</label>
          <input className={inputClass} value={evalAnti} onChange={(e) => setEvalAnti(e.target.value)} placeholder="functools" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Max Tokens</label>
          <input className={inputClass} type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Sentence Count</label>
          <input className={inputClass} type="number" value={evalSentenceCount} onChange={(e) => setEvalSentenceCount(e.target.value)} placeholder="Optional" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={evalJson}
              onChange={(e) => setEvalJson(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-blue-500"
            />
            <span className="text-sm text-zinc-300">Eval JSON</span>
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 mb-1 block">Response Schema (JSON)</label>
        <textarea
          className={`${inputClass} h-24 resize-none font-mono text-xs ${schemaError ? 'border-red-500 ring-1 ring-red-500' : ''}`}
          value={responseSchema}
          onChange={(e) => handleSchemaChange(e.target.value)}
          placeholder='{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}'
        />
        {schemaError && <span className="text-xs text-red-400 mt-0.5 block">{schemaError}</span>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Eval Mode</label>
          <select
            className={inputClass}
            value={evalMode}
            onChange={(e) => setEvalMode(e.target.value as 'keyword' | 'schema' | 'both')}
          >
            <option value="keyword">Keyword</option>
            <option value="schema">Schema</option>
            <option value="both">Both</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={handleSubmit} disabled={!!schemaError}>{initial ? 'Update' : 'Add Test'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
