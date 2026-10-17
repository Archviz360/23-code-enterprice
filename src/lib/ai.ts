import type { ModelInfo, IntegrationInfo, SessionInfo, SessionMessageInfo, PermissionRequest, FormInfo, FileDiffInfo, IntegrationAttempt, FormAnswer } from '@opencode/client';

export type { SessionInfo, SessionMessageInfo, FormInfo, FormAnswer, IntegrationAttempt };
export interface AICatalog {
  version: string;
  models: Pick<ModelInfo, 'id' | 'providerID' | 'name' | 'enabled' | 'capabilities' | 'variants' | 'limit' | 'cost'>[];
  integrations: IntegrationInfo[];
}
export interface AISnapshot {
  session: SessionInfo; messages: SessionMessageInfo[]; permissions: PermissionRequest[];
  forms: FormInfo[]; active: { type: 'running' } | null; diffs: FileDiffInfo[];
}
export function ai<T = void>(action: string, input?: Record<string, unknown>): Promise<T> {
  if (!window.desktop) return Promise.reject(new Error('AI requires the desktop app.'));
  return window.desktop.aiRequest<T>(action, input);
}
