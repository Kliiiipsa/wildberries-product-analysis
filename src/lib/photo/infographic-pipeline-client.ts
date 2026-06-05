// Client-side helper: calls /api/photo/infographic-brief and returns pipeline result.
// Never throws — returns null on any error so callers can fall back gracefully.

export interface PipelineInput {
  productType?: string;
  title?: string;
  description?: string;
  benefits?: string[];
  photoGoal?: string;
  targetAudience?: string;
  style?: string;
}

export interface PipelineResult {
  brief: Record<string, unknown>;
  template: { id: string; title: string; [k: string]: unknown };
  fluxPrompt: string;
  source: 'qwen' | 'fallback';
  warnings: string[];
}

export async function requestInfographicBriefPipeline(
  input: PipelineInput,
): Promise<PipelineResult | null> {
  try {
    const res = await fetch('/api/photo/infographic-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    if (!json.ok || typeof json.fluxPrompt !== 'string' || !json.fluxPrompt) return null;
    return json as unknown as PipelineResult;
  } catch {
    return null;
  }
}
